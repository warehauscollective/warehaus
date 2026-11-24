/**
 * The whole milestone loop, run through the real mutation handlers on the
 * in-memory ctx (`memoryCtx.testkit.ts`): a bot creates a milestone with its
 * tasks, a runner claims and completes them, Peter requests changes and then
 * approves, and the merged pull request ships it.
 *
 * This is not the Convex runtime. The ctx checks arguments, rows and indexes
 * against the schema, and rolls back a mutation that throws.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { claimNext, completeTask, recordEvent, releaseStuckRuns, reportBuild, retryBlocked, writePlannedTasks } from '../agent';
import { AGENT_DRIVER_LOCKED, setAgentDriver } from '../projects';
import { PortalAuthError } from './identity';
import { addTask, listForClientProject, reviewForApi } from '../milestones';
import { createMilestone, updateMilestone } from '../portalApi';
import { applyInbound } from '../sync/inbound';
import { buildRoadmap, roadmapViewForAudience } from './milestones';
import { RETRY_RUN_ACTIVE, RETRY_RUN_WINDING_DOWN, RUN_LEASE_GRACE_MS } from './agentRun';
import { transitionMilestone } from './milestoneStatus';
import { MILESTONE_TASK_SET_CAP, TOO_MANY_LINKED } from './milestoneTaskSet';
import { taskOrigin } from './milestoneTasks';
import { memoryCtx, type MemoryCtx } from './memoryCtx.testkit';
import { seedContact, seedMilestone, seedOrg, seedProject, seedTask } from './seedRows.testkit';

const RUNNER = 'peter-mbp';
const REPO = 'warehauscollective/warehaus';
const SHA = 'c'.repeat(40);

type Row = Record<string, unknown> & { _id: string };

function seedToken(t: MemoryCtx, name = 'grok-bot') {
  return t.seed('apiTokens', {
    name,
    tokenHash: `hash-${name}`,
    tokenPrefix: 'wh_',
    scope: 'read-write',
    createdAt: 0,
    rateLimit: 100,
    rateWindowMs: 60_000,
    windowStartedAt: 0,
    windowCount: 0,
  });
}

const rowOf = (t: MemoryCtx, id: string) => t.row(id) as Row;

/** Staff press Retry. The mutation throws the refusal, so a refused retry writes nothing. */
const retry = (t: MemoryCtx, milestoneId: string, taskId?: string) =>
  t.call<{ ok: true }>(retryBlocked, { milestoneId, ...(taskId ? { taskId } : {}) }, { as: 'staff' });

/** Every read the handlers made was indexed and limited: the milestone, runner, task set and lifecycle paths are bounded. */
function assertBounded(t: MemoryCtx) {
  assert.deepEqual(t.reads.unbounded(), []);
  assert.deepEqual(t.reads.unindexed(), []);
}

const refusedWith = (message: string) => (error: unknown) => error instanceof PortalAuthError && error.message === message;

type Claim = { kind: string; runId: string; task?: { id: string; title: string; round: number }; milestone?: { branch: string } };
const claim = (t: MemoryCtx, runnerId = RUNNER, extra: Record<string, unknown> = {}) =>
  t.call<Claim>(claimNext, { runnerId, repos: [REPO], ...extra });

