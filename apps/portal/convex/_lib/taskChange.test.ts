/**
 * Task change (ADR-0003) through a real mutation on the in-memory ctx: each
 * change against a Notion task, a portal-owned task and an archived task,
 * with write-back on and off.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { v } from 'convex/values';
import { internalMutation } from '../_generated/server';
import type { Doc, Id } from '../_generated/dataModel';
import { memoryCtx, type MemoryCtx } from './memoryCtx.testkit';
import { seedContact, seedOrg, seedProject, seedTask } from './seedRows.testkit';
import {
  CHOOSE_ASSIGNEE,
  EARLIER_WRITE_FAILED,
  PORTAL_TASK_DETAIL,
  PORTAL_TASK_STATUS,
  RESTORE_FIRST,
  TASK_CHANGED_IN_NOTION,
  USE_CALENDAR_DAY,
  applyTaskChanges,
  type TaskChange,
  type TaskChangeOptions,
  type TaskChangeResult,
} from './taskChange';

const TIME = '2026-11-20T10:00:00.000Z';
const AT = 1_800_000_000_000;
const PR = 'https://github.com/warehauscollective/warehaus/pull/170';

/** Test-only mutation: the task change runs inside one real mutation, so a throw rolls back. */
const change = internalMutation({
  args: { taskId: v.id('tasks'), changes: v.any(), options: v.any() },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error('Task not found');
    return applyTaskChanges(ctx, task, args.changes as TaskChange[], args.options as TaskChangeOptions);
  },
});

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

type State = 'notion' | 'portal' | 'archived';

function world(state: State = 'notion', fields: Record<string, unknown> = {}) {
  const t = memoryCtx();
  const orgId = seedOrg(t);
  const projectId = seedProject(t, orgId);
  const base =
    state === 'portal'
      ? { notionPageId: 'portal-milestone:m1:1', source: 'portal-milestone' }
      : { notionPageId: 'page-1', lastEditedTime: TIME };
  const taskId = seedTask(t, orgId, projectId, {
    status: 'In Progress',
    stage: 'Building',
    stageSynced: 'Building',
    priority: 'Low',
    ...base,
    ...(state === 'archived' ? { archivedAt: 1 } : {}),
    ...fields,
  });
  const run = (changes: TaskChange[], options: Partial<TaskChangeOptions> = {}) =>
    t.call<TaskChangeResult>(change, { taskId, changes, options: { actor: 'staff', actorId: 'contacts:staff', at: AT, ...options } });
  return { t, orgId, taskId, run, task: () => t.row(taskId) as Doc<'tasks'>, outbox: () => t.rows('notionOutbox') };
}

/** Every table, to prove a refused change wrote nothing. */
const snapshot = (t: MemoryCtx) => JSON.stringify([t.rows('tasks'), t.rows('notionOutbox'), t.scheduled]);

/** One row per field: the change, what the row holds after, and the write kind and properties for Notion. */
const FIELD_CASES: Array<{
  name: string;
  change: TaskChange;
  row: Partial<Doc<'tasks'>>;
  stamp: string;
  kind: string;
  properties: Record<string, unknown>;
}> = [
  { name: 'status', change: { field: 'status', status: 'Done' }, row: { status: 'Done', isDone: true }, stamp: 'status', kind: 'task-status', properties: { Status: 'Done' } },
  { name: 'stage', change: { field: 'stage', stage: 'Ready to Ship' }, row: { stage: 'Ready to Ship' }, stamp: 'stage', kind: 'task-stage', properties: { Stage: 'Ready to Ship' } },
  { name: 'date', change: { field: 'date', date: '2026-12-24' }, row: { date: '2026-12-24' }, stamp: 'date', kind: 'task-date', properties: { Date: '2026-12-24' } },
  { name: 'estimate', change: { field: 'estimate', estimate: 'L' }, row: { estimate: 'L' }, stamp: 'estimate', kind: 'task-fields', properties: { Estimate: 'L' } },
  { name: 'priority', change: { field: 'priority', priority: 'High' }, row: { priority: 'High' }, stamp: 'priority', kind: 'task-fields', properties: { Priority: 'High' } },
  { name: 'source', change: { field: 'source', source: 'portal' }, row: { source: 'portal' }, stamp: 'source', kind: 'task-fields', properties: { Source: 'portal' } },
  { name: 'publish', change: { field: 'publishToWarehaus', publishToWarehaus: true }, row: { publishToWarehaus: true }, stamp: 'publishToWarehaus', kind: 'task-fields', properties: { 'Publish to Warehaus': true } },
  { name: 'next action', change: { field: 'nextAction', nextAction: ' Call the client ' }, row: { nextAction: 'Call the client' }, stamp: 'nextAction', kind: 'task-fields', properties: { 'Next Action': 'Call the client' } },
  { name: 'description', change: { field: 'description', description: 'New detail' }, row: { description: 'New detail', descriptionSource: 'property' }, stamp: 'description', kind: 'task-description', properties: { Description: 'New detail' } },
  { name: 'resources', change: { field: 'resources', resourceNotionIds: ['r1', 'r2', 'r1'] }, row: { resourceNotionIds: ['r1', 'r2'] }, stamp: 'resources', kind: 'task-resources', properties: { Resources: ['r1', 'r2'] } },
];

