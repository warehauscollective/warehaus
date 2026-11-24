import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import schema from '../schema';
import { advance, archive, listArchivedForProject, listForProject, markComplete, restore, setStatus, taskChoices, undoCloseout } from '../milestones';
import { archiveTask, listForStaff, markDone, restoreTask, undoTaskChange } from '../tasks';
import {
  LEFTOVERS_NEEDED,
  MILESTONE_ARCHIVED,
  PARKED_MILESTONE_NAME,
  SHIPPED_NOTHING_OPEN,
  closeoutMenuItems,
  listedTaskCount,
  milestoneCloseoutState,
  parkedMilestoneTarget,
  planArchiveMilestone,
  planMarkComplete,
  shippedLockedReason,
  shippedOpenTag,
  taskCloseoutState,
} from './closeout';
import { PortalAuthError } from './identity';
import { memoryCtx, type CallOptions, type MemoryCtx, type Respond } from './memoryCtx.testkit';
import type { TaskSetRow } from './milestoneTaskSet';
import { seedMilestone, seedOrg, seedProject, seedTask } from './seedRows.testkit';

type Result = Record<string, unknown> & { ok?: boolean };
type Fields = Record<string, unknown>;

/** The Notion outbox answers every enqueue as queued. */
const outbox: Respond = () => ({ ok: true, outboxId: 'notionOutbox:1', duplicate: false });
const staff: CallOptions = { as: 'staff', respond: outbox };

/**
 * A client org with one project, on a fresh in-memory ctx. Rows are named in
 * the test (`m1`, `a`) and `ids` maps each name to the id the ctx gave it.
 * Task fields `milestone` and `parent` take names. A task joins `m1` unless
 * `milestone` says otherwise (null for none).
 */
function world() {
  const t = memoryCtx();
  // Seed the staff contact first, so a before/after compare sees only the handler's writes.
  t.actor('staff');
  const orgId = seedOrg(t, { slug: 'northwind', companyName: 'Northwind' });
  const projectId = seedProject(t, orgId, { name: 'Site' });
  const ids: Record<string, string> = {};
  const id = (name: string) => {
    const found = ids[name];
    if (!found) throw new Error(`No row named "${name}"`);
    return found;
  };
  const w = {
    t,
    orgId,
    projectId,
    ids,
    id,
    name: (rowId: unknown) => Object.keys(ids).find((key) => ids[key] === rowId) ?? rowId,
    row: (name: string) => t.row(id(name)),
    call: (fn: unknown, args: Fields, options: CallOptions = staff) => t.call<Result>(fn, args, options),
    milestone(name: string, fields: Fields = {}) {
      ids[name] = seedMilestone(t, orgId, (fields.projectId as string | undefined) ?? projectId, { name: `Milestone ${name}`, ...fields });
      return ids[name];
    },
    task(name: string, fields: Fields & { milestone?: string | null; parent?: string } = {}) {
      const { milestone = 'm1', parent, ...rest } = fields;
      ids[name] = seedTask(t, (rest.orgId as string | undefined) ?? orgId, projectId, {
        notionPageId: `portal-milestone:${name}`,
        externalId: name,
        source: 'portal-milestone',
        name: `Task ${name}`,
        stage: 'Building',
        ...(milestone ? { milestoneId: id(milestone) } : {}),
        ...(parent ? { parentTaskId: id(parent) } : {}),
        ...rest,
      });
      return ids[name];
    },
  };
  return w;
}

type World = ReturnType<typeof world>;

/** Every row of every table, to prove a call wrote nothing. */
const everything = (t: MemoryCtx) => Object.keys((schema as unknown as { tables: Record<string, unknown> }).tables).map((table) => t.rows(table));

const staffContactId = (t: MemoryCtx) => t.rows('contacts').find((row) => row.authUserId === 'auth-staff')?._id;

const source = (id: string, fields: Partial<TaskSetRow> = {}): TaskSetRow => ({
  id,
  parentTaskId: null,
  milestoneId: 'm1',
  stage: 'Building',
  status: 'To Do',
  isDone: false,
  archived: false,
  ...fields,
});

async function withWritebackOn<T>(body: () => Promise<T>): Promise<T> {
  const previous = process.env.NOTION_WRITEBACK_ENABLED;
  process.env.NOTION_WRITEBACK_ENABLED = 'true';
  try {
    return await body();
  } finally {
    if (previous === undefined) delete process.env.NOTION_WRITEBACK_ENABLED;
    else process.env.NOTION_WRITEBACK_ENABLED = previous;
  }
}