describe('milestone loop, bot to Shipped', () => {
  it('creates, builds, reviews twice and ships', async () => {
    const t = memoryCtx();
    const orgId = seedOrg(t, { companyName: 'Warehaus' });
    const projectId = seedProject(t, orgId, { name: 'Warehaus Portal', notionPageId: 'project-page', agentRepo: REPO });
    seedContact(t, orgId, { email: 'peter@warehaus.co', role: 'Warehaus Staff', name: 'Peter' });
    const tokenId = seedToken(t);

    // 1. Grok Bot creates the milestone with its task list in one call.
    const createArgs = {
      tokenId,
      key: 'create-1',
      requestHash: 'hash-1',
      tokenName: 'grok-bot',
      projectId,
      name: 'Client experience launch',
      objective: 'Clients can see their project and approve work.',
      goals: ['Review card is live'],
      proposedTasks: [{ title: 'Design the overview' }, { title: 'Build the overview' }, { title: 'Wire the review card' }],
    };
    const created = await t.call<{ status: number; body: { id: string; status: string; taskIds: string[]; createdVia: string } }>(
      createMilestone,
      createArgs,
    );
    assert.equal(created.status, 200, JSON.stringify(created.body));
    const milestoneId = created.body.id;
    assert.equal(created.body.status, 'Planning');
    assert.equal(created.body.createdVia, 'grok');
    assert.equal(created.body.taskIds.length, 3);
    const milestone = () => rowOf(t, milestoneId);
    const tasks = () => t.rows('tasks').filter((row) => row.milestoneId === milestoneId);
    assert.equal(milestone().branch, 'milestone/client-experience-launch');
    assert.deepEqual(
      tasks().map((task) => task.origin),
      ['brief', 'brief', 'brief'],
    );
    // The tasks never went to Notion.
    assert.equal(t.rows('notionOutbox').length, 0);

    // The same call again replays the stored result and creates nothing.
    const replay = await t.call<{ status: number; body: { id: string } }>(createMilestone, createArgs);
    assert.equal(replay.body.id, milestoneId);
    assert.equal(t.rows('milestones').length, 1);
    assert.equal(tasks().length, 3);

    // Nothing is claimable until Peter says go.
    const early = await claim(t);
    assert.equal(early.kind, 'none');

    // 2. Peter presses play until Building. The test sets that status directly.
    const go = transitionMilestone({ from: 'Awaiting Go', cause: 'advance', expected: 'Awaiting Go' });
    assert.equal(go.ok && go.status, 'Building');
    await t.db.patch(milestoneId, { status: 'Building' });

    // 3. The runner works the tasks top to bottom.
    const worked: string[] = [];
    for (let round = 0; round < 3; round += 1) {
      const mine = await claim(t, RUNNER, { mode: 'interactive' });
      assert.equal(mine.kind, 'task');
      assert.equal(mine.milestone?.branch, 'milestone/client-experience-launch');
      worked.push(mine.task!.title);
      // A second runner cannot take the task this runner holds.
      const other = await claim(t, 'studio-mini');
      if (other.kind === 'task') {
        assert.notEqual(other.task?.title, mine.task?.title);
        // Hand the other runner's task back so the first runner works in order.
        const otherRun = t.rows('agentRuns').find((run) => run.runnerId === 'studio-mini' && run.status === 'running') as Row;
        await t.call(completeTask, { runnerId: 'studio-mini', runId: otherRun._id, status: 'failed' });
        await retry(t, milestoneId, otherRun.taskId as string);
      }
      const event = await t.call<{ ok: boolean }>(recordEvent, {
        runnerId: RUNNER,
        runId: mine.runId,
        type: 'tool',
        summary: 'Edited MilestoneReview.tsx',
        payload: { env: { RUNNER_TOKEN: 'secret-value' }, tool_name: 'Edit' },
      });
      assert.equal(event.ok, true);
      const done = await t.call<{ ok: boolean; milestoneStatus: string; duplicate: boolean }>(completeTask, {
        runnerId: RUNNER,
        runId: mine.runId,
        status: 'done',
        commitSha: SHA,
        prUrl: 'https://github.com/warehauscollective/warehaus/pull/140',
      });
      assert.equal(done.ok, true);
      // A retry of the same completion writes nothing.
      const again = await t.call<{ duplicate: boolean }>(completeTask, {
        runnerId: RUNNER,
        runId: mine.runId,
        status: 'done',
        commitSha: SHA,
      });
      assert.equal(again.duplicate, true);
    }
    assert.deepEqual(worked, ['Design the overview', 'Build the overview', 'Wire the review card']);
    assert.equal(
      tasks().every((task) => task.isDone === true && task.lastCommitSha === SHA),
      true,
    );
    // No stored event carries the environment.
    assert.equal(JSON.stringify(t.rows('agentEvents')).includes('secret-value'), false);

    // 4. The last task done moves the milestone to Ready to Ship.
    assert.equal(milestone().status, 'Ready to Ship');
    // Hand-off: the local preview is stored and one open note waits on Peter.
    assert.equal(milestone().localPreviewUrl, 'http://localhost:3100/');
    const openNotes = () => t.rows('milestoneNotes').filter((note) => note.needsPeter === 'open');
    assert.equal(openNotes().length, 1);
    assert.equal(openNotes()[0]?.reason, 'approval');
    assert.match(String(openNotes()[0]?.body), /npm run preview:pr -- milestone\/client-experience-launch/);
    assert.match(String(openNotes()[0]?.body), /pull\/140/);
    assert.equal(String(openNotes()[0]?.body).includes('vercel'), false);
    assert.equal(milestone().prUrl, 'https://github.com/warehauscollective/warehaus/pull/140');
    assert.equal(
      t.rows('agentEvents').some((event) => event.type === 'ready'),
      true,
    );

    assertBounded(t);

    // 5. Peter requests changes in Grok Bot, with two task lines.
    const statusRows = () => t.rows('activity').filter((row) => row.type === 'milestone.status').length;
    const statusRowsBefore = statusRows();
    const changes = await t.call<{
      ok: boolean;
      status: number;
      error?: string;
      iteration?: number;
      milestoneStatus?: string;
      createdTaskIds?: string[];
    }>(reviewForApi, {
      milestoneId,
      iteration: 1,
      decision: 'request_changes',
      notes: 'The review card needs more space on mobile.',
      taskIds: [],
      newTasks: ['Give the review card more space at 390', 'Make the preview link a full-width tap target'],
      tokenName: 'grok-bot',
    });
    assertBounded(t);
    assert.equal(changes.ok, true, changes.error ?? '');
    assert.equal(changes.iteration, 2);
    assert.equal(changes.createdTaskIds?.length, 2);
    assert.equal(milestone().status, 'Building');
    assert.equal(milestone().approval, 'changes_requested');
    // Peter answered, so nothing waits on him.
    assert.equal(openNotes().length, 0);
    // The move back to Building went through the one writer: one status row.
    assert.equal(statusRows(), statusRowsBefore + 1);
    const review = tasks().filter((task) => taskOrigin({ origin: task.origin as string, source: task.source as string }) === 'review');
    assert.deepEqual(
      review.map((task) => [task.name, task.round]),
      [
        ['Give the review card more space at 390', 2],
        ['Make the preview link a full-width tap target', 2],
      ],
    );

    // Another token cannot decide.
    const refused = await t.call<{ ok: boolean; error?: string }>(reviewForApi, {
      milestoneId,
      iteration: 2,
      decision: 'approve',
      notes: '',
      taskIds: [],
      tokenName: 'claude',
    });
    assert.equal(refused.ok, false);
    assert.match(refused.error ?? '', /Only Peter/);

    // 6. The runner works the round 2 tasks.
    for (let round = 0; round < 2; round += 1) {
      const mine = await claim(t);
      assert.equal(mine.kind, 'task');
      assert.equal(mine.task?.round, 2);
      await t.call(completeTask, { runnerId: RUNNER, runId: mine.runId, status: 'done', commitSha: SHA });
    }
    assert.equal(milestone().status, 'Ready to Ship');

    assert.equal(openNotes().length, 1);

    // 7. Peter approves. The decision is recorded. Nothing ships yet.
    const approved = await t.call<{ ok: boolean; error?: string; approval?: string; milestoneStatus?: string }>(reviewForApi, {
      milestoneId,
      iteration: 2,
      decision: 'approve',
      notes: '',
      taskIds: [],
      tokenName: 'grok-bot',
    });
    assert.equal(approved.ok, true, approved.error ?? '');
    assert.equal(milestone().approval, 'approved');
    assert.equal(milestone().status, 'Ready to Ship');
    assert.equal(openNotes().length, 0);

    // 8. The pull request merges into main. The webhook ships the milestone.
    const merge = await t.call<{ wrote: boolean; shipped?: boolean }>(applyInbound, {
      source: 'github',
      deliveryId: 'delivery-merge-1',
      contentKey: `warehauscollective/warehaus#140#${SHA}#merged`,
      milestone: {
        kind: 'pull',
        branch: 'milestone/client-experience-launch',
        repo: 'WarehausCollective/warehaus',
        prUrl: 'https://github.com/warehauscollective/warehaus/pull/140',
        prNumber: 140,
        sha: SHA,
        merged: true,
      },
      items: [],
    });
    assert.equal(merge.shipped, true);
    assert.equal(milestone().status, 'Shipped');

    // Shipped is the end. A person cannot set it, and nothing more is claimable.
    assert.equal(transitionMilestone({ from: 'Building', cause: 'set', to: 'Shipped' }).ok, false);
    const after = await claim(t);
    assert.equal(after.kind, 'none');
    assertBounded(t);
  });

  it('plans a portal milestone from the brief', async () => {
    const t = memoryCtx();
    const orgId = seedOrg(t, { companyName: 'Warehaus' });
    const projectId = seedProject(t, orgId, { name: 'Warehaus Portal', agentRepo: REPO });
    const milestoneId = seedMilestone(t, orgId, projectId, {
      name: 'Linear task source',
      objective: 'Read-only task visibility for the pilot client.',
      status: 'Planning',
      createdVia: 'portal',
      planning: 'queued',
    });
    const planning = await claim(t);
    assert.equal(planning.kind, 'planning');
    const milestone = () => rowOf(t, milestoneId);
    assert.equal(milestone().planning, 'running');

    const short = await t.call<{ ok: boolean }>(writePlannedTasks, { runnerId: RUNNER, runId: planning.runId, tasks: ['Only one'] });
    assert.equal(short.ok, false);

    const wrote = await t.call<{ ok: boolean; taskIds: string[]; milestoneStatus: string }>(writePlannedTasks, {
      runnerId: RUNNER,
      runId: planning.runId,
      tasks: [{ title: 'Map Linear fields' }, { title: 'Read tasks for the pilot client' }, { title: 'Show the source on the task' }],
    });
    assert.equal(wrote.ok, true);
    assert.equal(wrote.taskIds.length, 3);
    assert.equal(wrote.milestoneStatus, 'Planning');
    assert.equal(milestone().status, 'Planning');
    assert.equal(milestone().planning, undefined);
    assert.equal(
      t.rows('tasks').every((task) => task.origin === 'planner'),
      true,
    );
    // A retry after the run ended writes no second list.
    const again = await t.call<{ duplicate: boolean }>(writePlannedTasks, {
      runnerId: RUNNER,
      runId: planning.runId,
      tasks: [{ title: 'a' }, { title: 'b' }, { title: 'c' }],
    });
    assert.equal(again.duplicate, true);
    assert.equal(t.rows('tasks').length, 3);
    assertBounded(t);
  });
});

