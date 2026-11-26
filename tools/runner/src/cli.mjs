#!/usr/bin/env node
// Warehaus runner. Claims milestone work from the Portal, opens the official
// `claude` CLI on the milestone branch, and reports back.
//
// It never reads or forwards a Claude credential and never calls a model API.
// The only program it starts for model work is the `claude` binary.

import { spawn } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cursorBuild } from './drivers/cursorBuild.mjs';
import { runInstall, runUninstall } from './install.mjs';
import { repoTools } from './repo.mjs';
import { deploymentFor, readKeychainSecret, readSavedConfig, runSetup } from './setup.mjs';
import { runnerClient } from '../../../packages/runner-protocol/index.mjs';
import {
  heartbeatSlices,
  idleDelayMs,
  keepCheckingIn,
  parseArgs,
  parsePlanOutput,
  planPrompt,
  childEnv,
  readEnv,
  RUNNER_HOME_DIR,
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
const { git, ensureClone, ensureWorktree, ensurePullRequest, markReadyForReview } = tools;

/** The runner's own folder, ~/warehaus-runner. Its clones live in repos/, its worktrees in worktrees/. */
const runnerHome = join(homedir(), RUNNER_HOME_DIR);

/**
 * The runner's clone of the project's repository. Throws with a `reason` the
 * Portal shows Peter when it cannot be cloned; the run is blocked, not retried.
 */
function checkoutFor(work) {
  return ensureClone(work.milestone?.repo, runnerHome);
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
  const dir = ensureWorktree(checkoutFor(work), work.milestone.branch);
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
  const dir = ensureWorktree(checkoutFor(work), work.milestone.branch);
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
  const checkout = checkoutFor(work);
  return cursorBuild({
    config,
    checkout,
    repoName: work.milestone.repo,
    work,
    key: (process.env.CURSOR_API_KEY ?? '').trim(),
    tools,
    call: (path, body) => client(config).post(path, body),
    say,
  });
}

/**
 * Keeps the Mac from idle sleep while a run is in progress, and only then.
 * Returns the release. Off macOS it does nothing.
 */
function holdAwake() {
  if (process.platform !== 'darwin') return () => {};
  const child = spawn('caffeinate', ['-i', '-w', String(process.pid)], { stdio: 'ignore' });
  child.on('error', () => {});
  return () => child.kill();
}

function sleep(ms) {
  return new Promise((done) => setTimeout(done, ms));
}

/**
 * Waits between empty polls, pinging the Portal every heartbeat so the runner
 * health chip keeps reading Ready. A ping claims nothing. A failed one is skipped.
 */
async function idleWait(config, ms) {
  const slices = heartbeatSlices(ms);
  for (let index = 0; index < slices.length; index += 1) {
    await sleep(slices[index]);
    if (index < slices.length - 1) await call(config, '/agent/ping', {}).catch(() => {});
  }
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (!parsed.ok) {
    process.stderr.write(`${parsed.error}\n`);
    process.exit(2);
  }
  const { production } = parsed.options;
  if (parsed.options.command === 'setup') {
    await runSetup({ production, id: parsed.options.id, say });
    return;
  }
  if (parsed.options.command === 'install') return runInstall({ production, say });
  if (parsed.options.command === 'uninstall') return runUninstall({ production, say });
  // The environment wins; otherwise the file and Keychain entry setup wrote.
  const saved = readSavedConfig(production);
  const id = parsed.options.id || saved.RUNNER_ID || '';
  if (!id && !production && readSavedConfig(true).RUNNER_ID) {
    process.stderr.write('This Mac is paired to production only. Start it with --production.\n');
    process.exit(2);
  }
  if (!id) {
    process.stderr.write('No runner id. Run npm run runner -- setup, or pass --id.\n');
    process.exit(2);
  }
  const url = process.env.PORTAL_AGENT_URL || saved.PORTAL_AGENT_URL || '';
  const token = process.env.RUNNER_TOKEN || readKeychainSecret(deploymentFor(production).name, id);
  const env = readEnv({ PORTAL_AGENT_URL: url, RUNNER_PRODUCTION: saved.RUNNER_PRODUCTION }, { production, token });
  if (!env.ok) {
    process.stderr.write(`${env.error}\n`);
    process.exit(2);
  }
  // A registered runner names no repository and serves every project that has one,
  // each in its own clone. --repo narrows it to those repositories.
  const config = { ...env, id, mode: parsed.options.mode, repos: parsed.options.repos };
  const serves = config.repos.length ? config.repos.join(', ') : 'every project with a repository';
  say(`Runner ${config.id} · ${config.mode} · ${serves} · ${new URL(config.url).hostname}`);
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
      const release = holdAwake();
      // The Portal hears from the runner through a long run, not only between runs.
      const stopCheckingIn = keepCheckingIn(() => call(config, '/agent/ping', {}));
      try {
        if (driver === 'cursor') buildStillRunning = (await doBuild(config, work)) === 'running';
        else if (work.kind === 'task') await doTask(config, work);
        else await doPlanning(config, work);
      } catch (error) {
        say(error.message);
        // A clone that failed blocks the run with its own reason, which lands in a needs Peter note.
        const blocked = typeof error.reason === 'string' && error.reason ? error.reason : null;
        const reason = blocked ?? 'The runner hit an error';
        const api = client(config);
        const report =
          work.kind === 'build'
            ? api.reportBuild({ runId: work.runId, status: 'failed', reason })
            : work.kind === 'task'
              ? api.completeTask({ runId: work.runId, status: blocked ? 'blocked' : 'failed', reason })
              : api.failPlanning({ runId: work.runId, reason });
        await report.catch((failed) => say(failed.message));
      } finally {
        release();
        stopCheckingIn();
      }
    } else {
      empty += 1;
      if (!parsed.options.once) say('Nothing to do. Waiting.');
    }
    if (parsed.options.once) break;
    if (buildStillRunning) await sleep(idleDelayMs(1));
    else if (work.kind !== 'task' && work.kind !== 'planning' && work.kind !== 'build') await idleWait(config, idleDelayMs(empty));
  }
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
