import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  BLOCKED_NEEDS_REASON,
  COMMIT_SHA_INVALID,
  EVENT_PAYLOAD_LIMIT,
  EVENT_SUMMARY_LIMIT,
  FEED_MAX,
  FEED_PAGE,
  RUNNER_RATE_LIMIT,
  RUNNER_RATE_LIMITED,
  RUNNER_RATE_WINDOW_MS,
  completeDecision,
  eventSummary,
  eventType,
  feedLimit,
  milestoneBranch,
  redactSecrets,
  runnerOnline,
  runnerRateDecision,
  runnerTouchDecision,
  trimEventPayload,
  RETRY_RUN_ACTIVE,
  RETRY_RUN_WINDING_DOWN,
  RUN_LEASE_GRACE_MS,
  cursorAgentToResume,
  retryLeaseDecision,
  runLease,
} from './agentRun';
import { checklistDetailText, checklistState, checklistSummary } from './milestoneTasks';
import { classifyClaimable } from './milestoneTaskSet';
import * as agentModule from '../agent';
import { claimNext, completeTask, releaseRun, releaseStuckRuns, reportBuild, touchRunner, writePlannedTasks } from '../agent';
import crons from '../crons';
import { create as createStaffMilestone, createFromAi, setStatus } from '../milestones';
import { createMilestone, listOpenAsks, updateMilestone } from '../portalApi';
import { setAgentDriver, setAgentRepo } from '../projects';
import { heldRunIds, openRunDecision, RUNNER_BUSY, RUNNER_MAX_SLOTS, RUNNER_NEEDS_REPO, runnerSlots } from './agentRun';
import { PortalAuthError } from './identity';
import { memoryCtx, type MemoryCtx } from './memoryCtx.testkit';
import { seedMilestone, seedMilestoneWorld } from './seedRows.testkit';
import { sha256Hex } from './tokenCrypto';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const RUNNER = 'peter-mbp';
const OTHER_RUNNER = 'studio-mini';
const REPO = 'warehauscollective/warehaus';
const SHA = 'c'.repeat(40);
const SOURCE = 'portal-milestone';
const API = { tokenId: 'apiTokens:1', requestHash: 'hash', tokenName: 'grok-bot' };

type Claim = { ok: boolean; kind: string; resumed: boolean; runId: string; reason?: string; task?: { id: string; title: string } };

/** A served project with a Building milestone and its ordered tasks. */
function building(t: MemoryCtx, names: string[] = ['First'], milestone: Record<string, unknown> = {}, project: Record<string, unknown> = {}) {
  const world = seedMilestoneWorld(t, { status: 'Building', branch: 'milestone/launch', ...milestone }, { agentRepo: REPO, ...project });
  const taskIds = names.map((name, index) => world.task({ name, source: SOURCE, milestoneOrder: index }));
  return { ...world, taskIds };
}

function seedRun(t: MemoryCtx, ids: { orgId: string; milestoneId: string }, fields: Record<string, unknown> = {}) {
  return t.seed('agentRuns', {
    orgId: ids.orgId,
    milestoneId: ids.milestoneId,
    kind: 'task',
    runnerId: OTHER_RUNNER,
    tool: 'claude_code',
    mode: 'headless',
    status: 'running',
    startedAt: Date.now(),
    ...fields,
  });
}

const claim = (t: MemoryCtx, runnerId = RUNNER, extra: Record<string, unknown> = {}) =>
  t.call<Claim>(claimNext, { runnerId, repos: [REPO], ...extra });
describe('no RUNNER_TOKENS fallback', () => {
  it('reads no RUNNER_TOKENS anywhere in Convex, and every claim is a registered runner naming its repositories', () => {
    // Absence guard (ADR-0005, task 13): runners get in only by their registration.
    for (const path of ['../agent.ts', '../agentHttp.ts', './agentRun.ts', './runnerHealth.ts', './runnerRegistry.ts']) {
      assert.doesNotMatch(read(path), /process\.env\.RUNNER_TOKENS|parseRunnerTokens|authorizeRunner|envAuthorized/, path);
    }
    const http = read('../agentHttp.ts');
    assert.match(http, /repos: runnerRepos\(body\.repos\),\s*anyRepo: true/);
  });
});

describe('rate limit and liveness', () => {
  it('allows 120 calls a minute and then waits for the next window', () => {
    let state = { windowStart: 0, count: 0 };
    const now = 1_000_000;
    for (let call = 0; call < RUNNER_RATE_LIMIT; call += 1) {
      const next = runnerRateDecision({ ...state, now });
      assert.equal(next.ok, true);
      if (next.ok) state = { windowStart: next.windowStart, count: next.count };
    }
    assert.equal(runnerRateDecision({ ...state, now }).ok, false);
    assert.equal(runnerRateDecision({ ...state, now: now + RUNNER_RATE_WINDOW_MS }).ok, true);
  });

  it('patches a runner at most once a minute', () => {
    const now = 1_000_000;
    const first = runnerTouchDecision({ lastSeenAt: null, windowStart: null, count: null, now });
    assert.deepEqual(first, { ok: true, write: true, windowStart: now, count: 1, lastSeenAt: now });
    const again = runnerTouchDecision({ lastSeenAt: now, windowStart: now, count: 1, now: now + 30_000 });
    assert.deepEqual(again, { ok: true, write: false });
    const held = runnerTouchDecision({ lastSeenAt: now, windowStart: now, count: RUNNER_RATE_LIMIT, now: now + 30_000 });
    assert.deepEqual(held, { ok: false, reason: RUNNER_RATE_LIMITED });
    const later = runnerTouchDecision({ lastSeenAt: now, windowStart: now, count: 1, now: now + 60_000 });
    assert.deepEqual(later, { ok: true, write: true, windowStart: now + 60_000, count: 1, lastSeenAt: now + 60_000 });
  });

  it('touchRunner writes the runner row once, and a call inside the same minute writes nothing', async () => {
    const t = memoryCtx();
    const tokenHash = await sha256Hex('runner-secret-'.padEnd(40, 'x'));
    t.seed('agentRunners', { runnerId: RUNNER, windowStart: 0, count: 0, tokenHash, registeredAt: 1 });
    const call = { runnerId: RUNNER, tokenHash };
    assert.deepEqual(await t.call(touchRunner, call), { ok: true, registered: true });
    const first = t.rows('agentRunners');
    assert.equal(first.length, 1);
    assert.equal(first[0]?.count, 1);
    assert.deepEqual(await t.call(touchRunner, call), { ok: true, registered: true });
    assert.deepEqual(t.rows('agentRunners'), first);
    // An unregistered id, or a wrong secret, is refused and writes nothing.
    assert.equal((await t.call<{ ok: boolean }>(touchRunner, { runnerId: 'someone-else', tokenHash })).ok, false);
    assert.equal((await t.call<{ ok: boolean }>(touchRunner, { runnerId: RUNNER, tokenHash: await sha256Hex('wrong') })).ok, false);
    assert.deepEqual(t.rows('agentRunners'), first);
  });

  it('a claim inspects at most 5 milestones of one project, so one project cannot starve the rest', async () => {
    const t = memoryCtx();
    const { orgId, projectId } = building(t, []);
    // Five busy milestones on the same project come first in the scan.
    const busy = [t.rows('milestones')[0]?._id as string];
    for (let i = 0; i < 4; i += 1) busy.push(seedMilestone(t, orgId, projectId, { status: 'Building' }));
    for (const milestoneId of busy) seedRun(t, { orgId, milestoneId });
    const sixth = seedMilestone(t, orgId, projectId, { status: 'Building' });
    t.seed('tasks', {
      orgId,
      projectId,
      milestoneId: sixth,
      notionPageId: 'sixth-task',
      lastSyncedAt: 0,
      name: 'Past the cap',
      status: 'To Do',
      isDone: false,
      publishToWarehaus: false,
      source: SOURCE,
      milestoneOrder: 0,
    });
    assert.equal((await claim(t)).kind, 'none');
    // Another project's milestone, later in the scan, is still reached.
    const other = building(t, ['Other project task']);
    const next = await claim(t);
    assert.equal(next.kind, 'task');
    assert.equal(next.task?.id, other.taskIds[0]);
  });

  it('reads a quiet runner as offline', () => {
    assert.equal(runnerOnline(1000, 1000 + 60_000), true);
    assert.equal(runnerOnline(1000, 1000 + 11 * 60_000), false);
    assert.equal(runnerOnline(null, 5), false);
  });
});