describe('close-out rules', () => {
  it('counts every listed task, archived ones left out', () => {
    const rows = [
      { status: 'To Do', isDone: false, children: [{ status: 'In Progress', isDone: false }, { status: 'Done', isDone: true }] },
      { status: 'Done', isDone: true, children: [{ status: 'To Do', isDone: false, archived: true }] },
    ];
    assert.equal(listedTaskCount(rows), 4);
  });

  it('writes the locked Shipped copy with the open count', () => {
    assert.equal(shippedOpenTag(3), '3 OPEN');
    assert.equal(shippedLockedReason(3), '3 open tasks. Use Mark complete to close them out.');
    assert.equal(shippedLockedReason(1), '1 open task. Use Mark complete to close them out.');
    assert.equal(shippedLockedReason(0), SHIPPED_NOTHING_OPEN);
  });

  it('shows Restore alone on a completed or archived item', () => {
    assert.deepEqual(closeoutMenuItems('open'), ['complete', 'archive']);
    assert.deepEqual(closeoutMenuItems('complete'), ['restore']);
    assert.deepEqual(closeoutMenuItems('archived'), ['restore']);
    assert.equal(milestoneCloseoutState({ status: 'Shipped' }), 'complete');
    assert.equal(milestoneCloseoutState({ status: 'Shipped', archived: true }), 'archived');
    assert.equal(milestoneCloseoutState({ status: 'Building' }), 'open');
    assert.equal(taskCloseoutState({ status: 'Done', isDone: true }), 'complete');
    assert.equal(taskCloseoutState({ status: 'To Do', isDone: false, archived: true }), 'archived');
    assert.equal(taskCloseoutState({ status: 'To Do', isDone: false }), 'open');
  });

  it('finds the Parked for later milestone by its exact name', () => {
    const rows = [
      { id: 'm1', name: PARKED_MILESTONE_NAME, status: 'Idea' },
      { id: 'm2', name: 'parked for later', status: 'Idea' },
      { id: 'm3', name: PARKED_MILESTONE_NAME, status: 'Idea', archived: true },
      { id: 'm4', name: PARKED_MILESTONE_NAME, status: 'Shipped' },
      { id: 'm5', name: PARKED_MILESTONE_NAME, status: 'Parked' },
    ];
    assert.equal(parkedMilestoneTarget(rows, 'm9')?.id, 'm1');
    // The milestone being closed is never its own target.
    assert.equal(parkedMilestoneTarget(rows, 'm1')?.id, 'm5');
    assert.equal(parkedMilestoneTarget(rows.slice(1, 4), 'm9'), null);
  });

  it('needs no choice when nothing is open, and one when something is', () => {
    assert.deepEqual(planMarkComplete({ milestoneId: 'm1', tasks: [], parkedMilestoneId: null }), {
      ok: true,
      open: 0,
      outcome: null,
      writes: [],
    });
    const closed = [source('a', { status: 'Done', isDone: true }), source('b', { stage: 'Parked' })];
    assert.equal(planMarkComplete({ milestoneId: 'm1', tasks: closed, parkedMilestoneId: null }).ok, true);
    assert.deepEqual(planMarkComplete({ milestoneId: 'm1', tasks: [source('a')], parkedMilestoneId: null }), {
      ok: false,
      reason: LEFTOVERS_NEEDED,
      open: 1,
    });
  });

  it('moves a subtask with its parent, and an open subtask of a Done parent on its own', () => {
    const tasks = [
      source('parent'),
      source('linked-child', { parentTaskId: 'parent' }),
      source('loose-child', { parentTaskId: 'parent', milestoneId: null }),
      source('done-parent', { status: 'Done', isDone: true }),
      source('open-child', { parentTaskId: 'done-parent' }),
      source('elsewhere', { parentTaskId: 'parent', milestoneId: 'm2' }),
    ];
    const plan = planMarkComplete({ milestoneId: 'm1', tasks, leftovers: 'park', parkedMilestoneId: 'parked' });
    assert.equal(plan.ok, true);
    if (!plan.ok) return;
    assert.equal(plan.outcome, 'moved');
    assert.equal(plan.open, 4);
    assert.deepEqual(
      plan.writes.map((write) => write.id).sort(),
      ['linked-child', 'open-child', 'parent'],
    );
    assert.ok(plan.writes.every((write) => write.kind === 'move' && write.milestoneId === 'parked'));
  });

  it('detaches only tasks linked to the milestone when it is archived', () => {
    const tasks = [source('parent'), source('loose-child', { parentTaskId: 'parent', milestoneId: null })];
    const plan = planArchiveMilestone({ milestoneId: 'm1', tasks, openTasks: 'detach' });
    assert.equal(plan.open, 2);
    assert.deepEqual(plan.writes, [{ id: 'parent', kind: 'detach' }]);
  });
});

const refusedWith = (message: string) => (err: unknown) => {
  assert.ok(err instanceof PortalAuthError);
  assert.equal(err.message, message);
  return true;
};

