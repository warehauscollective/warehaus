import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import schema from '../schema';
import { enqueueArchive } from '../sync/taskWrite';
import { addLink, archiveTask, moveProject, setAssignee, setDueDate } from '../tasks';
import { PortalAuthError } from './identity';
import { memoryCtx, type CallOptions, type MemoryCtx, type Respond } from './memoryCtx.testkit';
import { seedContact, seedOrg, seedProject, seedTask } from './seedRows.testkit';

type Result = Record<string, unknown> & { ok: boolean; error?: string };

/** The Notion outbox answers every enqueue as queued. */
const queued: Respond = () => ({ ok: true, outboxId: 'notionOutbox:1', duplicate: false });
const staff: CallOptions = { as: 'staff', respond: queued };

/** Every row of every table, to prove a call wrote nothing. */
const everything = (t: MemoryCtx) => Object.keys((schema as unknown as { tables: Record<string, unknown> }).tables).map((table) => t.rows(table));

/** Fields that differ between two copies of a row. */
function changedKeys(before: Record<string, unknown> | null, after: Record<string, unknown> | null): string[] {
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  return [...keys].filter((key) => JSON.stringify(before?.[key]) !== JSON.stringify(after?.[key])).sort();
}

/** Northwind with one project and one Notion task assigned to Alex Bauer. The staff contact is seeded first. */
function world(task: Record<string, unknown> = {}) {
  const t = memoryCtx();
  t.actor('staff');
  const orgId = seedOrg(t, { slug: 'northwind', companyName: 'Northwind' });
  const projectId = seedProject(t, orgId, { name: 'Site' });
  const taskId = seedTask(t, orgId, projectId, {
    notionPageId: 'notion-task-1',
    lastEditedTime: '2026-10-20T00:00:00.000Z',
    name: 'Build the project page',
    assigneeName: 'Alex Bauer',
    ...task,
  });
  return { t, orgId, projectId, taskId };
}