describe('wrap-up asks the milestone task set', () => {
  const SOURCE = 'portal-milestone';

  function building() {
    const t = memoryCtx();
    const orgId = seedOrg(t, { slug: 'warehaus', companyName: 'Warehaus' });
    const projectId = seedProject(t, orgId, { name: 'Warehaus Portal', agentRepo: REPO });
    const milestoneId = seedMilestone(t, orgId, projectId, {
      name: 'Client experience launch',
      status: 'Building',
      branch: 'milestone/client-experience-launch',
    });
    const taskId = seedTask(t, orgId, projectId, {
      milestoneId,
      name: 'Build the overview',
      source: SOURCE,
      notionPageId: `${SOURCE}:overview`,
      milestoneOrder: 0,
    });
    return { t, orgId, projectId, milestoneId, taskId };
  }

  async function finishOnlyTask(t: MemoryCtx) {
    const mine = await claim(t);
    assert.equal(mine.kind, 'task');
    return t.call<{ ok: boolean; milestoneStatus: string }>(completeTask, {
      runnerId: RUNNER,
      runId: mine.runId,
      status: 'done',
      commitSha: SHA,
    });
  }

  it('moves to Ready to Ship when the last task is done', async () => {
    const { t } = building();
    const done = await finishOnlyTask(t);
    assert.equal(done.milestoneStatus, 'Ready to Ship');
    assert.equal(t.rows('milestoneNotes').filter((note) => note.reason === 'approval').length, 1);
    assertBounded(t);
  });

  it('stays in Building while a subtask with no milestone is open, the same answer the close gate gives', async () => {
    const { t, orgId, projectId, taskId } = building();
    seedTask(t, orgId, projectId, {
      parentTaskId: taskId,
      name: 'Check the empty state',
      source: SOURCE,
      notionPageId: `${SOURCE}:empty-state`,
    });
    const done = await finishOnlyTask(t);
    assert.equal(done.ok, true);
    assert.equal(done.milestoneStatus, 'Building');
    assert.equal(t.rows('milestoneNotes').filter((note) => note.reason === 'approval').length, 0);
    assertBounded(t);
  });
});