describe('milestones.markComplete', () => {
  it('completes a milestone with no tasks and asks nothing', async () => {
    const w = world();
    w.milestone('m1');
    const result = await w.call(markComplete, { milestoneId: w.id('m1'), expectedStatus: 'Building' });
    assert.equal(result.wrote, true);
    assert.equal(result.status, 'Shipped');
    assert.equal(result.previous, 'Building');
    assert.equal(result.leftovers, null);
    assert.deepEqual(result.tasks, []);
    assert.equal(w.row('m1')?.status, 'Shipped');
    assert.equal(w.t.rows('activity').length, 1);
  });

  it('completes a milestone whose tasks are all Done or Parked without a choice', async () => {
    const w = world();
    w.milestone('m1');
    w.task('a', { status: 'Done', isDone: true });
    w.task('b', { stage: 'Parked' });
    const before = w.t.rows('tasks');
    const result = await w.call(markComplete, { milestoneId: w.id('m1'), expectedStatus: 'Building' });
    assert.equal(result.status, 'Shipped');
    assert.deepEqual(result.tasks, []);
    assert.deepEqual(w.t.rows('tasks'), before);
  });

  it('refuses open tasks without a leftovers choice and writes nothing', async () => {
    const w = world();
    w.milestone('m1');
    w.task('a');
    const before = everything(w.t);
    await assert.rejects(w.call(markComplete, { milestoneId: w.id('m1'), expectedStatus: 'Building' }), refusedWith(LEFTOVERS_NEEDED));
    assert.deepEqual(everything(w.t), before);
    assert.equal(w.row('m1')?.status, 'Building');
  });

  it('rejects a stale status before any task is written', async () => {
    const w = world();
    w.milestone('m1');
    w.task('a');
    const before = everything(w.t);
    await assert.rejects(
      w.call(markComplete, { milestoneId: w.id('m1'), expectedStatus: 'Planning', leftovers: 'done' }),
      /The status changed/,
    );
    assert.deepEqual(everything(w.t), before);
  });

  it('done: sets every open task Done, subtasks included, and leaves closed ones alone', async () => {
    const w = world();
    w.milestone('m1');
    w.task('a');
    w.task('a-child', { parent: 'a', milestone: null, status: 'In Progress' });
    w.task('b', { status: 'Done', isDone: true });
    w.task('c', { stage: 'Parked' });
    w.task('gone', { archivedAt: 5 });
    const result = await w.call(markComplete, { milestoneId: w.id('m1'), expectedStatus: 'Building', leftovers: 'done' });
    assert.equal(result.leftovers, 'done');
    assert.equal(w.row('m1')?.status, 'Shipped');
    for (const name of ['a', 'a-child']) {
      assert.equal(w.row(name)?.status, 'Done');
      assert.equal(w.row(name)?.isDone, true);
    }
    assert.equal(w.row('c')?.status, 'To Do');
    assert.equal(w.row('gone')?.status, 'To Do');
    const previous = result.tasks as Array<{ taskId: string; status: string; isDone: boolean }>;
    assert.deepEqual(previous.map((row) => [w.name(row.taskId), row.status, row.isDone]), [
      ['a', 'To Do', false],
      ['a-child', 'In Progress', false],
    ]);
    // Portal-owned tasks have no Notion page, so nothing is queued.
    assert.equal(w.t.runs.length, 0);
  });

  it('done: sends the status of a Notion task through the outbox', async () => {
    const w = world();
    w.milestone('m1');
    w.task('a', { notionPageId: 'notion-a', source: undefined, lastEditedTime: '2026-11-20T00:00:00.000Z' });
    await withWritebackOn(() => w.call(markComplete, { milestoneId: w.id('m1'), expectedStatus: 'Building', leftovers: 'done' }));
    const rows = w.t.rows('notionOutbox');
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.kind, 'task-status');
    assert.equal(rows[0]?.notionPageId, 'notion-a');
    assert.deepEqual(JSON.parse(String(rows[0]?.payload)).properties, { Status: 'Done' });
    assert.equal(rows[0]?.expectedLastEditedTime, '2026-11-20T00:00:00.000Z');
    assert.equal((w.row('a')?.fieldStamps as Record<string, { updatedBy: string }>).status?.updatedBy, staffContactId(w.t));
  });

  it('archive: archives open tasks with their subtasks, as tasks.archiveTask does', async () => {
    const w = world();
    w.milestone('m1');
    w.task('a', { notionPageId: 'notion-a', source: undefined });
    w.task('a-done-child', { parent: 'a', milestone: null, status: 'Done', isDone: true });
    w.task('b', { status: 'Done', isDone: true });
    const result = await withWritebackOn(() =>
      w.call(markComplete, { milestoneId: w.id('m1'), expectedStatus: 'Building', leftovers: 'archive' }),
    );
    assert.equal(result.leftovers, 'archived');
    assert.equal(typeof w.row('a')?.archivedAt, 'number');
    assert.equal(w.row('a-done-child')?.archivedAt, w.row('a')?.archivedAt);
    assert.equal(w.row('b')?.archivedAt, undefined);
    assert.equal(w.row('a')?.status, 'To Do');
    // One Notion page archive for the task, none for its subtask: the same as archiveTask.
    assert.deepEqual(
      w.t.rows('notionOutbox').map((row) => [row.kind, row.notionPageId, row.actorId]),
      [['task-archive', 'notion-a', staffContactId(w.t)]],
    );
    assert.equal(w.row('m1')?.status, 'Shipped');
  });

  it('park: moves leftovers to the Parked for later milestone and keeps each status', async () => {
    const w = world();
    w.milestone('m1');
    w.milestone('parked', { name: PARKED_MILESTONE_NAME, status: 'Idea' });
    w.task('a', { status: 'In Progress', milestoneOrder: 0 });
    w.task('a-child', { parent: 'a', status: 'Blocked' });
    w.task('a-loose', { parent: 'a', milestone: null });
    w.task('b', { status: 'Done', isDone: true, milestoneOrder: 1 });
    w.task('already', { milestone: 'parked', milestoneOrder: 4 });
    const milestonesBefore = w.t.rows('milestones').length;
    const result = await w.call(markComplete, { milestoneId: w.id('m1'), expectedStatus: 'Building', leftovers: 'park' });
    assert.equal(result.leftovers, 'moved');
    assert.equal(w.row('a')?.milestoneId, w.id('parked'));
    assert.equal(w.row('a-child')?.milestoneId, w.id('parked'));
    assert.equal(w.row('a-loose')?.milestoneId, undefined);
    assert.equal(w.row('b')?.milestoneId, w.id('m1'));
    assert.equal(w.row('a')?.status, 'In Progress');
    assert.equal(w.row('a-child')?.status, 'Blocked');
    assert.equal(w.row('a')?.stage, 'Building');
    assert.equal(w.row('a')?.isDone, false);
    // After the task already parked there.
    assert.equal(w.row('a')?.milestoneOrder, 5);
    assert.equal(w.row('a-child')?.milestoneOrder, 6);
    assert.equal(w.row('m1')?.status, 'Shipped');
    assert.equal(w.t.rows('milestones').length, milestonesBefore);
    const previous = result.tasks as Array<{ taskId: string; milestoneId: string; milestoneOrder: number | null }>;
    assert.deepEqual(previous.map((row) => [w.name(row.taskId), w.name(row.milestoneId)]), [
      ['a', 'm1'],
      ['a-child', 'm1'],
    ]);
  });

  it('park: with no Parked for later milestone, sets leftovers Parked and never creates one', async () => {
    const w = world();
    w.milestone('m1');
    w.milestone('other', { name: 'Parked for Later' });
    w.task('a', { status: 'In Progress' });
    w.task('b', { status: 'Done', isDone: true });
    const result = await w.call(markComplete, { milestoneId: w.id('m1'), expectedStatus: 'Building', leftovers: 'park' });
    assert.equal(result.leftovers, 'parked');
    assert.equal(w.row('a')?.stage, 'Parked');
    assert.equal(w.row('a')?.status, 'In Progress');
    assert.equal(w.row('a')?.milestoneId, w.id('m1'));
    assert.equal(w.row('b')?.stage, 'Building');
    assert.equal(w.row('m1')?.status, 'Shipped');
    assert.equal(w.t.rows('milestones').length, 2);
  });

  it('does nothing to a milestone that is already Shipped, and refuses an archived one', async () => {
    const shipped = world();
    shipped.milestone('m1', { status: 'Shipped' });
    shipped.task('a');
    const before = everything(shipped.t);
    const again = await shipped.call(markComplete, { milestoneId: shipped.id('m1'), expectedStatus: 'Shipped', leftovers: 'done' });
    assert.equal(again.wrote, false);
    assert.deepEqual(everything(shipped.t), before);
    const archived = world();
    archived.milestone('m1', { archivedAt: 9 });
    await assert.rejects(
      archived.call(markComplete, { milestoneId: archived.id('m1'), expectedStatus: 'Building' }),
      refusedWith(MILESTONE_ARCHIVED),
    );
  });

  it('reads no whole table and no longer uses the close gate', () => {
    const portal = readFileSync(new URL('../milestones.ts', import.meta.url), 'utf8');
    const body = portal.slice(portal.indexOf('export const markComplete'), portal.indexOf('export const archive ='));
    assert.ok(body.length > 0);
    assert.doesNotMatch(body, /milestoneCloseGate/);
    assert.doesNotMatch(body, /\.collect\(/);
  });
});

