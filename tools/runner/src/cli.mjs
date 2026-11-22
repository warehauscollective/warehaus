#!/usr/bin/env node
// Warehaus runner. Claims milestone work from the Portal, opens the official
// `claude` CLI on the milestone branch, and reports back.
//
// It never reads or forwards a Claude credential and never calls a model API.
// The only program it starts for model work is the `claude` binary.

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cursorBuildPrompt, cursorCreateBody, cursorRequest } from './drivers/cursor.mjs';
import {
  defaultBranchName,
  idleDelayMs,
  isMilestoneBranch,
  parseArgs,
  parseGitLog,
  parsePlanOutput,
  planPrompt,
  pullRequestBody,
  childEnv,
  mapCursorCommits,
  readEnv,
  repoFromRemote,
  selectDriver,
  taskOutcome,
  taskPrompt,
  worktreeName,
} from './lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const prompts = join(here, '..', 'prompts');

function say(message) {
  process.stdout.write(`[runner] ${message}\n`);
}

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  return { ok: result.status === 0, out: (result.stdout ?? '').trim(), err: (result.stderr ?? '').trim() };
}

async function call(config, path, body) {
  const response = await fetch(`${config.url}${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.token}`,
      'x-runner-id': config.id,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  if (!response.ok) {
    const reason = data && typeof data.error === 'string' ? data.error : `HTTP ${response.status}`;
    throw new Error(`${path}: ${reason}`);
  }
  return data ?? {};
}

/** The repository's default branch: origin/HEAD, else what GitHub says, else main. */
function defaultBranch(repo) {
  const ref = git(repo, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']);
  let fromGh = '';
  if (!ref.ok) {
    const viewed = spawnSync('gh', ['repo', 'view', '--json', 'defaultBranchRef', '--jq', '.defaultBranchRef.name'], {
      cwd: repo,
      encoding: 'utf8',
    });
    if (viewed.status === 0) fromGh = (viewed.stdout ?? '').trim();
  }
  return defaultBranchName(ref.ok ? ref.out : '', fromGh);
}

/** A worktree for the milestone branch, beside the repository. Created from the default branch when the branch is new. */
function ensureWorktree(repo, branch) {
  if (!isMilestoneBranch(branch)) throw new Error(`Refusing branch ${branch}. Only milestone/<slug> is used.`);
  const dir = resolve(repo, '..', 'warehaus-runner', worktreeName(branch));
  if (existsSync(join(dir, '.git'))) {
    const current = git(dir, ['branch', '--show-current']);
    if (current.out !== branch) throw new Error(`${dir} is on ${current.out || 'no branch'}, not ${branch}.`);
    return dir;
  }
  mkdirSync(dirname(dir), { recursive: true });
  git(repo, ['fetch', 'origin', '--quiet']);
  const remote = git(repo, ['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${branch}`]);
  const local = git(repo, ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`]);
  const added = local.ok
    ? git(repo, ['worktree', 'add', dir, branch])
    : remote.ok
      ? git(repo, ['worktree', 'add', '-b', branch, dir, `origin/${branch}`])
      : git(repo, ['worktree', 'add', '-b', branch, dir, `origin/${defaultBranch(repo)}`]);
  if (!added.ok) throw new Error(`Could not create the worktree: ${added.err}`);
  return dir;
}

/**
 * One pull request per milestone, from the milestone branch into main. Finds
 * the open one, or opens it. Returns its URL, or null when `gh` is missing or
 * the call fails: the task still completes, and the GitHub webhook stores the
 * link when the pull request appears.
 */
function ensurePullRequest(dir, work) {
  const branch = work.milestone.branch;
  const found = spawnSync('gh', ['pr', 'view', branch, '--json', 'url,state'], { cwd: dir, encoding: 'utf8' });
  if (found.status === 0) {
    try {
      const parsed = JSON.parse(found.stdout);
      if (parsed.state === 'OPEN' && typeof parsed.url === 'string') return parsed.url;
    } catch {
      // Fall through and open one.
    }
  }
  const created = spawnSync(
    'gh',
    ['pr', 'create', '--base', defaultBranch(dir), '--head', branch, '--title', work.milestone.name, '--body', pullRequestBody(work)],
    { cwd: dir, encoding: 'utf8' },
  );
  if (created.status !== 0) {
    say(`No pull request yet: ${(created.stderr ?? '').trim().split('\n')[0] || 'gh failed'}`);
    return null;
  }
  const url = (created.stdout ?? '').trim().split('\n').pop() ?? '';
  return /^https:\/\/github\.com\//.test(url) ? url : null;
}

function claudeEnv(config, runId) {
  return childEnv(process.env, {
    PORTAL_AGENT_URL: config.url,
    RUNNER_ID: config.id,
    AGENT_RUN_ID: runId,
  });
}

/** Starts the official `claude` CLI and waits for it to exit. */
function runClaude(config, cwd, prompt, runId) {
  const args = config.mode === 'headless' ? ['-p', prompt] : [prompt];
  return new Promise((done) => {
    const child = spawn('claude', args, {
      cwd,
      stdio: 'inherit',
      env: claudeEnv(config, runId),
    });
    child.on('error', (error) => {
      say(`Could not start claude: ${error.message}`);
      done(127);
    });
    child.on('exit', (code) => done(code ?? 1));
  });
}

/** Planning is read-only. stdout is the task list. Nothing is written to disk. */
function runClaudePlan(config, cwd, prompt, runId) {
  return new Promise((done) => {
    const child = spawn('claude', ['-p', '--permission-mode', 'plan', prompt], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: claudeEnv(config, runId),
    });
    let out = '';
    child.stdout?.on('data', (chunk) => {
      out += String(chunk);
      if (out.length > 100_000) out = out.slice(-100_000);
    });
    child.on('error', (error) => {
      say(`Could not start claude: ${error.message}`);
      done({ code: 127, out: '' });
    });
    child.on('exit', (code) => done({ code: code ?? 1, out }));
  });
}

function readIfPresent(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

async function doTask(config, work) {
  const order = String(work.task.order).padStart(2, '0');
  say(`Task ${order} · ${work.task.title} · ${work.milestone.branch}`);
  const dir = ensureWorktree(config.repo, work.milestone.branch);
  const notes = join(dir, '.runner');
  rmSync(join(notes, 'blocked.txt'), { force: true });
  const before = git(dir, ['rev-parse', 'HEAD']).out;
  await runClaude(config, dir, taskPrompt(readFileSync(join(prompts, 'task.md'), 'utf8'), work), work.runId);
  const after = git(dir, ['rev-parse', 'HEAD']).out;
  const outcome = taskOutcome({ before, after, blockedReason: readIfPresent(join(notes, 'blocked.txt')) });
  if (outcome.commitSha) {
    const pushed = git(dir, ['push', '-u', 'origin', work.milestone.branch]);
    if (!pushed.ok) {
      say(`Push failed: ${pushed.err}`);
      await call(config, '/agent/complete', { runId: work.runId, status: 'failed', reason: 'The push to origin failed' });
      return;
    }
  }
  const prUrl = outcome.commitSha ? ensurePullRequest(dir, work) : null;
  const result = await call(config, '/agent/complete', { runId: work.runId, ...outcome, ...(prUrl ? { prUrl } : {}) });
  if (result.milestoneStatus === 'Ready to Ship') markReadyForReview(dir, work.milestone.branch);
  say(`Reported ${outcome.status}${result.milestoneStatus ? ` · milestone is ${result.milestoneStatus}` : ''}`);
}

async function doPlanning(config, work) {
  say(`Planning · ${work.milestone.name}`);
  const dir = ensureWorktree(config.repo, work.milestone.branch);
  const planned = await runClaudePlan(
    config,
    dir,
    planPrompt(readFileSync(join(prompts, 'plan-milestone.md'), 'utf8'), work),
    work.runId,
  );
  const plan = parsePlanOutput(planned.out);
  if (!plan.ok) {
    say(`No usable plan: ${plan.error}`);
    await call(config, '/agent/complete', { runId: work.runId, kind: 'planning', reason: plan.error });
    return;
  }
  const result = await call(config, '/agent/tasks', { runId: work.runId, tasks: plan.tasks });
  say(`Wrote ${plan.tasks.length} tasks${result.milestoneStatus ? ` · milestone is ${result.milestoneStatus}` : ''}`);
}

function markReadyForReview(dir, branch) {
  const labeled = spawnSync('gh', ['pr', 'edit', branch, '--add-label', 'ready-for-review'], { cwd: dir, encoding: 'utf8' });
  if (labeled.status !== 0) {
    say(`Review label not added: ${(labeled.stderr ?? '').trim().split('\n')[0] || 'gh failed'}`);
  }
}

function milestoneBranchOnOrigin(repo, branch) {
  git(repo, ['fetch', 'origin', branch, '--quiet']);
  return git(repo, ['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${branch}`]).ok;
}

/** Creates milestone/<slug> from the default branch and pushes it, when origin does not have it yet. */
function publishMilestoneBranch(repo, branch) {
  if (!isMilestoneBranch(branch)) return { ok: false, error: 'The milestone branch is not a milestone branch' };
  if (milestoneBranchOnOrigin(repo, branch)) return { ok: true };
  let dir;
  try {
    dir = ensureWorktree(repo, branch);
  } catch {
    return { ok: false, error: 'The milestone branch could not be created' };
  }
  const pushed = git(dir, ['push', '-u', 'origin', branch]);
  if (!pushed.ok || !milestoneBranchOnOrigin(repo, branch)) return { ok: false, error: 'The push to origin failed' };
  return { ok: true };
}

async function doBuild(config, work) {
  say(`Cursor · ${work.milestone.name} · ${work.milestone.branch}`);
  const key = (process.env.CURSOR_API_KEY ?? '').trim();
  if (!key) {
    await call(config, '/agent/build', {
      runId: work.runId,
      status: 'failed',
      reason: 'The Cursor API key is not set on this runner',
    });
    return 'settled';
  }
  const repoName = repoFromRemote(git(config.repo, ['remote', 'get-url', 'origin']).out) ?? '';
  let agentId = work.externalId || '';
  let agentUrl = work.externalUrl || '';
  if (!agentId) {
    const published = publishMilestoneBranch(config.repo, work.milestone.branch);
    if (!published.ok) {
      await call(config, '/agent/build', {
        runId: work.runId,
        status: 'failed',
        reason: published.error,
      });
      return 'settled';
    }
    const prompt = cursorBuildPrompt('', { ...work, repo: repoName });
    const created = await cursorRequest({
      key,
      path: '',
      method: 'POST',
      body: cursorCreateBody({ repo: repoName, branch: work.milestone.branch, prompt }),
    });
    if (!created.ok) {
      await call(config, '/agent/build', { runId: work.runId, status: 'failed', reason: created.error });
      return 'settled';
    }
    agentId = created.agent.id;
    agentUrl = created.agent.url;
    await call(config, '/agent/build', {
      runId: work.runId,
      status: 'running',
      ...(agentId ? { agentId } : {}),
      ...(agentUrl ? { agentUrl } : {}),
    });
    if (created.agent.state !== 'finished') {
      say('Cursor agent is running.');
      return 'running';
    }
  }
  const looked = await cursorRequest({ key, path: `/${encodeURIComponent(agentId)}`, method: 'GET' });
  if (!looked.ok) {
    await call(config, '/agent/build', { runId: work.runId, status: 'failed', reason: looked.error });
    return 'settled';
  }
  if (looked.agent.state === 'running') {
    say('Cursor agent is still running.');
    return 'running';
  }
  if (looked.agent.state === 'failed') {
    await call(config, '/agent/build', {
      runId: work.runId,
      status: 'failed',
      reason: looked.agent.reason,
      ...(agentUrl ? { agentUrl } : {}),
    });
    return 'settled';
  }
  git(config.repo, ['fetch', 'origin', work.milestone.branch, '--quiet']);
  const log = git(config.repo, ['log', `origin/${work.milestone.branch}`, '--format=%H%x1f%B%x1e']);
  const done = mapCursorCommits(parseGitLog(log.out), work.tasks ?? []);
  if (done.length === 0) {
    await call(config, '/agent/build', {
      runId: work.runId,
      status: 'failed',
      reason: 'The Cursor agent finished without a Portal-Task trailer',
      ...(agentUrl || looked.agent.url ? { agentUrl: agentUrl || looked.agent.url } : {}),
    });
    return 'settled';
  }
  const dir = ensureWorktree(config.repo, work.milestone.branch);
  const prUrl = looked.agent.prUrl || ensurePullRequest(dir, work);
  const result = await call(config, '/agent/build', {
    runId: work.runId,
    status: 'finished',
    ...(agentId ? { agentId } : {}),
    ...(agentUrl || looked.agent.url ? { agentUrl: agentUrl || looked.agent.url } : {}),
    tasks: done,
    ...(prUrl ? { prUrl } : {}),
  });
  if (result.milestoneStatus === 'Ready to Ship') markReadyForReview(dir, work.milestone.branch);
  say(`Cursor finished ${done.length} tasks${result.milestoneStatus ? ` · milestone is ${result.milestoneStatus}` : ''}`);
  return 'settled';
}

function sleep(ms) {
  return new Promise((done) => setTimeout(done, ms));
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (!parsed.ok) {
    process.stderr.write(`${parsed.error}\n`);
    process.exit(2);
  }
  const env = readEnv(process.env);
  if (!env.ok) {
    process.stderr.write(`${env.error}\n`);
    process.exit(2);
  }
  const repo = resolve(parsed.options.dir || process.cwd());
  if (!git(repo, ['rev-parse', '--show-toplevel']).ok) {
    process.stderr.write(`${repo} is not a git repository.\n`);
    process.exit(2);
  }
  // The checkout has to be one of the repositories this runner serves, so work
  // for one project is never committed into another project's repository.
  const origin = repoFromRemote(git(repo, ['remote', 'get-url', 'origin']).out);
  if (!origin || !parsed.options.repos.includes(origin)) {
    process.stderr.write(`${repo} is ${origin ?? 'not a GitHub checkout'}, which is not in --repo ${parsed.options.repos.join(',')}.\n`);
    process.exit(2);
  }
  // One checkout, one repository: only that repository's projects are claimed here.
  const config = { ...env, id: parsed.options.id, mode: parsed.options.mode, repo, repos: [origin] };
  say(`Runner ${config.id} · ${config.mode} · ${origin} · ${new URL(config.url).hostname}`);
  let empty = 0;
  for (;;) {
    let work;
    try {
      work = await call(config, '/agent/claim', { mode: config.mode, repos: config.repos });
    } catch (error) {
      say(error.message);
      if (parsed.options.once) process.exit(1);
      await sleep(idleDelayMs(4));
      continue;
    }
    const driver = selectDriver(work);
    let buildStillRunning = false;
    if (work.kind === 'task' || work.kind === 'planning' || work.kind === 'build') {
      empty = 0;
      try {
        if (driver === 'cursor') buildStillRunning = (await doBuild(config, work)) === 'running';
        else if (work.kind === 'task') await doTask(config, work);
        else await doPlanning(config, work);
      } catch (error) {
        say(error.message);
        const body =
          work.kind === 'build'
            ? { runId: work.runId, status: 'failed', reason: 'The runner hit an error' }
            : work.kind === 'task'
              ? { runId: work.runId, status: 'failed', reason: 'The runner hit an error' }
              : { runId: work.runId, kind: 'planning', reason: 'The runner hit an error' };
        const path = work.kind === 'build' ? '/agent/build' : '/agent/complete';
        await call(config, path, body).catch((failed) => say(failed.message));
      }
    } else {
      empty += 1;
      if (!parsed.options.once) say('Nothing to do. Waiting.');
    }
    if (parsed.options.once) break;
    if (buildStillRunning) await sleep(idleDelayMs(1));
    else if (work.kind !== 'task' && work.kind !== 'planning' && work.kind !== 'build') await sleep(idleDelayMs(empty));
  }
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
