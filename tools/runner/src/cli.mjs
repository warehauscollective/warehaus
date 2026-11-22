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
import {
  defaultBranchName,
  idleDelayMs,
  isMilestoneBranch,
  parseArgs,
  parsePlan,
  planPrompt,
  pullRequestBody,
  readEnv,
  repoFromRemote,
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

/** Starts the official `claude` CLI and waits for it to exit. */
function runClaude(config, cwd, prompt, runId) {
  const args = config.mode === 'headless' ? ['-p', prompt] : [prompt];
  return new Promise((done) => {
    const child = spawn('claude', args, {
      cwd,
      stdio: 'inherit',
      env: {
        ...process.env,
        // Read by the hook script so its events land on this run.
        PORTAL_AGENT_URL: config.url,
        RUNNER_TOKEN: config.token,
        RUNNER_ID: config.id,
        AGENT_RUN_ID: runId,
      },
    });
    child.on('error', (error) => {
      say(`Could not start claude: ${error.message}`);
      done(127);
    });
    child.on('exit', (code) => done(code ?? 1));
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
  say(`Reported ${outcome.status}${result.milestoneStatus ? ` · milestone is ${result.milestoneStatus}` : ''}`);
}

async function doPlanning(config, work) {
  say(`Planning · ${work.milestone.name}`);
  const dir = ensureWorktree(config.repo, work.milestone.branch);
  const planFile = join(dir, '.runner', 'plan.json');
  mkdirSync(dirname(planFile), { recursive: true });
  rmSync(planFile, { force: true });
  await runClaude(config, dir, planPrompt(readFileSync(join(prompts, 'plan-milestone.md'), 'utf8'), work), work.runId);
  const plan = parsePlan(readIfPresent(planFile) || 'null');
  if (!plan.ok) {
    say(`No usable plan: ${plan.error}`);
    await call(config, '/agent/complete', { runId: work.runId, kind: 'planning', reason: plan.error });
    return;
  }
  const result = await call(config, '/agent/tasks', { runId: work.runId, tasks: plan.tasks });
  rmSync(planFile, { force: true });
  say(`Wrote ${plan.tasks.length} tasks${result.milestoneStatus ? ` · milestone is ${result.milestoneStatus}` : ''}`);
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
      work = await call(config, '/agent/claim', { mode: config.mode, tool: 'claude_code', repos: config.repos });
    } catch (error) {
      say(error.message);
      if (parsed.options.once) process.exit(1);
      await sleep(idleDelayMs(4));
      continue;
    }
    if (work.kind === 'task' || work.kind === 'planning') {
      empty = 0;
      try {
        if (work.kind === 'task') await doTask(config, work);
        else await doPlanning(config, work);
      } catch (error) {
        say(error.message);
        const body =
          work.kind === 'task'
            ? { runId: work.runId, status: 'failed', reason: error.message }
            : { runId: work.runId, kind: 'planning', reason: error.message };
        await call(config, '/agent/complete', body).catch((failed) => say(failed.message));
      }
    } else {
      empty += 1;
      if (!parsed.options.once) say('Nothing to do. Waiting.');
    }
    if (parsed.options.once) break;
    if (work.kind !== 'task' && work.kind !== 'planning') await sleep(idleDelayMs(empty));
  }
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