describe('milestones.setStatus', () => {
  it('names the open count and points to Mark complete when Shipped is locked', async () => {
    const w = world();
    w.milestone('m1');
    for (const name of ['a', 'b', 'c']) w.task(name);
    w.task('d', { status: 'Done', isDone: true });
    w.task('e', { stage: 'Parked' });
    const before = everything(w.t);
    await assert.rejects(
      w.call(setStatus, { milestoneId: w.id('m1'), status: 'Shipped' }),
      refusedWith('3 open tasks. Use Mark complete to close them out.'),
    );
    assert.deepEqual(everything(w.t), before);
  });

  it('says one open task in the singular', async () => {
    const w = world();
    w.milestone('m1');
    w.task('a');
    await assert.rejects(
      w.call(setStatus, { milestoneId: w.id('m1'), status: 'Shipped' }),
      /1 open task\. Use Mark complete to close them out\./,
    );
  });

  it('still refuses an empty milestone and points to Mark complete', async () => {
    const w = world();
    w.milestone('m1');
    await assert.rejects(w.call(setStatus, { milestoneId: w.id('m1'), status: 'Shipped' }), refusedWith(SHIPPED_NOTHING_OPEN));
  });

  it('still sets Shipped when every task is Done', async () => {
    const w = world();
    w.milestone('m1');
    w.task('a', { status: 'Done', isDone: true });
    const result = await w.call(setStatus, { milestoneId: w.id('m1'), status: 'Shipped' });
    assert.equal(result.status, 'Shipped');
  });
});

