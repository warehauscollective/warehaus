/**
 * Run troubleshooting (decisions 0012 to 0014), the Convex side: a Blocked
 * task carries its Blocked cause, a failed run keeps the end of its output,
 * and staff fix it with Rerun, Answer and rerun or Stop run. Through the real
 * handlers, against the in-memory ctx.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { STOP_RUN_PROTOCOL } from '@warehaus/runner-protocol';
import {
  RERUN_DONE_TASK,
  answerAndRerun,
  claimNext,
  completeTask,
  releaseStuckRuns,
  rerunTask,
  stopRun,
  touchRunner,
} from '../agent';
import { moveStatus } from '../tasks';
import {
  RERUN_ANSWER_REQUIRED,
  RERUN_NOT_NEEDS_INPUT,
  RETRY_RUN_WINDING_DOWN,
  STOP_NO_RUN,
  STOP_RUNNER_TOO_OLD,
  completeDecision,
  failureOutput,
  stopRunDecision,
} from './agentRun';
import { PortalAuthError } from './identity';
import { memoryCtx, type MemoryCtx } from './memoryCtx.testkit';
import { seedMilestone, seedOrg, seedProject, seedTask } from './seedRows.testkit';
import { sha256Hex } from './tokenCrypto';

const RUNNER = 'peter-mbp';
const REPO = 'warehauscollective/warehaus';
const SHA = 'c'.repeat(40);
const SECRET = 'runner-secret-for-tests';
const SOURCE_TASK = 'portal-milestone';

type Row = Record<string, unknown> & { _id: string };
type Claim = {
  kind: string;
  runId: string;
  task?: { id: string; answer: { question: string; answer: string } | null };
};

const rowOf = (t: MemoryCtx, id: string) => t.row(id) as Row;
const refusedWith = (message: string) => (error: unknown) => error instanceof PortalAuthError && error.message === message;
const claim = (t: MemoryCtx, extra: Record<string, unknown> = {}) =>
  t.call<Claim>(claimNext, { runnerId: RUNNER, repos: [REPO], signsOfLife: true, ...extra });
const openAsks = (t: MemoryCtx) => t.rows('milestoneNotes').filter((note) => note.open === true);

/** A Building milestone with two portal tasks and a registered runner on the given protocol. */
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
      source: SOURCE_TASK,
      notionPageId: `${SOURCE_TASK}:${index}`,
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
  /** A claim or ping from the runner: the heartbeat, with the runs it holds. */
  const touch = async (held: string[], version = protocolVersion) =>
    t.call<{ ok: boolean; stop?: string[] }>(touchRunner, {
      runnerId: RUNNER,
      tokenHash: await sha256Hex(SECRET),
      protocolVersion: version,
      alive: held,
    });
  return { t, milestoneId, taskIds, touch };
}

function assertBounded(t: MemoryCtx) {
  assert.deepEqual(t.reads.unbounded(), []);
  assert.deepEqual(t.reads.unindexed(), []);
}

