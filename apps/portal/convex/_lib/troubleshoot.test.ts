/**
 * Run troubleshooting on screen (decisions 0012 to 0014): the cause and fix a
 * Blocked card shows, and the staff-only Troubleshoot section's view. The
 * query runs through its real handler, against the in-memory ctx.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { STOP_RUN_PROTOCOL } from '@warehaus/runner-protocol';
import { claimNext, completeTask, releaseStuckRuns, rerunTask, stopRun, taskTroubleshoot, touchRunner } from '../agent';
import { RUN_SILENT_BLOCK_AFTER_MS } from './buildRun';
import { memoryCtx, type MemoryCtx } from './memoryCtx.testkit';
import { buildRoadmap, type RoadmapTaskInput } from './milestones';
import { seedMilestone, seedOrg, seedProject, seedTask } from './seedRows.testkit';
import { sha256Hex } from './tokenCrypto';
import {
  LAST_SIGN_OF_LIFE,
  SIGN_OF_LIFE,
  agoText,
  cardBlocked,
  fixLabel,
  runningLine,
  troubleshootView,
  type TroubleshootView,
} from './troubleshoot';

const RUNNER = 'peter-mbp';
const REPO = 'warehauscollective/warehaus';
const SECRET = 'runner-secret-for-tests';
const SHA = 'a1b2c3d'.padEnd(40, '0');

type Claim = { kind: string; runId: string };
const claim = (t: MemoryCtx) => t.call<Claim>(claimNext, { runnerId: RUNNER, repos: [REPO], signsOfLife: true });
const view = (t: MemoryCtx, taskId: string) => t.call<TroubleshootView | null>(taskTroubleshoot, { taskId }, { as: 'staff' });

async function building(protocolVersion = STOP_RUN_PROTOCOL) {
  const t = memoryCtx();
  const orgId = seedOrg(t, { slug: 'warehaus', companyName: 'Warehaus' });
  const projectId = seedProject(t, orgId, { name: 'Warehaus Portal', agentRepo: REPO });
  const milestoneId = seedMilestone(t, orgId, projectId, {
    name: 'Run troubleshooting',
    status: 'Building',
    branch: 'milestone/run-troubleshooting',
  });
  const taskIds = ['Convex: Blocked cause', 'Board: cause on the card'].map((name, index) =>
    seedTask(t, orgId, projectId, {
      milestoneId,
      name,
      source: 'portal-milestone',
      notionPageId: `portal-milestone:${index}`,
      origin: 'manual',
      milestoneOrder: index,
    }),
  );
  t.seed('agentRunners', {
    runnerId: RUNNER,
    windowStart: 0,
    count: 0,
    tokenHash: await sha256Hex(SECRET),
    registeredAt: 1,
    protocolVersion,
  });
  const touch = async (held: string[]) =>
    t.call(touchRunner, { runnerId: RUNNER, tokenHash: await sha256Hex(SECRET), protocolVersion, alive: held });
  return { t, orgId, projectId, milestoneId, taskIds, touch };
}

describe('Blocked card', () => {
  const blocked = { status: 'Blocked', isDone: false };

  it('shows each cause with its one fix', () => {
    const needs = cardBlocked({ ...blocked, blockedCause: 'needs_input', blockedReason: 'Which frame?' });
    assert.deepEqual(needs, { cause: 'needs_input', label: 'Needs input', tone: 'info', reason: 'Which frame?', fix: 'answer' });
    assert.equal(fixLabel(needs!.fix!), 'Answer and rerun');
    const failed = cardBlocked({ ...blocked, blockedCause: 'failed', blockedReason: 'no commit' });
    assert.deepEqual([failed?.label, failed?.tone, fixLabel(failed!.fix!)], ['Failed', 'danger', 'Rerun']);
    const stalled = cardBlocked({ ...blocked, blockedCause: 'stalled', blockedReason: 'went quiet' });
    assert.deepEqual([stalled?.label, stalled?.tone, fixLabel(stalled!.fix!)], ['Stalled', 'warning', 'Rerun']);
  });

  it('keeps the Waiting on text for a task a person blocked, and never offers a fix on a Done task', () => {
    assert.equal(cardBlocked({ ...blocked, nextAction: 'Waiting on client copy' }), null);
    assert.equal(cardBlocked({ ...blocked, blockedCause: 'unknown' }), null);
    assert.equal(cardBlocked({ status: 'Done', isDone: true, blockedCause: 'failed' }), null);
    assert.equal(cardBlocked({ status: 'To Do', isDone: false, blockedCause: 'failed' }), null);
    // No runner reason: the next action stands in.
    assert.equal(cardBlocked({ ...blocked, blockedCause: 'failed', nextAction: 'Waiting on client copy' })?.reason, 'Waiting on client copy');
  });

  it('gives a client row no cause and no reason', () => {
    const task: RoadmapTaskInput = {
      id: 't1',
      name: 'Build the card',
      status: 'Blocked',
      isDone: false,
      stage: null,
      pullRequestUrl: null,
      parentTaskId: null,
      milestoneId: 'm1',
      milestoneOrder: 0,
      resourceCount: 0,
      publishToWarehaus: true,
      hidden: false,
      blockedReason: 'The run ended with no new commit',
      blockedCause: 'failed',
    };
    const client = buildRoadmap({ audience: 'client', milestoneId: 'm1', tasks: [task], projectVisibleToClient: true }).rows[0];
    assert.ok(client);
    assert.equal('blockedCause' in client, false);
    assert.equal('blockedReason' in client, false);
    const staff = buildRoadmap({ audience: 'staff', milestoneId: 'm1', tasks: [task], projectVisibleToClient: true }).rows[0];
    assert.equal(staff?.blockedCause, 'failed');
  });
});

describe('Troubleshoot view', () => {
  it('says how long ago the last sign of life was', () => {
    assert.equal(agoText(0, 40_000), '40 seconds ago');
    assert.equal(agoText(0, 1_000), '1 second ago');
    assert.equal(agoText(0, 3 * 60_000), '3 minutes ago');
    assert.equal(agoText(0, 2 * 3_600_000), '2 hours ago');
    assert.equal(runningLine({ runnerId: 'peteroqs-laptop-prod', aliveAt: 0 }, 40_000), 'peteroqs-laptop-prod · last sign of life 40 seconds ago');
    assert.equal(runningLine({ runnerId: 'old-runner', aliveAt: null }, 40_000), 'old-runner');
  });

  it('shows nothing for a Done task, or one with no cause and no run going', () => {
    const base = { events: [], branch: null, runnerStops: true };
    assert.equal(troubleshootView({ ...base, task: { status: 'Done', isDone: true, blockedCause: 'failed' }, run: null }), null);
    assert.equal(troubleshootView({ ...base, task: { status: 'To Do', isDone: false }, run: { status: 'failed', runnerId: RUNNER } }), null);
    assert.equal(troubleshootView({ ...base, task: { status: 'Blocked', isDone: false }, run: null }), null);
  });

  it('lists the sign of life with the events, and keeps output for Failed only', () => {
    const events = [
      { id: 'e1', summary: 'Run started', at: 10 },
      { id: 'e2', summary: 'Blocked', at: 30 },
    ];
    const run = { status: 'failed', runnerId: RUNNER, aliveAt: 20, failureOutput: 'Error: boom' };
    const stalled = troubleshootView({ task: { status: 'Blocked', isDone: false, blockedCause: 'stalled', blockedReason: 'quiet' }, run, events, branch: 'b', runnerStops: true });
    assert.deepEqual(stalled?.events.map((event) => event.summary), ['Run started', LAST_SIGN_OF_LIFE, 'Blocked']);
    assert.equal(stalled?.output, null);
    assert.equal(stalled?.canStop, false);
    const failed = troubleshootView({ task: { status: 'Blocked', isDone: false, blockedCause: 'failed', blockedReason: 'no commit', lastCommitSha: SHA }, run, events, branch: 'b', runnerStops: true });
    assert.equal(failed?.output, 'Error: boom');
    assert.equal(failed?.commit, 'a1b2c3d');
    assert.deepEqual(failed?.events.map((event) => event.summary), ['Run started', 'Blocked']);
    const running = troubleshootView({ task: { status: 'In Progress', isDone: false, blockedCause: 'failed' }, run: { ...run, status: 'running' }, events: [events[0]!], branch: 'b', runnerStops: false });
    assert.equal(running?.state, 'running');
    assert.equal(running?.reason, null);
    assert.equal(running?.output, null);
    assert.equal(running?.canStop, false);
    assert.deepEqual(running?.events.map((event) => event.summary), ['Run started', SIGN_OF_LIFE]);
  });
});

describe('taskTroubleshoot', () => {
  it('shows a run going, with Stop run on a runner that honours stop', async () => {
    const { t, taskIds, touch } = await building();
    assert.equal(await view(t, taskIds[0]!), null);
    const run = await claim(t);
    await touch([run.runId]);
    const going = await view(t, taskIds[0]!);
    assert.equal(going?.state, 'running');
    assert.equal(going?.runnerId, RUNNER);
    assert.equal(going?.canStop, true);
    assert.equal(going?.branch, 'milestone/run-troubleshooting');
    assert.equal(typeof going?.aliveAt, 'number');
    assert.ok(going?.events.some((event) => event.summary === SIGN_OF_LIFE));
    // The task that is not being run has nothing to troubleshoot.
    assert.equal(await view(t, taskIds[1]!), null);
    assert.deepEqual(t.reads.unbounded(), []);
    assert.deepEqual(t.reads.unindexed(), []);
  });

  it('hides Stop run on a runner older than protocol 5', async () => {
    const { t, taskIds } = await building(STOP_RUN_PROTOCOL - 1);
    await claim(t);
    const going = await view(t, taskIds[0]!);
    assert.equal(going?.state, 'running');
    assert.equal(going?.canStop, false);
  });

  it('shows a Failed task with its reason, output, branch and last commit', async () => {
    const { t, taskIds } = await building();
    await t.db.patch(taskIds[0]!, { lastCommitSha: SHA });
    const run = await claim(t);
    await t.call(completeTask, {
      runnerId: RUNNER,
      runId: run.runId,
      status: 'failed',
      cause: 'failed',
      reason: 'The run ended with no new commit',
      output: 'Error: typecheck failed',
    });
    const failed = await view(t, taskIds[0]!);
    assert.equal(failed?.state, 'failed');
    assert.equal(failed?.reason, 'The run ended with no new commit');
    assert.equal(failed?.output, 'Error: typecheck failed');
    assert.equal(failed?.commit, 'a1b2c3d');
    assert.equal(failed?.canStop, false);
    assert.ok((failed?.events.length ?? 0) > 0);

    // Rerun puts it back in To do: nothing left to troubleshoot.
    await t.db.patch(run.runId, { settledAt: 1 });
    await t.call(rerunTask, { taskId: taskIds[0] }, { as: 'staff' });
    assert.equal(await view(t, taskIds[0]!), null);
  });

  it('shows Needs input with no output, and Stalled after the stuck sweep', async () => {
    const { t, taskIds } = await building();
    const run = await claim(t);
    await t.call(completeTask, {
      runnerId: RUNNER,
      runId: run.runId,
      status: 'blocked',
      cause: 'needs_input',
      reason: 'Which Stripe price ID should checkout use?',
      output: 'never kept',
    });
    const asked = await view(t, taskIds[0]!);
    assert.equal(asked?.state, 'needs_input');
    assert.equal(asked?.reason, 'Which Stripe price ID should checkout use?');
    assert.equal(asked?.output, null);

    const second = await claim(t);
    await t.db.patch(second.runId, { startedAt: Date.now() - RUN_SILENT_BLOCK_AFTER_MS * 10, aliveAt: Date.now() - RUN_SILENT_BLOCK_AFTER_MS * 2 });
    await t.call(releaseStuckRuns, {});
    const stalled = await view(t, taskIds[1]!);
    assert.equal(stalled?.state, 'stalled');
    assert.ok(stalled?.events.some((event) => event.summary === LAST_SIGN_OF_LIFE));
  });

  it('shows a stopped run as Failed, with who stopped it', async () => {
    const { t, taskIds } = await building();
    await claim(t);
    await t.call(stopRun, { taskId: taskIds[0] }, { as: 'staff' });
    const stopped = await view(t, taskIds[0]!);
    assert.equal(stopped?.state, 'failed');
    assert.match(stopped?.reason ?? '', /^Stopped by /);
    assert.ok(stopped?.events.some((event) => /^Run stopped/.test(event.summary)));
  });

  it('is staff only', async () => {
    const { t, taskIds } = await building();
    await claim(t);
    await assert.rejects(() => t.call(taskTroubleshoot, { taskId: taskIds[0] }, { as: 'client' }));
    await assert.rejects(() => t.call(taskTroubleshoot, { taskId: taskIds[0] }));
  });
});