describe('milestones.archive and restore', () => {
  it('archive: archives open tasks with the milestone, under one archive time', async () => {
    const w = world();
    w.milestone('m1', { planning: 'queued' });
    w.task('a');
    w.task('a-child', { parent: 'a', milestone: null });
    w.task('b', { status: 'Done', isDone: true });
    const result = await w.call(archive, { milestoneId: w.id('m1'), openTasks: 'archive' });
    assert.equal(result.wrote, true);
    const at = w.row('m1')?.archivedAt;
    assert.equal(typeof at, 'number');
    assert.equal(result.archivedAt, at);
    assert.equal(w.row('a')?.archivedAt, at);
    assert.equal(w.row('a-child')?.archivedAt, at);
    assert.equal(w.row('b')?.archivedAt, undefined);
    assert.equal(w.row('m1')?.status, 'Building');
    assert.equal(w.row('m1')?.planning, undefined);
    assert.equal((result.tasks as unknown[]).length, 2);
  });

  it('detach: moves open tasks to No milestone and archives none of them', async () => {
    const w = world();
    w.milestone('m1');
    w.task('a', { milestoneOrder: 2 });
    w.task('b', { status: 'Done', isDone: true });
    const result = await w.call(archive, { milestoneId: w.id('m1'), openTasks: 'detach' });
    assert.equal(w.row('a')?.milestoneId, undefined);
    assert.equal(w.row('a')?.milestoneOrder, undefined);
    assert.equal(w.row('a')?.archivedAt, undefined);
    assert.equal(w.row('b')?.milestoneId, w.id('m1'));
    assert.equal(typeof w.row('m1')?.archivedAt, 'number');
    assert.deepEqual(
      (result.tasks as Array<{ taskId: string; milestoneId: string; milestoneOrder: number }>).map((row) => [
        w.name(row.taskId),
        w.name(row.milestoneId),
        row.milestoneOrder,
      ]),
      [['a', 'm1', 2]],
    );
    assert.equal(w.t.runs.length, 0);
  });

  it('archiving twice writes once', async () => {
    const w = world();
    w.milestone('m1', { archivedAt: 7 });
    w.task('a');
    const before = everything(w.t);
    const result = await w.call(archive, { milestoneId: w.id('m1'), openTasks: 'archive' });
    assert.equal(result.wrote, false);
    assert.deepEqual(everything(w.t), before);
  });

  it('restore: brings back an archived milestone and only the tasks archived with it', async () => {
    const w = world();
    w.milestone('m1', { archivedAt: 7 });
    w.task('with', { archivedAt: 7 });
    w.task('earlier', { archivedAt: 3 });
    w.task('live');
    const result = await w.call(restore, { milestoneId: w.id('m1') });
    assert.equal(result.restored, 'archived');
    assert.equal(result.archivedAt, 7);
    assert.equal(w.row('m1')?.archivedAt, undefined);
    assert.equal(w.row('with')?.archivedAt, undefined);
    assert.equal(w.row('earlier')?.archivedAt, 3);
    assert.deepEqual((result.tasks as Array<{ taskId: string; archivedAt: number }>).map((row) => [w.name(row.taskId), row.archivedAt]), [
      ['with', 7],
    ]);
  });

  it('restore: reopens a completed milestone as Ready to Ship and leaves its tasks', async () => {
    const w = world();
    w.milestone('m1', { status: 'Shipped' });
    w.task('a', { status: 'Done', isDone: true });
    const result = await w.call(restore, { milestoneId: w.id('m1') });
    assert.equal(result.restored, 'completed');
    assert.equal(result.previous, 'Shipped');
    assert.equal(w.row('m1')?.status, 'Ready to Ship');
    assert.equal(w.row('a')?.status, 'Done');
  });

  it('restore: writes nothing on an open milestone', async () => {
    const w = world();
    w.milestone('m1');
    const before = everything(w.t);
    const result = await w.call(restore, { milestoneId: w.id('m1') });
    assert.equal(result.wrote, false);
    assert.deepEqual(everything(w.t), before);
  });
});