describe('Blocked cause', () => {
  it('reads the cause from the runner, and falls back by status for an older runner', () => {
    const cause = (input: Parameters<typeof completeDecision>[0]) => {
      const decision = completeDecision(input);
      return decision.ok ? decision.cause : 'refused';
    };
    assert.equal(cause({ status: 'blocked', reason: 'which frame?', cause: 'needs_input' }), 'needs_input');
    // A failed clone reports blocked, with cause failed.
    assert.equal(cause({ status: 'blocked', reason: 'clone failed', cause: 'failed' }), 'failed');
    assert.equal(cause({ status: 'blocked', reason: 'which frame?' }), 'needs_input');
    assert.equal(cause({ status: 'failed' }), 'failed');
    // Stalled is the Portal's own cause. A runner cannot send it.
    assert.equal(cause({ status: 'failed', cause: 'stalled' }), 'failed');
    assert.equal(cause({ status: 'done', commitSha: SHA, cause: 'failed' }), null);
  });

  it('keeps failure output only for a failed cause, cut to 4 KB with credentials masked', () => {
    const failed = completeDecision({ status: 'failed', cause: 'failed', output: 'npm ERR! boom' });
    assert.equal(failed.ok && failed.output, 'npm ERR! boom');
    const asked = completeDecision({ status: 'blocked', reason: 'which frame?', cause: 'needs_input', output: 'chatter' });
    assert.equal(asked.ok && asked.output, null);
    const done = completeDecision({ status: 'done', commitSha: SHA, output: 'chatter' });
    assert.equal(done.ok && done.output, null);

    const long = failureOutput(`${'x'.repeat(9000)}\nlast line`) ?? '';
    assert.equal(new TextEncoder().encode(long).length, 4096);
    assert.ok(long.endsWith('last line'));
    const masked = failureOutput(`push failed\nAuthorization: Bearer ${'a1B2'.repeat(8)}\nexit 1`) ?? '';
    assert.doesNotMatch(masked, /a1B2a1B2/);
    assert.match(masked, /\[redacted\]/);
    assert.match(masked, /^push failed\n/);
    assert.equal(failureOutput('   '), null);
    assert.equal(failureOutput(42), null);
  });

  it('stores Needs input with the reason, and no output', async () => {
    const { t, taskIds } = await building();
    const run = await claim(t);
    await t.call(completeTask, {
      runnerId: RUNNER,
      runId: run.runId,
      status: 'blocked',
      cause: 'needs_input',
      reason: 'Which Figma frame is the card?',
      output: 'should never be kept',
    });
    const task = rowOf(t, taskIds[0]!);
    assert.equal(task.status, 'Blocked');
    assert.equal(task.blockedCause, 'needs_input');
    assert.equal(task.blockedReason, 'Which Figma frame is the card?');
    assert.equal(rowOf(t, run.runId).failureOutput, undefined);
    assert.equal(openAsks(t).length, 1);
    assertBounded(t);
  });

  it('stores Failed with the reason on the task and the output on the run', async () => {
    const { t, taskIds } = await building();
    const run = await claim(t);
    await t.call(completeTask, {
      runnerId: RUNNER,
      runId: run.runId,
      status: 'failed',
      cause: 'failed',
      reason: 'The run ended with no new commit',
      output: 'Error: typecheck failed\n  at convex/agent.ts',
    });
    const task = rowOf(t, taskIds[0]!);
    assert.equal(task.status, 'Blocked');
    assert.equal(task.blockedCause, 'failed');
    assert.equal(task.blockedReason, 'The run ended with no new commit');
    const stored = rowOf(t, run.runId);
    assert.equal(stored.status, 'failed');
    assert.equal(stored.failureOutput, 'Error: typecheck failed\n  at convex/agent.ts');
    assert.equal(stored.blockedReason, 'The run ended with no new commit');
    assertBounded(t);
  });

  it('marks a task the stuck sweep blocked as Stalled', async () => {
    const { t, taskIds } = await building();
    const run = await claim(t);
    await t.db.patch(run.runId, { aliveAt: 1 });
    await t.call(releaseStuckRuns, {});
    const task = rowOf(t, taskIds[0]!);
    assert.equal(task.status, 'Blocked');
    assert.equal(task.blockedCause, 'stalled');
  });

  it('clears the cause when the task is claimed again and when it is done', async () => {
    const { t, taskIds } = await building();
    const first = await claim(t);
    await t.call(completeTask, { runnerId: RUNNER, runId: first.runId, status: 'failed', cause: 'failed', reason: 'no commit' });
    await t.call(rerunTask, { taskId: taskIds[0] }, { as: 'staff' });
    assert.equal(rowOf(t, taskIds[0]!).blockedCause, undefined);
    const second = await claim(t);
    assert.equal(second.task?.id, taskIds[0]);
    await t.call(completeTask, { runnerId: RUNNER, runId: second.runId, status: 'done', commitSha: SHA });
    const task = rowOf(t, taskIds[0]!);
    assert.equal(task.status, 'Done');
    assert.equal(task.blockedCause, undefined);
    assert.equal(task.blockedReason, undefined);
  });
});

