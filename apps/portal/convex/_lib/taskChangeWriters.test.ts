/**
 * The writers that now go through the task change (ADR-0003): the staff API
 * `updateTask`, closeout park and undo, and the pending-stage drain.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { v } from 'convex/values';
import { internalMutation } from '../_generated/server';
import type { Doc, Id } from '../_generated/dataModel';
import { updateTask } from '../portalApi';
import { drainPendingStages } from '../sync/taskWrite';
import { SnapshotLog, parkTask, restoreTaskSnapshots, type TaskSnapshot } from './closeoutStore';
import { memoryCtx, type MemoryCtx } from './memoryCtx.testkit';
import { seedOrg, seedProject, seedTask } from './seedRows.testkit';
import { EARLIER_WRITE_FAILED, PORTAL_TASK_STATUS, TASK_CHANGED_IN_NOTION } from './taskChange';

const TIME = '2026-11-20T10:00:00.000Z';

type ApiResult = { status: number; body: Record<string, unknown> };

async function withWriteback(on: boolean, fn: () => Promise<void>) {
  const previous = process.env.NOTION_WRITEBACK_ENABLED;
  if (on) process.env.NOTION_WRITEBACK_ENABLED = 'true';
  else delete process.env.NOTION_WRITEBACK_ENABLED;
  try {
    await fn();
  } finally {
    if (previous === undefined) delete process.env.NOTION_WRITEBACK_ENABLED;
    else process.env.NOTION_WRITEBACK_ENABLED = previous;
  }
}

/** Test-only: closeout parks a task, as `markComplete` does for a leftover. */
const park = internalMutation({
  args: { taskId: v.id('tasks'), actorId: v.string() },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error('Task not found');
    const log = new SnapshotLog();
    const wrote = await parkTask(ctx, task, log, args.actorId);
    return { wrote, previous: log.list() };
  },
});

/** Test-only: Undo through the closeout store. */
const undo = internalMutation({
  args: { snapshots: v.any(), actorId: v.string() },
  handler: async (ctx, args) => restoreTaskSnapshots(ctx, null, args.snapshots as TaskSnapshot[], args.actorId),
});

function world(fields: Record<string, unknown> = {}) {
  const t = memoryCtx();
  const orgId = seedOrg(t);
  const projectId = seedProject(t, orgId);
  const taskId = seedTask(t, orgId, projectId, {
    notionPageId: 'page-1',
    lastEditedTime: TIME,
    status: 'In Progress',
    stage: 'Building',
    priority: 'Low',
    ...fields,
  });
  const tokenId = t.seed('apiTokens', {
    name: 'grok-bot',
    tokenHash: 'hash-grok-bot',
    tokenPrefix: 'wh_',
    scope: 'read-write',
    createdAt: 0,
    rateLimit: 100,
    rateWindowMs: 60_000,
    windowStartedAt: 0,
    windowCount: 0,
  });
  let keys = 0;
  const update = (body: Record<string, unknown>) =>
    t.call<ApiResult>(updateTask, {
      tokenId,
      key: `key-${(keys += 1)}`,
      requestHash: `hash-${keys}`,
      tokenName: 'grok-bot',
      taskId,
      expectedLastEditedTime: TIME,
      ...body,
    });
  return { t, orgId, taskId, update, task: () => t.row(taskId) as Doc<'tasks'> };
}

const taskAndOutbox = (t: MemoryCtx) => JSON.stringify([t.rows('tasks'), t.rows('notionOutbox')]);