describe('claiming', () => {
  const task = (over: Record<string, unknown>) => ({
    id: 't',
    milestoneId: 'm',
    status: 'To Do',
    isDone: false,
    milestoneOrder: 0,
    source: 'portal-milestone',
    ...over,
  });

  it('claims in one mutation, and a second runner cannot take the same task', async () => {
    const t = memoryCtx();
    const { taskIds, milestoneId } = building(t, ['First', 'Second']);
    const first = await claim(t);
    assert.equal(first.kind, 'task');
    assert.equal(first.resumed, false);
    assert.equal(first.task?.id, taskIds[0]);
    // The claim patch and the run row land in the same mutation, with nothing scheduled or run elsewhere.
    assert.equal(t.row(taskIds[0] as string)?.claimedBy, RUNNER);
    assert.equal(t.row(taskIds[0] as string)?.status, 'In Progress');
    const runs = t.rows('agentRuns');
    assert.equal(runs.length, 1);
    assert.equal(runs[0]?._id, first.runId);
    assert.equal(runs[0]?.taskId, taskIds[0]);
    assert.equal(runs[0]?.milestoneId, milestoneId);
    assert.deepEqual(t.scheduled, []);
    assert.deepEqual(t.runs, []);
    // A second runner does not get the claimed task, or any other task on that milestone's branch.
    assert.equal((await claim(t, OTHER_RUNNER)).kind, 'none');
    assert.equal(t.row(taskIds[1] as string)?.claimedBy, undefined);
    // The second runner reads the task after the first commit and sees it claimed.
    const afterFirstClaim = [task({ id: 'a', status: 'In Progress', claimedBy: 'peter-mbp' }), task({ id: 'b', milestoneOrder: 1 })];
    assert.equal(classifyClaimable(afterFirstClaim).nextClaimable?.id, 'b');
    // A runner with a run still open gets that run back, and nothing new is claimed.
    const again = await claim(t);
    assert.equal(again.resumed, true);
    assert.equal(again.runId, first.runId);
    assert.equal(again.task?.id, taskIds[0]);
    assert.equal(t.rows('agentRuns').length, 1);
  });
});

describe('parallel runs', () => {
  it('reads slots and held runs defensively', () => {
    assert.equal(runnerSlots(undefined), 1);
    assert.equal(runnerSlots(3), 3);
    assert.equal(runnerSlots(2.7), 2);
    assert.equal(runnerSlots(0), 1);
    assert.equal(runnerSlots(99), RUNNER_MAX_SLOTS);
    assert.equal(runnerSlots('3'), 1);
    assert.deepEqual(heldRunIds(['a', 'a', '', 7, 'b']), ['a', 'b']);
    assert.deepEqual(heldRunIds('a'), []);
  });

  it('hands back an open run the runner did not list, and is full when every slot holds a run', () => {
    assert.deepEqual(openRunDecision({ open: ['a', 'b'], held: ['a'], slots: 3 }), { resume: 'b', full: false });
    assert.deepEqual(openRunDecision({ open: ['a', 'b'], held: ['a', 'b'], slots: 2 }), { resume: null, full: true });
    assert.deepEqual(openRunDecision({ open: [], held: [], slots: 1 }), { resume: null, full: false });
    // Protocol 2: one slot and no list, so the open run comes back.
    assert.deepEqual(openRunDecision({ open: ['a'], held: [], slots: 1 }), { resume: 'a', full: false });
  });

  it('works several Building milestones at once, one run on each, up to its slots', async () => {
    const t = memoryCtx();
    const first = building(t, ['A1', 'A2']);
    const second = building(t, ['B1']);
    const third = building(t, ['C1']);
    const one = await claim(t, RUNNER, { slots: 2, held: [] });
    assert.equal(one.kind, 'task');
    const two = await claim(t, RUNNER, { slots: 2, held: [one.runId] });
    assert.equal(two.kind, 'task');
    assert.equal(two.resumed, false);
    const milestones = new Set(t.rows('agentRuns').map((run) => run.milestoneId));
    assert.equal(milestones.size, 2, 'two runs on two different milestones');
    // Both slots are in use: nothing new, even with a third milestone waiting.
    const full = await claim(t, RUNNER, { slots: 2, held: [one.runId, two.runId] });
    assert.equal(full.kind, 'none');
    assert.equal(full.reason, RUNNER_BUSY);
    assert.equal(t.rows('agentRuns').length, 2);
    // A third slot takes the third milestone, never a second task on a busy one.
    const three = await claim(t, RUNNER, { slots: 3, held: [one.runId, two.runId] });
    assert.equal(three.kind, 'task');
    const byMilestone = t.rows('agentRuns').map((run) => run.milestoneId);
    assert.deepEqual(new Set(byMilestone), new Set([first.milestoneId, second.milestoneId, third.milestoneId]));
    assert.equal(t.row(first.taskIds[1] as string)?.claimedBy, undefined);
  });

  it('gives a runner that lost track of a run that same run back before anything new', async () => {
    const t = memoryCtx();
    building(t, ['A1']);
    building(t, ['B1']);
    const one = await claim(t, RUNNER, { slots: 3, held: [] });
    const again = await claim(t, RUNNER, { slots: 3, held: [] });
    assert.equal(again.resumed, true);
    assert.equal(again.runId, one.runId);
    assert.equal(t.rows('agentRuns').length, 1);
  });

  it('passes slots and held runs through the claim route', () => {
    const http = read('../agentHttp.ts');
    assert.match(http, /slots: runnerSlots\(body\.slots\)/);
    assert.match(http, /held: heldRunIds\(body\.held\)/);
  });
});