describe('Rerun', () => {
  it('reruns any Blocked task, not only the first, and closes its Ask', async () => {
    const { t, taskIds } = await building();
    // Both tasks end up Blocked: the first failed, the second asked a question.
    const first = await claim(t);
    await t.call(completeTask, { runnerId: RUNNER, runId: first.runId, status: 'failed', cause: 'failed', reason: 'no commit' });
    const second = await claim(t);
    assert.equal(second.task?.id, taskIds[1]);
    await t.call(completeTask, { runnerId: RUNNER, runId: second.runId, status: 'blocked', cause: 'needs_input', reason: 'which frame?' });
    assert.equal(openAsks(t).length, 2);

    await t.call(rerunTask, { taskId: taskIds[1] }, { as: 'staff' });
    const rerun = rowOf(t, taskIds[1]!);
    assert.equal(rerun.status, 'To Do');
    assert.equal(rerun.claimedBy, undefined);
    assert.equal(rerun.blockedReason, undefined);
    assert.equal(rerun.blockedCause, undefined);
    // The other Blocked task and its Ask are untouched.
    assert.equal(rowOf(t, taskIds[0]!).status, 'Blocked');
    assert.deepEqual(
      openAsks(t).map((note) => note.taskId),
      [taskIds[0]],
    );
    assert.ok(t.rows('agentEvents').some((event) => event.summary === 'Task 02 queued to rerun · Maya Chen'));
    assert.equal((await claim(t)).task?.id, taskIds[1]);
    assertBounded(t);
  });

  it('never reruns a Done task or one that is not Blocked, and writes nothing', async () => {
    const { t, taskIds } = await building();
    const run = await claim(t);
    await t.call(completeTask, { runnerId: RUNNER, runId: run.runId, status: 'done', commitSha: SHA });
    const before = JSON.stringify(t.rows('tasks'));
    const events = t.rows('agentEvents').length;
    await assert.rejects(() => t.call(rerunTask, { taskId: taskIds[0] }, { as: 'staff' }), refusedWith(RERUN_DONE_TASK));
    await assert.rejects(() => t.call(rerunTask, { taskId: taskIds[1] }, { as: 'staff' }), refusedWith('That task is not blocked.'));
    assert.equal(JSON.stringify(t.rows('tasks')), before);
    assert.equal(t.rows('agentEvents').length, events);
  });

  it('is staff only', async () => {
    const { t, taskIds } = await building();
    const run = await claim(t);
    await t.call(completeTask, { runnerId: RUNNER, runId: run.runId, status: 'failed', cause: 'failed', reason: 'no commit' });
    await assert.rejects(() => t.call(rerunTask, { taskId: taskIds[0] }, { as: 'client' }));
    await assert.rejects(() => t.call(answerAndRerun, { taskId: taskIds[0], answer: 'x' }, { as: 'client' }));
    await assert.rejects(() => t.call(stopRun, { taskId: taskIds[0] }, { as: 'client' }));
    await assert.rejects(() => t.call(rerunTask, { taskId: taskIds[0] }));
    assert.equal(rowOf(t, taskIds[0]!).status, 'Blocked');
  });
});