describe('cursor build hold and agent lock', () => {
  const SOURCE = 'portal-milestone';

  function buildingCursor() {
    const t = memoryCtx();
    const orgId = seedOrg(t, { slug: 'warehaus', companyName: 'Warehaus' });
    const projectId = seedProject(t, orgId, { name: 'Warehaus Portal', agentRepo: REPO, agentDriver: 'cursor' });
    const milestoneId = seedMilestone(t, orgId, projectId, {
      name: 'Client experience launch',
      status: 'Building',
      branch: 'milestone/client-experience-launch',
    });
    const taskId = seedTask(t, orgId, projectId, {
      milestoneId,
      name: 'Build the overview',
      source: SOURCE,
      notionPageId: `${SOURCE}:overview`,
      origin: 'manual',
      milestoneOrder: 0,
    });
    const otherId = seedTask(t, orgId, projectId, {
      milestoneId,
      name: 'Hand added later',
      source: SOURCE,
      notionPageId: `${SOURCE}:later`,
      origin: 'manual',
      milestoneOrder: 1,
    });
    return { t, orgId, projectId, milestoneId, taskId, otherId };
  }

  it('holds a quiet Cursor build until staff retry, and does not launch another agent', async () => {
    const { t, milestoneId } = buildingCursor();
    const build = await claim(t);
    assert.equal(build.kind, 'build');
    await t.db.patch(build.runId, { startedAt: 1 });
    const sweep = await t.call<{ released: number }>(releaseStuckRuns, {});
    assert.equal(sweep.released, 1);
    const run = () => rowOf(t, build.runId);
    assert.equal(run().status, 'failed');
    assert.match(String(run().blockedReason), /30 minutes/);
    const task = t.rows('tasks').find((row) => row.milestoneId === milestoneId && row.status === 'Blocked');
    assert.equal(task?.blockedReason, 'Runner went quiet for 30 minutes');
    const notes = () => t.rows('milestoneNotes').filter((row) => row.needsPeter === 'open' && row.reason === 'blocked' && !row.taskId);
    assert.equal(notes().length, 1);
    const again = await t.call<{ released: number }>(releaseStuckRuns, {});
    assert.equal(again.released, 0);
    assert.equal(notes().length, 1);
    const relaunch = await claim(t);
    assert.equal(relaunch.kind, 'none');
    // The sweep closed the run. The runner never said it stopped, so Retry waits out the grace window.
    await assert.rejects(() => retry(t, milestoneId), refusedWith(RETRY_RUN_WINDING_DOWN));
    assert.equal(run().status, 'failed');
    assert.equal(notes().length, 1);
    assert.equal((await claim(t)).kind, 'none');
    await t.db.patch(build.runId, { endedAt: Date.now() - RUN_LEASE_GRACE_MS - 1 });
    const retried = await retry(t, milestoneId);
    assert.equal(retried.ok, true);
    const next = await t.call<{ kind: string; runId: string; externalId: string | null }>(claimNext, { runnerId: RUNNER, repos: [REPO] });
    assert.equal(next.kind, 'build');
    assert.notEqual(next.runId, build.runId);
    // No agent was ever launched, so there is nothing to follow.
    assert.equal(next.externalId, null);
    assertBounded(t);
  });

  it('follows the same Cursor agent after a quiet build is retried, instead of launching a second', async () => {
    const { t, milestoneId } = buildingCursor();
    const build = await claim(t);
    await t.call(reportBuild, {
      runnerId: RUNNER,
      runId: build.runId,
      status: 'running',
      agentId: 'bc_abc12345',
      agentUrl: 'https://cursor.com/agents/bc_abc12345',
    });
    await t.db.patch(build.runId, { startedAt: 1 });
    await t.call(releaseStuckRuns, {});
    const old = rowOf(t, build.runId);
    assert.equal(old.status, 'failed');
    assert.equal(old.settledAt, undefined);
    // The agent id is known, so Retry is allowed at once: the next build follows that agent.
    const retried = await retry(t, milestoneId);
    assert.equal(retried.ok, true);
    const next = await t.call<{ kind: string; runId: string; externalId: string | null; externalUrl: string | null }>(claimNext, {
      runnerId: RUNNER,
      repos: [REPO],
    });
    assert.equal(next.kind, 'build');
    assert.notEqual(next.runId, build.runId);
    assert.equal(next.externalId, 'bc_abc12345');
    assert.equal(next.externalUrl, 'https://cursor.com/agents/bc_abc12345');
    const events = t.rows('agentEvents');
    assert.match(String(events[events.length - 1]?.summary), /picked up again/);
    // Only one build is ever running on the milestone.
    assert.equal(t.rows('agentRuns').filter((row) => row.status === 'running').length, 1);

    // The runner then sees that agent fail. That settles it, so the next retry starts a fresh agent.
    await t.call(reportBuild, { runnerId: RUNNER, runId: next.runId, status: 'failed', reason: 'The Cursor agent stopped' });
    assert.equal(typeof rowOf(t, next.runId).settledAt, 'number');
    assert.equal((await retry(t, milestoneId)).ok, true);
    const fresh = await t.call<{ kind: string; externalId: string | null }>(claimNext, { runnerId: RUNNER, repos: [REPO] });
    assert.equal(fresh.kind, 'build');
    assert.equal(fresh.externalId, null);
    assertBounded(t);
  });

  it('refuses a build retry while a run is still going on the milestone', async () => {
    const { t, milestoneId } = buildingCursor();
    const build = await claim(t);
    assert.equal(build.kind, 'build');
    const before = JSON.stringify(t.rows('tasks'));
    await assert.rejects(() => retry(t, milestoneId), refusedWith(RETRY_RUN_ACTIVE));
    // Nothing was written, and the one run is still the only run.
    assert.equal(JSON.stringify(t.rows('tasks')), before);
    assert.equal(t.rows('agentRuns').length, 1);
    assert.equal(t.rows('agentRuns')[0]?.status, 'running');
    assertBounded(t);
  });

  it('does not relaunch a failed Cursor build until staff retry', async () => {
    const { t, milestoneId, taskId } = buildingCursor();
    const build = await claim(t);
    assert.equal(build.kind, 'build');
    const failed = await t.call<{ ok: boolean; duplicate: boolean }>(reportBuild, {
      runnerId: RUNNER,
      runId: build.runId,
      status: 'failed',
      reason: 'Cursor refused the API key',
    });
    assert.equal(failed.ok, true);
    assert.equal(failed.duplicate, false);
    const again = await claim(t);
    assert.equal(again.kind, 'none');
    const repeat = await t.call<{ duplicate: boolean }>(reportBuild, {
      runnerId: RUNNER,
      runId: build.runId,
      status: 'failed',
      reason: 'Cursor refused the API key',
    });
    assert.equal(repeat.duplicate, true);
    const notes = t.rows('milestoneNotes').filter((row) => row.needsPeter === 'open' && row.reason === 'blocked');
    assert.equal(notes.length, 1);
    await retry(t, milestoneId);
    const retried = await claim(t);
    assert.equal(retried.kind, 'build');
    assert.notEqual(retried.runId, build.runId);
    assert.equal(rowOf(t, taskId).status, 'In Progress');
    assertBounded(t);
  });

  it('marks done only the tasks that build claimed', async () => {
    const { t, taskId, otherId } = buildingCursor();
    const build = await claim(t);
    await t.db.patch(otherId, { claimedBy: undefined, claimedAt: undefined, status: 'To Do' });
    const finished = await t.call<{ ok: boolean }>(reportBuild, {
      runnerId: RUNNER,
      runId: build.runId,
      status: 'finished',
      tasks: [
        { taskId, commitSha: SHA },
        { taskId: otherId, commitSha: 'd'.repeat(40) },
      ],
    });
    assert.equal(finished.ok, true);
    const claimed = rowOf(t, taskId);
    const other = rowOf(t, otherId);
    assert.equal(claimed.isDone, true);
    assert.equal(claimed.lastCommitSha, SHA);
    assert.equal(other.isDone, false);
    assert.equal(other.status, 'To Do');
    assertBounded(t);
  });

  it('blocks a finished Cursor build that has no Portal-Task trailer', async () => {
    const { t } = buildingCursor();
    const build = await claim(t);
    await t.call(reportBuild, { runnerId: RUNNER, runId: build.runId, status: 'finished', tasks: [] });
    const run = rowOf(t, build.runId);
    assert.equal(run.status, 'failed');
    assert.match(String(run.blockedReason), /Portal-Task trailer/);
    const next = await claim(t);
    assert.equal(next.kind, 'none');
    assertBounded(t);
  });

  it('refuses an agent change while a milestone is Building', async () => {
    const { t, projectId } = buildingCursor();
    await assert.rejects(
      () => t.call(setAgentDriver, { projectId, driver: 'claude_code' }, { as: 'staff' }),
      (error: unknown) => error instanceof PortalAuthError && error.message === AGENT_DRIVER_LOCKED,
    );
    assert.equal(rowOf(t, projectId).agentDriver, 'cursor');
    assertBounded(t);
  });

  it('archives planner drafts on regenerate and leaves hand-added tasks', async () => {
    const t = memoryCtx();
    const orgId = seedOrg(t, { companyName: 'Warehaus' });
    const projectId = seedProject(t, orgId, { name: 'Warehaus Portal', agentRepo: REPO });
    const milestoneId = seedMilestone(t, orgId, projectId, {
      name: 'Client experience launch',
      status: 'Planning',
      planning: 'running',
      planningReplace: true,
    });
    const runId = t.seed('agentRuns', {
      orgId,
      milestoneId,
      kind: 'planning',
      runnerId: RUNNER,
      tool: 'claude_code',
      mode: 'headless',
      status: 'running',
      startedAt: 1,
    });
    const drafted = seedTask(t, orgId, projectId, {
      milestoneId,
      name: 'Old draft',
      source: SOURCE,
      notionPageId: `${SOURCE}:draft`,
      origin: 'planner',
    });
    const edited = seedTask(t, orgId, projectId, {
      milestoneId,
      name: 'Staff kept this',
      source: SOURCE,
      notionPageId: `${SOURCE}:kept`,
      origin: 'manual',
    });
    const wrote = await t.call<{ ok: boolean }>(writePlannedTasks, {
      runnerId: RUNNER,
      runId,
      tasks: [{ title: 'One' }, { title: 'Two' }, { title: 'Three' }],
    });
    assert.equal(wrote.ok, true);
    const draft = t.row(drafted);
    const kept = t.row(edited);
    assert.equal(typeof draft?.archivedAt, 'number');
    assert.equal(kept?.archivedAt, undefined);
    // Archived, not deleted.
    assert.notEqual(draft, null);
    assertBounded(t);
  });
});