describe('finishing a task', () => {
  it('closes the task with its commit', () => {
    const done = completeDecision({ status: 'done', commitSha: '4C1E9AA0FF' });
    assert.equal(done.ok, true);
    if (done.ok) {
      assert.deepEqual(done.task, { status: 'Done', isDone: true });
      assert.equal(done.commitSha, '4c1e9aa0ff');
      assert.equal(done.run, 'succeeded');
    }
  });

  it('needs a reason to block and hands a failed task back', () => {
    assert.deepEqual(completeDecision({ status: 'blocked' }), { ok: false, reason: BLOCKED_NEEDS_REASON });
    const blocked = completeDecision({ status: 'blocked', reason: 'needs Figma frame' });
    assert.equal(blocked.ok && blocked.task.status, 'Blocked');
    const failed = completeDecision({ status: 'failed' });
    assert.equal(failed.ok && failed.task.status, 'Blocked');
    assert.equal(failed.ok && failed.reason, 'The run failed');
    assert.equal(completeDecision({ status: 'shipped' }).ok, false);
    assert.deepEqual(completeDecision({ status: 'done', commitSha: 'not a sha' }), { ok: false, reason: COMMIT_SHA_INVALID });
  });

  it('moves the milestone to Ready to Ship through the one status writer, and a repeat writes nothing', async () => {
    const t = memoryCtx();
    const { milestoneId, taskIds } = building(t, ['Only task']);
    const run = await claim(t);
    const done = await t.call<{ ok: boolean; duplicate: boolean; milestoneStatus: string }>(completeTask, {
      runnerId: RUNNER,
      runId: run.runId,
      status: 'done',
      commitSha: SHA,
    });
    assert.deepEqual([done.ok, done.duplicate, done.milestoneStatus], [true, false, 'Ready to Ship']);
    assert.equal(t.row(milestoneId)?.status, 'Ready to Ship');
    assert.equal(t.row(taskIds[0] as string)?.lastCommitSha, SHA);
    // The status writer's own effects: one status activity row and Peter's approval note.
    assert.equal(t.rows('activity').filter((row) => row.type === 'milestone.status' && row.milestoneId === milestoneId).length, 1);
    assert.equal(t.rows('milestoneNotes').filter((note) => note.open === true && note.reason === 'approval').length, 1);
    const tables = ['agentRuns', 'agentEvents', 'tasks', 'milestones', 'milestoneNotes', 'activity'];
    const before = JSON.stringify(tables.map((table) => t.rows(table)));
    const again = await t.call<{ ok: boolean; duplicate: boolean; run: string; milestoneStatus: string }>(completeTask, {
      runnerId: RUNNER,
      runId: run.runId,
      status: 'done',
      commitSha: SHA,
    });
    assert.deepEqual([again.ok, again.duplicate, again.run, again.milestoneStatus], [true, true, 'succeeded', 'Ready to Ship']);
    assert.equal(JSON.stringify(tables.map((table) => t.rows(table))), before);
  });

  it('hands a task back to To do on a release, with no Ask, and the next claim takes it again', async () => {
    const t = memoryCtx();
    const { milestoneId, taskIds } = building(t, ['Board columns']);
    const run = await claim(t);
    const reason = "Claude usage limit · resets 8:30am (America/New_York)";
    const released = await t.call<{ ok: boolean; duplicate: boolean }>(releaseRun, { runnerId: RUNNER, runId: run.runId, reason });
    assert.deepEqual([released.ok, released.duplicate], [true, false]);
    const task = t.row(taskIds[0] as string);
    assert.deepEqual([task?.status, task?.claimedBy, task?.blockedReason], ['To Do', undefined, undefined]);
    const row = t.row(run.runId);
    assert.equal(row?.status, 'cancelled');
    assert.equal(typeof row?.settledAt, 'number');
    assert.equal(t.rows('milestoneNotes').filter((note) => note.open === true).length, 0);
    const events = t.rows('agentEvents').filter((event) => event.milestoneId === milestoneId);
    assert.equal(events[events.length - 1]?.type, 'note');
    assert.match(String(events[events.length - 1]?.summary), /^Task 01 went back to To do · Claude usage limit/);
    // A repeat writes nothing.
    const before = JSON.stringify(['agentRuns', 'agentEvents', 'tasks'].map((table) => t.rows(table)));
    const again = await t.call<{ ok: boolean; duplicate: boolean }>(releaseRun, { runnerId: RUNNER, runId: run.runId, reason });
    assert.deepEqual([again.ok, again.duplicate], [true, true]);
    assert.equal(JSON.stringify(['agentRuns', 'agentEvents', 'tasks'].map((table) => t.rows(table))), before);
    // The released run holds nothing, so the same task is claimable again.
    const next = await claim(t);
    assert.equal(next.task?.id, taskIds[0]);
    assert.notEqual(next.runId, run.runId);
  });

  it('puts a released plan back in the queue, and refuses another runner or a Cursor build', async () => {
    const t = memoryCtx();
    const planning = seedMilestoneWorld(t, { status: 'Planning', planning: 'queued' }, { agentRepo: REPO });
    const run = await claim(t);
    assert.equal(run.kind, 'planning');
    const refused = await t.call<{ ok: boolean; status: number }>(releaseRun, { runnerId: OTHER_RUNNER, runId: run.runId });
    assert.deepEqual([refused.ok, refused.status], [false, 403]);
    await t.call(releaseRun, { runnerId: RUNNER, runId: run.runId, reason: 'Claude usage limit' });
    assert.equal(t.row(planning.milestoneId)?.planning, 'queued');
    assert.equal(t.rows('milestoneNotes').filter((note) => note.open === true).length, 0);
    const build = seedRun(t, { orgId: planning.orgId, milestoneId: planning.milestoneId }, { kind: 'build', runnerId: RUNNER });
    const wrongKind = await t.call<{ ok: boolean; status: number }>(releaseRun, { runnerId: RUNNER, runId: build });
    assert.deepEqual([wrongKind.ok, wrongKind.status], [false, 400]);
  });

  it('never writes Shipped from the runner', () => {
    // Absence guard: only a merge or Mark complete ships a milestone.
    assert.doesNotMatch(read('../agent.ts'), /status: 'Shipped'/);
  });
});

describe('event payloads', () => {
  it('masks credentials in any string', () => {
    const fakeKey = `sk-${'x'.repeat(24)}`;
    const text = redactSecrets(`curl -H "Authorization: Bearer abcdefghijklmnop1234" ${fakeKey} ghp_abcdefghijklmnopqrstuvwx`);
    assert.equal(text.includes('abcdefghijklmnop1234'), false);
    assert.equal(text.includes(fakeKey), false);
    assert.equal(text.includes('ghp_'), false);
  });

  it('cuts the summary to one short line', () => {
    const summary = eventSummary(`  Edited\n  a file ${'x'.repeat(400)}`);
    assert.equal(summary.ok, true);
    if (summary.ok) {
      assert.equal(summary.summary.length, EVENT_SUMMARY_LIMIT);
      assert.equal(summary.summary.includes('\n'), false);
    }
    assert.equal(eventSummary('   ').ok, false);
    assert.equal(eventSummary(42).ok, false);
  });

  it('strips the environment and credential-named keys, and caps the size', () => {
    const stored = trimEventPayload({
      tool_name: 'Bash',
      env: { RUNNER_TOKEN: 'super-secret-value' },
      tool_input: { command: 'npm test', apiKey: 'k-123456', nested: { password: 'hunter2', note: 'fine' } },
      authorization: 'Bearer abcdefghijklmnop1234',
    });
    assert.ok(stored);
    assert.equal(stored.includes('super-secret-value'), false);
    assert.equal(stored.includes('k-123456'), false);
    assert.equal(stored.includes('hunter2'), false);
    assert.equal(stored.includes('abcdefghijklmnop1234'), false);
    assert.match(stored, /npm test/);
    assert.match(stored, /fine/);
    const big = trimEventPayload({ output: Array.from({ length: 10 }, () => 'y'.repeat(290)), more: 'z'.repeat(290) });
    assert.ok(big && big.length <= EVENT_PAYLOAD_LIMIT);
    assert.equal(trimEventPayload(null), null);
    assert.equal(trimEventPayload({}), null);
  });

  it('stores an unknown event type as a note', () => {
    assert.equal(eventType('commit'), 'commit');
    assert.equal(eventType('rm -rf'), 'note');
    assert.equal(eventType(undefined), 'note');
  });
});