describe('task field mutations', () => {
  it('rejects a client on every new staff mutation', async () => {
    const { t, orgId, taskId } = world();
    t.actor('client');
    const staffId = t.rows('contacts').find((row) => row.authUserId === 'auth-staff')?._id;
    const brand = seedProject(t, orgId, { name: 'Brand' });
    const before = everything(t);
    for (const [fn, args] of [
      [setAssignee, { taskId, assigneeContactId: staffId }],
      [setDueDate, { taskId, date: '2026-11-02' }],
      [moveProject, { taskId, projectId: brand }],
      [addLink, { taskId, kind: 'PR', url: 'https://example.com/pr/1' }],
      [archiveTask, { taskId }],
    ] as const) {
      await assert.rejects(t.call(fn, args, { as: 'client', respond: queued }), (err: unknown) => {
        assert.ok(err instanceof PortalAuthError);
        assert.equal(err.code, 'FORBIDDEN');
        assert.equal(err.message, 'Staff role required');
        return true;
      });
    }
    assert.equal(t.runs.length, 0);
    assert.deepEqual(everything(t), before);
  });

  it('rejects an assignee and a project from another org, and never writes Owner / DRI', async () => {
    const { t, orgId, taskId } = world();
    const otherOrg = seedOrg(t, { slug: 'other' });
    const otherStaff = seedContact(t, otherOrg, { name: 'Other Staff', role: 'Warehaus Staff' });
    const otherProject = seedProject(t, otherOrg, { name: 'Other brand' });
    const before = everything(t);
    const assignee = await t.call<Result>(setAssignee, { taskId, assigneeContactId: otherStaff }, staff);
    assert.deepEqual(assignee, { ok: false, code: 'invalid', error: 'Choose someone on this client' });
    const project = await t.call<Result>(moveProject, { taskId, projectId: otherProject }, staff);
    assert.deepEqual(project, { ok: false, error: 'Choose a project on this client' });
    assert.deepEqual(everything(t), before);
    assert.equal(t.runs.length, 0);

    const maya = seedContact(t, orgId, { name: 'Maya Chen', role: 'Warehaus Staff' });
    const taskBefore = t.row(taskId);
    const saved = await t.call<Result>(setAssignee, { taskId, assigneeContactId: maya }, staff);
    assert.equal(saved.ok, true);
    const taskAfter = t.row(taskId);
    assert.deepEqual(changedKeys(taskBefore, taskAfter), ['assigneeContactId', 'assigneeName', 'fieldStamps', 'updatedAt']);
    assert.equal(taskAfter?.assigneeContactId, maya);
    assert.equal(taskAfter?.assigneeName, 'Maya Chen');
    assert.equal(JSON.stringify(taskAfter).includes('Owner / DRI'), false);
    assert.equal(t.runs.length, 0);
  });

  it('soft-hides the task and its direct sub-tasks, capped at 50, with no hard delete', async () => {
    const { t, orgId, projectId, taskId } = world();
    const otherOrg = seedOrg(t, { slug: 'other' });
    const otherProject = seedProject(t, otherOrg);
    const children = Array.from({ length: 51 }, (_, index) => {
      const fields: Record<string, unknown> = { parentTaskId: taskId, name: `Child ${index + 1}` };
      if (index === 2) fields.archivedAt = 1;
      if (index === 3) return seedTask(t, otherOrg, otherProject, fields);
      return seedTask(t, orgId, projectId, fields);
    });
    const grandchild = seedTask(t, orgId, projectId, { parentTaskId: children[0], name: 'Grandchild' });
    const before = new Map(t.rows('tasks').map((row) => [row._id, row]));

    const result = await t.call<Result>(archiveTask, { taskId }, staff);
    assert.equal(result.ok, true);

    const childReads = t.reads.all.filter((read) => read.table === 'tasks' && read.index === 'by_parentTaskId');
    assert.deepEqual(
      childReads.map((read) => read.terminal),
      ['take'],
    );
    assert.deepEqual(t.reads.unbounded(), []);
    assert.deepEqual(t.reads.unindexed(), []);

    const after = t.rows('tasks');
    assert.equal(after.length, before.size, 'no task was hard deleted');
    const patched = new Set(after.filter((row) => changedKeys(before.get(row._id) ?? null, row).length > 0).map((row) => row._id));
    assert.equal(patched.has(taskId), true);
    assert.equal(patched.has(children[49]!), true);
    assert.equal(patched.has(children[50]!), false);
    assert.equal(patched.has(children[2]!), false);
    assert.equal(patched.has(children[3]!), false);
    assert.equal(patched.has(grandchild), false);
    for (const id of patched) {
      const row = after.find((candidate) => candidate._id === id);
      assert.equal(typeof row?.archivedAt, 'number');
      assert.deepEqual(changedKeys(before.get(id) ?? null, row ?? null), ['archivedAt']);
    }
    assert.equal(t.runs.length, 1);
    assert.equal(t.runs[0]?.name, 'sync/taskWrite:enqueueArchive');
  });

  it('archives the Notion page only when write-back is on', async () => {
    const previous = process.env.NOTION_WRITEBACK_ENABLED;
    const { t, taskId } = world();
    try {
      delete process.env.NOTION_WRITEBACK_ENABLED;
      const off = await t.call<Result>(enqueueArchive, { taskId, actorId: 'contact-staff' }, { respond: queued });
      assert.equal(off.ok, false);
      assert.equal(t.runs.length, 0);

      process.env.NOTION_WRITEBACK_ENABLED = 'true';
      const on = await t.call<Result>(enqueueArchive, { taskId, actorId: 'contact-staff' }, { respond: queued });
      assert.equal(on.ok, true);
      assert.equal(t.runs.length, 1);
      assert.equal(t.runs[0]?.name, 'sync/outbox:enqueue');
      assert.equal(t.runs[0]?.args.kind, 'task-archive');
      assert.equal(t.runs[0]?.args.notionPageId, 'notion-task-1');
    } finally {
      if (previous === undefined) delete process.env.NOTION_WRITEBACK_ENABLED;
      else process.env.NOTION_WRITEBACK_ENABLED = previous;
    }
  });

  it('rejects a date that is not a calendar day', async () => {
    const { t, taskId } = world({ date: '2026-10-20' });
    const before = t.row(taskId);
    const bad = await t.call<Result>(setDueDate, { taskId, date: '2026-02-31' }, staff);
    assert.deepEqual(bad, { ok: false, code: 'invalid', error: 'Use a calendar day' });
    assert.deepEqual(t.row(taskId), before);
    const month = await t.call<Result>(setDueDate, { taskId, date: '2026-13-01' }, staff);
    assert.equal(month.ok, false);
    assert.deepEqual(t.row(taskId), before);
    const saved = await t.call<Result>(setDueDate, { taskId, date: '2026-11-02' }, staff);
    assert.equal(saved.ok, true);
    assert.equal(t.row(taskId)?.date, '2026-11-02');
  });

  it('refuses a 51st source and does not insert', async () => {
    const { t, orgId, taskId } = world();
    for (let index = 1; index <= 50; index += 1) {
      t.seed('taskLinks', {
        orgId,
        taskId,
        kind: 'PR',
        url: `https://example.com/${index}`,
        addedBy: 'staff',
        createdAt: index,
      });
    }
    const before = t.rows('taskLinks');
    const result = await t.call<Result>(addLink, { taskId, kind: 'PR', url: 'https://example.com/new' }, staff);
    assert.deepEqual(result, { ok: false, error: 'This task already has 50 sources' });
    assert.deepEqual(t.rows('taskLinks'), before);
  });
});