describe('status change from the staff API and a merge', () => {
  function seed(status: string, tasks: Array<Record<string, unknown>>) {
    const t = memoryCtx();
    const orgId = seedOrg(t, { companyName: 'Warehaus' });
    const projectId = seedProject(t, orgId, { name: 'Warehaus Portal', agentRepo: REPO });
    const milestoneId = seedMilestone(t, orgId, projectId, {
      name: 'Lifecycle check',
      objective: 'One writer.',
      status,
      branch: 'milestone/lifecycle-check',
    });
    const ids: string[] = [];
    for (const task of tasks) {
      const parent = typeof task.parent === 'number' ? ids[task.parent] : undefined;
      const fields = { ...task };
      delete fields.parent;
      ids.push(
        seedTask(t, orgId, projectId, {
          name: `Task ${ids.length + 1}`,
          stage: 'Building',
          source: 'portal-milestone',
          ...(parent ? { parentTaskId: parent } : { milestoneId }),
          ...fields,
        }),
      );
    }
    const tokenId = seedToken(t);
    const milestone = () => rowOf(t, milestoneId);
    const openNotes = () => t.rows('milestoneNotes').filter((note) => note.needsPeter === 'open' && note.reason === 'approval');
    return { t, orgId, tokenId, milestoneId, ids, milestone, openNotes };
  }

  const update = (run: ReturnType<typeof seed>, key: string, status: string) =>
    run.t.call<{ status: number; body: { id?: string; error?: string } }>(updateMilestone, {
      tokenId: run.tokenId,
      key,
      requestHash: key,
      tokenName: 'grok-bot',
      milestoneId: run.milestoneId,
      status,
    });

  it('a staff API move into Ready to Ship writes the hand-off, and a move out closes the note', async () => {
    const run = seed('Building', [{ status: 'Done', isDone: true }, {}]);
    const moved = await update(run, 'k1', 'Ready to Ship');
    assert.equal(moved.status, 200, JSON.stringify(moved.body));
    assert.equal(run.milestone().status, 'Ready to Ship');
    assert.equal(run.openNotes().length, 1);
    assert.equal(run.openNotes()[0]?.addedBy, 'grok-bot');
    assert.match(String(run.openNotes()[0]?.body), /Heads up: 1 task is still open\./);
    assert.ok(run.milestone().localPreviewUrl);
    assert.deepEqual(
      run.t
        .rows('agentEvents')
        .filter((event) => event.type === 'ready')
        .map((event) => event.summary),
      ['Moved to Ready to Ship by grok-bot'],
    );
    const back = await update(run, 'k2', 'Awaiting Go');
    assert.equal(back.status, 200, JSON.stringify(back.body));
    assert.equal(run.openNotes().length, 0);
    assertBounded(run.t);
  });

  it('a staff API Shipped with an open task is refused and writes nothing', async () => {
    const run = seed('Ready to Ship', [{ status: 'Done', isDone: true }, {}]);
    const refused = await update(run, 'k1', 'Shipped');
    assert.equal(refused.status, 400);
    assert.equal(run.milestone().status, 'Ready to Ship');
    assert.equal(run.t.rows('activity').length, 0);
    assertBounded(run.t);
  });

  it('a merge with an open subtask stores the pull request and does not ship, and a later merge does', async () => {
    const run = seed('Ready to Ship', [{ status: 'Done', isDone: true }, { parent: 0 }]);
    run.t.seed('milestoneNotes', {
      orgId: run.orgId,
      milestoneId: run.milestoneId,
      body: 'Approve?',
      addedBy: 'runner:peter-mbp',
      createdAt: 1,
      needsPeter: 'open',
      reason: 'approval',
    });
    const merged = (n: number) =>
      run.t.call<{ wrote: boolean; shipped?: boolean }>(applyInbound, {
        source: 'github',
        deliveryId: `delivery-${n}`,
        contentKey: `warehauscollective/warehaus#${n}#${SHA}#merged`,
        milestone: {
          kind: 'pull',
          branch: 'milestone/lifecycle-check',
          repo: REPO,
          prUrl: `https://github.com/warehauscollective/warehaus/pull/${n}`,
          prNumber: n,
          sha: SHA,
          merged: true,
        },
        items: [],
      });
    const first = await merged(141);
    assert.notEqual(first.shipped, true);
    assert.equal(run.milestone().status, 'Ready to Ship');
    assert.equal(run.milestone().prUrl, 'https://github.com/warehauscollective/warehaus/pull/141');
    assert.equal(run.openNotes().length, 1);

    await run.t.db.patch(run.ids[1]!, { status: 'Done', isDone: true });
    const second = await merged(142);
    assert.equal(second.shipped, true);
    assert.equal(run.milestone().status, 'Shipped');
    // Leaving Ready to Ship closes Peter's note.
    assert.equal(run.openNotes().length, 0);
    assert.deepEqual(
      run.t
        .rows('agentEvents')
        .filter((event) => event.key === 'merged:142')
        .map((event) => event.summary),
      ['Pull request #142 merged · milestone is Shipped'],
    );
    assert.equal(run.t.rows('activity').filter((row) => row.type === 'milestone.status').length, 1);
    assertBounded(run.t);
  });
});

