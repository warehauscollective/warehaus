/**
 * The whole milestone loop, run through the real mutation handlers against an
 * in-memory database: a bot creates a milestone with its tasks, a runner
 * claims and completes them, Peter requests changes and then approves, and
 * the merged pull request ships it.
 *
 * This is not the Convex runtime. It checks the handlers and the rules they
 * share. Validators, indexes and transactions are Convex's own.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { claimNext, completeTask, recordEvent, releaseStuckRuns, reportBuild, retryBlockedWork, writePlannedTasks } from '../agent';
import { AGENT_DRIVER_LOCKED, setAgentDriver } from '../projects';
import { PortalAuthError } from './identity';
import { reviewForApi } from '../milestones';
import { createMilestone, updateMilestone } from '../portalApi';
import { applyInbound } from '../sync/inbound';
import { buildRoadmap, roadmapViewForAudience } from './milestones';
import { RETRY_RUN_ACTIVE, RETRY_RUN_WINDING_DOWN, RUN_LEASE_GRACE_MS } from './agentRun';
import { transitionMilestone } from './milestoneStatus';
import { taskOrigin } from './milestoneTasks';

type Row = Record<string, unknown> & { _id: string; _creationTime: number };

function memoryDb() {
  const tables = new Map<string, Row[]>();
  let next = 1;
  const rowsOf = (table: string) => {
    if (!tables.has(table)) tables.set(table, []);
    return tables.get(table) as Row[];
  };
  const find = (id: string) => {
    for (const rows of tables.values()) {
      const row = rows.find((item) => item._id === id);
      if (row) return row;
    }
    return null;
  };
  const db = {
    get: async (id: string) => find(id),
    normalizeId: (table: string, id: string) => (rowsOf(table).some((row) => row._id === id) ? id : null),
    insert: async (table: string, value: Record<string, unknown>) => {
      const row = { ...value, _id: `${table}:${next}`, _creationTime: next } as Row;
      next += 1;
      rowsOf(table).push(row);
      return row._id;
    },
    patch: async (id: string, value: Record<string, unknown>) => {
      const row = find(id);
      if (!row) throw new Error(`patch: ${id} not found`);
      for (const [key, item] of Object.entries(value)) {
        if (item === undefined) delete row[key];
        else row[key] = item;
      }
    },
    delete: async (id: string) => {
      for (const rows of tables.values()) {
        const at = rows.findIndex((item) => item._id === id);
        if (at >= 0) rows.splice(at, 1);
      }
    },
    query: (table: string) => {
      const wanted: Array<[string, unknown]> = [];
      let descending = false;
      const matched = () => {
        const rows = rowsOf(table).filter((row) => wanted.every(([field, value]) => (row[field] ?? undefined) === value));
        return descending ? [...rows].reverse() : rows;
      };
      const chain = {
        withIndex: (_name: string, range?: (q: { eq: (field: string, value: unknown) => unknown }) => unknown) => {
          const q = {
            eq: (field: string, value: unknown) => {
              wanted.push([field, value]);
              return q;
            },
          };
          range?.(q);
          return chain;
        },
        order: (direction: 'asc' | 'desc') => {
          descending = direction === 'desc';
          return chain;
        },
        first: async () => matched()[0] ?? null,
        unique: async () => matched()[0] ?? null,
        take: async (count: number) => matched().slice(0, count),
        collect: async () => matched(),
      };
      return chain;
    },
  };
  return { db, rowsOf };
}

type Handler<T> = (ctx: unknown, args: Record<string, unknown>) => Promise<T>;

function handler<T>(fn: unknown): Handler<T> {
  return (fn as { _handler: Handler<T> })._handler;
}

const RUNNER = 'peter-mbp';
const REPO = 'warehauscollective/warehaus';
const SHA = 'c'.repeat(40);

describe('milestone loop, bot to Shipped', () => {
  it('creates, builds, reviews twice and ships', async () => {
    const { db, rowsOf } = memoryDb();
    const scheduled: unknown[] = [];
    const ctx = { db, scheduler: { runAfter: async (...args: unknown[]) => scheduled.push(args) } };

    const orgId = await db.insert('clients', { name: 'Warehaus', portalAccess: 'Enabled' });
    const projectId = await db.insert('projects', {
      orgId,
      name: 'Warehaus Portal',
      notionPageId: 'project-page',
      agentRepo: REPO,
    });
    await db.insert('contacts', { orgId, email: 'peter@warehaus.co', role: 'Warehaus Staff', name: 'Peter' });

    // 1. Grok Bot creates the milestone with its task list in one call.
    const created = await handler<{ status: number; body: { id: string; status: string; taskIds: string[]; createdVia: string } }>(
      createMilestone,
    )(ctx, {
      tokenId: 'apiTokens:1',
      key: 'create-1',
      requestHash: 'hash-1',
      tokenName: 'grok-bot',
      projectId,
      name: 'Client experience launch',
      objective: 'Clients can see their project and approve work.',
      goals: ['Review card is live'],
      proposedTasks: [{ title: 'Design the overview' }, { title: 'Build the overview' }, { title: 'Wire the review card' }],
    });
    assert.equal(created.status, 200, JSON.stringify(created.body));
    const milestoneId = created.body.id;
    assert.equal(created.body.status, 'Planning');
    assert.equal(created.body.createdVia, 'grok');
    assert.equal(created.body.taskIds.length, 3);
    const milestone = () => rowsOf('milestones').find((row) => row._id === milestoneId) as Row;
    const tasks = () => rowsOf('tasks').filter((row) => row.milestoneId === milestoneId);
    assert.equal(milestone().branch, 'milestone/client-experience-launch');
    assert.deepEqual(tasks().map((task) => task.origin), ['brief', 'brief', 'brief']);
    // The tasks never went to Notion.
    assert.equal(rowsOf('notionOutbox').length, 0);

    // The same call again replays the stored result and creates nothing.
    const replay = await handler<{ status: number; body: { id: string } }>(createMilestone)(ctx, {
      tokenId: 'apiTokens:1',
      key: 'create-1',
      requestHash: 'hash-1',
      tokenName: 'grok-bot',
      projectId,
      name: 'Client experience launch',
      objective: 'Clients can see their project and approve work.',
      goals: ['Review card is live'],
      proposedTasks: [{ title: 'Design the overview' }, { title: 'Build the overview' }, { title: 'Wire the review card' }],
    });
    assert.equal(replay.body.id, milestoneId);
    assert.equal(rowsOf('milestones').length, 1);
    assert.equal(tasks().length, 3);

    // Nothing is claimable until Peter says go.
    const early = await handler<{ kind: string }>(claimNext)(ctx, { runnerId: RUNNER, repos: [REPO] });
    assert.equal(early.kind, 'none');

    // 2. Peter presses play until Building. The test sets that status directly.
    const go = transitionMilestone({ from: 'Awaiting Go', cause: 'advance', expected: 'Awaiting Go' });
    assert.equal(go.ok && go.status, 'Building');
    await db.patch(milestoneId, { status: 'Building' });

    // 3. The runner works the tasks top to bottom.
    const worked: string[] = [];
    for (let round = 0; round < 3; round += 1) {
      const claim = await handler<{ kind: string; runId: string; task: { title: string }; milestone: { branch: string } }>(claimNext)(
        ctx,
        { runnerId: RUNNER, mode: 'interactive', repos: [REPO] },
      );
      assert.equal(claim.kind, 'task');
      assert.equal(claim.milestone.branch, 'milestone/client-experience-launch');
      worked.push(claim.task.title);
      // A second runner cannot take the task this runner holds.
      const other = await handler<{ kind: string; task?: { title: string } }>(claimNext)(ctx, { runnerId: 'studio-mini', repos: [REPO] });
      if (other.kind === 'task') {
        assert.notEqual(other.task?.title, claim.task.title);
        // Hand the other runner's task back so the first runner works in order.
        const otherRun = rowsOf('agentRuns').find((run) => run.runnerId === 'studio-mini' && run.status === 'running') as Row;
        await handler(completeTask)(ctx, { runnerId: 'studio-mini', runId: otherRun._id, status: 'failed' });
        await retryBlockedWork(ctx as never, { milestoneId: milestoneId as never, taskId: otherRun.taskId as never });
      }
      const event = await handler<{ ok: boolean }>(recordEvent)(ctx, {
        runnerId: RUNNER,
        runId: claim.runId,
        type: 'tool',
        summary: 'Edited MilestoneReview.tsx',
        payload: { env: { RUNNER_TOKEN: 'secret-value' }, tool_name: 'Edit' },
      });
      assert.equal(event.ok, true);
      const done = await handler<{ ok: boolean; milestoneStatus: string; duplicate: boolean }>(completeTask)(ctx, {
        runnerId: RUNNER,
        runId: claim.runId,
        status: 'done',
        commitSha: SHA,
        prUrl: 'https://github.com/warehauscollective/warehaus/pull/140',
      });
      assert.equal(done.ok, true);
      // A retry of the same completion writes nothing.
      const again = await handler<{ duplicate: boolean }>(completeTask)(ctx, {
        runnerId: RUNNER,
        runId: claim.runId,
        status: 'done',
        commitSha: SHA,
      });
      assert.equal(again.duplicate, true);
    }
    assert.deepEqual(worked, ['Design the overview', 'Build the overview', 'Wire the review card']);
    assert.equal(tasks().every((task) => task.isDone === true && task.lastCommitSha === SHA), true);
    // No stored event carries the environment.
    assert.equal(JSON.stringify(rowsOf('agentEvents')).includes('secret-value'), false);

    // 4. The last task done moves the milestone to Ready to Ship.
    assert.equal(milestone().status, 'Ready to Ship');
    // Hand-off: the local preview is stored and one open note waits on Peter.
    assert.equal(milestone().localPreviewUrl, 'http://localhost:3100/');
    const openNotes = () => rowsOf('milestoneNotes').filter((note) => note.needsPeter === 'open');
    assert.equal(openNotes().length, 1);
    assert.equal(openNotes()[0]?.reason, 'approval');
    assert.match(String(openNotes()[0]?.body), /npm run preview:pr -- milestone\/client-experience-launch/);
    assert.match(String(openNotes()[0]?.body), /pull\/140/);
    assert.equal(String(openNotes()[0]?.body).includes('vercel'), false);
    assert.equal(milestone().prUrl, 'https://github.com/warehauscollective/warehaus/pull/140');
    assert.equal(rowsOf('agentEvents').some((event) => event.type === 'ready'), true);

    // 5. Peter requests changes in Grok Bot, with two task lines.
    const statusRows = () => rowsOf('activity').filter((row) => row.type === 'milestone.status').length;
    const statusRowsBefore = statusRows();
    const changes = await handler<{ ok: boolean; status: number; error?: string; iteration?: number; milestoneStatus?: string; createdTaskIds?: string[] }>(
      reviewForApi,
    )(ctx, {
      milestoneId,
      iteration: 1,
      decision: 'request_changes',
      notes: 'The review card needs more space on mobile.',
      taskIds: [],
      newTasks: ['Give the review card more space at 390', 'Make the preview link a full-width tap target'],
      tokenName: 'grok-bot',
    });
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
    assert.deepEqual(review.map((task) => [task.name, task.round]), [
      ['Give the review card more space at 390', 2],
      ['Make the preview link a full-width tap target', 2],
    ]);

    // Another token cannot decide.
    const refused = await handler<{ ok: boolean; error?: string }>(reviewForApi)(ctx, {
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
      const claim = await handler<{ kind: string; runId: string; task: { round: number } }>(claimNext)(ctx, { runnerId: RUNNER, repos: [REPO] });
      assert.equal(claim.kind, 'task');
      assert.equal(claim.task.round, 2);
      await handler(completeTask)(ctx, { runnerId: RUNNER, runId: claim.runId, status: 'done', commitSha: SHA });
    }
    assert.equal(milestone().status, 'Ready to Ship');

    assert.equal(openNotes().length, 1);

    // 7. Peter approves. The decision is recorded. Nothing ships yet.
    const approved = await handler<{ ok: boolean; error?: string; approval?: string; milestoneStatus?: string }>(reviewForApi)(ctx, {
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
    const merge = await handler<{ wrote: boolean; shipped?: boolean }>(applyInbound)(ctx, {
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
    const after = await handler<{ kind: string }>(claimNext)(ctx, { runnerId: RUNNER, repos: [REPO] });
    assert.equal(after.kind, 'none');
  });

  it('plans a portal milestone from the brief', async () => {
    const { db, rowsOf } = memoryDb();
    const ctx = { db };
    const orgId = await db.insert('clients', { name: 'Warehaus', portalAccess: 'Enabled' });
    const projectId = await db.insert('projects', { orgId, name: 'Warehaus Portal', agentRepo: REPO });
    const milestoneId = await db.insert('milestones', {
      orgId,
      projectId,
      name: 'Linear task source',
      objective: 'Read-only task visibility for the pilot client.',
      goals: [],
      status: 'Planning',
      approval: 'unreviewed',
      publishToWarehaus: false,
      createdVia: 'portal',
      planning: 'queued',
    });
    const claim = await handler<{ kind: string; runId: string }>(claimNext)(ctx, { runnerId: RUNNER, repos: [REPO] });
    assert.equal(claim.kind, 'planning');
    const milestone = () => rowsOf('milestones').find((row) => row._id === milestoneId) as Row;
    assert.equal(milestone().planning, 'running');

    const short = await handler<{ ok: boolean }>(writePlannedTasks)(ctx, { runnerId: RUNNER, runId: claim.runId, tasks: ['Only one'] });
    assert.equal(short.ok, false);

    const wrote = await handler<{ ok: boolean; taskIds: string[]; milestoneStatus: string }>(writePlannedTasks)(ctx, {
      runnerId: RUNNER,
      runId: claim.runId,
      tasks: [{ title: 'Map Linear fields' }, { title: 'Read tasks for the pilot client' }, { title: 'Show the source on the task' }],
    });
    assert.equal(wrote.ok, true);
    assert.equal(wrote.taskIds.length, 3);
    assert.equal(wrote.milestoneStatus, 'Planning');
    assert.equal(milestone().status, 'Planning');
    assert.equal(milestone().planning, undefined);
    assert.equal(rowsOf('tasks').every((task) => task.origin === 'planner'), true);
    // A retry after the run ended writes no second list.
    const again = await handler<{ duplicate: boolean }>(writePlannedTasks)(ctx, {
      runnerId: RUNNER,
      runId: claim.runId,
      tasks: [{ title: 'a' }, { title: 'b' }, { title: 'c' }],
    });
    assert.equal(again.duplicate, true);
    assert.equal(rowsOf('tasks').length, 3);
  });
});

describe('wrap-up asks the milestone task set', () => {
  const SOURCE = 'portal-milestone';

  async function building() {
    const { db, rowsOf } = memoryDb();
    const ctx = { db, scheduler: { runAfter: async () => undefined } };
    const orgId = await db.insert('clients', { name: 'Warehaus', slug: 'warehaus', portalAccess: 'Enabled' });
    const projectId = await db.insert('projects', { orgId, name: 'Warehaus Portal', agentRepo: REPO });
    const milestoneId = await db.insert('milestones', {
      orgId,
      projectId,
      name: 'Client experience launch',
      status: 'Building',
      approval: 'unreviewed',
      branch: 'milestone/client-experience-launch',
    });
    const taskId = await db.insert('tasks', {
      orgId,
      projectId,
      milestoneId,
      name: 'Build the overview',
      status: 'To Do',
      isDone: false,
      source: SOURCE,
      notionPageId: `${SOURCE}:overview`,
      milestoneOrder: 0,
    });
    return { db, rowsOf, ctx, orgId, projectId, milestoneId, taskId };
  }

  async function finishOnlyTask(ctx: unknown) {
    const claim = await handler<{ kind: string; runId: string }>(claimNext)(ctx, { runnerId: RUNNER, repos: [REPO] });
    assert.equal(claim.kind, 'task');
    return handler<{ ok: boolean; milestoneStatus: string }>(completeTask)(ctx, {
      runnerId: RUNNER,
      runId: claim.runId,
      status: 'done',
      commitSha: SHA,
    });
  }

  it('moves to Ready to Ship when the last task is done', async () => {
    const { ctx, rowsOf } = await building();
    const done = await finishOnlyTask(ctx);
    assert.equal(done.milestoneStatus, 'Ready to Ship');
    assert.equal(rowsOf('milestoneNotes').filter((note) => note.reason === 'approval').length, 1);
  });

  it('stays in Building while a subtask with no milestone is open, the same answer the close gate gives', async () => {
    const { db, ctx, rowsOf, orgId, projectId, taskId } = await building();
    await db.insert('tasks', {
      orgId,
      projectId,
      parentTaskId: taskId,
      name: 'Check the empty state',
      status: 'To Do',
      isDone: false,
      source: SOURCE,
      notionPageId: `${SOURCE}:empty-state`,
    });
    const done = await finishOnlyTask(ctx);
    assert.equal(done.ok, true);
    assert.equal(done.milestoneStatus, 'Building');
    assert.equal(rowsOf('milestoneNotes').filter((note) => note.reason === 'approval').length, 0);
  });
});

describe('cursor build hold and agent lock', () => {
  const SOURCE = 'portal-milestone';

  async function buildingCursor() {
    const { db, rowsOf } = memoryDb();
    const orgId = await db.insert('clients', { name: 'Warehaus', slug: 'warehaus', portalAccess: 'Enabled' });
    const projectId = await db.insert('projects', { orgId, name: 'Warehaus Portal', agentRepo: REPO, agentDriver: 'cursor' });
    const milestoneId = await db.insert('milestones', {
      orgId,
      projectId,
      name: 'Client experience launch',
      status: 'Building',
      approval: 'unreviewed',
      branch: 'milestone/client-experience-launch',
    });
    const taskId = await db.insert('tasks', {
      orgId,
      projectId,
      milestoneId,
      name: 'Build the overview',
      status: 'To Do',
      isDone: false,
      source: SOURCE,
      notionPageId: `${SOURCE}:overview`,
      origin: 'manual',
      milestoneOrder: 0,
    });
    const otherId = await db.insert('tasks', {
      orgId,
      projectId,
      milestoneId,
      name: 'Hand added later',
      status: 'To Do',
      isDone: false,
      source: SOURCE,
      notionPageId: `${SOURCE}:later`,
      origin: 'manual',
      milestoneOrder: 1,
    });
    return { db, rowsOf, orgId, projectId, milestoneId, taskId, otherId };
  }

  it('holds a quiet Cursor build until staff retry, and does not launch another agent', async () => {
    const { db, rowsOf, milestoneId } = await buildingCursor();
    const ctx = { db };
    const claim = await handler<{ kind: string; runId: string }>(claimNext)(ctx, { runnerId: RUNNER, repos: [REPO] });
    assert.equal(claim.kind, 'build');
    await db.patch(claim.runId, { startedAt: 1 });
    const sweep = await handler<{ released: number }>(releaseStuckRuns)(ctx, {});
    assert.equal(sweep.released, 1);
    const run = rowsOf('agentRuns').find((row) => row._id === claim.runId);
    assert.equal(run?.status, 'failed');
    assert.match(String(run?.blockedReason), /30 minutes/);
    const task = rowsOf('tasks').find((row) => row.milestoneId === milestoneId && row.status === 'Blocked');
    assert.equal(task?.blockedReason, 'Runner went quiet for 30 minutes');
    const notes = () => rowsOf('milestoneNotes').filter((row) => row.needsPeter === 'open' && row.reason === 'blocked' && !row.taskId);
    assert.equal(notes().length, 1);
    const again = await handler<{ released: number }>(releaseStuckRuns)(ctx, {});
    assert.equal(again.released, 0);
    assert.equal(notes().length, 1);
    const relaunch = await handler<{ kind: string }>(claimNext)(ctx, { runnerId: RUNNER, repos: [REPO] });
    assert.equal(relaunch.kind, 'none');
    // The sweep closed the run. The runner never said it stopped, so Retry waits out the grace window.
    const early = await retryBlockedWork(ctx as never, { milestoneId: milestoneId as never });
    assert.deepEqual(early, { ok: false, status: 409, error: RETRY_RUN_WINDING_DOWN });
    assert.equal(run?.status, 'failed');
    assert.equal(notes().length, 1);
    assert.equal((await handler<{ kind: string }>(claimNext)(ctx, { runnerId: RUNNER, repos: [REPO] })).kind, 'none');
    await db.patch(claim.runId, { endedAt: Date.now() - RUN_LEASE_GRACE_MS - 1 });
    const retried = await retryBlockedWork(ctx as never, { milestoneId: milestoneId as never });
    assert.equal(retried.ok, true);
    const next = await handler<{ kind: string; runId: string; externalId: string | null }>(claimNext)(ctx, { runnerId: RUNNER, repos: [REPO] });
    assert.equal(next.kind, 'build');
    assert.notEqual(next.runId, claim.runId);
    // No agent was ever launched, so there is nothing to follow.
    assert.equal(next.externalId, null);
  });

  it('follows the same Cursor agent after a quiet build is retried, instead of launching a second', async () => {
    const { db, rowsOf, milestoneId } = await buildingCursor();
    const ctx = { db };
    const claim = await handler<{ kind: string; runId: string }>(claimNext)(ctx, { runnerId: RUNNER, repos: [REPO] });
    await handler(reportBuild)(ctx, {
      runnerId: RUNNER,
      runId: claim.runId,
      status: 'running',
      agentId: 'bc_abc12345',
      agentUrl: 'https://cursor.com/agents/bc_abc12345',
    });
    await db.patch(claim.runId, { startedAt: 1 });
    await handler(releaseStuckRuns)(ctx, {});
    const old = rowsOf('agentRuns').find((row) => row._id === claim.runId);
    assert.equal(old?.status, 'failed');
    assert.equal(old?.settledAt, undefined);
    // The agent id is known, so Retry is allowed at once: the next build follows that agent.
    const retried = await retryBlockedWork(ctx as never, { milestoneId: milestoneId as never });
    assert.equal(retried.ok, true);
    const next = await handler<{ kind: string; runId: string; externalId: string | null; externalUrl: string | null }>(claimNext)(ctx, {
      runnerId: RUNNER,
      repos: [REPO],
    });
    assert.equal(next.kind, 'build');
    assert.notEqual(next.runId, claim.runId);
    assert.equal(next.externalId, 'bc_abc12345');
    assert.equal(next.externalUrl, 'https://cursor.com/agents/bc_abc12345');
    assert.match(String(rowsOf('agentEvents').at(-1)?.summary), /picked up again/);
    // Only one build is ever running on the milestone.
    assert.equal(rowsOf('agentRuns').filter((row) => row.status === 'running').length, 1);

    // The runner then sees that agent fail. That settles it, so the next retry starts a fresh agent.
    await handler(reportBuild)(ctx, { runnerId: RUNNER, runId: next.runId, status: 'failed', reason: 'The Cursor agent stopped' });
    assert.equal(typeof rowsOf('agentRuns').find((row) => row._id === next.runId)?.settledAt, 'number');
    assert.equal((await retryBlockedWork(ctx as never, { milestoneId: milestoneId as never })).ok, true);
    const fresh = await handler<{ kind: string; externalId: string | null }>(claimNext)(ctx, { runnerId: RUNNER, repos: [REPO] });
    assert.equal(fresh.kind, 'build');
    assert.equal(fresh.externalId, null);
  });

  it('refuses a build retry while a run is still going on the milestone', async () => {
    const { db, rowsOf, milestoneId } = await buildingCursor();
    const ctx = { db };
    const claim = await handler<{ kind: string; runId: string }>(claimNext)(ctx, { runnerId: RUNNER, repos: [REPO] });
    assert.equal(claim.kind, 'build');
    const before = JSON.stringify(rowsOf('tasks'));
    const refused = await retryBlockedWork(ctx as never, { milestoneId: milestoneId as never });
    assert.deepEqual(refused, { ok: false, status: 409, error: RETRY_RUN_ACTIVE });
    // Nothing was written, and the one run is still the only run.
    assert.equal(JSON.stringify(rowsOf('tasks')), before);
    assert.equal(rowsOf('agentRuns').length, 1);
    assert.equal(rowsOf('agentRuns')[0]?.status, 'running');
  });

  it('does not relaunch a failed Cursor build until staff retry', async () => {
    const { db, rowsOf, milestoneId, taskId } = await buildingCursor();
    const ctx = { db };
    const claim = await handler<{ kind: string; runId: string }>(claimNext)(ctx, { runnerId: RUNNER, repos: [REPO] });
    assert.equal(claim.kind, 'build');
    const failed = await handler<{ ok: boolean; duplicate: boolean }>(reportBuild)(ctx, {
      runnerId: RUNNER,
      runId: claim.runId,
      status: 'failed',
      reason: 'Cursor refused the API key',
    });
    assert.equal(failed.ok, true);
    assert.equal(failed.duplicate, false);
    const again = await handler<{ kind: string }>(claimNext)(ctx, { runnerId: RUNNER, repos: [REPO] });
    assert.equal(again.kind, 'none');
    const repeat = await handler<{ duplicate: boolean }>(reportBuild)(ctx, {
      runnerId: RUNNER,
      runId: claim.runId,
      status: 'failed',
      reason: 'Cursor refused the API key',
    });
    assert.equal(repeat.duplicate, true);
    const notes = rowsOf('milestoneNotes').filter((row) => row.needsPeter === 'open' && row.reason === 'blocked');
    assert.equal(notes.length, 1);
    await retryBlockedWork(ctx as never, { milestoneId: milestoneId as never });
    const retried = await handler<{ kind: string; runId: string }>(claimNext)(ctx, { runnerId: RUNNER, repos: [REPO] });
    assert.equal(retried.kind, 'build');
    assert.notEqual(retried.runId, claim.runId);
    const task = rowsOf('tasks').find((row) => row._id === taskId);
    assert.equal(task?.status, 'In Progress');
  });

  it('marks done only the tasks that build claimed', async () => {
    const { db, rowsOf, taskId, otherId } = await buildingCursor();
    const ctx = { db };
    const claim = await handler<{ kind: string; runId: string }>(claimNext)(ctx, { runnerId: RUNNER, repos: [REPO] });
    await db.patch(otherId, { claimedBy: undefined, claimedAt: undefined, status: 'To Do' });
    const finished = await handler<{ ok: boolean }>(reportBuild)(ctx, {
      runnerId: RUNNER,
      runId: claim.runId,
      status: 'finished',
      tasks: [
        { taskId, commitSha: SHA },
        { taskId: otherId, commitSha: 'd'.repeat(40) },
      ],
    });
    assert.equal(finished.ok, true);
    const claimed = rowsOf('tasks').find((row) => row._id === taskId);
    const other = rowsOf('tasks').find((row) => row._id === otherId);
    assert.equal(claimed?.isDone, true);
    assert.equal(claimed?.lastCommitSha, SHA);
    assert.equal(other?.isDone, false);
    assert.equal(other?.status, 'To Do');
  });

  it('blocks a finished Cursor build that has no Portal-Task trailer', async () => {
    const { db, rowsOf } = await buildingCursor();
    const ctx = { db };
    const claim = await handler<{ runId: string }>(claimNext)(ctx, { runnerId: RUNNER, repos: [REPO] });
    await handler(reportBuild)(ctx, { runnerId: RUNNER, runId: claim.runId, status: 'finished', tasks: [] });
    const run = rowsOf('agentRuns').find((row) => row._id === claim.runId);
    assert.equal(run?.status, 'failed');
    assert.match(String(run?.blockedReason), /Portal-Task trailer/);
    const next = await handler<{ kind: string }>(claimNext)(ctx, { runnerId: RUNNER, repos: [REPO] });
    assert.equal(next.kind, 'none');
  });

  it('refuses an agent change while a milestone is Building', async () => {
    const { db, orgId, projectId } = await buildingCursor();
    await db.insert('contacts', {
      orgId,
      authUserId: 'user-staff',
      role: 'Warehaus Staff',
      portalAccess: 'Enabled',
      name: 'Peter',
      email: 'peter@warehaus.co',
    });
    const ctx = { db, auth: { getUserIdentity: async () => ({ subject: 'user-staff' }) } };
    await assert.rejects(
      () => handler(setAgentDriver)(ctx, { projectId, driver: 'claude_code' }),
      (error: unknown) => error instanceof PortalAuthError && error.message === AGENT_DRIVER_LOCKED,
    );
    const project = (await db.get(projectId)) as { agentDriver?: string };
    assert.equal(project.agentDriver, 'cursor');
  });

  it('archives planner drafts on regenerate and leaves hand-added tasks', async () => {
    const { db, rowsOf } = memoryDb();
    const orgId = await db.insert('clients', { name: 'Warehaus', portalAccess: 'Enabled' });
    const projectId = await db.insert('projects', { orgId, name: 'Warehaus Portal', agentRepo: REPO });
    const milestoneId = await db.insert('milestones', {
      orgId,
      projectId,
      name: 'Client experience launch',
      status: 'Planning',
      approval: 'unreviewed',
      planning: 'running',
      planningReplace: true,
    });
    const runId = await db.insert('agentRuns', {
      orgId,
      milestoneId,
      kind: 'planning',
      runnerId: RUNNER,
      tool: 'claude_code',
      mode: 'headless',
      status: 'running',
      startedAt: 1,
    });
    const drafted = await db.insert('tasks', {
      orgId,
      projectId,
      milestoneId,
      name: 'Old draft',
      status: 'To Do',
      isDone: false,
      source: SOURCE,
      notionPageId: `${SOURCE}:draft`,
      origin: 'planner',
    });
    const edited = await db.insert('tasks', {
      orgId,
      projectId,
      milestoneId,
      name: 'Staff kept this',
      status: 'To Do',
      isDone: false,
      source: SOURCE,
      notionPageId: `${SOURCE}:kept`,
      origin: 'manual',
    });
    const wrote = await handler<{ ok: boolean }>(writePlannedTasks)({ db }, {
      runnerId: RUNNER,
      runId,
      tasks: [{ title: 'One' }, { title: 'Two' }, { title: 'Three' }],
    });
    assert.equal(wrote.ok, true);
    const draft = rowsOf('tasks').find((row) => row._id === drafted);
    const kept = rowsOf('tasks').find((row) => row._id === edited);
    assert.equal(typeof draft?.archivedAt, 'number');
    assert.equal(kept?.archivedAt, undefined);
    assert.equal(rowsOf('tasks').some((row) => row._id === drafted), true);
  });
});

describe('status change from the staff API and a merge', () => {
  async function seed(status: string, tasks: Array<Record<string, unknown>>) {
    const { db, rowsOf } = memoryDb();
    const ctx = { db, scheduler: { runAfter: async () => undefined } };
    const orgId = await db.insert('clients', { name: 'Warehaus', portalAccess: 'Enabled' });
    const projectId = await db.insert('projects', { orgId, name: 'Warehaus Portal', agentRepo: REPO });
    const milestoneId = await db.insert('milestones', {
      orgId,
      projectId,
      name: 'Lifecycle check',
      objective: 'One writer.',
      goals: [],
      status,
      approval: 'unreviewed',
      publishToWarehaus: false,
      branch: 'milestone/lifecycle-check',
    });
    const ids: string[] = [];
    for (const task of tasks) {
      const parent = typeof task.parent === 'number' ? ids[task.parent] : undefined;
      const { parent: _parent, ...fields } = task;
      ids.push(
        await db.insert('tasks', {
          orgId,
          projectId,
          name: `Task ${ids.length + 1}`,
          status: 'To Do',
          isDone: false,
          stage: 'Building',
          source: 'portal-milestone',
          ...(parent ? { parentTaskId: parent } : { milestoneId }),
          ...fields,
        }),
      );
    }
    const milestone = () => rowsOf('milestones').find((row) => row._id === milestoneId) as Row;
    const openNotes = () => rowsOf('milestoneNotes').filter((note) => note.needsPeter === 'open' && note.reason === 'approval');
    return { ctx, db, rowsOf, milestoneId, ids, milestone, openNotes };
  }

  const update = (ctx: unknown, milestoneId: string, key: string, status: string) =>
    handler<{ status: number; body: { id?: string; error?: string } }>(updateMilestone)(ctx, {
      tokenId: 'apiTokens:1',
      key,
      requestHash: key,
      tokenName: 'grok-bot',
      milestoneId,
      status,
    });

  it('a staff API move into Ready to Ship writes the hand-off, and a move out closes the note', async () => {
    const run = await seed('Building', [{ status: 'Done', isDone: true }, {}]);
    const moved = await update(run.ctx, run.milestoneId, 'k1', 'Ready to Ship');
    assert.equal(moved.status, 200, JSON.stringify(moved.body));
    assert.equal(run.milestone().status, 'Ready to Ship');
    assert.equal(run.openNotes().length, 1);
    assert.equal(run.openNotes()[0]?.addedBy, 'grok-bot');
    assert.match(String(run.openNotes()[0]?.body), /Heads up: 1 task is still open\./);
    assert.ok(run.milestone().localPreviewUrl);
    assert.deepEqual(
      run.rowsOf('agentEvents').filter((event) => event.type === 'ready').map((event) => event.summary),
      ['Moved to Ready to Ship by grok-bot'],
    );
    const back = await update(run.ctx, run.milestoneId, 'k2', 'Awaiting Go');
    assert.equal(back.status, 200, JSON.stringify(back.body));
    assert.equal(run.openNotes().length, 0);
  });

  it('a staff API Shipped with an open task is refused and writes nothing', async () => {
    const run = await seed('Ready to Ship', [{ status: 'Done', isDone: true }, {}]);
    const refused = await update(run.ctx, run.milestoneId, 'k1', 'Shipped');
    assert.equal(refused.status, 400);
    assert.equal(run.milestone().status, 'Ready to Ship');
    assert.equal(run.rowsOf('activity').length, 0);
  });

  it('a merge with an open subtask stores the pull request and does not ship, and a later merge does', async () => {
    const run = await seed('Ready to Ship', [{ status: 'Done', isDone: true }, { parent: 0 }]);
    await run.db.insert('milestoneNotes', {
      orgId: run.milestone().orgId,
      milestoneId: run.milestoneId,
      body: 'Approve?',
      addedBy: 'runner:peter-mbp',
      createdAt: 1,
      needsPeter: 'open',
      reason: 'approval',
    });
    const merged = (n: number) =>
      handler<{ wrote: boolean; shipped?: boolean }>(applyInbound)(run.ctx, {
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

    await run.db.patch(run.ids[1]!, { status: 'Done', isDone: true });
    const second = await merged(142);
    assert.equal(second.shipped, true);
    assert.equal(run.milestone().status, 'Shipped');
    // Leaving Ready to Ship closes Peter's note.
    assert.equal(run.openNotes().length, 0);
    assert.deepEqual(
      run.rowsOf('agentEvents').filter((event) => event.key === 'merged:142').map((event) => event.summary),
      ['Pull request #142 merged · milestone is Shipped'],
    );
    assert.equal(run.rowsOf('activity').filter((row) => row.type === 'milestone.status').length, 1);
  });
});

describe('retry does not overlap the run it replaces', () => {
  const SOURCE_TASK = 'portal-milestone';

  async function buildingClaude() {
    const { db, rowsOf } = memoryDb();
    const orgId = await db.insert('clients', { name: 'Warehaus', slug: 'warehaus', portalAccess: 'Enabled' });
    const projectId = await db.insert('projects', { orgId, name: 'Warehaus Portal', agentRepo: REPO });
    const milestoneId = await db.insert('milestones', {
      orgId,
      projectId,
      name: 'Client experience launch',
      status: 'Building',
      approval: 'unreviewed',
      branch: 'milestone/client-experience-launch',
    });
    const taskIds: string[] = [];
    for (const [index, name] of ['Build the overview', 'Wire the review card'].entries()) {
      taskIds.push(
        await db.insert('tasks', {
          orgId,
          projectId,
          milestoneId,
          name,
          status: 'To Do',
          isDone: false,
          source: SOURCE_TASK,
          notionPageId: `${SOURCE_TASK}:${index}`,
          origin: 'manual',
          milestoneOrder: index,
        }),
      );
    }
    return { db, rowsOf, milestoneId, taskIds };
  }

  type Claim = { kind: string; runId: string; task?: { id: string } };
  const claimAs = (ctx: unknown, runnerId: string) => handler<Claim>(claimNext)(ctx, { runnerId, repos: [REPO] });

  it('holds a task the sweep released until its runner answers, so a second runner cannot start over it', async () => {
    const { db, rowsOf, milestoneId, taskIds } = await buildingClaude();
    const ctx = { db };
    const first = await claimAs(ctx, RUNNER);
    assert.equal(first.kind, 'task');
    assert.equal(first.task?.id, taskIds[0]);
    // A long Claude session: the runner makes no call for 30 minutes and the sweep releases the run.
    await db.patch(first.runId, { startedAt: 1 });
    await handler(releaseStuckRuns)(ctx, {});
    const run = () => rowsOf('agentRuns').find((row) => row._id === first.runId) as Row;
    assert.equal(run().status, 'cancelled');
    assert.equal(run().settledAt, undefined);
    assert.equal(rowsOf('tasks').find((row) => row._id === taskIds[0])?.status, 'Blocked');

    // Staff press Retry while that session may still be committing. Refused, nothing written.
    const refused = await retryBlockedWork(ctx as never, { milestoneId: milestoneId as never, taskId: taskIds[0] as never });
    assert.deepEqual(refused, { ok: false, status: 409, error: RETRY_RUN_WINDING_DOWN });
    assert.equal(rowsOf('tasks').find((row) => row._id === taskIds[0])?.status, 'Blocked');
    // A second Mac asking for work is not handed the task the first may still be on.
    const other = await claimAs(ctx, 'studio-mini');
    assert.notEqual(other.task?.id, taskIds[0]);
    if (other.kind === 'task') await handler(completeTask)(ctx, { runnerId: 'studio-mini', runId: other.runId, status: 'done', commitSha: SHA });

    // The first runner's session ends and it reports. The run already ended, so nothing changes but the lease.
    const late = await handler<{ duplicate: boolean }>(completeTask)(ctx, { runnerId: RUNNER, runId: first.runId, status: 'done', commitSha: SHA });
    assert.equal(late.duplicate, true);
    assert.equal(typeof run().settledAt, 'number');
    const retried = await retryBlockedWork(ctx as never, { milestoneId: milestoneId as never, taskId: taskIds[0] as never });
    assert.equal(retried.ok, true);
    const again = await claimAs(ctx, RUNNER);
    assert.equal(again.kind, 'task');
    assert.equal(again.task?.id, taskIds[0]);
    assert.notEqual(again.runId, first.runId);
    assert.equal(rowsOf('agentRuns').filter((row) => row.status === 'running').length, 1);
  });

  it('frees the lease when the runner is seen idle, or when the grace window passes', async () => {
    const { db, rowsOf, milestoneId, taskIds } = await buildingClaude();
    const ctx = { db };
    const first = await claimAs(ctx, RUNNER);
    await db.patch(first.runId, { startedAt: 1 });
    await handler(releaseStuckRuns)(ctx, {});
    const retry = () => retryBlockedWork(ctx as never, { milestoneId: milestoneId as never, taskId: taskIds[0] as never });
    assert.equal((await retry()).ok, false);
    // The runner asks for work again, so it is not working on the old run.
    const idle = await claimAs(ctx, RUNNER);
    assert.equal(idle.task?.id, taskIds[1]);
    assert.equal(typeof rowsOf('agentRuns').find((row) => row._id === first.runId)?.settledAt, 'number');
    // Retry now puts the task back in the queue. It does not start a run: the other task's run holds the milestone.
    assert.equal((await retry()).ok, true);
    assert.equal(rowsOf('tasks').find((row) => row._id === taskIds[0])?.status, 'To Do');
    assert.equal((await claimAs(ctx, 'studio-mini')).kind, 'none');
    assert.equal(rowsOf('agentRuns').filter((row) => row.status === 'running').length, 1);

    // A runner that never comes back: the lease ends on its own after the grace window.
    const dead = await buildingClaude();
    const deadCtx = { db: dead.db };
    const lost = await claimAs(deadCtx, RUNNER);
    await dead.db.patch(lost.runId, { startedAt: 1 });
    await handler(releaseStuckRuns)(deadCtx, {});
    const deadRetry = () =>
      retryBlockedWork(deadCtx as never, { milestoneId: dead.milestoneId as never, taskId: dead.taskIds[0] as never });
    assert.equal((await deadRetry()).ok, false);
    await dead.db.patch(lost.runId, { endedAt: Date.now() - RUN_LEASE_GRACE_MS - 1 });
    assert.equal((await deadRetry()).ok, true);
  });

  it('retries a task the runner itself reported blocked at once', async () => {
    const { db, milestoneId, taskIds } = await buildingClaude();
    const ctx = { db };
    const first = await claimAs(ctx, RUNNER);
    await handler(completeTask)(ctx, { runnerId: RUNNER, runId: first.runId, status: 'blocked', reason: 'needs the Figma frame' });
    const retried = await retryBlockedWork(ctx as never, { milestoneId: milestoneId as never, taskId: taskIds[0] as never });
    assert.equal(retried.ok, true);
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
    // The only client milestone queries go through the audience filter.
    const milestones = read('../milestones.ts');
    const clientList = milestones.slice(milestones.indexOf('export const listForClientProject'), milestones.indexOf('async function personName'));
    assert.match(clientList, /listOnProject\(ctx, project, 'client'/);
    for (const table of ['agentRuns', 'agentEvents', 'agentRunners']) {
      assert.equal(milestones.includes(table), false, table);
    }
    // Notes are read only where a review decision closes the open request. No read path, staff or client, lists them here.
    const reads = milestones.slice(0, milestones.indexOf('async function applyMilestoneReview'));
    assert.equal(reads.includes('milestoneNotes'), false);
    assert.equal(clientList.includes('milestoneNotes'), false);
    // A project's repo setting is staff only.
    for (const file of ['../portalData.ts', '../search.ts']) {
      assert.equal(read(file).includes('agentRepo'), false, file);
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
    assert.deepEqual(Object.keys(rows[0] ?? {}).sort(), [
      'children',
      'id',
      'isDone',
      'name',
      'onMilestone',
      'resourceCount',
      'stage',
      'status',
    ]);
  });
});
