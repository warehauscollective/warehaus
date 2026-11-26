#!/usr/bin/env node
// Warehaus runner. Claims milestone work from the Portal, opens the official
// `claude` CLI on the milestone branch, and reports back.
//
// It never reads or forwards a Claude credential and never calls a model API.
// The only program it starts for model work is the `claude` binary.

import { spawn, spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cursorBuild } from './drivers/cursorBuild.mjs';
import { runInstall, runUninstall } from './install.mjs';
import { repoTools } from './repo.mjs';
import {
  deleteKeychainSecret,
  deploymentFor,
  readKeychainSecret,
  readSavedConfig,
  removeSavedConfig,
  runSetup,
} from './setup.mjs';
import { runnerClient } from '../../../packages/runner-protocol/index.mjs';
import {
  attentionForStatus,
  HEARTBEAT_MS,
  idleDelayMs,
  idleWait,
  parseArgs,
  parsePlanOutput,
  planPrompt,
  childEnv,
  readEnv,
  RUNNER_HOME_DIR,
  runSlots,
  selectDriver,
  supervisorCommand,
  supervisorLine,
  taskOutcome,
  taskPrompt,
} from './lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const prompts = join(here, '..', 'prompts');

function say(message) {
  process.stdout.write(`[runner] ${message}\n`);
}

/**
 * State lines for the runner Mac app (apps/mac), which starts the runner with
 * --supervised. Without it this does nothing and the log reads as before.
 */
let supervised = false;
function report(type, fields = {}) {
  if (supervised) process.stdout.write(supervisorLine(type, fields));
}

/**
 * Pause from the app. A paused runner claims nothing and tells the Portal on
 * every heartbeat; a run in progress finishes first ("Pause after this run").
 * `wake` cuts a wait short so Pause and Resume take effect at once.
 */
const control = { paused: false, wake: null, changed: 0 };

function listenForCommands() {
  const lines = createInterface({ input: process.stdin });
  lines.on('line', (line) => {
    const command = supervisorCommand(line);
    if (!command) return;
    control.paused = command === 'pause';
    control.wake?.();
  });
  // The app went away: stop with it rather than run unsupervised.
  lines.on('close', () => process.exit(0));
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
  return outcome.status;
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
    return 'failed';
  }
  const result = await client(config).writeTasks({ runId: work.runId, tasks: plan.tasks });
  say(`Wrote ${plan.tasks.length} tasks${result.milestoneStatus ? ` · milestone is ${result.milestoneStatus}` : ''}`);
  return 'done';
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

/** A sleep that Pause or Resume from the app cuts short. */
function wakeableSleep(ms) {
  return new Promise((done) => {
    const timer = setTimeout(finish, ms);
    function finish() {
      clearTimeout(timer);
      if (control.wake === finish) control.wake = null;
      done();
    }
    control.wake = finish;
  });
}

/**
 * Waits between empty polls, pinging the Portal every heartbeat so the runner
 * health chip keeps reading Ready, and carrying Paused. See idleWait in lib.mjs.
 * Pause or Resume from the app ends the wait early.
 */
function waitIdle(config, ms) {
  const pausedAtStart = control.paused;
  const changedAtStart = control.changed;
  return idleWait({
    ms,
    sleep: wakeableSleep,
    // A run that ends frees a slot, so the wait ends too.
    stopped: () => control.paused !== pausedAtStart || control.changed !== changedAtStart,
    ping: () => client(config).ping({ paused: control.paused }),
  });
}

/**
 * Every slot is in use, or the runner is paused with runs still going. Waits
 * one heartbeat, or less when a run ends or Pause changes, then pings so the
 * Portal keeps seeing the runner while it works.
 */
async function waitBusy(config, ms = HEARTBEAT_MS) {
  const changedAtStart = control.changed;
  const pausedAtStart = control.paused;
  await wakeableSleep(ms);
  if (control.changed !== changedAtStart || control.paused !== pausedAtStart) return;
  await client(config).ping().catch((error) => say(error.message));
}

/** How long a GitHub sign-in check is trusted before `gh auth status` runs again. */
const GITHUB_CHECK_MS = 10 * 60_000;
let githubCheckedAt = 0;
let githubSignedIn = true;

/** Supervised only: builds push with gh, so a signed-out gh means builds wait. */
function githubReady() {
  if (!supervised) return true;
  const now = Date.now();
  if (now - githubCheckedAt < GITHUB_CHECK_MS) return githubSignedIn;
  githubCheckedAt = now;
  const checked = spawnSync('gh', ['auth', 'status'], { stdio: 'ignore', timeout: 15_000 });
  githubSignedIn = checked.status === 0;
  return githubSignedIn;
}