describe('retry does not overlap the run it replaces', () => {
  const SOURCE_TASK = 'portal-milestone';

  function buildingClaude() {
    const t = memoryCtx();
    const orgId = seedOrg(t, { slug: 'warehaus', companyName: 'Warehaus' });
    const projectId = seedProject(t, orgId, { name: 'Warehaus Portal', agentRepo: REPO });
    const milestoneId = seedMilestone(t, orgId, projectId, {
      name: 'Client experience launch',
      status: 'Building',
      branch: 'milestone/client-experience-launch',
    });
    const taskIds = ['Build the overview', 'Wire the review card'].map((name, index) =>
      seedTask(t, orgId, projectId, {
        milestoneId,
        name,
        source: SOURCE_TASK,
        notionPageId: `${SOURCE_TASK}:${index}`,
        origin: 'manual',
        milestoneOrder: index,
      }),
    );
    return { t, milestoneId, taskIds };
  }

  it('holds a task the sweep released until its runner answers, so a second runner cannot start over it', async () => {
    const { t, milestoneId, taskIds } = buildingClaude();
    const first = await claim(t);
    assert.equal(first.kind, 'task');
    assert.equal(first.task?.id, taskIds[0]);
    // A long Claude session: the runner makes no call for 30 minutes and the sweep releases the run.
    await t.db.patch(first.runId, { startedAt: 1 });
    await t.call(releaseStuckRuns, {});
    const run = () => rowOf(t, first.runId);
    assert.equal(run().status, 'cancelled');
    assert.equal(run().settledAt, undefined);
    assert.equal(rowOf(t, taskIds[0]!).status, 'Blocked');

    // Staff press Retry while that session may still be committing. Refused, nothing written.
    await assert.rejects(() => retry(t, milestoneId, taskIds[0]), refusedWith(RETRY_RUN_WINDING_DOWN));
    assert.equal(rowOf(t, taskIds[0]!).status, 'Blocked');
    // A second Mac asking for work is not handed the task the first may still be on.
    const other = await claim(t, 'studio-mini');
    assert.notEqual(other.task?.id, taskIds[0]);
    if (other.kind === 'task') await t.call(completeTask, { runnerId: 'studio-mini', runId: other.runId, status: 'done', commitSha: SHA });

    // The first runner's session ends and it reports. The run already ended, so nothing changes but the lease.
    const late = await t.call<{ duplicate: boolean }>(completeTask, { runnerId: RUNNER, runId: first.runId, status: 'done', commitSha: SHA });
    assert.equal(late.duplicate, true);
    assert.equal(typeof run().settledAt, 'number');
    const retried = await retry(t, milestoneId, taskIds[0]);
    assert.equal(retried.ok, true);
    const again = await claim(t);
    assert.equal(again.kind, 'task');
    assert.equal(again.task?.id, taskIds[0]);
    assert.notEqual(again.runId, first.runId);
    assert.equal(t.rows('agentRuns').filter((row) => row.status === 'running').length, 1);
    assertBounded(t);
  });

  it('frees the lease when the runner is seen idle, or when the grace window passes', async () => {
    const { t, milestoneId, taskIds } = buildingClaude();
    const first = await claim(t);
    await t.db.patch(first.runId, { startedAt: 1 });
    await t.call(releaseStuckRuns, {});
    await assert.rejects(() => retry(t, milestoneId, taskIds[0]), refusedWith(RETRY_RUN_WINDING_DOWN));
    // The runner asks for work again, so it is not working on the old run.
    const idle = await claim(t);
    assert.equal(idle.task?.id, taskIds[1]);
    assert.equal(typeof rowOf(t, first.runId).settledAt, 'number');
    // Retry now puts the task back in the queue. It does not start a run: the other task's run holds the milestone.
    assert.equal((await retry(t, milestoneId, taskIds[0])).ok, true);
    assert.equal(rowOf(t, taskIds[0]!).status, 'To Do');
    assert.equal((await claim(t, 'studio-mini')).kind, 'none');
    assert.equal(t.rows('agentRuns').filter((row) => row.status === 'running').length, 1);

    // A runner that never comes back: the lease ends on its own after the grace window.
    const dead = buildingClaude();
    const lost = await claim(dead.t);
    await dead.t.db.patch(lost.runId, { startedAt: 1 });
    await dead.t.call(releaseStuckRuns, {});
    await assert.rejects(() => retry(dead.t, dead.milestoneId, dead.taskIds[0]), refusedWith(RETRY_RUN_WINDING_DOWN));
    await dead.t.db.patch(lost.runId, { endedAt: Date.now() - RUN_LEASE_GRACE_MS - 1 });
    assert.equal((await retry(dead.t, dead.milestoneId, dead.taskIds[0])).ok, true);
    assertBounded(t);
    assertBounded(dead.t);
  });

  it('retries a task the runner itself reported blocked at once', async () => {
    const { t, milestoneId, taskIds } = buildingClaude();
    const first = await claim(t);
    await t.call(completeTask, { runnerId: RUNNER, runId: first.runId, status: 'blocked', reason: 'needs the Figma frame' });
    const retried = await retry(t, milestoneId, taskIds[0]);
    assert.equal(retried.ok, true);
    assertBounded(t);
  });
});