describe('task change: every field against a Notion task', () => {
  for (const c of FIELD_CASES) {
    it(`${c.name}: write-back on saves, stamps and queues one ${c.kind} row`, async () => {
      await withWriteback(true, async () => {
        const w = world();
        const result = await w.run([c.change]);
        assert.equal(result.ok, true, JSON.stringify(result));
        if (!result.ok) return;
        assert.deepEqual([result.wrote, result.notion, result.outboxIds.length], [true, 'queued', 1]);
        for (const [field, value] of Object.entries(c.row)) assert.deepEqual(w.task()[field as keyof Doc<'tasks'>], value, field);
        assert.deepEqual((w.task().fieldStamps as Record<string, unknown>)[c.stamp], { updatedAt: AT, updatedBy: 'contacts:staff' });
        const [row] = w.outbox();
        assert.equal(row.kind, c.kind);
        assert.equal(row.expectedLastEditedTime, TIME);
        assert.equal(row.actorId, 'contacts:staff');
        assert.deepEqual(JSON.parse(String(row.payload)).properties, c.properties);
        assert.deepEqual(w.t.scheduled.map((call) => call.name), ['sync/outboxWork:processOne']);
        assert.deepEqual(w.t.reads.unbounded(), []);
      });
    });

    it(`${c.name}: write-back off still saves and stamps, queues nothing, and says off`, async () => {
      await withWriteback(false, async () => {
        const w = world();
        const result = await w.run([c.change]);
        assert.deepEqual(result, { ok: true, wrote: true, notion: 'off', outboxIds: [] });
        for (const [field, value] of Object.entries(c.row)) assert.deepEqual(w.task()[field as keyof Doc<'tasks'>], value, field);
        assert.ok((w.task().fieldStamps as Record<string, unknown>)[c.stamp]);
        assert.equal(w.outbox().length, 0);
        assert.equal(w.task().stagePendingAt, undefined, 'no pending stage when nothing is queued');
      });
    });
  }
});