describe('Answer and rerun', () => {
  it('keeps the answer with its question and hands both to the next run', async () => {
    const { t, taskIds } = await building();
    const first = await claim(t);
    assert.equal(first.task?.answer, null);
    await t.call(completeTask, {
      runnerId: RUNNER,
      runId: first.runId,
      status: 'blocked',
      cause: 'needs_input',
      reason: 'Which Figma frame is the card?',
    });
    await t.call(answerAndRerun, { taskId: taskIds[0], answer: '  Use 1106:8680, the Milestone task card.  ' }, { as: 'staff' });
    const task = rowOf(t, taskIds[0]!);
    assert.equal(task.status, 'To Do');
    assert.equal(task.blockedCause, undefined);
    const stored = task.rerunAnswer as { question: string; answer: string; by: string };
    assert.equal(stored.question, 'Which Figma frame is the card?');
    assert.equal(stored.answer, 'Use 1106:8680, the Milestone task card.');
    assert.equal(stored.by, 'Maya Chen');
    assert.equal(openAsks(t).length, 0);
    assert.ok(t.rows('agentEvents').some((event) => event.summary === 'Task 01 answered and queued to rerun · Maya Chen'));

    const second = await claim(t);
    assert.equal(second.task?.id, taskIds[0]);
    assert.deepEqual(second.task?.answer, {
      question: 'Which Figma frame is the card?',
      answer: 'Use 1106:8680, the Milestone task card.',
    });
    // The answer is spent once the task is done.
    await t.call(completeTask, { runnerId: RUNNER, runId: second.runId, status: 'done', commitSha: SHA });
    assert.equal(rowOf(t, taskIds[0]!).rerunAnswer, undefined);
    assertBounded(t);
  });

  it('survives a failed rerun, and is dropped when the run asks something new', async () => {
    const { t, taskIds } = await building();
    const first = await claim(t);
    await t.call(completeTask, { runnerId: RUNNER, runId: first.runId, status: 'blocked', cause: 'needs_input', reason: 'Which frame?' });
    await t.call(answerAndRerun, { taskId: taskIds[0], answer: 'The card.' }, { as: 'staff' });
    const second = await claim(t);
    await t.call(completeTask, { runnerId: RUNNER, runId: second.runId, status: 'failed', cause: 'failed', reason: 'no commit' });
    assert.equal((rowOf(t, taskIds[0]!).rerunAnswer as { answer: string }).answer, 'The card.');
    await t.call(rerunTask, { taskId: taskIds[0] }, { as: 'staff' });
    const third = await claim(t);
    assert.equal(third.task?.answer?.answer, 'The card.');
    await t.call(completeTask, { runnerId: RUNNER, runId: third.runId, status: 'blocked', cause: 'needs_input', reason: 'Dark or Light?' });
    assert.equal(rowOf(t, taskIds[0]!).rerunAnswer, undefined);
  });

  it('refuses an empty answer and a task that is not Needs input, with nothing written', async () => {
    const { t, taskIds } = await building();
    const first = await claim(t);
    await t.call(completeTask, { runnerId: RUNNER, runId: first.runId, status: 'blocked', cause: 'needs_input', reason: 'Which frame?' });
    await assert.rejects(() => t.call(answerAndRerun, { taskId: taskIds[0], answer: '   ' }, { as: 'staff' }), refusedWith(RERUN_ANSWER_REQUIRED));
    assert.equal(rowOf(t, taskIds[0]!).status, 'Blocked');
    assert.equal(openAsks(t).length, 1);

    await t.call(rerunTask, { taskId: taskIds[0] }, { as: 'staff' });
    const second = await claim(t);
    await t.call(completeTask, { runnerId: RUNNER, runId: second.runId, status: 'failed', cause: 'failed', reason: 'no commit' });
    await assert.rejects(() => t.call(answerAndRerun, { taskId: taskIds[0], answer: 'An answer' }, { as: 'staff' }), refusedWith(RERUN_NOT_NEEDS_INPUT));
    assert.equal(rowOf(t, taskIds[0]!).status, 'Blocked');
    assert.equal(rowOf(t, taskIds[0]!).rerunAnswer, undefined);
  });
});

