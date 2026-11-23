import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { RUNNER_TOUCH_INTERVAL_MS, runnerTouchDecision } from './agentRun';
import {
  RUNNER_HEARTBEAT_MS,
  RUNNER_READY_WITHIN_MS,
  agoLabel,
  latestRunner,
  runnerHealthCopy,
  runnerHealthState,
  runnerName,
  runnersAllowedFor,
  type RunnerHealthView,
} from './runnerHealth';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const NOW = 1_800_000_000_000;
const TOKEN_A = 'a'.repeat(32);
const TOKEN_B = 'b'.repeat(32);
const CONFIGURED = `peter-mbp=${TOKEN_A} warehauscollective/warehaus\nstudio-mini=${TOKEN_B} acme/site warehauscollective/warehaus`;
const LAUNCH = { milestoneId: 'm1', milestoneName: 'Client experience launch' };

function view(patch: Partial<RunnerHealthView> = {}): RunnerHealthView {
  return {
    repoSet: true,
    runnerAllowed: true,
    runners: [{ id: 'peter-mbp', name: "Peter's Mac", lastSeenAt: NOW - 20_000 }],
    working: null,
    building: null,
    ...patch,
  };
}

/** Replays the stored row the way `touchRunner` patches it. Returns the times it wrote. */
function replay(calls: readonly number[]): number[] {
  let row: { lastSeenAt: number; windowStart: number; count: number } | null = null;
  const writes: number[] = [];
  for (const now of calls) {
    const decision = runnerTouchDecision({ lastSeenAt: row?.lastSeenAt, windowStart: row?.windowStart, count: row?.count, now });
    if (!decision.ok || !decision.write) continue;
    row = { lastSeenAt: decision.lastSeenAt, windowStart: decision.windowStart, count: decision.count };
    writes.push(now);
  }
  return writes;
}

describe('runner heartbeat throttle', () => {
  it('writes lastSeenAt once, then not again inside the minute', () => {
    assert.deepEqual(replay([NOW, NOW + 1_000, NOW + 30_000, NOW + 59_999]), [NOW]);
  });

  it('never writes twice within a minute over five minutes of polling every 5 seconds', () => {
    const calls = Array.from({ length: 61 }, (_, index) => NOW + index * 5_000);
    const writes = replay(calls);
    assert.deepEqual(writes, [0, 1, 2, 3, 4, 5].map((minute) => NOW + minute * 60_000));
    for (let index = 1; index < writes.length; index += 1) {
      assert.equal(writes[index] - writes[index - 1] >= RUNNER_TOUCH_INTERVAL_MS, true);
    }
  });

  it('keeps an idle runner inside the Ready window on its heartbeat', () => {
    // Each ping lands after the one-minute throttle, so each one writes.
    assert.equal(RUNNER_HEARTBEAT_MS > RUNNER_TOUCH_INTERVAL_MS, true);
    assert.equal(RUNNER_HEARTBEAT_MS < RUNNER_READY_WITHIN_MS, true);
    const pings = Array.from({ length: 5 }, (_, index) => NOW + index * RUNNER_HEARTBEAT_MS);
    assert.deepEqual(replay(pings), pings);
    const http = read('../agentHttp.ts');
    assert.match(http, /'\/agent\/ping'/);
    // The ping is only the touch: it runs after it and reaches no other mutation.
    assert.equal(http.indexOf('internal.agent.touchRunner') < http.indexOf("path === '/agent/ping'"), true);
    assert.equal(http.indexOf("path === '/agent/ping'") < http.indexOf('internal.agent.claimNext'), true);
    const runnerLib = read('../../../../tools/runner/src/lib.mjs');
    assert.match(runnerLib, new RegExp(`HEARTBEAT_MS = ${RUNNER_HEARTBEAT_MS.toLocaleString('en-US').replace(/,/g, '_')}`));
  });
});