/**
 * `npm run runner -- remove`: Remove this runner in the app. Revokes the
 * registration in the Portal with the runner's own secret, removes the launchd
 * agent, then deletes the Keychain entry and the saved file. The local steps
 * run even when the Portal cannot be reached; exit code 3 says the revoke did
 * not happen, so the app can tell the person to revoke it in the Portal.
 */
async function runRemove({ production }) {
  const deployment = deploymentFor(production);
  const saved = readSavedConfig(production);
  const id = saved.RUNNER_ID || '';
  let revoked = !id;
  if (id) {
    const token = readKeychainSecret(deployment.name, id);
    const env = readEnv({ PORTAL_AGENT_URL: saved.PORTAL_AGENT_URL, RUNNER_PRODUCTION: saved.RUNNER_PRODUCTION }, { production, token });
    if (env.ok) {
      try {
        await runnerClient({ url: env.url, token: env.token, runnerId: id, timeoutMs: 15_000 }).unpair();
        revoked = true;
      } catch (error) {
        // 401: the Portal no longer knows this secret, so it is already revoked.
        if (error.status === 401) revoked = true;
        else say(`Could not revoke ${id} in the Portal: ${error.message}`);
      }
    } else {
      say(`Could not revoke ${id} in the Portal: ${env.error}`);
    }
  }
  runUninstall({ production, say });
  const keychainGone = deleteKeychainSecret(deployment.name, id);
  removeSavedConfig(production);
  say(`${id || 'This runner'}: ${revoked ? 'revoked in the Portal' : 'NOT revoked in the Portal'}, launchd agent removed, ${keychainGone ? 'Keychain secret deleted' : 'Keychain secret could not be deleted'}.`);
  if (!keychainGone) process.exit(4);
  if (!revoked) process.exit(3);
}

/**
 * `app-release`: the latest runner app build, for the Mac app's self-update.
 * The app never holds the runner secret, so it asks through this command,
 * which prints one app_release line. Exit 3 when the Portal refuses the
 * secret, 2 when this Mac is not paired, 1 when the Portal can't be reached.
 */
