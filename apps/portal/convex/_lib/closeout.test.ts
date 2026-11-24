import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { archive, listArchivedForProject, listForProject, markComplete, restore, setStatus, taskChoices, undoCloseout } from '../milestones';
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
import type { TaskSetRow } from './milestoneTaskSet';

type Result = Record<string, unknown> & { ok?: boolean };
type Handler = (ctx: unknown, args: Record<string, unknown>) => Promise<Result>;

function run(fn: object, ctx: unknown, args: Record<string, unknown>) {
  return (fn as { _handler: Handler })._handler(ctx, args);
}

type Row = Record<string, unknown> & { _id: string };

const staffContact: Row = {
  _id: 'contact-staff',
  orgId: 'org-warehaus',
  name: 'Maya Chen',
  email: 'maya@warehaus.studio',
  authUserId: 'auth-staff',
  role: 'Warehaus Staff',
  portalAccess: 'Enabled',
};
const warehaus: Row = { _id: 'org-warehaus', slug: 'warehaus', portalAccess: 'Enabled' };
const project: Row = {
  _id: 'project-site',
  orgId: 'org-north',
  name: 'Site',
  type: [],
  publishToWarehaus: true,
  archive: false,
};

/** In-memory tables. Indexed reads match on the `eq` pairs, as the Convex index would. */
function memory(seed: Record<string, Row[]>) {
  const tables: Record<string, Row[]> = {
    contacts: [staffContact],
    clients: [warehaus, { _id: 'org-north', slug: 'northwind', portalAccess: 'Enabled' }],
    projects: [project],
    ...seed,
  };
  const patches: Array<{ id: string; fields: Record<string, unknown> }> = [];
  const inserts: Array<{ table: string; doc: Record<string, unknown> }> = [];
  const calls: Array<Record<string, unknown>> = [];
  const find = (id: string) => {
    for (const rows of Object.values(tables)) {
      const found = rows.find((row) => row._id === id);
      if (found) return found;
    }
    return null;
  };
  const db = {
    async get(id: string) {
      return find(id);
    },
    async patch(id: string, fields: Record<string, unknown>) {
      patches.push({ id, fields: { ...fields } });
      for (const rows of Object.values(tables)) {
        const index = rows.findIndex((row) => row._id === id);
        if (index < 0) continue;
        const next: Row = { ...rows[index]!, ...fields };
        // Convex drops a field patched to undefined.
        for (const [key, value] of Object.entries(fields)) if (value === undefined) delete next[key];
        rows[index] = next;
      }
    },
    async insert(table: string, doc: Record<string, unknown>) {
      const id = `${table}-${inserts.length + 1}`;
      inserts.push({ table, doc });
      tables[table] = tables[table] ?? [];
      tables[table]!.push({ ...doc, _id: id });
      return id;
    },
    async delete() {
      throw new Error('close-out never deletes');
    },
    query(table: string) {
      const read = (pairs: Array<[string, unknown]>) => {
        const matched = (tables[table] ?? []).filter((row) => pairs.every(([field, value]) => row[field] === value));
        const result = {
          unique: async () => matched[0] ?? null,
          first: async () => matched[0] ?? null,
          take: async (limit: number) => matched.slice(0, limit),
          collect: async () => matched,
          order: () => result,
        };
        return result;
      };
      return {
        ...read([]),
        withIndex(_name: string, build: (q: { eq: (field: string, value: unknown) => unknown }) => unknown) {
          const recorder = {
            pairs: [] as Array<[string, unknown]>,
            eq(field: string, value: unknown) {
              this.pairs.push([field, value]);
              return this;
            },
          };
          build(recorder);
          return read(recorder.pairs);
        },
      };
    },
  };
  const ctx = {
    auth: { getUserIdentity: async () => ({ subject: 'auth-staff' }) },
    db,
    runMutation: async (_ref: unknown, args: Record<string, unknown>) => {
      calls.push(args);
      return { ok: true, outboxId: 'out-1', duplicate: false };
    },
  };
  return { ctx, tables, patches, inserts, calls, row: (id: string) => find(id) };
}