describe('task change: portal-owned and archived tasks', () => {
  for (const c of FIELD_CASES) {
    const refusal = c.name === 'status' ? PORTAL_TASK_STATUS : c.name === 'description' ? PORTAL_TASK_DETAIL : null;
    it(`${c.name} on a portal-owned task ${refusal ? 'is refused' : 'saves in the portal only'}`, async () => {
      await withWriteback(true, async () => {
        const w = world('portal');
        const before = snapshot(w.t);
        const result = await w.run([c.change]);
        if (refusal) {
          assert.deepEqual(result, { ok: false, code: 'refused', error: refusal });
          assert.equal(snapshot(w.t), before);
          return;
        }
        assert.deepEqual(result, { ok: true, wrote: true, notion: 'portal', outboxIds: [] });
        for (const [field, value] of Object.entries(c.row)) assert.deepEqual(w.task()[field as keyof Doc<'tasks'>], value, field);
        assert.equal(w.outbox().length, 0);
      });
    });

    it(`${c.name} on an archived task is refused and writes nothing`, async () => {
      await withWriteback(true, async () => {
        const w = world('archived');
        const before = snapshot(w.t);
        assert.deepEqual(await w.run([c.change]), { ok: false, code: 'refused', error: RESTORE_FIRST });
        assert.equal(snapshot(w.t), before);
      });
    });
  }

  it('lets closeout set the status of an archived or portal-owned task', async () => {
    await withWriteback(true, async () => {
      const archived = world('archived');
      const done = await archived.run([{ field: 'status', status: 'Done' }], { actor: 'closeout' });
      assert.equal(done.ok && done.notion, 'queued');
      const portal = world('portal');
      const parked = await portal.run([{ field: 'status', status: 'Done' }], { actor: 'closeout' });
      assert.deepEqual(parked, { ok: true, wrote: true, notion: 'portal', outboxIds: [] });
    });
  });
});

describe('task change: checked whole', () => {
  it('refuses a stale last edit time and writes nothing', async () => {
    await withWriteback(true, async () => {
      const w = world();
      const before = snapshot(w.t);
      const result = await w.run([{ field: 'priority', priority: 'High' }], { expectedLastEditedTime: '2026-11-19T00:00:00.000Z' });
      assert.deepEqual(result, { ok: false, code: 'stale', error: TASK_CHANGED_IN_NOTION });
      assert.equal(snapshot(w.t), before);
    });
  });

  it('writes no field when one change in the list is invalid', async () => {
    await withWriteback(true, async () => {
      const w = world();
      const before = snapshot(w.t);
      const result = await w.run([
        { field: 'priority', priority: 'High' },
        { field: 'date', date: '2026-02-30' },
      ]);
      assert.deepEqual(result, { ok: false, code: 'invalid', error: USE_CALENDAR_DAY });
      assert.equal(snapshot(w.t), before);
    });
  });

  it('writes nothing when every field already holds the value', async () => {
    await withWriteback(true, async () => {
      const w = world();
      const before = snapshot(w.t);
      const result = await w.run([{ field: 'priority', priority: 'Low' }, { field: 'stage', stage: 'Building' }]);
      assert.deepEqual(result, { ok: true, wrote: false, notion: 'portal', outboxIds: [] });
      assert.equal(snapshot(w.t), before);
    });
  });

  it('puts every live field into one task-fields row', async () => {
    await withWriteback(true, async () => {
      const w = world();
      const result = await w.run([
        { field: 'priority', priority: 'High' },
        { field: 'nextAction', nextAction: 'Ship it' },
        { field: 'date', date: null },
      ]);
      assert.equal(result.ok && result.outboxIds.length, 1, 'date was already empty, so only task-fields is queued');
      assert.deepEqual(JSON.parse(String(w.outbox()[0].payload)).properties, { Priority: 'High', 'Next Action': 'Ship it' });
    });
  });

  it('refuses a change whose earlier write under the same key died, and writes nothing', async () => {
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
      const before = snapshot(w.t);
      assert.deepEqual(await w.run([{ field: 'status', status: 'Done' }]), { ok: false, code: 'conflict', error: EARLIER_WRITE_FAILED });
      assert.equal(snapshot(w.t), before);
    });
  });

  it('reuses a row still queued under the same key instead of writing a second', async () => {
    await withWriteback(true, async () => {
      const w = world();
      const queuedId = w.t.seed('notionOutbox', {
        idempotencyKey: `task-status:page-1:Done:${TIME}`,
        kind: 'task-status',
        orgId: w.orgId,
        database: 'tasks',
        notionPageId: 'page-1',
        payload: '{"properties":{"Status":"Done"}}',
        actor: 'staff',
        status: 'queued',
        attempts: 0,
        nextAttemptAt: 0,
        createdAt: 0,
      });
      const result = await w.run([{ field: 'status', status: 'Done' }]);
      assert.deepEqual(result.ok && result.outboxIds, [queuedId]);
      assert.equal(w.outbox().length, 1);
      assert.deepEqual(w.t.scheduled, []);
    });
  });
});