describe('client host', () => {
  const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

  it('reads no agent table and no staff notes', () => {
    const files = [
      '../portalData.ts',
      '../tasks.ts',
      '../clients.ts',
      '../projects.ts',
      '../search.ts',
      '../taskResponses.ts',
      '../clientDocs.ts',
      '../sharedResources.ts',
    ];
    for (const file of files) {
      const source = read(file);
      for (const table of ['agentRuns', 'agentEvents', 'agentRunners', 'milestoneNotes']) {
        assert.equal(source.includes(table), false, `${file} reads ${table}`);
      }
    }
    const milestones = read('../milestones.ts');
    for (const table of ['agentRuns', 'agentEvents', 'agentRunners']) {
      assert.equal(milestones.includes(table), false, table);
    }
    // Notes are read only where a review decision closes the open request. No read path, staff or client, lists them here.
    const reads = milestones.slice(0, milestones.indexOf('async function applyMilestoneReview'));
    assert.equal(reads.includes('milestoneNotes'), false);
    // A project's repo setting is staff only.
    for (const file of ['../portalData.ts', '../search.ts']) {
      assert.equal(read(file).includes('agentRepo'), false, file);
    }
  });

  it('lists a client only the published milestones on a project, through the client audience filter', async () => {
    const t = memoryCtx();
    t.actor('client');
    const orgId = t.rows('clients').find((row) => row.slug === 'northwind')!._id;
    const projectId = seedProject(t, orgId, { name: 'Site', agentRepo: REPO });
    const staffFields = {
      note: 'Internal',
      localPreviewUrl: 'http://localhost:3100/',
      figmaUrl: 'https://figma.com/file/x',
      createdVia: 'grok',
      planning: 'queued',
      branch: 'milestone/launch',
      prUrl: 'https://github.com/warehauscollective/warehaus/pull/140',
      previewUrl: 'https://x.vercel.app',
    };
    const published = seedMilestone(t, orgId, projectId, { name: 'Launch', publishToWarehaus: true, approval: 'approved', ...staffFields });
    seedMilestone(t, orgId, projectId, { name: 'Draft', publishToWarehaus: false, ...staffFields });
    seedTask(t, orgId, projectId, {
      milestoneId: published,
      name: 'Task',
      status: 'Blocked',
      publishToWarehaus: true,
      origin: 'review',
      round: 2,
      claimedBy: RUNNER,
      lastCommitSha: SHA,
      blockedReason: 'needs Figma frame',
    });
    const views = await t.call<Array<Record<string, unknown>>>(listForClientProject, { projectId }, { as: 'client' });
    assert.deepEqual(
      views.map((view) => view.name),
      ['Launch'],
    );
    const text = JSON.stringify(views);
    for (const value of [...Object.values(staffFields), RUNNER, SHA, 'needs Figma frame']) {
      assert.equal(text.includes(value), false, `client view carries ${value}`);
    }
  });

  it('receives no staff field on a milestone or its tasks', () => {
    const view = roadmapViewForAudience(
      {
        id: 'm1',
        name: 'Launch',
        approval: 'approved',
        note: 'Internal',
        approverName: 'Peter',
        decidedAt: 5,
        localPreviewUrl: 'http://localhost:3100/',
        figmaUrl: 'https://figma.com/file/x',
        createdVia: 'grok',
        planning: 'queued',
        branch: 'milestone/launch',
        prUrl: 'https://github.com/warehauscollective/warehaus/pull/140',
        review: { previewUrl: 'https://x.vercel.app' },
      },
      'client',
    );
    assert.deepEqual(Object.keys(view).sort(), ['id', 'name']);
    const rows = buildRoadmap({
      audience: 'client',
      milestoneId: 'm1',
      projectVisibleToClient: true,
      tasks: [
        {
          id: 't1',
          name: 'Task',
          status: 'Blocked',
          isDone: false,
          stage: 'Building',
          pullRequestUrl: 'https://github.com/a/b/pull/1',
          parentTaskId: null,
          milestoneId: 'm1',
          milestoneOrder: 0,
          resourceCount: 0,
          publishToWarehaus: true,
          hidden: false,
          source: 'portal-review',
          origin: 'review',
          round: 2,
          portalOwned: true,
          detail: 'Staff detail',
          runner: 'peter-mbp',
          commit: 'cccccccccc',
          blockedReason: 'needs Figma frame',
        },
      ],
    }).rows;
    assert.deepEqual(Object.keys(rows[0] ?? {}).sort(), ['children', 'id', 'isDone', 'name', 'onMilestone', 'resourceCount', 'stage', 'status']);
  });
});