function milestone(id: string, fields: Record<string, unknown> = {}): Row {
  return {
    _id: id,
    _creationTime: 1,
    orgId: 'org-north',
    projectId: 'project-site',
    name: `Milestone ${id}`,
    objective: 'Ship it',
    goals: [],
    status: 'Building',
    approval: 'unreviewed',
    publishToWarehaus: false,
    ...fields,
  };
}

function task(id: string, fields: Record<string, unknown> = {}): Row {
  return {
    _id: id,
    orgId: 'org-north',
    projectId: 'project-site',
    notionPageId: `portal-milestone:${id}`,
    externalId: id,
    source: 'portal-milestone',
    name: `Task ${id}`,
    status: 'To Do',
    isDone: false,
    stage: 'Building',
    publishToWarehaus: false,
    milestoneId: 'm1',
    ...fields,
  };
}

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

describe('milestones.markComplete', () => {
  it('completes a milestone with no tasks and asks nothing', async () => {
    const store = memory({ milestones: [milestone('m1')] });
    const result = await run(markComplete, store.ctx, { milestoneId: 'm1', expectedStatus: 'Building' });
    assert.equal(result.wrote, true);
    assert.equal(result.status, 'Shipped');
    assert.equal(result.previous, 'Building');
    assert.equal(result.leftovers, null);
    assert.deepEqual(result.tasks, []);
    assert.equal(store.row('m1')?.status, 'Shipped');
    assert.equal(store.inserts.filter((row) => row.table === 'activity').length, 1);
  });

  it('completes a milestone whose tasks are all Done or Parked without a choice', async () => {
    const store = memory({
      milestones: [milestone('m1')],
      tasks: [task('a', { status: 'Done', isDone: true }), task('b', { stage: 'Parked' })],
    });
    const result = await run(markComplete, store.ctx, { milestoneId: 'm1', expectedStatus: 'Building' });
    assert.equal(result.status, 'Shipped');
    assert.deepEqual(result.tasks, []);
    assert.equal(store.patches.filter((patch) => patch.id !== 'm1').length, 0);
  });

  it('refuses open tasks without a leftovers choice and writes nothing', async () => {
    const store = memory({ milestones: [milestone('m1')], tasks: [task('a')] });
    await assert.rejects(run(markComplete, store.ctx, { milestoneId: 'm1', expectedStatus: 'Building' }), (err: unknown) => {
      assert.ok(err instanceof PortalAuthError);
      assert.equal(err.message, LEFTOVERS_NEEDED);
      return true;
    });
    assert.equal(store.patches.length, 0);
    assert.equal(store.row('m1')?.status, 'Building');
  });

  it('rejects a stale status before any task is written', async () => {
    const store = memory({ milestones: [milestone('m1')], tasks: [task('a')] });
    await assert.rejects(
      run(markComplete, store.ctx, { milestoneId: 'm1', expectedStatus: 'Planning', leftovers: 'done' }),
      /The status changed/,
    );
    assert.equal(store.patches.length, 0);
  });

  it('done: sets every open task Done, subtasks included, and leaves closed ones alone', async () => {
    const store = memory({
      milestones: [milestone('m1')],
      tasks: [
        task('a'),
        task('a-child', { parentTaskId: 'a', milestoneId: undefined, status: 'In Progress' }),
        task('b', { status: 'Done', isDone: true }),
        task('c', { stage: 'Parked' }),
        task('gone', { archivedAt: 5 }),
      ],
    });
    const result = await run(markComplete, store.ctx, { milestoneId: 'm1', expectedStatus: 'Building', leftovers: 'done' });
    assert.equal(result.leftovers, 'done');
    assert.equal(store.row('m1')?.status, 'Shipped');
    for (const id of ['a', 'a-child']) {
      assert.equal(store.row(id)?.status, 'Done');
      assert.equal(store.row(id)?.isDone, true);
    }
    assert.equal(store.row('c')?.status, 'To Do');
    assert.equal(store.row('gone')?.status, 'To Do');
    const previous = result.tasks as Array<{ taskId: string; status: string; isDone: boolean }>;
    assert.deepEqual(previous.map((row) => [row.taskId, row.status, row.isDone]), [
      ['a', 'To Do', false],
      ['a-child', 'In Progress', false],
    ]);
    // Portal-owned tasks have no Notion page, so nothing is queued.
    assert.equal(store.calls.length, 0);
  });

  it('done: sends the status of a Notion task through the outbox', async () => {
    const store = memory({
      milestones: [milestone('m1')],
      tasks: [task('a', { notionPageId: 'notion-a', source: undefined, lastEditedTime: '2026-11-20T00:00:00.000Z' })],
    });
    await run(markComplete, store.ctx, { milestoneId: 'm1', expectedStatus: 'Building', leftovers: 'done' });
    assert.equal(store.calls.length, 1);
    assert.equal(store.calls[0]?.status, 'Done');
    assert.equal(store.calls[0]?.expectedLastEditedTime, '2026-11-20T00:00:00.000Z');
  });

  it('archive: archives open tasks with their subtasks, as tasks.archiveTask does', async () => {
    const store = memory({
      milestones: [milestone('m1')],
      tasks: [
        task('a', { notionPageId: 'notion-a', source: undefined }),
        task('a-done-child', { parentTaskId: 'a', milestoneId: undefined, status: 'Done', isDone: true }),
        task('b', { status: 'Done', isDone: true }),
      ],
    });
    const result = await run(markComplete, store.ctx, { milestoneId: 'm1', expectedStatus: 'Building', leftovers: 'archive' });
    assert.equal(result.leftovers, 'archived');
    assert.equal(typeof store.row('a')?.archivedAt, 'number');
    assert.equal(store.row('a-done-child')?.archivedAt, store.row('a')?.archivedAt);
    assert.equal(store.row('b')?.archivedAt, undefined);
    assert.equal(store.row('a')?.status, 'To Do');
    // One Notion page archive for the task, none for its subtask: the same as archiveTask.
    assert.deepEqual(store.calls, [{ taskId: 'a', actorId: 'contact-staff' }]);
    assert.equal(store.row('m1')?.status, 'Shipped');
  });

  it('park: moves leftovers to the Parked for later milestone and keeps each status', async () => {
    const store = memory({
      milestones: [milestone('m1'), milestone('parked', { name: PARKED_MILESTONE_NAME, status: 'Idea' })],
      tasks: [
        task('a', { status: 'In Progress', milestoneOrder: 0 }),
        task('a-child', { parentTaskId: 'a', status: 'Blocked' }),
        task('a-loose', { parentTaskId: 'a', milestoneId: undefined }),
        task('b', { status: 'Done', isDone: true, milestoneOrder: 1 }),
        task('already', { milestoneId: 'parked', milestoneOrder: 4 }),
      ],
    });
    const result = await run(markComplete, store.ctx, { milestoneId: 'm1', expectedStatus: 'Building', leftovers: 'park' });
    assert.equal(result.leftovers, 'moved');
    assert.equal(store.row('a')?.milestoneId, 'parked');
    assert.equal(store.row('a-child')?.milestoneId, 'parked');
    assert.equal(store.row('a-loose')?.milestoneId, undefined);
    assert.equal(store.row('b')?.milestoneId, 'm1');
    assert.equal(store.row('a')?.status, 'In Progress');
    assert.equal(store.row('a-child')?.status, 'Blocked');
    assert.equal(store.row('a')?.stage, 'Building');
    assert.equal(store.row('a')?.isDone, false);
    // After the task already parked there.
    assert.equal(store.row('a')?.milestoneOrder, 5);
    assert.equal(store.row('a-child')?.milestoneOrder, 6);
    assert.equal(store.row('m1')?.status, 'Shipped');
    assert.equal(store.inserts.filter((row) => row.table === 'milestones').length, 0);
    const previous = result.tasks as Array<{ taskId: string; milestoneId: string; milestoneOrder: number | null }>;
    assert.deepEqual(previous.map((row) => [row.taskId, row.milestoneId]), [
      ['a', 'm1'],
      ['a-child', 'm1'],
    ]);
  });

  it('park: with no Parked for later milestone, sets leftovers Parked and never creates one', async () => {
    const store = memory({
      milestones: [milestone('m1'), milestone('other', { name: 'Parked for Later' })],
      tasks: [task('a', { status: 'In Progress' }), task('b', { status: 'Done', isDone: true })],
    });
    const result = await run(markComplete, store.ctx, { milestoneId: 'm1', expectedStatus: 'Building', leftovers: 'park' });
    assert.equal(result.leftovers, 'parked');
    assert.equal(store.row('a')?.stage, 'Parked');
    assert.equal(store.row('a')?.status, 'In Progress');
    assert.equal(store.row('a')?.milestoneId, 'm1');
    assert.equal(store.row('b')?.stage, 'Building');
    assert.equal(store.row('m1')?.status, 'Shipped');
    assert.equal(store.inserts.filter((row) => row.table === 'milestones').length, 0);
    assert.equal(store.tables.milestones?.length, 2);
  });

  it('does nothing to a milestone that is already Shipped, and refuses an archived one', async () => {
    const shipped = memory({ milestones: [milestone('m1', { status: 'Shipped' })], tasks: [task('a')] });
    const again = await run(markComplete, shipped.ctx, { milestoneId: 'm1', expectedStatus: 'Shipped', leftovers: 'done' });
    assert.equal(again.wrote, false);
    assert.equal(shipped.patches.length, 0);
    const archived = memory({ milestones: [milestone('m1', { archivedAt: 9 })] });
    await assert.rejects(run(markComplete, archived.ctx, { milestoneId: 'm1', expectedStatus: 'Building' }), (err: unknown) => {
      assert.ok(err instanceof PortalAuthError);
      assert.equal(err.message, MILESTONE_ARCHIVED);
      return true;
    });
  });

  it('is the only Shipped path that passes tasksReady without the gate', () => {
    const portal = readFileSync(new URL('../milestones.ts', import.meta.url), 'utf8');
    const body = portal.slice(portal.indexOf('export const markComplete'), portal.indexOf('export const archive ='));
    assert.match(body, /planMarkComplete/);
    assert.doesNotMatch(body, /milestoneCloseGate/);
    assert.doesNotMatch(body, /\.collect\(/);
  });
});

describe('milestones.setStatus', () => {
  it('names the open count and points to Mark complete when Shipped is locked', async () => {
    const store = memory({
      milestones: [milestone('m1')],
      tasks: [task('a'), task('b'), task('c'), task('d', { status: 'Done', isDone: true }), task('e', { stage: 'Parked' })],
    });
    await assert.rejects(run(setStatus, store.ctx, { milestoneId: 'm1', status: 'Shipped' }), (err: unknown) => {
      assert.ok(err instanceof PortalAuthError);
      assert.equal(err.message, '3 open tasks. Use Mark complete to close them out.');
      return true;
    });
    assert.equal(store.patches.length, 0);
  });

  it('says one open task in the singular', async () => {
    const store = memory({ milestones: [milestone('m1')], tasks: [task('a')] });
    await assert.rejects(
      run(setStatus, store.ctx, { milestoneId: 'm1', status: 'Shipped' }),
      /1 open task\. Use Mark complete to close them out\./,
    );
  });

  it('still refuses an empty milestone and points to Mark complete', async () => {
    const store = memory({ milestones: [milestone('m1')] });
    await assert.rejects(run(setStatus, store.ctx, { milestoneId: 'm1', status: 'Shipped' }), (err: unknown) => {
      assert.ok(err instanceof PortalAuthError);
      assert.equal(err.message, SHIPPED_NOTHING_OPEN);
      return true;
    });
  });

  it('still sets Shipped when every task is Done', async () => {
    const store = memory({ milestones: [milestone('m1')], tasks: [task('a', { status: 'Done', isDone: true })] });
    const result = await run(setStatus, store.ctx, { milestoneId: 'm1', status: 'Shipped' });
    assert.equal(result.status, 'Shipped');
  });
});

describe('milestones.archive and restore', () => {
  it('archive: archives open tasks with the milestone, under one archive time', async () => {
    const store = memory({
      milestones: [milestone('m1', { planning: 'queued' })],
      tasks: [task('a'), task('a-child', { parentTaskId: 'a', milestoneId: undefined }), task('b', { status: 'Done', isDone: true })],
    });
    const result = await run(archive, store.ctx, { milestoneId: 'm1', openTasks: 'archive' });
    assert.equal(result.wrote, true);
    const at = store.row('m1')?.archivedAt;
    assert.equal(typeof at, 'number');
    assert.equal(result.archivedAt, at);
    assert.equal(store.row('a')?.archivedAt, at);
    assert.equal(store.row('a-child')?.archivedAt, at);
    assert.equal(store.row('b')?.archivedAt, undefined);
    assert.equal(store.row('m1')?.status, 'Building');
    assert.equal(store.row('m1')?.planning, undefined);
    assert.equal((result.tasks as unknown[]).length, 2);
  });

  it('detach: moves open tasks to No milestone and archives none of them', async () => {
    const store = memory({
      milestones: [milestone('m1')],
      tasks: [task('a', { milestoneOrder: 2 }), task('b', { status: 'Done', isDone: true })],
    });
    const result = await run(archive, store.ctx, { milestoneId: 'm1', openTasks: 'detach' });
    assert.equal(store.row('a')?.milestoneId, undefined);
    assert.equal(store.row('a')?.milestoneOrder, undefined);
    assert.equal(store.row('a')?.archivedAt, undefined);
    assert.equal(store.row('b')?.milestoneId, 'm1');
    assert.equal(typeof store.row('m1')?.archivedAt, 'number');
    assert.deepEqual(
      (result.tasks as Array<{ taskId: string; milestoneId: string; milestoneOrder: number }>).map((row) => [
        row.taskId,
        row.milestoneId,
        row.milestoneOrder,
      ]),
      [['a', 'm1', 2]],
    );
    assert.equal(store.calls.length, 0);
  });

  it('archiving twice writes once', async () => {
    const store = memory({ milestones: [milestone('m1', { archivedAt: 7 })], tasks: [task('a')] });
    const result = await run(archive, store.ctx, { milestoneId: 'm1', openTasks: 'archive' });
    assert.equal(result.wrote, false);
    assert.equal(store.patches.length, 0);
  });

  it('restore: brings back an archived milestone and only the tasks archived with it', async () => {
    const store = memory({
      milestones: [milestone('m1', { archivedAt: 7 })],
      tasks: [task('with', { archivedAt: 7 }), task('earlier', { archivedAt: 3 }), task('live')],
    });
    const result = await run(restore, store.ctx, { milestoneId: 'm1' });
    assert.equal(result.restored, 'archived');
    assert.equal(result.archivedAt, 7);
    assert.equal(store.row('m1')?.archivedAt, undefined);
    assert.equal(store.row('with')?.archivedAt, undefined);
    assert.equal(store.row('earlier')?.archivedAt, 3);
    assert.deepEqual((result.tasks as Array<{ taskId: string; archivedAt: number }>).map((row) => [row.taskId, row.archivedAt]), [
      ['with', 7],
    ]);
  });

  it('restore: reopens a completed milestone as Ready to Ship and leaves its tasks', async () => {
    const store = memory({ milestones: [milestone('m1', { status: 'Shipped' })], tasks: [task('a', { status: 'Done', isDone: true })] });
    const result = await run(restore, store.ctx, { milestoneId: 'm1' });
    assert.equal(result.restored, 'completed');
    assert.equal(result.previous, 'Shipped');
    assert.equal(store.row('m1')?.status, 'Ready to Ship');
    assert.equal(store.row('a')?.status, 'Done');
  });

  it('restore: writes nothing on an open milestone', async () => {
    const store = memory({ milestones: [milestone('m1')] });
    const result = await run(restore, store.ctx, { milestoneId: 'm1' });
    assert.equal(result.wrote, false);
    assert.equal(store.patches.length, 0);
  });
});

describe('milestones.undoCloseout', () => {
  it('undoes Mark complete: the status and every leftover go back', async () => {
    const store = memory({
      milestones: [milestone('m1'), milestone('parked', { name: PARKED_MILESTONE_NAME, status: 'Idea' })],
      tasks: [task('a', { status: 'In Progress', milestoneOrder: 3 }), task('b', { status: 'Done', isDone: true })],
    });
    const done = await run(markComplete, store.ctx, { milestoneId: 'm1', expectedStatus: 'Building', leftovers: 'park' });
    assert.equal(store.row('a')?.milestoneId, 'parked');
    const undone = await run(undoCloseout, store.ctx, { milestoneId: 'm1', status: done.previous, tasks: done.tasks });
    assert.equal(undone.wrote, true);
    assert.equal(store.row('m1')?.status, 'Building');
    assert.equal(store.row('a')?.milestoneId, 'm1');
    assert.equal(store.row('a')?.milestoneOrder, 3);
    assert.equal(store.row('a')?.status, 'In Progress');
  });

  it('undoes each leftovers choice', async () => {
    for (const leftovers of ['done', 'archive', 'park'] as const) {
      const store = memory({ milestones: [milestone('m1')], tasks: [task('a', { status: 'Blocked' })] });
      const done = await run(markComplete, store.ctx, { milestoneId: 'm1', expectedStatus: 'Building', leftovers });
      await run(undoCloseout, store.ctx, { milestoneId: 'm1', status: done.previous, tasks: done.tasks });
      assert.equal(store.row('m1')?.status, 'Building', leftovers);
      assert.equal(store.row('a')?.status, 'Blocked', leftovers);
      assert.equal(store.row('a')?.isDone, false, leftovers);
      assert.equal(store.row('a')?.stage, 'Building', leftovers);
      assert.equal(store.row('a')?.archivedAt, undefined, leftovers);
      assert.equal(store.row('a')?.milestoneId, 'm1', leftovers);
    }
  });

  it('undoes Archive and Restore', async () => {
    const store = memory({ milestones: [milestone('m1')], tasks: [task('a', { milestoneOrder: 1 })] });
    const archived = await run(archive, store.ctx, { milestoneId: 'm1', openTasks: 'detach' });
    await run(undoCloseout, store.ctx, { milestoneId: 'm1', archivedAt: null, tasks: archived.tasks });
    assert.equal(store.row('m1')?.archivedAt, undefined);
    assert.equal(store.row('a')?.milestoneId, 'm1');
    assert.equal(store.row('a')?.milestoneOrder, 1);

    const again = await run(archive, store.ctx, { milestoneId: 'm1', openTasks: 'archive' });
    const at = again.archivedAt;
    const restored = await run(restore, store.ctx, { milestoneId: 'm1' });
    await run(undoCloseout, store.ctx, { milestoneId: 'm1', archivedAt: restored.archivedAt, tasks: restored.tasks });
    assert.equal(store.row('m1')?.archivedAt, at);
    assert.equal(store.row('a')?.archivedAt, at);
  });

  it('undoes a Restore of a completed milestone back to Shipped', async () => {
    const store = memory({ milestones: [milestone('m1', { status: 'Shipped' })] });
    const restored = await run(restore, store.ctx, { milestoneId: 'm1' });
    await run(undoCloseout, store.ctx, { milestoneId: 'm1', status: restored.previous, tasks: [] });
    assert.equal(store.row('m1')?.status, 'Shipped');
  });

  it('skips a task from another org and a milestone on another project', async () => {
    const store = memory({
      milestones: [milestone('m1'), milestone('far', { projectId: 'project-other' })],
      tasks: [task('a', { milestoneId: undefined }), task('alien', { orgId: 'org-other', status: 'Done', isDone: true })],
    });
    const snapshot = { status: 'To Do', isDone: false, stage: 'Building', milestoneOrder: null, archivedAt: null };
    const undone = await run(undoCloseout, store.ctx, {
      milestoneId: 'm1',
      tasks: [
        { ...snapshot, taskId: 'a', milestoneId: 'far' },
        { ...snapshot, taskId: 'alien', milestoneId: null },
      ],
    });
    assert.equal(undone.wrote, false);
    assert.equal(store.row('a')?.milestoneId, undefined);
    assert.equal(store.row('alien')?.status, 'Done');
  });
});

describe('task mark complete, archive and restore', () => {
  it('markDone sets Done once and returns the task as it was', async () => {
    const store = memory({ tasks: [task('a', { status: 'In Progress' })] });
    const result = await run(markDone, store.ctx, { taskId: 'a' });
    assert.equal(result.wrote, true);
    assert.equal(store.row('a')?.status, 'Done');
    assert.equal(store.row('a')?.isDone, true);
    assert.deepEqual((result.previous as Array<{ status: string; isDone: boolean }>).map((row) => [row.status, row.isDone]), [
      ['In Progress', false],
    ]);
    const again = await run(markDone, store.ctx, { taskId: 'a' });
    assert.equal(again.wrote, false);
    assert.equal(store.patches.length, 1);
  });

  it('markDone refuses an archived task', async () => {
    const store = memory({ tasks: [task('a', { archivedAt: 4 })] });
    assert.deepEqual(await run(markDone, store.ctx, { taskId: 'a' }), { ok: false, error: 'Task not found' });
  });

  it('archiveTask returns the task and its subtasks as they were', async () => {
    const store = memory({ tasks: [task('a'), task('child', { parentTaskId: 'a' })] });
    const result = await run(archiveTask, store.ctx, { taskId: 'a' });
    assert.equal(result.wrote, true);
    assert.deepEqual(
      (result.previous as Array<{ taskId: string; archivedAt: number | null }>).map((row) => [row.taskId, row.archivedAt]),
      [
        ['a', null],
        ['child', null],
      ],
    );
  });

  it('restoreTask brings back an archived task with the subtasks archived with it', async () => {
    const store = memory({
      tasks: [task('a', { archivedAt: 8 }), task('with', { parentTaskId: 'a', archivedAt: 8 }), task('before', { parentTaskId: 'a', archivedAt: 2 })],
    });
    const result = await run(restoreTask, store.ctx, { taskId: 'a' });
    assert.equal(result.restored, 'archived');
    assert.equal(store.row('a')?.archivedAt, undefined);
    assert.equal(store.row('with')?.archivedAt, undefined);
    assert.equal(store.row('before')?.archivedAt, 2);
    // Restore does not write to Notion.
    assert.equal(store.calls.length, 0);
  });

  it('restoreTask reopens a Done task as To Do, and leaves an open one alone', async () => {
    const store = memory({ tasks: [task('a', { status: 'Done', isDone: true }), task('b')] });
    const result = await run(restoreTask, store.ctx, { taskId: 'a' });
    assert.equal(result.restored, 'completed');
    assert.equal(store.row('a')?.status, 'To Do');
    assert.equal(store.row('a')?.isDone, false);
    const open = await run(restoreTask, store.ctx, { taskId: 'b' });
    assert.equal(open.wrote, false);
  });

  it('undoTaskChange is the inverse of each task write', async () => {
    const store = memory({ tasks: [task('a', { status: 'Blocked' }), task('child', { parentTaskId: 'a' })] });
    const done = await run(markDone, store.ctx, { taskId: 'a' });
    await run(undoTaskChange, store.ctx, { tasks: done.previous });
    assert.equal(store.row('a')?.status, 'Blocked');
    assert.equal(store.row('a')?.isDone, false);

    const archived = await run(archiveTask, store.ctx, { taskId: 'a' });
    await run(undoTaskChange, store.ctx, { tasks: archived.previous });
    assert.equal(store.row('a')?.archivedAt, undefined);
    assert.equal(store.row('child')?.archivedAt, undefined);

    await run(archiveTask, store.ctx, { taskId: 'a' });
    const at = store.row('a')?.archivedAt;
    const restored = await run(restoreTask, store.ctx, { taskId: 'a' });
    await run(undoTaskChange, store.ctx, { tasks: restored.previous });
    assert.equal(store.row('a')?.archivedAt, at);
    assert.equal(store.row('child')?.archivedAt, at);
  });
});

describe('archived items stay out of normal reads', () => {
  const seed = () =>
    memory({
      milestones: [milestone('live'), milestone('gone', { archivedAt: 7, name: 'Old launch' })],
      tasks: [
        task('a', { milestoneId: 'live' }),
        task('a-archived', { milestoneId: 'live', archivedAt: 4 }),
        task('b', { milestoneId: 'gone', archivedAt: 7 }),
        task('b-child', { parentTaskId: 'b', milestoneId: undefined, archivedAt: 7 }),
        task('c', { milestoneId: 'gone', status: 'Done', isDone: true }),
        task('free', { milestoneId: undefined }),
        task('free-archived', { milestoneId: undefined, archivedAt: 6 }),
      ],
    });

  it('the roadmap leaves out archived milestones and archived tasks', async () => {
    const store = seed();
    const views = (await run(listForProject, store.ctx, { projectId: 'project-site' })) as unknown as Array<{
      id: string;
      rows: Array<{ id: string }>;
      attachableTasks: Array<{ id: string }>;
    }>;
    assert.deepEqual(views.map((view) => view.id), ['live']);
    assert.deepEqual(views[0]?.rows.map((row) => row.id), ['a']);
    // An archived task cannot be attached to a milestone either.
    assert.deepEqual(views[0]?.attachableTasks.map((row) => row.id), ['free']);
  });

  it('a new task cannot choose an archived milestone', async () => {
    const store = seed();
    const choices = (await run(taskChoices, store.ctx, { projectId: 'project-site' })) as unknown as Array<{ id: string }>;
    assert.deepEqual(choices.map((choice) => choice.id), ['live']);
  });

  it('the staff task list leaves out archived tasks, so they are not counted as needing a milestone', async () => {
    const store = seed();
    const rows = (await run(listForStaff, store.ctx, {})) as unknown as Array<{ id: string; milestoneId: string | null }>;
    assert.deepEqual(rows.map((row) => row.id).sort(), ['a', 'c', 'free']);
  });

  it('the Archived filter returns the archived milestones and tasks', async () => {
    const store = seed();
    const archived = (await run(listArchivedForProject, store.ctx, { projectId: 'project-site' })) as unknown as {
      milestones: Array<{ id: string; archivedAt: number; rows: Array<{ id: string; children: Array<{ id: string }> }> }>;
      tasks: Array<{ id: string; milestoneId: string | null }>;
    };
    assert.deepEqual(archived.milestones.map((row) => [row.id, row.archivedAt]), [['gone', 7]]);
    // The card shows the tasks archived with the milestone, and its live ones.
    assert.deepEqual(archived.milestones[0]?.rows.map((row) => row.id).sort(), ['b', 'c']);
    assert.deepEqual(archived.milestones[0]?.rows.find((row) => row.id === 'b')?.children.map((row) => row.id), ['b-child']);
    assert.deepEqual(
      archived.tasks.map((row) => [row.id, row.milestoneId]),
      [
        ['b', 'gone'],
        ['b-child', 'gone'],
        ['free-archived', null],
        ['a-archived', 'live'],
      ],
    );
  });

  it('rejects a client on every close-out mutation', async () => {
    const store = memory({
      contacts: [
        {
          _id: 'contact-client',
          orgId: 'org-north',
          name: 'Ada Client',
          email: 'ada@northwind.test',
          authUserId: 'auth-staff',
          role: 'Client Admin',
          portalAccess: 'Enabled',
        },
      ],
      milestones: [milestone('m1')],
      tasks: [task('a')],
    });
    for (const [fn, args] of [
      [markComplete, { milestoneId: 'm1', expectedStatus: 'Building', leftovers: 'done' }],
      [archive, { milestoneId: 'm1', openTasks: 'archive' }],
      [restore, { milestoneId: 'm1' }],
      [undoCloseout, { milestoneId: 'm1', tasks: [] }],
      [listArchivedForProject, { projectId: 'project-site' }],
      [markDone, { taskId: 'a' }],
      [restoreTask, { taskId: 'a' }],
      [undoTaskChange, { tasks: [] }],
    ] as const) {
      await assert.rejects(run(fn, store.ctx, args), (err: unknown) => {
        assert.ok(err instanceof PortalAuthError);
        assert.equal(err.message, 'Staff role required');
        return true;
      });
    }
    assert.equal(store.patches.length, 0);
  });
});