describe('staff API updateTask', () => {
  it('saves and stamps status, priority and Next Action, and queues one status and one fields row', async () => {
    await withWriteback(true, async () => {
      const w = world();
      const result = await w.update({ status: 'Done', priority: 'High', nextAction: 'Ship the page' });
      assert.equal(result.status, 200, JSON.stringify(result.body));
      assert.equal(result.body.notion, 'queued');
      const task = w.task();
      assert.deepEqual([task.status, task.isDone, task.priority, task.nextAction], ['Done', true, 'High', 'Ship the page']);
      const stamps = task.fieldStamps as Record<string, { updatedBy: string }>;
      assert.deepEqual(['status', 'priority', 'nextAction'].map((field) => stamps[field]?.updatedBy), ['grok-bot', 'grok-bot', 'grok-bot']);
      const rows = w.t.rows('notionOutbox');
      assert.deepEqual(rows.map((row) => row.kind).sort(), ['task-fields', 'task-status']);
      assert.equal(rows.some((row) => row.kind === 'update'), false, 'no new update rows for tasks');
      assert.ok(rows.every((row) => row.actorId === 'grok-bot' && row.expectedLastEditedTime === TIME));
      const fields = rows.find((row) => row.kind === 'task-fields');
      assert.deepEqual(JSON.parse(String(fields?.payload)).properties, { Priority: 'High', 'Next Action': 'Ship the page' });
    });
  });

  it('saves with write-back off and says so', async () => {
    await withWriteback(false, async () => {
      const w = world();
      const result = await w.update({ priority: 'High' });
      assert.equal(result.status, 200);
      assert.equal(result.body.notion, 'off');
      assert.equal(w.task().priority, 'High');
      assert.equal(w.t.rows('notionOutbox').length, 0);
    });
  });

  it('refuses a stale read with 409 stale and writes nothing to the task or outbox', async () => {
    await withWriteback(true, async () => {
      const w = world();
      const before = taskAndOutbox(w.t);
      const result = await w.update({ priority: 'High', expectedLastEditedTime: '2026-11-19T00:00:00.000Z' });
      assert.deepEqual(result, { status: 409, body: { error: TASK_CHANGED_IN_NOTION, code: 'stale' } });
      assert.equal(taskAndOutbox(w.t), before);
    });
  });

  it('refuses the whole change with 400 when one field is invalid', async () => {
    await withWriteback(true, async () => {
      const w = world();
      const before = taskAndOutbox(w.t);
      const result = await w.update({ priority: 'High', status: 'Someday' });
      assert.equal(result.status, 400);
      assert.equal(taskAndOutbox(w.t), before);
    });
  });

  it('refuses with 409 conflict when the same write already died', async () => {
    await withWriteback(true, async () => {
      const w = world();
      w.t.seed('notionOutbox', {
        idempotencyKey: `task-status:page-1:Done:${TIME}`,
        kind: 'task-status',
        orgId: w.orgId,
        database: 'tasks',
        notionPageId: 'page-1',
        payload: '{"properties":{"Status":"Done"}}',
        actor: 'staff',
        status: 'dead',
        attempts: 5,
        nextAttemptAt: 0,
        createdAt: 0,
      });
      const before = taskAndOutbox(w.t);
      const result = await w.update({ status: 'Done' });
      assert.deepEqual(result, { status: 409, body: { error: EARLIER_WRITE_FAILED, code: 'conflict' } });
      assert.equal(taskAndOutbox(w.t), before);
    });
  });

  it("refuses a portal-owned task's status: the runner and Mark done set it", async () => {
    await withWriteback(true, async () => {
      const w = world({ notionPageId: 'portal-milestone:m1:1', source: 'portal-milestone', lastEditedTime: undefined });
      const result = await w.update({ status: 'Done', expectedLastEditedTime: '' });
      assert.deepEqual(result, { status: 400, body: { error: PORTAL_TASK_STATUS, code: 'refused' } });
      assert.equal(w.task().status, 'In Progress');
    });
  });

  it('refuses unverified Shipped', async () => {
    await withWriteback(true, async () => {
      const w = world();
      const result = await w.update({ stage: 'Shipped', pullRequestLink: 'https://github.com/warehauscollective/warehaus/pull/9' });
      assert.equal(result.status, 400);
      assert.equal(w.task().stage, 'Building');
    });
  });
});

describe('closeout park and undo', () => {
  it('parks an unstaged Notion task, stamps it and writes the stage back', async () => {
    await withWriteback(true, async () => {
      const w = world({ stage: undefined });
      const parked = await w.t.call<{ wrote: boolean; previous: TaskSnapshot[] }>(park, { taskId: w.taskId, actorId: 'contacts:staff' });
      assert.equal(parked.wrote, true);
      assert.equal(w.task().stage, 'Parked');
      assert.equal((w.task().fieldStamps as Record<string, { updatedBy: string }>).stage?.updatedBy, 'contacts:staff');
      const [row] = w.t.rows('notionOutbox');
      assert.equal(row?.kind, 'task-stage');
      assert.deepEqual(JSON.parse(String(row?.payload)).properties, { Stage: 'Parked' });

      // Undo puts the empty stage back in the portal only: Notion has no empty stage to write.
      const wrote = await w.t.call<number>(undo, { snapshots: parked.previous, actorId: 'contacts:staff' });
      assert.equal(wrote, 1);
      assert.equal(w.task().stage, undefined);
    });
  });

  it('undo puts a Shipped task back even though staff cannot move into Shipped', async () => {
    await withWriteback(true, async () => {
      const w = world({ stage: 'Shipped', stageSynced: 'Shipped' });
      const parked = await w.t.call<{ previous: TaskSnapshot[] }>(park, { taskId: w.taskId, actorId: 'contacts:staff' });
      assert.equal(w.task().stage, 'Parked');
      await w.t.call<number>(undo, { snapshots: parked.previous, actorId: 'contacts:staff' });
      assert.equal(w.task().stage, 'Shipped');
      assert.equal(w.task().stagePendingAt, undefined, 'back on the stage Notion has: nothing pending');
    });
  });

  it('undo restores an archived task and its status, writing the status back', async () => {
    await withWriteback(true, async () => {
      const w = world({ archivedAt: 5, status: 'Done', isDone: true });
      const snapshot: TaskSnapshot = {
        taskId: w.taskId as Id<'tasks'>,
        status: 'In Progress',
        isDone: false,
        stage: 'Building',
        archivedAt: null,
        milestoneId: null,
        milestoneOrder: null,
      };
      const wrote = await w.t.call<number>(undo, { snapshots: [snapshot], actorId: 'contacts:staff' });
      assert.equal(wrote, 1);
      assert.deepEqual([w.task().status, w.task().isDone, w.task().archivedAt], ['In Progress', false, undefined]);
      assert.deepEqual(w.t.rows('notionOutbox').map((row) => row.kind), ['task-status']);
    });
  });
});

describe('pending-stage drain', () => {
  it('queues the pending move under the contact who made it', async () => {
    await withWriteback(true, async () => {
      const w = world({ stage: 'Planning', stageSynced: 'Building', stagePendingAt: 1, stagePendingBaseEditedTime: TIME, stagePendingBy: 'contacts:staff' });
      const drained = await w.t.call<{ inserted: number }>(drainPendingStages, {});
      assert.equal(drained.inserted, 1);
      const [row] = w.t.rows('notionOutbox');
      assert.equal(row?.kind, 'task-stage');
      assert.equal(row?.actorId, 'contacts:staff');
      assert.deepEqual(w.t.reads.unbounded(), []);
    });
  });
});