describe('runners allowed for a project', () => {
  it('returns ids for the repository and never a token', () => {
    assert.deepEqual(runnersAllowedFor(CONFIGURED, 'warehauscollective/warehaus'), ['peter-mbp', 'studio-mini']);
    assert.deepEqual(runnersAllowedFor(CONFIGURED, 'https://github.com/Acme/Site.git'), ['studio-mini']);
    assert.deepEqual(runnersAllowedFor(CONFIGURED, 'acme/other'), []);
    assert.deepEqual(runnersAllowedFor(CONFIGURED, null), []);
    assert.deepEqual(runnersAllowedFor(undefined, 'acme/site'), []);
    const out = JSON.stringify(runnersAllowedFor(CONFIGURED, 'warehauscollective/warehaus'));
    assert.equal(out.includes(TOKEN_A) || out.includes(TOKEN_B), false);
  });

  it('names a known runner and falls back to the id', () => {
    assert.equal(runnerName('peter-mbp'), "Peter's Mac");
    assert.equal(runnerName('studio-mini'), 'studio-mini');
  });
});

describe('runner health state', () => {
  it('is Ready when seen within two minutes, Offline after', () => {
    assert.equal(runnerHealthState(view(), NOW), 'ready');
    assert.equal(runnerHealthState(view(), NOW + RUNNER_READY_WITHIN_MS - 20_001), 'ready');
    assert.equal(runnerHealthState(view(), NOW + RUNNER_READY_WITHIN_MS - 20_000), 'offline');
    assert.equal(runnerHealthState(view({ runners: [{ id: 'peter-mbp', name: "Peter's Mac", lastSeenAt: null }] }), NOW), 'offline');
  });

  it('is Working while a run is in progress, whatever else is true', () => {
    assert.equal(runnerHealthState(view({ working: LAUNCH, building: LAUNCH }), NOW), 'working');
    assert.equal(runnerHealthState(view({ working: LAUNCH }), NOW + 60 * 60_000), 'working');
  });

  it('warns when the runner is offline and a milestone is Building', () => {
    assert.equal(runnerHealthState(view({ building: LAUNCH }), NOW + 2 * 60 * 60_000), 'offline-building');
    // A Building milestone with a live runner is just Ready.
    assert.equal(runnerHealthState(view({ building: LAUNCH }), NOW), 'ready');
  });

  it('is not set up without a repository, or with no runner allowed', () => {
    assert.equal(runnerHealthState(view({ repoSet: false, runnerAllowed: false, runners: [] }), NOW), 'no-repo');
    assert.equal(runnerHealthState(view({ runnerAllowed: false, runners: [] }), NOW), 'no-runner');
    assert.equal(runnerHealthState(view({ repoSet: false, working: LAUNCH }), NOW), 'no-repo');
  });

  it('goes by the runner seen most recently', () => {
    const runners = [
      { id: 'studio-mini', name: 'studio-mini', lastSeenAt: NOW - 3 * 60 * 60_000 },
      { id: 'peter-mbp', name: "Peter's Mac", lastSeenAt: NOW - 20_000 },
      { id: 'spare', name: 'spare', lastSeenAt: null },
    ];
    assert.equal(latestRunner(runners)?.id, 'peter-mbp');
    assert.equal(runnerHealthState(view({ runners }), NOW), 'ready');
    assert.equal(latestRunner([]), null);
  });
});