describe('milestone task reads are capped', () => {
  function overCap(status: string) {
    const t = memoryCtx();
    const orgId = seedOrg(t);
    const projectId = seedProject(t, orgId);
    const milestoneId = seedMilestone(t, orgId, projectId, { status, publishToWarehaus: true, localPreviewUrl: 'http://localhost:3100/' });
    for (let i = 0; i <= MILESTONE_TASK_SET_CAP; i += 1) seedTask(t, orgId, projectId, { milestoneId, milestoneOrder: i });
    t.actor('peter');
    return { t, milestoneId };
  }

  it('refuses a request for changes on a milestone over the cap, and writes nothing', async () => {
    const { t, milestoneId } = overCap('Ready to Ship');
    const before = JSON.stringify([t.rows('tasks'), t.rows('milestones'), t.rows('milestoneReviews'), t.rows('milestoneNotes')]);
    t.reads.reset();
    const changes = await t.call<{ ok: boolean; status: number; error?: string }>(reviewForApi, {
      milestoneId,
      iteration: 1,
      decision: 'request_changes',
      notes: 'More space.',
      taskIds: [],
      newTasks: ['Give it more space'],
      tokenName: 'grok-bot',
    });
    assert.deepEqual([changes.ok, changes.status, changes.error], [false, 409, TOO_MANY_LINKED]);
    assert.equal(JSON.stringify([t.rows('tasks'), t.rows('milestones'), t.rows('milestoneReviews'), t.rows('milestoneNotes')]), before);
    assertBounded(t);
  });

  it('refuses a staff task added to a milestone over the cap', async () => {
    const { t, milestoneId } = overCap('Building');
    const count = t.rows('tasks').length;
    t.reads.reset();
    await assert.rejects(() => t.call(addTask, { milestoneId, title: 'One more' }, { as: 'staff' }), refusedWith(TOO_MANY_LINKED));
    assert.equal(t.rows('tasks').length, count);
    assertBounded(t);
  });
});