describe('task change: stage', () => {
  it('marks the move pending with its base time, link and actor', async () => {
    await withWriteback(true, async () => {
      const w = world();
      await w.run([{ field: 'stage', stage: 'Shipped', pullRequestLink: PR, verifiedMerge: true }]);
      const task = w.task();
      assert.deepEqual(
        [task.stagePendingAt, task.stagePendingBaseEditedTime, task.stageSynced, task.stagePendingPullRequest, task.stagePendingBy],
        [AT, TIME, 'Building', PR, 'contacts:staff'],
      );
    });
  });

  it('a second move keeps the first pending time and replaces the unsent row', async () => {
    await withWriteback(true, async () => {
      const w = world();
      await w.run([{ field: 'stage', stage: 'Planning' }]);
      await w.run([{ field: 'stage', stage: 'Idea' }], { at: AT + 5 });
      assert.equal(w.task().stagePendingAt, AT);
      assert.equal(w.task().stageSynced, 'Building');
      assert.deepEqual(w.outbox().map((row) => JSON.parse(String(row.payload)).properties.Stage), ['Idea']);
    });
  });

  it('moving back to the stage Notion has drops the pending move and the unsent row', async () => {
    await withWriteback(true, async () => {
      const w = world();
      await w.run([{ field: 'stage', stage: 'Planning' }]);
      const back = await w.run([{ field: 'stage', stage: 'Building' }]);
      assert.deepEqual(back, { ok: true, wrote: true, notion: 'portal', outboxIds: [] });
      assert.equal(w.task().stage, 'Building');
      assert.equal(w.task().stagePendingAt, undefined);
      assert.equal(w.task().stagePendingBy, undefined);
      assert.equal(w.outbox().length, 0);
    });
  });

  it('refuses Shipped without a verified merge, and takes it with one', async () => {
    await withWriteback(true, async () => {
      const w = world();
      const refused = await w.run([{ field: 'stage', stage: 'Shipped', pullRequestLink: PR }]);
      assert.equal(refused.ok, false);
      assert.equal(w.outbox().length, 0);
      const shipped = await w.run([{ field: 'stage', stage: 'Shipped', pullRequestLink: PR, verifiedMerge: true }]);
      assert.equal(shipped.ok && shipped.notion, 'queued');
      assert.deepEqual(JSON.parse(String(w.outbox()[0].payload)).properties, { Stage: 'Shipped', 'GitHub Issue/PR': PR });
    });
  });

  it('refuses leaving Shipped', async () => {
    await withWriteback(true, async () => {
      const w = world('notion', { stage: 'Shipped', stageSynced: 'Shipped' });
      const result = await w.run([{ field: 'stage', stage: 'Building' }]);
      assert.equal(result.ok ? 'ok' : result.code, 'refused');
    });
  });
});

describe('task change: assignee', () => {
  it('sets a staff contact on the same client, in the portal only', async () => {
    await withWriteback(true, async () => {
      const w = world();
      const contactId = seedContact(w.t, w.orgId, { role: 'Warehaus Staff', name: 'Maya Chen' }) as Id<'contacts'>;
      const result = await w.run([{ field: 'assignee', assigneeContactId: contactId }]);
      assert.deepEqual(result, { ok: true, wrote: true, notion: 'portal', outboxIds: [], assigneeName: 'Maya Chen' });
      assert.equal(w.task().assigneeContactId, contactId);
      assert.ok(w.task().fieldStamps?.assignee);
    });
  });

  it('refuses a contact who is not staff on this client', async () => {
    await withWriteback(true, async () => {
      const w = world();
      const other = seedOrg(w.t);
      const contactId = seedContact(w.t, other, { role: 'Warehaus Staff' }) as Id<'contacts'>;
      const before = snapshot(w.t);
      assert.deepEqual(await w.run([{ field: 'assignee', assigneeContactId: contactId }]), { ok: false, code: 'invalid', error: CHOOSE_ASSIGNEE });
      assert.equal(snapshot(w.t), before);
    });
  });
});