describe('branch and feed', () => {
  it('names the branch from the milestone', () => {
    assert.equal(milestoneBranch('Client experience launch'), 'milestone/client-experience-launch');
    assert.equal(milestoneBranch('  Visitor Check-In!! '), 'milestone/visitor-check-in');
    assert.equal(milestoneBranch('Café ☕ menu'), 'milestone/cafe-menu');
    assert.equal(milestoneBranch('***'), 'milestone/untitled');
    assert.ok(milestoneBranch('x'.repeat(200)).length <= 'milestone/'.length + 48);
  });

  it('pages the feed by 20 up to 200', () => {
    assert.equal(feedLimit(undefined), FEED_PAGE);
    assert.equal(feedLimit(5), FEED_PAGE);
    assert.equal(feedLimit(40), 40);
    assert.equal(feedLimit(5000), FEED_MAX);
  });
});

describe('checklist with runner fields', () => {
  it('shows the commit, the runner and the blocked reason', () => {
    assert.equal(checklistDetailText({ status: 'Done', isDone: true, commit: '4c1e9aa' }), 'Done · 4c1e9aa');
    assert.equal(checklistDetailText({ status: 'In Progress', isDone: false, runner: 'peter-mbp' }), 'In progress · peter-mbp');
    assert.equal(
      checklistDetailText({ status: 'Blocked', isDone: false, blockedReason: 'needs Figma frame' }),
      'Blocked · needs Figma frame',
    );
    assert.equal(checklistDetailText({ status: 'To Do', isDone: false }), 'To do');
    assert.equal(checklistState({ status: 'Blocked', isDone: false }), 'blocked');
    assert.equal(
      checklistSummary([
        { status: 'Done', isDone: true },
        { status: 'In Progress', isDone: false },
        { status: 'Blocked', isDone: false },
      ]),
      '1 done · 1 in progress · 1 blocked',
    );
  });
});

describe('who can read agent tables', () => {
  it('gives a client session nothing', () => {
    for (const file of ['../portalData.ts', '../tasks.ts', '../milestones.ts', '../clients.ts', '../projects.ts', '../search.ts']) {
      const source = read(file);
      for (const table of ['agentRuns', 'agentEvents', 'agentRunners']) {
        assert.equal(source.includes(table), false, `${file} reads ${table}`);
      }
    }
    const agent = read('../agent.ts');
    assert.equal(agent.includes('clientQuery'), false);
    assert.equal(agent.includes('clientMutation'), false);
  });

  it('exposes five staff functions and keeps every other function internal', async () => {
    type Registered = { _handler?: unknown; isPublic?: boolean; isInternal?: boolean };
    const functions = Object.entries(agentModule as Record<string, unknown>).filter(
      ([, value]) => typeof (value as Registered | null)?._handler === 'function',
    ) as Array<[string, Registered]>;
    const publicNames = functions.filter(([, fn]) => fn.isPublic).map(([name]) => name).sort();
    assert.deepEqual(publicNames, ['buildingProgress', 'feedForMilestone', 'regeneratePlan', 'retryBlocked', 'runnerHealth']);
    // Every other function is internal, so only the runner routes reach it.
    for (const [name, fn] of functions) assert.equal(fn.isPublic === true || fn.isInternal === true, true, name);
    const t = memoryCtx();
    const { milestoneId, projectId } = building(t);
    for (const name of publicNames) {
      const fn = (agentModule as Record<string, unknown>)[name];
      const args = name === 'runnerHealth' ? { projectId } : { milestoneId };
      await assert.rejects(t.call(fn, args, { as: 'client' }), PortalAuthError, `${name} as client`);
      await assert.rejects(t.call(fn, args), PortalAuthError, `${name} signed out`);
    }
  });

  it('holds no model key in Convex', () => {
    for (const file of ['../agent.ts', '../agentHttp.ts', './agentRun.ts']) {
      assert.equal(/ANTHROPIC|OPENAI|api\.anthropic\.com|CLAUDE_CODE_OAUTH/.test(read(file)), false, file);
    }
  });
});

describe('queue rules', () => {
  it('plans any milestone created with no tasks, whatever made it', async () => {
    const { planningForNewMilestone } = await import('./agentRun');
    assert.equal(planningForNewMilestone({ taskCount: 0, status: 'Planning' }), true);
    assert.equal(planningForNewMilestone({ taskCount: 3, status: 'Awaiting Go' }), false);
    assert.equal(planningForNewMilestone({ taskCount: 0, status: 'Parked' }), false);
  });

  it('queues planning for a new milestone with no tasks from every create path, and not for a bot that sends tasks', async () => {
    const t = memoryCtx();
    const { orgId, projectId } = building(t, []);
    const base = { projectId, objective: 'Ship it', goals: [] as string[] };
    const staff = await t.call<{ id: string }>(createStaffMilestone, { ...base, name: 'From staff', status: 'Planning' }, { as: 'staff' });
    const ai = await t.call<{ id: string }>(createFromAi, { ...base, orgId, name: 'From Claude', status: 'Planning', createdVia: 'claude' });
    const bare = await t.call<{ status: number; body: { id: string } }>(createMilestone, { ...API, ...base, key: 'bare', name: 'Bot, no tasks' });
    const listed = await t.call<{ status: number; body: { id: string } }>(createMilestone, {
      ...API,
      ...base,
      key: 'listed',
      name: 'Bot with tasks',
      proposedTasks: [{ title: 'One' }, { title: 'Two' }, { title: 'Three' }],
    });
    assert.equal(bare.status, 200);
    assert.equal(listed.status, 200);
    for (const id of [staff.id, ai.id, bare.body.id]) {
      assert.equal(t.row(id)?.status, 'Planning', id);
      assert.equal(t.row(id)?.planning, 'queued', id);
    }
    assert.equal(t.row(listed.body.id)?.planning, undefined);
  });

  it('keeps one task run per milestone and releases a run whose runner went quiet', async () => {
    const { runIsStuck, STUCK_RUN_AFTER_MS } = await import('./agentRun');
    assert.equal(runIsStuck({ lastSeenAt: 0, startedAt: 0, now: STUCK_RUN_AFTER_MS }), true);
    assert.equal(runIsStuck({ lastSeenAt: 1000, startedAt: 0, now: 1000 + STUCK_RUN_AFTER_MS - 1 }), false);
    assert.equal(runIsStuck({ lastSeenAt: null, startedAt: 5000, now: 6000 }), false);
  });

  it('claims nothing on a milestone that already has a running run', async () => {
    const t = memoryCtx();
    const { orgId, milestoneId, taskIds } = building(t, ['Waiting']);
    seedRun(t, { orgId, milestoneId });
    assert.equal((await claim(t)).kind, 'none');
    assert.equal(t.row(taskIds[0] as string)?.status, 'To Do');
    assert.equal(t.rows('agentRuns').length, 1);
  });

  it('the stuck sweep blocks a quiet run with one indexed, capped read, and runs from a cron', async () => {
    const t = memoryCtx();
    const { orgId, milestoneId, taskIds } = building(t, ['Stuck task']);
    const taskId = taskIds[0] as string;
    await t.db.patch(taskId, { status: 'In Progress', claimedBy: OTHER_RUNNER, claimedAt: 1 });
    const runId = seedRun(t, { orgId, milestoneId }, { taskId, startedAt: 1 });
    t.reads.reset();
    const result = await t.call<{ scanned: number; released: number; pairingsSwept: number }>(releaseStuckRuns, {});
    // No runner is registered here, so the Building milestone also gets the no-runner note.
    assert.deepEqual(result, { scanned: 1, released: 1, pairingsSwept: 0, noRunnerOpened: 1, noRunnerClosed: 0 });
    assert.equal(t.row(runId)?.status, 'cancelled');
    assert.equal(t.row(taskId)?.status, 'Blocked');
    assert.deepEqual(t.reads.unbounded(), []);
    assert.deepEqual(t.reads.unindexed(), []);
    assert.deepEqual(t.reads.all[0], { table: 'agentRuns', index: 'by_status', eq: ['status'], terminal: 'take', limit: 25 });
    const jobs = Object.values((crons as unknown as { crons: Record<string, { name: string }> }).crons);
    assert.equal(jobs.some((job) => job.name === 'agent:releaseStuckRuns'), true);
  });

  it('blocks a Cursor build after 2 hours with an Ask, counting from the first launch', async () => {
    const { CURSOR_BUILD_MAX_MS, CURSOR_BUILD_TOO_LONG, cursorBuildTooLong } = await import('./agentRun');
    const now = Date.now();
    assert.equal(cursorBuildTooLong({ startedAt: now - CURSOR_BUILD_MAX_MS + 1000, now }), false);
    assert.equal(cursorBuildTooLong({ startedAt: now - CURSOR_BUILD_MAX_MS, now }), true);
    // A resumed build counts from the agent's first launch, not the follow-up run.
    assert.equal(cursorBuildTooLong({ agentStartedAt: now - CURSOR_BUILD_MAX_MS, startedAt: now - 60_000, now }), true);
    const t = memoryCtx();
    const { orgId, milestoneId } = building(t, ['Long build'], {}, { agentDriver: 'cursor' });
    t.seed('agentRunners', { runnerId: OTHER_RUNNER, windowStart: now, count: 0, lastSeenAt: now });
    const runId = seedRun(t, { orgId, milestoneId }, {
      kind: 'build',
      tool: 'cursor',
      startedAt: now - 60_000,
      agentStartedAt: now - CURSOR_BUILD_MAX_MS - 1000,
      externalId: 'bc-long',
    });
    const result = await t.call<{ released: number }>(releaseStuckRuns, {});
    assert.equal(result.released, 1);
    assert.equal(t.row(runId)?.status, 'failed');
    assert.equal(t.row(runId)?.blockedReason, CURSOR_BUILD_TOO_LONG);
    const notes = t.rows('milestoneNotes').filter((note) => note.milestoneId === milestoneId && /2 hours/.test(String(note.body)));
    assert.equal(notes.length, 1);
  });

  it('leaves a Cursor build under 2 hours alone while its runner is seen', async () => {
    const t = memoryCtx();
    const now = Date.now();
    const { orgId, milestoneId } = building(t, ['Short build'], {}, { agentDriver: 'cursor' });
    t.seed('agentRunners', { runnerId: OTHER_RUNNER, windowStart: now, count: 0, lastSeenAt: now });
    const runId = seedRun(t, { orgId, milestoneId }, { kind: 'build', tool: 'cursor', startedAt: now - 60 * 60_000 });
    const result = await t.call<{ released: number }>(releaseStuckRuns, {});
    assert.equal(result.released, 0);
    assert.equal(t.row(runId)?.status, 'running');
  });
});