describe('milestones.undoCloseout', () => {
  it('undoes Mark complete: the status and every leftover go back', async () => {
    const w = world();
    w.milestone('m1');
    w.milestone('parked', { name: PARKED_MILESTONE_NAME, status: 'Idea' });
    w.task('a', { status: 'In Progress', milestoneOrder: 3 });
    w.task('b', { status: 'Done', isDone: true });
    const done = await w.call(markComplete, { milestoneId: w.id('m1'), expectedStatus: 'Building', leftovers: 'park' });
    assert.equal(w.row('a')?.milestoneId, w.id('parked'));
    const undone = await w.call(undoCloseout, { milestoneId: w.id('m1'), status: done.previous, tasks: done.tasks });
    assert.equal(undone.wrote, true);
    assert.equal(w.row('m1')?.status, 'Building');
    assert.equal(w.row('a')?.milestoneId, w.id('m1'));
    assert.equal(w.row('a')?.milestoneOrder, 3);
    assert.equal(w.row('a')?.status, 'In Progress');
  });

  it('undoes each leftovers choice', async () => {
    for (const leftovers of ['done', 'archive', 'park'] as const) {
      const w = world();
      w.milestone('m1');
      w.task('a', { status: 'Blocked' });
      const done = await w.call(markComplete, { milestoneId: w.id('m1'), expectedStatus: 'Building', leftovers });
      await w.call(undoCloseout, { milestoneId: w.id('m1'), status: done.previous, tasks: done.tasks });
      assert.equal(w.row('m1')?.status, 'Building', leftovers);
      assert.equal(w.row('a')?.status, 'Blocked', leftovers);
      assert.equal(w.row('a')?.isDone, false, leftovers);
      assert.equal(w.row('a')?.stage, 'Building', leftovers);
      assert.equal(w.row('a')?.archivedAt, undefined, leftovers);
      assert.equal(w.row('a')?.milestoneId, w.id('m1'), leftovers);
    }
  });

  it('undoes Archive and Restore', async () => {
    const w = world();
    w.milestone('m1');
    w.task('a', { milestoneOrder: 1 });
    const archived = await w.call(archive, { milestoneId: w.id('m1'), openTasks: 'detach' });
    await w.call(undoCloseout, { milestoneId: w.id('m1'), archivedAt: null, tasks: archived.tasks });
    assert.equal(w.row('m1')?.archivedAt, undefined);
    assert.equal(w.row('a')?.milestoneId, w.id('m1'));
    assert.equal(w.row('a')?.milestoneOrder, 1);

    const again = await w.call(archive, { milestoneId: w.id('m1'), openTasks: 'archive' });
    const at = again.archivedAt;
    const restored = await w.call(restore, { milestoneId: w.id('m1') });
    await w.call(undoCloseout, { milestoneId: w.id('m1'), archivedAt: restored.archivedAt, tasks: restored.tasks });
    assert.equal(w.row('m1')?.archivedAt, at);
    assert.equal(w.row('a')?.archivedAt, at);
  });

  it('undoes a Restore of a completed milestone back to Shipped', async () => {
    const w = world();
    w.milestone('m1', { status: 'Shipped' });
    const restored = await w.call(restore, { milestoneId: w.id('m1') });
    await w.call(undoCloseout, { milestoneId: w.id('m1'), status: restored.previous, tasks: [] });
    assert.equal(w.row('m1')?.status, 'Shipped');
  });

  it('skips a task from another org and a milestone on another project', async () => {
    const w = world();
    const otherProject = seedProject(w.t, w.orgId, { name: 'Other' });
    const otherOrg = seedOrg(w.t);
    w.milestone('m1');
    w.milestone('far', { projectId: otherProject });
    w.task('a', { milestone: null });
    w.task('alien', { orgId: otherOrg, status: 'Done', isDone: true });
    const snapshot = { status: 'To Do', isDone: false, stage: 'Building', milestoneOrder: null, archivedAt: null };
    const undone = await w.call(undoCloseout, {
      milestoneId: w.id('m1'),
      tasks: [
        { ...snapshot, taskId: w.id('a'), milestoneId: w.id('far') },
        { ...snapshot, taskId: w.id('alien'), milestoneId: null },
      ],
    });
    assert.equal(undone.wrote, false);
    assert.equal(w.row('a')?.milestoneId, undefined);
    assert.equal(w.row('alien')?.status, 'Done');
  });
});