async function runAppRelease({ production }) {
  const saved = readSavedConfig(production);
  const id = saved.RUNNER_ID || '';
  if (!id) process.exit(2);
  const token = readKeychainSecret(deploymentFor(production).name, id);
  const env = readEnv({ PORTAL_AGENT_URL: saved.PORTAL_AGENT_URL, RUNNER_PRODUCTION: saved.RUNNER_PRODUCTION }, { production, token });
  if (!env.ok) {
    process.stderr.write(`${env.error}\n`);
    process.exit(2);
  }
  try {
    const result = await runnerClient({ url: env.url, token: env.token, runnerId: id, timeoutMs: 15_000 }).appRelease();
    process.stdout.write(supervisorLine('app_release', { release: result?.release ?? null }));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(error.status === 401 ? 3 : 1);
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
    supervised = parsed.options.supervised === true;
    await runSetup({ production, id: parsed.options.id, say, report: supervised ? report : null });
    return;
  }
  if (parsed.options.command === 'install') return runInstall({ production, say });
  if (parsed.options.command === 'uninstall') return runUninstall({ production, say });
  if (parsed.options.command === 'remove') return runRemove({ production });
  if (parsed.options.command === 'app-release') return runAppRelease({ production });
  supervised = parsed.options.supervised === true;
  control.paused = parsed.options.paused === true;
  if (supervised) listenForCommands();
  // The environment wins; otherwise the file and Keychain entry setup wrote.
  const saved = readSavedConfig(production);
  const id = parsed.options.id || saved.RUNNER_ID || '';
  if (!id && !production && readSavedConfig(true).RUNNER_ID) {
    process.stderr.write('This Mac is paired to production only. Start it with --production.\n');
    process.exit(2);
  }
  if (!id) {
    report('attention', { reason: 'not_paired' });
    process.stderr.write('No runner id. Run npm run runner -- setup, or pass --id.\n');
    process.exit(2);
  }
  const url = process.env.PORTAL_AGENT_URL || saved.PORTAL_AGENT_URL || '';
  const token = process.env.RUNNER_TOKEN || readKeychainSecret(deploymentFor(production).name, id);
  const env = readEnv({ PORTAL_AGENT_URL: url, RUNNER_PRODUCTION: saved.RUNNER_PRODUCTION }, { production, token });
  if (!env.ok) {
    if (!token) report('attention', { reason: 'not_paired' });
    process.stderr.write(`${env.error}\n`);
    process.exit(2);
  }
  // A registered runner names no repository and serves every project that has one,
  // each in its own clone. --repo narrows it to those repositories.
  const config = { ...env, id, mode: parsed.options.mode, repos: parsed.options.repos };
  const serves = config.repos.length ? config.repos.join(', ') : 'every project with a repository';
  say(`Runner ${config.id} · ${config.mode} · ${serves} · ${new URL(config.url).hostname}`);
  report('started', { runnerId: config.id, production: config.production, paused: control.paused });
  const slots = runSlots(parsed.options.parallel);
  if (slots.size > 1) say(`Works up to ${slots.size} milestones at once`);

  /** One run in its own slot. It reports working and finished with its run id, then frees the slot. */
  function startRun(work) {
    const driver = selectDriver(work);
    const about = {
      runId: work.runId,
      kind: work.kind,
      milestoneId: work.milestone?.id ?? null,
      milestone: work.milestone?.name ?? '',
      ...(work.kind === 'task' ? { taskOrder: work.task?.order ?? null, task: work.task?.title ?? '' } : {}),
    };
    slots.start(work.runId);
    report('working', { ...about, running: slots.running });
    return (async () => {
      const release = holdAwake();
      let status = 'done';
      let buildStillRunning = false;
      try {
        if (driver === 'cursor') {
          buildStillRunning = (await doBuild(config, work)) === 'running';
          status = buildStillRunning ? 'running' : 'done';
        } else if (work.kind === 'task') status = (await doTask(config, work)) ?? 'failed';
        else status = await doPlanning(config, work);
      } catch (error) {
        say(error.message);
        // A clone that failed blocks the run with its own reason, which lands in a needs Peter note.
        const blocked = typeof error.reason === 'string' && error.reason ? error.reason : null;
        const reason = blocked ?? 'The runner hit an error';
        const api = client(config);
        const failure =
          work.kind === 'build'
            ? api.reportBuild({ runId: work.runId, status: 'failed', reason })
            : work.kind === 'task'
              ? api.completeTask({ runId: work.runId, status: blocked ? 'blocked' : 'failed', reason })
              : api.failPlanning({ runId: work.runId, reason });
        await failure.catch((failed) => say(failed.message));
        status = blocked ? 'blocked' : 'failed';
      } finally {
        release();
      }
      // A Cursor agent still going: give the slot back, and follow it again after a minute.
      if (buildStillRunning) slots.coolDown(work.runId, idleDelayMs(1));
      else slots.finish(work.runId);
      report('finished', { ...about, status, running: slots.running });
      control.changed += 1;
      control.wake?.();
    })();
  }

  let empty = 0;
  let failures = 0;
  let pausedReported = false;
  for (;;) {
    if (control.paused) {
      // Pause after this run: runs in progress finish first, and only then is the runner Paused.
      if (slots.running > 0) {
        await waitBusy(config);
        continue;
      }
      if (!pausedReported) report('paused');
      pausedReported = true;
      await client(config).ping({ paused: true }).catch((error) => say(error.message));
      await wakeableSleep(HEARTBEAT_MS);
      continue;
    }
    pausedReported = false;
    if (!githubReady()) {
      report('attention', { reason: 'github' });
      await wakeableSleep(idleDelayMs(1));
      continue;
    }
    if (!slots.free()) {
      await waitBusy(config, Math.min(HEARTBEAT_MS, slots.nextCoolDownMs() ?? HEARTBEAT_MS));
      continue;
    }
    let work;
    try {
      work = await client(config).claim({
        mode: config.mode,
        repos: config.repos,
        slots: slots.size,
        held: slots.held(),
        ...(supervised ? { paused: false } : {}),
      });
      failures = 0;
    } catch (error) {
      say(error.message);
      failures += 1;
      const reason = attentionForStatus(error.status) ?? (failures >= 3 ? 'unreachable' : null);
      if (reason) report('attention', { reason });
      if (parsed.options.once) process.exit(1);
      await wakeableSleep(idleDelayMs(4));
      continue;
    }
    if (work.kind === 'task' || work.kind === 'planning' || work.kind === 'build') {
      empty = 0;
      // A Portal that predates parallel runs hands back a run this runner already holds. Wait for it instead.
      if (slots.held().includes(work.runId)) {
        await waitBusy(config);
        continue;
      }
      const run = startRun(work);
      if (parsed.options.once) {
        await run;
        break;
      }
      // Fill the next free slot straight away.
      continue;
    }
    empty += 1;
    if (slots.running === 0) {
      report('idle');
      if (!parsed.options.once) say('Nothing to do. Waiting.');
    }
    if (parsed.options.once) break;
    const coolDown = slots.nextCoolDownMs();
    await waitIdle(config, coolDown == null ? idleDelayMs(empty) : Math.min(idleDelayMs(empty), Math.max(coolDown, 1_000)));
  }
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