describe('repository fail-safe', () => {
  it('hands a runner nothing for a project with no repository, or one it does not serve', async () => {
    const { agentRepo, projectServedBy, runnerRepos } = await import('./agentRun');
    assert.equal(agentRepo('WarehausCollective/warehaus'), 'warehauscollective/warehaus');
    assert.equal(agentRepo('https://github.com/warehauscollective/warehaus.git'), 'warehauscollective/warehaus');
    for (const bad of ['warehaus', 'a/b/c', '../etc', '', null, 5]) assert.equal(agentRepo(bad), null, String(bad));
    assert.deepEqual(runnerRepos(['A/b', 'a/b', 'nope', 'c/d']), ['a/b', 'c/d']);
    assert.deepEqual(runnerRepos('a/b, c/d'), ['a/b', 'c/d']);
    assert.deepEqual(runnerRepos(undefined), []);
    assert.equal(projectServedBy({ agentRepo: 'a/b' }, ['a/b']), true);
    assert.equal(projectServedBy({ agentRepo: 'a/b' }, ['c/d']), false);
    assert.equal(projectServedBy({ agentRepo: null }, ['a/b']), false);
    assert.equal(projectServedBy({}, ['a/b']), false);
    assert.equal(projectServedBy(null, ['a/b']), false);
  });

  it('checks the repository before planning and before tasks, and a runner with none gets nothing', async () => {
    const t = memoryCtx();
    const elsewhere = { agentRepo: 'someone/else' };
    const planning = seedMilestoneWorld(t, { status: 'Planning', planning: 'queued' }, elsewhere);
    const builder = building(t, ['Not yours'], {}, elsewhere);
    const none = await t.call<Claim>(claimNext, { runnerId: RUNNER });
    assert.deepEqual([none.kind, none.reason], ['none', RUNNER_NEEDS_REPO]);
    assert.equal((await t.call<Claim>(claimNext, { runnerId: RUNNER, repos: [] })).kind, 'none');
    // A runner for another repository is handed neither the planning job nor the task.
    assert.equal((await claim(t)).kind, 'none');
    assert.equal(t.row(planning.milestoneId)?.planning, 'queued');
    assert.equal(t.row(builder.taskIds[0] as string)?.status, 'To Do');
    assert.deepEqual(t.rows('agentRuns'), []);
    // The runner that serves that repository gets the planning job first.
    const served = await t.call<Claim>(claimNext, { runnerId: RUNNER, repos: ['someone/else'] });
    assert.equal(served.kind, 'planning');
  });

  it('lets only staff set the repository and the agent', async () => {
    const t = memoryCtx();
    const { projectId } = building(t, []);
    for (const as of ['client', undefined] as const) {
      await assert.rejects(t.call(setAgentRepo, { projectId, repo: 'someone/else' }, { as }), PortalAuthError);
      await assert.rejects(t.call(setAgentDriver, { projectId, driver: 'cursor' }, { as }), PortalAuthError);
    }
    assert.equal(t.row(projectId)?.agentRepo, REPO);
    assert.equal(t.row(projectId)?.agentDriver, undefined);
  });

  it('runs the agent the project names and ignores a tool the runner sends', async () => {
    const t = memoryCtx();
    building(t, ['Claude task']);
    const task = await claim(t, RUNNER, { tool: 'cursor' });
    assert.equal(task.kind, 'task');
    assert.equal(t.row(task.runId)?.tool, 'claude_code');
    // The claim names the project's repository, so the runner works in its own clone of it.
    assert.equal((task as unknown as { milestone: { repo: string | null } }).milestone.repo, REPO);
    building(t, ['Cursor task'], {}, { agentDriver: 'cursor' });
    const build = await claim(t, OTHER_RUNNER, { tool: 'claude_code' });
    assert.equal(build.kind, 'build');
    assert.equal(t.row(build.runId)?.tool, 'cursor');
  });
});