describe('Stop run', () => {
  it('needs a running task run on a runner that honours stop', () => {
    const running = { status: 'running', kind: 'task' };
    assert.deepEqual(stopRunDecision({ run: running, runnerProtocol: STOP_RUN_PROTOCOL }), { ok: true });
    assert.deepEqual(stopRunDecision({ run: running, runnerProtocol: STOP_RUN_PROTOCOL - 1 }), { ok: false, reason: STOP_RUNNER_TOO_OLD });
    assert.deepEqual(stopRunDecision({ run: running, runnerProtocol: null }), { ok: false, reason: STOP_RUNNER_TOO_OLD });
    assert.deepEqual(stopRunDecision({ run: null, runnerProtocol: STOP_RUN_PROTOCOL }), { ok: false, reason: STOP_NO_RUN });
    assert.equal(stopRunDecision({ run: { status: 'failed', kind: 'task' }, runnerProtocol: STOP_RUN_PROTOCOL }).ok, false);
    assert.equal(stopRunDecision({ run: { status: 'running', kind: 'planning' }, runnerProtocol: STOP_RUN_PROTOCOL }).ok, false);
    assert.equal(stopRunDecision({ run: { status: 'running', kind: 'build' }, runnerProtocol: STOP_RUN_PROTOCOL }).ok, false);
  });

  it('closes the run, blocks the task and tells the runner while it still holds the run', async () => {
    const { t, taskIds, touch } = await building();
    const run = await claim(t);
    assert.equal((await touch([run.runId])).stop, undefined);

    const stopped = await t.call<{ stopped: boolean }>(stopRun, { taskId: taskIds[0] }, { as: 'staff' });
    assert.equal(stopped.stopped, true);
    const stored = rowOf(t, run.runId);
    assert.equal(stored.status, 'cancelled');
    assert.equal(typeof stored.stoppedAt, 'number');
    assert.equal(stored.blockedReason, 'Stopped by Maya Chen');
    // Not settled: the runner has not let go yet.
    assert.equal(stored.settledAt, undefined);
    const task = rowOf(t, taskIds[0]!);
    assert.equal(task.status, 'Blocked');
    assert.equal(task.claimedBy, undefined);
    assert.equal(task.blockedReason, 'Stopped by Maya Chen');
    assert.equal(task.blockedCause, 'failed');
    assert.ok(t.rows('agentEvents').some((event) => event.type === 'stop' && event.summary === 'Run stopped · task 01 · Maya Chen'));
    // Staff stopped it themselves, so nobody is asked.
    assert.equal(openAsks(t).length, 0);

    // The runner still lists the run: every claim and ping names it, until it lets go.
    assert.deepEqual((await touch([run.runId])).stop, [run.runId]);
    assert.deepEqual((await touch([run.runId])).stop, [run.runId]);
    assert.equal((await touch([])).stop, undefined);
    assertBounded(t);
  });

  it('does not hand the stopped task out again, and a second press writes nothing', async () => {
    const { t, taskIds } = await building();
    const run = await claim(t);
    await t.call(stopRun, { taskId: taskIds[0] }, { as: 'staff' });
    const before = JSON.stringify([t.rows('tasks'), t.rows('agentRuns'), t.rows('agentEvents')]);
    const again = await t.call<{ stopped: boolean }>(stopRun, { taskId: taskIds[0] }, { as: 'staff' });
    assert.equal(again.stopped, false);
    assert.equal(JSON.stringify([t.rows('tasks'), t.rows('agentRuns'), t.rows('agentEvents')]), before);
    // The next claim takes the other task. The stopped one waits for Rerun.
    const next = await claim(t, { held: [run.runId] });
    assert.equal(next.task?.id, taskIds[1]);
  });

  it('ignores a late result: the task stays stopped and nothing the run sends is kept', async () => {
    const { t, taskIds } = await building();
    const run = await claim(t);
    await t.call(stopRun, { taskId: taskIds[0] }, { as: 'staff' });
    const late = await t.call<{ ok: boolean; duplicate: boolean; run: string }>(completeTask, {
      runnerId: RUNNER,
      runId: run.runId,
      status: 'done',
      commitSha: SHA,
    });
    assert.equal(late.duplicate, true);
    assert.equal(late.run, 'cancelled');
    const task = rowOf(t, taskIds[0]!);
    assert.equal(task.status, 'Blocked');
    assert.equal(task.isDone, false);
    assert.equal(task.lastCommitSha, undefined);
    assert.equal(rowOf(t, run.runId).status, 'cancelled');
    // A late failure is ignored the same way.
    await t.call(completeTask, { runnerId: RUNNER, runId: run.runId, status: 'failed', cause: 'failed', output: 'late output' });
    assert.equal(rowOf(t, run.runId).failureOutput, undefined);
    assert.equal(rowOf(t, taskIds[0]!).blockedReason, 'Stopped by Maya Chen');
  });

  it('holds Rerun until the runner has let go of the stopped run', async () => {
    const { t, taskIds } = await building();
    const run = await claim(t);
    await t.call(stopRun, { taskId: taskIds[0] }, { as: 'staff' });
    await assert.rejects(() => t.call(rerunTask, { taskId: taskIds[0] }, { as: 'staff' }), refusedWith(RETRY_RUN_WINDING_DOWN));
    assert.equal(rowOf(t, taskIds[0]!).status, 'Blocked');
    // The runner asks for work without listing the run: it has stopped, so the hold ends.
    const next = await claim(t);
    assert.equal(next.task?.id, taskIds[1]);
    assert.equal(typeof rowOf(t, run.runId).settledAt, 'number');
    await t.call(rerunTask, { taskId: taskIds[0] }, { as: 'staff' });
    assert.equal(rowOf(t, taskIds[0]!).status, 'To Do');
  });

  it('is refused on a runner older than protocol 5, and when no run is going', async () => {
    const old = await building(STOP_RUN_PROTOCOL - 1);
    const run = await claim(old.t);
    await assert.rejects(() => old.t.call(stopRun, { taskId: old.taskIds[0] }, { as: 'staff' }), refusedWith(STOP_RUNNER_TOO_OLD));
    assert.equal(rowOf(old.t, run.runId).status, 'running');
    assert.equal(rowOf(old.t, old.taskIds[0]!).status, 'In Progress');
    // An old runner is never sent a stop list either.
    await old.t.db.patch(run.runId, { status: 'cancelled', stoppedAt: 1 });
    assert.equal((await old.touch([run.runId])).stop, undefined);

    const idle = await building();
    await assert.rejects(() => idle.t.call(stopRun, { taskId: idle.taskIds[0] }, { as: 'staff' }), refusedWith(STOP_NO_RUN));
  });
});

describe('a manual move out of Blocked', () => {
  it('clears the claim, the reason and the cause when staff move Blocked to To Do', async () => {
    const { t, taskIds } = await building();
    const run = await claim(t);
    await t.call(completeTask, { runnerId: RUNNER, runId: run.runId, status: 'blocked', cause: 'needs_input', reason: 'Which frame?' });
    const blocked = rowOf(t, taskIds[0]!);
    assert.equal(blocked.claimedBy, RUNNER);
    assert.equal(blocked.blockedCause, 'needs_input');

    const moved = await t.call<{ ok: boolean }>(moveStatus, { taskId: taskIds[0], status: 'To Do', expectedLastEditedTime: '' }, { as: 'staff' });
    assert.equal(moved.ok, true, JSON.stringify(moved));
    const task = rowOf(t, taskIds[0]!);
    assert.equal(task.status, 'To Do');
    assert.equal(task.claimedBy, undefined);
    assert.equal(task.claimedAt, undefined);
    assert.equal(task.blockedReason, undefined);
    assert.equal(task.blockedCause, undefined);
    assert.equal(openAsks(t).length, 0);
  });
});