describe('status change effects on the portal paths', () => {
  const openNotes = (w: World) =>
    w.t.rows('milestoneNotes').filter((note) => note.needsPeter === 'open' && note.reason === 'approval');

  it('play into Ready to Ship writes the approval note, the preview link and a feed line', async () => {
    const w = world();
    w.milestone('m1');
    w.task('a', { status: 'Done', isDone: true });
    const result = await w.call(advance, { milestoneId: w.id('m1'), expectedStatus: 'Building' });
    assert.equal(result.status, 'Ready to Ship');
    assert.equal(openNotes(w).length, 1);
    assert.equal(openNotes(w)[0]?.addedBy, 'Maya Chen');
    assert.doesNotMatch(String(openNotes(w)[0]?.body), /Heads up/);
    assert.ok(w.row('m1')?.localPreviewUrl);
    const feed = w.t.rows('agentEvents').filter((event) => event.type === 'ready');
    assert.deepEqual(feed.map((event) => event.summary), ['Moved to Ready to Ship by Maya Chen']);
  });

  it('names the open tasks in the note when staff move it early', async () => {
    const w = world();
    w.milestone('m1');
    w.task('a');
    w.task('b');
    await w.call(setStatus, { milestoneId: w.id('m1'), status: 'Ready to Ship' });
    assert.match(String(openNotes(w)[0]?.body), /Heads up: 2 tasks are still open\./);
  });

  it('leaving Ready to Ship closes the approval note', async () => {
    const w = world();
    w.milestone('m1');
    w.task('a');
    await w.call(advance, { milestoneId: w.id('m1'), expectedStatus: 'Building' });
    assert.equal(openNotes(w).length, 1);
    await w.call(setStatus, { milestoneId: w.id('m1'), status: 'Building', expectedStatus: 'Ready to Ship' });
    assert.equal(openNotes(w).length, 0);
  });

  it('Restore from Shipped reopens without a note or a feed line', async () => {
    const w = world();
    w.milestone('m1', { status: 'Shipped' });
    w.task('a', { status: 'Done', isDone: true });
    await w.call(restore, { milestoneId: w.id('m1') });
    assert.equal(w.row('m1')?.status, 'Ready to Ship');
    assert.equal(w.t.rows('milestoneNotes').length, 0);
    assert.equal(w.t.rows('agentEvents').length, 0);
  });

  it('refuses an undo back to Shipped while a task is open', async () => {
    const w = world();
    w.milestone('m1', { status: 'Ready to Ship' });
    w.task('a');
    await assert.rejects(
      w.call(undoCloseout, { milestoneId: w.id('m1'), status: 'Shipped', tasks: [] }),
      refusedWith('1 open task. Use Mark complete to close them out.'),
    );
    assert.equal(w.row('m1')?.status, 'Ready to Ship');
  });

  it('Mark complete from Ready to Ship closes the approval note', async () => {
    const w = world();
    w.milestone('m1');
    w.task('a', { status: 'Done', isDone: true });
    await w.call(advance, { milestoneId: w.id('m1'), expectedStatus: 'Building' });
    await w.call(markComplete, { milestoneId: w.id('m1'), expectedStatus: 'Ready to Ship' });
    assert.equal(w.row('m1')?.status, 'Shipped');
    assert.equal(openNotes(w).length, 0);
  });
});

describe('task mark complete, archive and restore', () => {
  it('markDone sets Done once and returns the task as it was', async () => {
    const w = world();
    w.task('a', { milestone: null, status: 'In Progress' });
    const result = await w.call(markDone, { taskId: w.id('a') });
    assert.equal(result.wrote, true);
    assert.equal(w.row('a')?.status, 'Done');
    assert.equal(w.row('a')?.isDone, true);
    assert.deepEqual((result.previous as Array<{ status: string; isDone: boolean }>).map((row) => [row.status, row.isDone]), [
      ['In Progress', false],
    ]);
    const before = everything(w.t);
    const again = await w.call(markDone, { taskId: w.id('a') });
    assert.equal(again.wrote, false);
    assert.deepEqual(everything(w.t), before);
  });

  it('markDone refuses an archived task', async () => {
    const w = world();
    w.task('a', { milestone: null, archivedAt: 4 });
    assert.deepEqual(await w.call(markDone, { taskId: w.id('a') }), { ok: false, error: 'Task not found' });
  });

  it('archiveTask returns the task and its subtasks as they were', async () => {
    const w = world();
    w.task('a', { milestone: null });
    w.task('child', { milestone: null, parent: 'a' });
    const result = await w.call(archiveTask, { taskId: w.id('a') });
    assert.equal(result.wrote, true);
    assert.deepEqual(
      (result.previous as Array<{ taskId: string; archivedAt: number | null }>).map((row) => [w.name(row.taskId), row.archivedAt]),
      [
        ['a', null],
        ['child', null],
      ],
    );
  });

  it('restoreTask brings back an archived task with the subtasks archived with it', async () => {
    const w = world();
    w.task('a', { milestone: null, archivedAt: 8 });
    w.task('with', { milestone: null, parent: 'a', archivedAt: 8 });
    w.task('before', { milestone: null, parent: 'a', archivedAt: 2 });
    const result = await w.call(restoreTask, { taskId: w.id('a') });
    assert.equal(result.restored, 'archived');
    assert.equal(w.row('a')?.archivedAt, undefined);
    assert.equal(w.row('with')?.archivedAt, undefined);
    assert.equal(w.row('before')?.archivedAt, 2);
    // Restore does not write to Notion.
    assert.equal(w.t.runs.length, 0);
  });

  it('restoreTask reopens a Done task as To Do, and leaves an open one alone', async () => {
    const w = world();
    w.task('a', { milestone: null, status: 'Done', isDone: true });
    w.task('b', { milestone: null });
    const result = await w.call(restoreTask, { taskId: w.id('a') });
    assert.equal(result.restored, 'completed');
    assert.equal(w.row('a')?.status, 'To Do');
    assert.equal(w.row('a')?.isDone, false);
    const open = await w.call(restoreTask, { taskId: w.id('b') });
    assert.equal(open.wrote, false);
  });

  it('undoTaskChange is the inverse of each task write', async () => {
    const w = world();
    w.task('a', { milestone: null, status: 'Blocked' });
    w.task('child', { milestone: null, parent: 'a' });
    const done = await w.call(markDone, { taskId: w.id('a') });
    await w.call(undoTaskChange, { tasks: done.previous });
    assert.equal(w.row('a')?.status, 'Blocked');
    assert.equal(w.row('a')?.isDone, false);

    const archived = await w.call(archiveTask, { taskId: w.id('a') });
    await w.call(undoTaskChange, { tasks: archived.previous });
    assert.equal(w.row('a')?.archivedAt, undefined);
    assert.equal(w.row('child')?.archivedAt, undefined);

    await w.call(archiveTask, { taskId: w.id('a') });
    const at = w.row('a')?.archivedAt;
    const restored = await w.call(restoreTask, { taskId: w.id('a') });
    await w.call(undoTaskChange, { tasks: restored.previous });
    assert.equal(w.row('a')?.archivedAt, at);
    assert.equal(w.row('child')?.archivedAt, at);
  });
});