describe('Asks', () => {
  it('asks for approval from the local preview and never names the Vercel one', async () => {
    const { approvalNote, blockedNote, localPreviewCommand } = await import('./agentRun');
    const note = approvalNote({
      milestoneName: 'Client experience launch',
      iteration: 2,
      branch: 'milestone/client-experience-launch',
      prUrl: 'https://github.com/warehauscollective/warehaus/pull/140',
      localPreviewUrl: 'http://localhost:3100/',
    });
    assert.match(note, /Iteration 2 is Ready to Ship and needs your review/);
    assert.match(note, /pull\/140/);
    assert.match(note, /npm run preview:pr -- milestone\/client-experience-launch/);
    assert.match(note, /http:\/\/localhost:3100\//);
    assert.match(note, /Merge and deploy stay separate steps/);
    assert.equal(/vercel/i.test(note), false);
    assert.equal(localPreviewCommand('milestone/x'), 'npm run preview:pr -- milestone/x');
    const blocked = blockedNote({
      milestoneName: 'Launch',
      taskOrder: '06',
      taskName: 'Adjust mobile summary',
      reason: 'needs Figma frame',
      runnerId: 'peter-mbp',
    });
    assert.match(blocked, /Task 06 is blocked and needs you/);
    assert.match(blocked, /Blocked on: needs Figma frame/);
  });

  it('lists open notes newest first with one indexed, capped read', async () => {
    const t = memoryCtx();
    const { orgId, milestoneId } = building(t, []);
    const note = (body: string, createdAt: number, open: boolean) =>
      t.seed('milestoneNotes', {
        orgId,
        milestoneId,
        body,
        addedBy: 'runner:peter-mbp',
        createdAt,
        reason: 'blocked',
        ...(open ? { open: true } : {}),
      });
    note('older', 1, true);
    note('answered', 2, false);
    note('newer', 3, true);
    t.reads.reset();
    const listed = await t.call<{ status: number; body: { items: Array<{ body: string }> } }>(listOpenAsks, {});
    assert.equal(listed.status, 200);
    assert.deepEqual(listed.body.items.map((item) => item.body), ['newer', 'older']);
    assert.deepEqual(t.reads.unbounded(), []);
    assert.deepEqual(t.reads.unindexed(), []);
  });

  it('lists only the Asks waiting on one person, with one indexed, capped read', async () => {
    const t = memoryCtx();
    const { orgId, milestoneId } = building(t, []);
    const staff = (name: string, email: string) =>
      t.seed('contacts', {
        orgId,
        notionPageId: `seed-contact-${name}`,
        lastSyncedAt: 0,
        name,
        email,
        role: 'Warehaus Staff',
        portalAccess: 'Enabled',
      });
    const maya = staff('Maya Chen', 'maya@warehaus.test');
    const omar = staff('Omar Reyes', 'omar@warehaus.test');
    const ask = (body: string, createdAt: number, waitingOn: string | null, open = true) =>
      t.seed('milestoneNotes', {
        orgId,
        milestoneId,
        body,
        addedBy: 'runner:peter-mbp',
        createdAt,
        reason: 'blocked',
        ...(waitingOn ? { waitingOn } : {}),
        ...(open ? { open: true } : {}),
      });
    ask('maya older', 1, maya);
    ask('omar', 2, omar);
    ask('maya answered', 3, maya, false);
    ask('maya newer', 4, maya);
    ask('no one', 5, null);
    type Listed = { status: number; body: { items: Array<{ body: string; waitingOn: { id: string; name: string } | null }> } };
    t.reads.reset();
    const forMaya = await t.call<Listed>(listOpenAsks, { waitingOn: maya });
    assert.deepEqual(forMaya.body.items.map((item) => item.body), ['maya newer', 'maya older']);
    assert.deepEqual(forMaya.body.items[0]?.waitingOn, { id: maya, name: 'Maya Chen' });
    assert.deepEqual(t.reads.unbounded(), []);
    assert.deepEqual(t.reads.unindexed(), []);
    const everyone = await t.call<Listed>(listOpenAsks, {});
    assert.deepEqual(everyone.body.items.map((item) => item.body), ['no one', 'maya newer', 'omar', 'maya older']);
    assert.equal(everyone.body.items[0]?.waitingOn, null);
    assert.equal(everyone.body.items[2]?.waitingOn?.name, 'Omar Reyes');
  });

  it('lists the Asks for a person named by email, contact id or "peter"', async () => {
    const t = memoryCtx();
    const { orgId, milestoneId } = building(t, []);
    const contact = (name: string, email: string, role: 'Warehaus Staff' | 'Client Admin' = 'Warehaus Staff') =>
      t.seed('contacts', {
        orgId,
        notionPageId: `seed-contact-${name}`,
        lastSyncedAt: 0,
        name,
        email,
        role,
        portalAccess: 'Enabled',
      });
    const maya = contact('Maya Chen', 'maya@warehaus.test');
    const peter = contact('Peter', 'peter@warehaus.co');
    const client = contact('Cleo Client', 'cleo@client.test', 'Client Admin');
    const ask = (body: string, createdAt: number, waitingOn: string) =>
      t.seed('milestoneNotes', {
        orgId,
        milestoneId,
        body,
        addedBy: 'runner:peter-mbp',
        createdAt,
        reason: 'blocked',
        waitingOn,
        open: true,
      });
    ask('for maya', 1, maya);
    ask('for peter', 2, peter);
    type Listed = { status: number; body: { items?: Array<{ body: string }>; error?: string } };
    const bodies = (listed: Listed) => listed.body.items?.map((item) => item.body);
    t.reads.reset();
    assert.deepEqual(bodies(await t.call<Listed>(listOpenAsks, { person: ' Maya@Warehaus.test ' })), ['for maya']);
    assert.deepEqual(bodies(await t.call<Listed>(listOpenAsks, { person: maya })), ['for maya']);
    assert.deepEqual(bodies(await t.call<Listed>(listOpenAsks, { person: 'peter' })), ['for peter']);
    assert.deepEqual(t.reads.unbounded(), []);
    assert.deepEqual(t.reads.unindexed(), []);
    // A typo, a client and another table's id are a 404, not an empty list.
    for (const person of ['nobody@warehaus.test', 'cleo@client.test', client, milestoneId, 'not an id']) {
      const missing = await t.call<Listed>(listOpenAsks, { person });
      assert.equal(missing.status, 404, person);
      assert.equal(missing.body.error, 'No staff member matches that person');
    }
  });

  it('the old needs-peter read lists Peter\'s Asks, and every open Ask where Peter has no contact', async () => {
    const t = memoryCtx();
    const { orgId, milestoneId } = building(t, []);
    const ask = (body: string, createdAt: number, waitingOn?: string) =>
      t.seed('milestoneNotes', {
        orgId,
        milestoneId,
        body,
        addedBy: 'runner:peter-mbp',
        createdAt,
        reason: 'blocked',
        open: true,
        ...(waitingOn ? { waitingOn } : {}),
      });
    type Listed = { status: number; body: { items?: Array<{ body: string }> } };
    const old = { person: 'peter', personOptional: true };
    ask('waits on no one', 1);
    const noPeter = await t.call<Listed>(listOpenAsks, old);
    assert.deepEqual(noPeter.body.items?.map((item) => item.body), ['waits on no one']);
    assert.equal((await t.call<Listed>(listOpenAsks, { person: 'peter' })).status, 404);

    const staff = (name: string, email: string) =>
      t.seed('contacts', {
        orgId,
        notionPageId: `seed-contact-${name}`,
        lastSyncedAt: 0,
        name,
        email,
        role: 'Warehaus Staff',
        portalAccess: 'Enabled',
      });
    const peter = staff('Peter', 'peter@warehaus.co');
    const maya = staff('Maya Chen', 'maya@warehaus.test');
    ask('for peter', 2, peter);
    ask('for maya', 3, maya);
    const withPeter = await t.call<Listed>(listOpenAsks, old);
    assert.deepEqual(withPeter.body.items?.map((item) => item.body), ['for peter']);
  });

  it('writes a blocked Ask waiting on Peter, and keeps who it waited on once answered', async () => {
    const t = memoryCtx();
    const { orgId, milestoneId, taskIds } = building(t, ['Needs a frame', 'Has an Ask']);
    const peter = t.seed('contacts', {
      orgId,
      notionPageId: 'seed-contact-peter',
      lastSyncedAt: 0,
      name: 'Peter',
      email: 'peter@warehaus.co',
      role: 'Warehaus Staff',
      portalAccess: 'Enabled',
    });
    const run = await claim(t);
    await t.call(completeTask, { runnerId: RUNNER, runId: run.runId, status: 'blocked', reason: 'needs Figma frame' });
    const [note] = t.rows('milestoneNotes');
    assert.equal(note?.open, true);
    assert.equal(note?.waitingOn, peter);
    const listed = await t.call<{ body: { items: Array<{ id: string }> } }>(listOpenAsks, { waitingOn: peter });
    assert.deepEqual(listed.body.items.map((item) => item.id), [note?._id]);
    // An older Ask on the second task. Finishing that task answers it.
    const older = t.seed('milestoneNotes', {
      orgId,
      milestoneId,
      body: 'Task 02 is blocked and needs you',
      addedBy: 'runner:peter-mbp',
      createdAt: 1,
      open: true,
      waitingOn: peter,
      reason: 'blocked',
      taskId: taskIds[1] as string,
    });
    const next = await claim(t);
    await t.call(completeTask, { runnerId: RUNNER, runId: next.runId, status: 'done', commitSha: SHA });
    assert.equal(t.row(older)?.open, undefined);
    assert.equal(t.row(older)?.waitingOn, peter);
  });

  it('writes the approval Ask waiting on Peter when the last task is done', async () => {
    const t = memoryCtx();
    const { orgId } = building(t, ['Only task']);
    const peter = t.seed('contacts', {
      orgId,
      notionPageId: 'seed-contact-peter',
      lastSyncedAt: 0,
      name: 'Peter',
      email: 'peter@warehaus.co',
      role: 'Warehaus Staff',
      portalAccess: 'Enabled',
    });
    const run = await claim(t);
    await t.call(completeTask, { runnerId: RUNNER, runId: run.runId, status: 'done', commitSha: SHA });
    const asks = t.rows('milestoneNotes').filter((row) => row.open === true);
    assert.deepEqual(asks.map((row) => [row.reason, row.waitingOn]), [['approval', peter]]);
  });

  it('still writes the Ask, waiting on no one, where Peter has no contact', async () => {
    const t = memoryCtx();
    building(t, ['Needs a frame']);
    const run = await claim(t);
    await t.call(completeTask, { runnerId: RUNNER, runId: run.runId, status: 'blocked', reason: 'needs Figma frame' });
    const [note] = t.rows('milestoneNotes');
    assert.equal(note?.open, true);
    assert.equal(note?.waitingOn, undefined);
  });

  it('makes no outbound call from the runner functions', () => {
    // Absence guard: the runner side never fetches, schedules or runs an action.
    assert.doesNotMatch(read('../agent.ts'), /fetch\(|runAction|scheduler/);
  });

  it('leaves an open note when a task is blocked, and a done task closes only its own note', async () => {
    const t = memoryCtx();
    const { orgId, milestoneId, taskIds } = building(t, ['Needs a frame', 'Has a note']);
    const [blockedId, notedId] = taskIds as [string, string];
    const run = await claim(t);
    await t.call(completeTask, { runnerId: RUNNER, runId: run.runId, status: 'blocked', reason: 'needs Figma frame' });
    const open = () => t.rows('milestoneNotes').filter((row) => row.open === true);
    assert.equal(open().length, 1);
    assert.equal(open()[0]?.reason, 'blocked');
    assert.equal(open()[0]?.taskId, blockedId);
    assert.match(String(open()[0]?.body), /Blocked on: needs Figma frame/);
    // An older blocked note on the second task, still open.
    t.seed('milestoneNotes', {
      orgId,
      milestoneId,
      body: 'Task 02 is blocked and needs you',
      addedBy: 'runner:peter-mbp',
      createdAt: 1,
      open: true,
      reason: 'blocked',
      taskId: notedId,
    });
    const next = await claim(t);
    assert.equal(next.task?.id, notedId);
    await t.call(completeTask, { runnerId: RUNNER, runId: next.runId, status: 'done', commitSha: SHA });
    assert.deepEqual(open().map((row) => row.taskId), [blockedId]);
  });
});

describe('auto-planning and agent choice', () => {
  it('queues one planning run per iteration and skips when tasks exist', async () => {
    const { planningEnqueueDecision, planningForNewMilestone, PLANNING_RATE_LIMIT } = await import('./agentRun');
    assert.equal(planningForNewMilestone({ taskCount: 0, status: 'Planning' }), true);
    assert.equal(planningForNewMilestone({ taskCount: 0, status: 'Awaiting Go' }), false);
    assert.equal(planningForNewMilestone({ taskCount: 0, status: 'Idea' }), false);
    const first = planningEnqueueDecision({
      status: 'Planning',
      taskCount: 0,
      planning: null,
      planningIteration: null,
      iteration: 1,
      recentRuns: 0,
    });
    assert.deepEqual(first, { enqueue: true, replace: false });
    const again = planningEnqueueDecision({
      status: 'Planning',
      taskCount: 0,
      planning: 'queued',
      planningIteration: 1,
      iteration: 1,
      recentRuns: 1,
    });
    assert.deepEqual(again, { enqueue: false, replace: false });
    const withTasks = planningEnqueueDecision({
      status: 'Planning',
      taskCount: 4,
      planning: null,
      iteration: 1,
      recentRuns: 0,
    });
    assert.equal(withTasks.enqueue, false);
    const regenerate = planningEnqueueDecision({
      status: 'Planning',
      taskCount: 4,
      planning: null,
      iteration: 1,
      regenerate: true,
      recentRuns: 0,
    });
    assert.deepEqual(regenerate, { enqueue: true, replace: true });
    const running = planningEnqueueDecision({
      status: 'Planning',
      taskCount: 0,
      planning: 'running',
      iteration: 1,
      regenerate: true,
      recentRuns: 1,
    });
    assert.equal(running.enqueue, false);
    const capped = planningEnqueueDecision({
      status: 'Planning',
      taskCount: 0,
      planning: null,
      iteration: 1,
      recentRuns: PLANNING_RATE_LIMIT,
    });
    assert.equal(capped.enqueue, false);
    // Absence guard: a planning run never moves the milestone toward Awaiting Go. Staff edit the draft first.
    const agent = read('../agent.ts');
    assert.doesNotMatch(agent.slice(agent.indexOf('export const writePlannedTasks')), /Awaiting Go/);
  });

  it('queues planning when a milestone with no tasks enters Planning, from staff or the staff API', async () => {
    const t = memoryCtx();
    const empty = seedMilestoneWorld(t, { status: 'Idea' });
    await t.call(setStatus, { milestoneId: empty.milestoneId, status: 'Planning' }, { as: 'staff' });
    assert.equal(t.row(empty.milestoneId)?.planning, 'queued');
    const viaApi = seedMilestoneWorld(t, { status: 'Idea' });
    const moved = await t.call<{ status: number }>(updateMilestone, { ...API, key: 'move', milestoneId: viaApi.milestoneId, status: 'Planning' });
    assert.equal(moved.status, 200);
    assert.equal(t.row(viaApi.milestoneId)?.status, 'Planning');
    assert.equal(t.row(viaApi.milestoneId)?.planning, 'queued');
    assert.equal(t.rows('activity').filter((row) => row.type === 'milestone.status' && row.milestoneId === viaApi.milestoneId).length, 1);
    // A milestone that already has a task is not planned.
    const withTask = seedMilestoneWorld(t, { status: 'Idea' });
    withTask.task({ name: 'Already here', source: SOURCE });
    await t.call(setStatus, { milestoneId: withTask.milestoneId, status: 'Planning' }, { as: 'staff' });
    assert.equal(t.row(withTask.milestoneId)?.planning, undefined);
  });

  it('a planning run writes planner tasks and leaves the milestone in Planning', async () => {
    const t = memoryCtx();
    const { milestoneId } = seedMilestoneWorld(t, { status: 'Planning', planning: 'queued' }, { agentRepo: REPO });
    const run = await claim(t);
    assert.equal(run.kind, 'planning');
    const wrote = await t.call<{ ok: boolean; taskIds: string[]; milestoneStatus: string }>(writePlannedTasks, {
      runnerId: RUNNER,
      runId: run.runId,
      tasks: [{ title: 'One' }, { title: 'Two' }, { title: 'Three' }],
    });
    assert.deepEqual([wrote.ok, wrote.taskIds.length, wrote.milestoneStatus], [true, 3, 'Planning']);
    assert.deepEqual(wrote.taskIds.map((id) => t.row(id)?.origin), ['planner', 'planner', 'planner']);
    assert.equal(t.row(milestoneId)?.status, 'Planning');
    assert.equal(t.row(milestoneId)?.planning, undefined);
  });

  it('picks the project agent and maps Cursor commits onto tasks', async () => {
    const { buildAgent, cursorAgentUrl, mapCursorCommits } = await import('./agentRun');
    const { statusForBotCreate, BOT_STATUS_BUILDING } = await import('./milestoneBot');
    assert.equal(buildAgent(undefined), 'claude_code');
    assert.equal(buildAgent('claude_code'), 'claude_code');
    assert.equal(buildAgent('cursor'), 'cursor');
    assert.equal(buildAgent('something else'), 'claude_code');
    assert.deepEqual(statusForBotCreate('Building'), { ok: false, reason: BOT_STATUS_BUILDING });
    const tasks = [{ id: 'tasks:1' }, { id: 'tasks:2' }];
    const mapped = mapCursorCommits(
      [
        { sha: 'a'.repeat(40), message: 'First\n\nPortal-Task: tasks:1' },
        { sha: 'b'.repeat(40), message: 'Again\n\nPortal-Task: tasks:1' },
        { sha: 'not-a-sha', message: 'Portal-Task: tasks:2' },
        { sha: 'c'.repeat(40), message: 'Second\n\nPortal-Task: tasks:2' },
        { sha: 'd'.repeat(40), message: 'Portal-Task: tasks:nope' },
      ],
      tasks,
    );
    assert.deepEqual(mapped, [
      { taskId: 'tasks:1', commitSha: 'a'.repeat(40) },
      { taskId: 'tasks:2', commitSha: 'c'.repeat(40) },
    ]);
    assert.equal(cursorAgentUrl('https://cursor.com/agents/bc-20ed844d'), 'https://cursor.com/agents/bc-20ed844d');
    assert.equal(cursorAgentUrl('https://example.com/agents/bc-20ed844d'), null);
    // Absence guard: no Cursor key and no production deployment name in the runner code.
    assert.doesNotMatch(read('../agent.ts'), /CURSOR_API_KEY|unique-turtle-383/);
  });

  it('links each task a Cursor build finished to its agent', async () => {
    const t = memoryCtx();
    const { taskIds } = building(t, ['Cursor task'], {}, { agentDriver: 'cursor' });
    const run = await claim(t);
    assert.equal(run.kind, 'build');
    const url = 'https://cursor.com/agents/bc-20ed844d';
    await t.call(reportBuild, { runnerId: RUNNER, runId: run.runId, status: 'finished', agentUrl: url, tasks: [{ taskId: taskIds[0], commitSha: SHA }] });
    const links = t.rows('taskLinks');
    assert.equal(links.length, 1);
    assert.deepEqual([links[0]?.taskId, links[0]?.kind, links[0]?.url], [taskIds[0], 'agent', url]);
  });
});

describe('run lease', () => {
  const NOW = 1_800_000_000_000;

  it('holds a running run, and a run the Portal closed until it settles or the grace window passes', () => {
    assert.deepEqual(runLease({ status: 'running', kind: 'task' }, NOW), { held: true, why: 'active', until: null });
    assert.deepEqual(runLease({ status: 'succeeded', kind: 'task', endedAt: NOW }, NOW), { held: false });
    assert.deepEqual(runLease({ status: 'failed', kind: 'task', endedAt: NOW, settledAt: NOW }, NOW), { held: false });
    assert.deepEqual(runLease({ status: 'cancelled', kind: 'task', endedAt: NOW - 60_000 }, NOW), {
      held: true,
      why: 'winding_down',
      until: NOW - 60_000 + RUN_LEASE_GRACE_MS,
    });
    assert.deepEqual(runLease({ status: 'cancelled', kind: 'task', endedAt: NOW - RUN_LEASE_GRACE_MS }, NOW), { held: false });
    assert.deepEqual(runLease({ status: 'cancelled', kind: 'planning' }, NOW), { held: false });
    // A closed build with an agent id is followed, not replaced, so it holds nothing.
    assert.deepEqual(runLease({ status: 'failed', kind: 'build', endedAt: NOW, externalId: 'bc_1' }, NOW), { held: false });
    assert.equal(runLease({ status: 'failed', kind: 'build', endedAt: NOW }, NOW).held, true);
  });

  it('refuses a milestone retry over any held run, and a task retry only over that task or a build', () => {
    const running = { status: 'running', kind: 'task', taskId: 't2' };
    const released = { status: 'cancelled', kind: 'task', taskId: 't1', endedAt: NOW - 1000 };
    assert.deepEqual(retryLeaseDecision({ runs: [running], now: NOW }), { ok: false, reason: RETRY_RUN_ACTIVE, until: null });
    assert.deepEqual(retryLeaseDecision({ runs: [running], taskId: 't1', now: NOW }), { ok: true });
    assert.deepEqual(retryLeaseDecision({ runs: [running], taskId: 't2', now: NOW }), { ok: false, reason: RETRY_RUN_ACTIVE, until: null });
    assert.deepEqual(retryLeaseDecision({ runs: [released], taskId: 't1', now: NOW }), {
      ok: false,
      reason: RETRY_RUN_WINDING_DOWN,
      until: NOW - 1000 + RUN_LEASE_GRACE_MS,
    });
    assert.deepEqual(retryLeaseDecision({ runs: [released], taskId: 't3', now: NOW }), { ok: true });
    assert.equal(retryLeaseDecision({ runs: [{ status: 'running', kind: 'build' }], taskId: 't1', now: NOW }).ok, false);
    // Active wins over winding down, and an empty history is free.
    assert.equal((retryLeaseDecision({ runs: [released, running], now: NOW }) as { reason: string }).reason, RETRY_RUN_ACTIVE);
    assert.deepEqual(retryLeaseDecision({ runs: [], now: NOW }), { ok: true });
    assert.deepEqual(retryLeaseDecision({ runs: [{ ...released, settledAt: NOW }], taskId: 't1', now: NOW }), { ok: true });
  });

  it('follows only an unsettled, retried build that has an agent id', () => {
    const base = { kind: 'build', status: 'cancelled', externalId: 'bc_1', externalUrl: 'https://cursor.com/agents/bc_abc12345' };
    assert.deepEqual(cursorAgentToResume([base]), { externalId: 'bc_1', externalUrl: 'https://cursor.com/agents/bc_abc12345' });
    assert.equal(cursorAgentToResume([{ ...base, settledAt: NOW }]), null);
    assert.equal(cursorAgentToResume([{ ...base, externalId: null }]), null);
    assert.equal(cursorAgentToResume([{ ...base, status: 'succeeded' }]), null);
    // Only the newest build counts.
    assert.equal(cursorAgentToResume([{ kind: 'build', status: 'cancelled', settledAt: NOW }, base]), null);
    assert.equal(cursorAgentToResume([{ kind: 'task', status: 'cancelled' }]), null);
  });
});
