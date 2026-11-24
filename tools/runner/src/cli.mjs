#!/usr/bin/env node
// Warehaus runner. Claims milestone work from the Portal, opens the official
// `claude` CLI on the milestone branch, and reports back.
//
// It never reads or forwards a Claude credential and never calls a model API.
// The only program it starts for model work is the `claude` binary.

import { spawn } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cursorBuild } from './drivers/cursorBuild.mjs';
import { repoTools } from './repo.mjs';
import { runnerClient } from '../../../packages/runner-protocol/index.mjs';
import {
  idleDelayMs,
  parseArgs,
  parsePlanOutput,
  planPrompt,
  childEnv,
  readEnv,
  repoFromRemote,
  selectDriver,
  taskOutcome,
  taskPrompt,
} from './lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const prompts = join(here, '..', 'prompts');

function say(message) {
  process.stdout.write(`[runner] ${message}\n`);
}

/** One protocol client per runner config. */
const clients = new WeakMap();
function client(config) {
  if (!clients.has(config)) clients.set(config, runnerClient({ url: config.url, token: config.token, runnerId: config.id }));
  return clients.get(config);
}

const tools = repoTools({ say });
const { git, ensureWorktree, ensurePullRequest, markReadyForReview } = tools;

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
      await client(config).completeTask({ runId: work.runId, status: 'failed', reason: 'The push to origin failed' });
      return;
    }
  }
  const prUrl = outcome.commitSha ? ensurePullRequest(dir, work) : null;
  const result = await client(config).completeTask({ runId: work.runId, ...outcome, ...(prUrl ? { prUrl } : {}) });
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
    await client(config).failPlanning({ runId: work.runId, reason: plan.error });
    return;
  }
  const result = await client(config).writeTasks({ runId: work.runId, tasks: plan.tasks });
  say(`Wrote ${plan.tasks.length} tasks${result.milestoneStatus ? ` · milestone is ${result.milestoneStatus}` : ''}`);
}

/** One step of a Cursor build. The key stays in this process: see drivers/cursorBuild.mjs. */
function doBuild(config, work) {
  say(`Cursor · ${work.milestone.name} · ${work.milestone.branch}`);
  return cursorBuild({
    config,
    repoName: config.repos[0] ?? '',
    work,
    key: (process.env.CURSOR_API_KEY ?? '').trim(),
    tools,
    call: (path, body) => client(config).post(path, body),
    say,
  });
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
      work = await client(config).claim({ mode: config.mode, repos: config.repos });
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
        const reason = 'The runner hit an error';
        const api = client(config);
        const report =
          work.kind === 'build'
            ? api.reportBuild({ runId: work.runId, status: 'failed', reason })
            : work.kind === 'task'
              ? api.completeTask({ runId: work.runId, status: 'failed', reason })
              : api.failPlanning({ runId: work.runId, reason });
        await report.catch((failed) => say(failed.message));
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