describe('runner health copy', () => {
  it('matches the frames for each state', () => {
    const ready = runnerHealthCopy(view(), NOW);
    assert.equal(`${ready.label} · ${ready.meta}`, "Runner ready · Peter's Mac · seen 20s ago");
    assert.deepEqual(
      [ready.compactLabel, ready.dot, ready.runner, ready.lastSeen, ready.milestone, ready.helper],
      ['Ready', 'ready', "Peter's Mac", '20s ago', '—', 'The runner will start an agent when a milestone moves to Building.'],
    );

    const working = runnerHealthCopy(view({ working: LAUNCH }), NOW);
    assert.equal(`${working.label} · ${working.meta}`, 'Runner working · Client experience launch');
    assert.deepEqual(
      [working.compactLabel, working.dot, working.warning, working.milestone, working.helper],
      ['Working', 'warning', false, 'Client experience launch', 'The runner is working on this milestone.'],
    );

    const late = NOW + 2 * 60 * 60_000 - 20_000;
    const offline = runnerHealthCopy(view(), late);
    assert.equal(`${offline.label} · ${offline.meta}`, 'Runner offline · last seen 2h ago');
    assert.deepEqual(
      [offline.compactLabel, offline.dot, offline.warning, offline.lastSeen, offline.milestone, offline.helper],
      ['Offline', 'offline', false, '2h ago', '—', "Your Mac is asleep or the runner is off. Moving a milestone to Building won't start an agent."],
    );

    const held = runnerHealthCopy(view({ building: LAUNCH }), late);
    assert.equal(`${held.label} · ${held.meta}`, 'Runner offline · Client experience launch');
    assert.deepEqual(
      [held.compactLabel, held.dot, held.warning, held.lastSeen, held.milestone, held.helper],
      ['Offline', 'warning', true, '2h ago', 'Client experience launch', 'Client experience launch is Building and waiting for the runner.'],
    );

    const noRepo = runnerHealthCopy(view({ repoSet: false, runnerAllowed: false, runners: [] }), NOW);
    assert.equal(`${noRepo.label} · ${noRepo.meta}`, 'Runner not set up · Add repo');
    assert.deepEqual(
      [noRepo.compactLabel, noRepo.dot, noRepo.runner, noRepo.lastSeen, noRepo.milestone, noRepo.helper],
      ['Not set up', 'unset', '—', '—', '—', 'This project has no GitHub repo. Add a repo before the runner can start an agent.'],
    );

    const noRunner = runnerHealthCopy(view({ runnerAllowed: false, runners: [] }), NOW);
    assert.equal(`${noRunner.label} · ${noRunner.meta}`, 'Runner not set up · No runner allowed');
    assert.deepEqual([noRunner.compactLabel, noRunner.dot, noRunner.helper], ['Not set up', 'unset', 'No runner is allowed for this project.']);
  });

  it('says so when an allowed runner has never called', () => {
    const never = runnerHealthCopy(view({ runners: [{ id: 'peter-mbp', name: "Peter's Mac", lastSeenAt: null }] }), NOW);
    assert.deepEqual([never.state, never.meta, never.lastSeen], ['offline', 'not seen yet', '—']);
  });

  it('formats relative times', () => {
    assert.equal(agoLabel(NOW, NOW), '0s ago');
    assert.equal(agoLabel(NOW + 5_000, NOW), '0s ago');
    assert.equal(agoLabel(NOW - 59_999, NOW), '59s ago');
    assert.equal(agoLabel(NOW - 60_000, NOW), '1m ago');
    assert.equal(agoLabel(NOW - 2 * 60 * 60_000, NOW), '2h ago');
    assert.equal(agoLabel(NOW - 47 * 60 * 60_000, NOW), '47h ago');
    assert.equal(agoLabel(NOW - 72 * 60 * 60_000, NOW), '3d ago');
  });
});

describe('who can read runner health', () => {
  it('is a staff query that returns ids and names, never a token', () => {
    const agent = read('../agent.ts');
    assert.match(agent, /export const runnerHealth = adminQuery\(/);
    const block = agent.slice(agent.indexOf('export const runnerHealth'));
    // The environment value goes straight into the id filter and nowhere else.
    assert.deepEqual(block.match(/RUNNER_TOKENS/g), ['RUNNER_TOKENS']);
    assert.match(block, /runnersAllowedFor\(process\.env\.RUNNER_TOKENS, repo\)/);
    assert.equal(/token/.test(block.replace('RUNNER_TOKENS', '').replace(/a token never leaves/i, '')), false);
    // Indexed and capped: no bare collect.
    assert.equal(block.includes('.collect()'), false);
    for (const index of ['by_runnerId', 'by_runner_status', 'by_projectId']) assert.equal(block.includes(index), true, index);
    assert.match(read('./wrappers.ts'), /export const adminQuery = customQuery\(query, \{[\s\S]*?Staff role required/);
  });

  it('gives a client nothing', () => {
    for (const file of ['../portalData.ts', '../tasks.ts', '../milestones.ts', '../clients.ts', '../projects.ts', '../search.ts', '../me.ts']) {
      const source = read(file);
      for (const word of ['runnerHealth', 'agentRunners', 'lastSeenAt', 'RUNNER_TOKENS']) {
        assert.equal(source.includes(word), false, `${file} has ${word}`);
      }
    }
    const projects = read('../projects.ts');
    const clientShape = projects.slice(projects.indexOf('function toClientProject'), projects.indexOf('export const'));
    assert.equal(/runner|agentRepo|lastSeen/i.test(clientShape), false);
  });
});