describe('archived items stay out of normal reads', () => {
  const seed = () => {
    const w = world();
    w.milestone('live');
    w.milestone('gone', { archivedAt: 7, name: 'Old launch' });
    w.task('a', { milestone: 'live' });
    w.task('a-archived', { milestone: 'live', archivedAt: 4 });
    w.task('b', { milestone: 'gone', archivedAt: 7 });
    w.task('b-child', { parent: 'b', milestone: null, archivedAt: 7 });
    w.task('c', { milestone: 'gone', status: 'Done', isDone: true });
    w.task('free', { milestone: null });
    w.task('free-archived', { milestone: null, archivedAt: 6 });
    return w;
  };

  it('the roadmap leaves out archived milestones and archived tasks', async () => {
    const w = seed();
    const views = (await w.call(listForProject, { projectId: w.projectId })) as unknown as Array<{
      id: string;
      rows: Array<{ id: string }>;
      attachableTasks: Array<{ id: string }>;
    }>;
    assert.deepEqual(views.map((view) => w.name(view.id)), ['live']);
    assert.deepEqual(views[0]?.rows.map((row) => w.name(row.id)), ['a']);
    // An archived task cannot be attached to a milestone either.
    assert.deepEqual(views[0]?.attachableTasks.map((row) => w.name(row.id)), ['free']);
  });

  it('a new task cannot choose an archived milestone', async () => {
    const w = seed();
    const choices = (await w.call(taskChoices, { projectId: w.projectId })) as unknown as Array<{ id: string }>;
    assert.deepEqual(choices.map((choice) => w.name(choice.id)), ['live']);
  });

  it('the staff task list leaves out archived tasks, so they are not counted as needing a milestone', async () => {
    const w = seed();
    const rows = (await w.call(listForStaff, {})) as unknown as Array<{ id: string; milestoneId: string | null }>;
    assert.deepEqual(rows.map((row) => w.name(row.id)).sort(), ['a', 'c', 'free']);
  });

  it('the Archived filter returns the archived milestones and tasks', async () => {
    const w = seed();
    const archived = (await w.call(listArchivedForProject, { projectId: w.projectId })) as unknown as {
      milestones: Array<{ id: string; archivedAt: number; rows: Array<{ id: string; children: Array<{ id: string }> }> }>;
      tasks: Array<{ id: string; milestoneId: string | null }>;
    };
    assert.deepEqual(archived.milestones.map((row) => [w.name(row.id), row.archivedAt]), [['gone', 7]]);
    // The card shows the tasks archived with the milestone, and its live ones.
    assert.deepEqual(archived.milestones[0]?.rows.map((row) => w.name(row.id)).sort(), ['b', 'c']);
    assert.deepEqual(
      archived.milestones[0]?.rows.find((row) => w.name(row.id) === 'b')?.children.map((row) => w.name(row.id)),
      ['b-child'],
    );
    assert.deepEqual(
      archived.tasks.map((row) => [w.name(row.id), row.milestoneId === null ? null : w.name(row.milestoneId)]),
      [
        ['b', 'gone'],
        ['b-child', 'gone'],
        ['free-archived', null],
        ['a-archived', 'live'],
      ],
    );
  });

  it('rejects a client on every close-out mutation', async () => {
    const w = world();
    w.milestone('m1');
    w.task('a');
    // Seed the client contact before the snapshot.
    w.t.actor('client');
    const before = everything(w.t);
    const asClient: CallOptions = { as: 'client', respond: outbox };
    for (const [fn, args] of [
      [markComplete, { milestoneId: w.id('m1'), expectedStatus: 'Building', leftovers: 'done' }],
      [archive, { milestoneId: w.id('m1'), openTasks: 'archive' }],
      [restore, { milestoneId: w.id('m1') }],
      [undoCloseout, { milestoneId: w.id('m1'), tasks: [] }],
      [listArchivedForProject, { projectId: w.projectId }],
      [markDone, { taskId: w.id('a') }],
      [restoreTask, { taskId: w.id('a') }],
      [undoTaskChange, { tasks: [] }],
    ] as const) {
      await assert.rejects(w.call(fn, args, asClient), refusedWith('Staff role required'));
    }
    assert.deepEqual(everything(w.t), before);
  });
});
