import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Doc } from '../_generated/dataModel';
import type { QueryCtx } from '../_generated/server';
import {
  MILESTONE_TASK_SET_CAP,
  SHIP_NEEDS_A_TASK,
  SHIP_NEEDS_DONE,
  TOO_MANY_TASKS,
  canShipRows,
  classifyClaimable,
  classifyMilestoneTasks,
  isOpenTask,
  loadClaimableTasks,
  loadMilestoneTaskSet,
  type ClaimRow,
  type TaskSetRow,
} from './milestoneTaskSet';

const M = 'm-1';
const PORTAL = 'portal-milestone';

const row = (id: string, fields: Partial<ClaimRow> = {}): ClaimRow => ({
  id,
  milestoneId: M,
  status: 'To Do',
  isDone: false,
  source: PORTAL,
  ...fields,
});

const ids = (rows: readonly TaskSetRow[]) => rows.map((task) => task.id);

describe('milestone task set: membership', () => {
  it('is the roadmap rows: linked tasks, plus subtasks with no milestone or linked here', () => {
    const set = classifyMilestoneTasks(M, [
      row('a'),
      row('a-unlinked', { parentTaskId: 'a', milestoneId: null }),
      row('a-here', { parentTaskId: 'a' }),
      row('a-elsewhere', { parentTaskId: 'a', milestoneId: 'm-2' }),
      row('orphan', { parentTaskId: 'not-here' }),
      row('other', { milestoneId: 'm-2' }),
      row('gone', { archived: true }),
      row('gone-child', { parentTaskId: 'a', milestoneId: null, archived: true }),
    ]);
    assert.deepEqual(ids(set.tasks), ['a', 'a-unlinked', 'a-here', 'orphan']);
  });

  it('counts a subtask linked here once, under its linked parent', () => {
    const set = classifyMilestoneTasks(M, [row('p'), row('c', { parentTaskId: 'p' })]);
    assert.deepEqual(ids(set.tasks), ['p', 'c']);
  });
});

describe('milestone task set: one table, every question', () => {
  type Case = {
    name: string;
    rows: ClaimRow[];
    open: string[];
    done: string[];
    parked: string[];
    waiting: string[];
    allDone: boolean;
    ship: true | string;
  };
  const cases: Case[] = [
    { name: 'empty', rows: [], open: [], done: [], parked: [], waiting: [], allDone: false, ship: SHIP_NEEDS_A_TASK },
    {
      name: 'all done',
      rows: [row('a', { isDone: true, status: 'Done' }), row('b', { isDone: true, status: 'Done' })],
      open: [],
      done: ['a', 'b'],
      parked: [],
      waiting: [],
      allDone: true,
      ship: true,
    },
    {
      name: 'status Done before isDone follows counts as done',
      rows: [row('a', { status: 'Done', isDone: false })],
      open: [],
      done: ['a'],
      parked: [],
      waiting: [],
      allDone: true,
      ship: true,
    },
    {
      name: 'a Parked task holds nothing up',
      rows: [row('a', { isDone: true }), row('p', { stage: 'Parked' })],
      open: [],
      done: ['a'],
      parked: ['p'],
      waiting: [],
      allDone: true,
      ship: true,
    },
    {
      name: 'Parked wins over a Done status',
      rows: [row('a', { isDone: true }), row('p', { stage: 'Parked', isDone: true, status: 'Done' })],
      open: [],
      done: ['a'],
      parked: ['p'],
      waiting: [],
      allDone: true,
      ship: true,
    },
    {
      name: 'only Parked is not done',
      rows: [row('p', { stage: 'Parked' })],
      open: [],
      done: [],
      parked: ['p'],
      waiting: [],
      allDone: false,
      ship: SHIP_NEEDS_A_TASK,
    },
    {
      name: 'an open subtask with no milestone holds the milestone and waits on a person',
      rows: [row('a', { isDone: true }), row('sub', { parentTaskId: 'a', milestoneId: null })],
      open: ['sub'],
      done: ['a'],
      parked: [],
      waiting: ['sub'],
      allDone: false,
      ship: SHIP_NEEDS_DONE,
    },
    {
      name: 'a task that syncs from Notion waits on a person; a portal task does not',
      rows: [row('portal'), row('synced', { source: 'Client', notionPageId: 'abc123' })],
      open: ['portal', 'synced'],
      done: [],
      parked: [],
      waiting: ['synced'],
      allDone: false,
      ship: SHIP_NEEDS_DONE,
    },
    {
      name: 'an archived open task does not count',
      rows: [row('a', { isDone: true }), row('old', { archived: true })],
      open: [],
      done: ['a'],
      parked: [],
      waiting: [],
      allDone: true,
      ship: true,
    },
  ];

  for (const c of cases) {
    it(c.name, () => {
      const set = classifyMilestoneTasks(M, c.rows);
      assert.deepEqual(ids(set.open), c.open, 'open');
      assert.deepEqual(ids(set.done), c.done, 'done');
      assert.deepEqual(ids(set.parked), c.parked, 'parked');
      assert.deepEqual(ids(set.waitingOnPerson), c.waiting, 'waiting');
      assert.equal(set.allDone, c.allDone, 'allDone');
      if (c.ship === true) assert.deepEqual(set.canShip, { ok: true });
      else assert.deepEqual(set.canShip, { ok: false, reason: c.ship, open: c.open.length });
      // allDone and canShip are the same rule.
      assert.equal(set.allDone, set.canShip.ok);
      // Roadmap rows cut to the same set give the same answer.
      assert.deepEqual(canShipRows(set.tasks), set.canShip);
    });
  }

  it('isOpenTask matches the open bucket', () => {
    assert.equal(isOpenTask({ status: 'To Do', isDone: false }), true);
    assert.equal(isOpenTask({ status: 'Done', isDone: false }), false);
    assert.equal(isOpenTask({ status: 'To Do', isDone: true }), false);
    assert.equal(isOpenTask({ status: 'To Do', isDone: false, stage: 'Parked' }), false);
    assert.equal(isOpenTask({ status: 'To Do', isDone: false, archived: true }), false);
  });

  it('canShipRows reads subtasks nested under each row', () => {
    assert.equal(canShipRows([{ id: 'a', isDone: true, children: [{ id: 'p', stage: 'Parked' }] }]).ok, true);
    assert.equal(canShipRows([{ id: 'a', isDone: true, children: [{ id: 'c', status: 'To Do', isDone: false }] }]).ok, false);
  });
});

describe('claimable tasks', () => {
  it('takes the lowest-order To do task that is unclaimed, top level, not Parked and portal owned', () => {
    const claim = classifyClaimable([
      row('later', { milestoneOrder: 3 }),
      row('first', { milestoneOrder: 1 }),
      row('claimed', { milestoneOrder: 0, claimedBy: 'studio-mini' }),
      row('sub', { milestoneOrder: 0, parentTaskId: 'first' }),
      row('parked', { milestoneOrder: 0, stage: 'Parked' }),
      row('synced', { milestoneOrder: 0, source: 'Client', notionPageId: 'abc123' }),
      row('old', { milestoneOrder: 0, archived: true }),
      row('started', { milestoneOrder: 0, status: 'In Progress' }),
      row('done-status', { milestoneOrder: 0, status: 'Done' }),
    ]);
    assert.equal(claim.nextClaimable?.id, 'first');
  });

  it('has nothing to claim when only Parked or claimed work is left', () => {
    assert.equal(classifyClaimable([row('p', { stage: 'Parked' }), row('c', { claimedBy: 'r' })]).nextClaimable, null);
  });

  it('a Cursor build takes To do and In Progress top-level portal tasks, in order', () => {
    const claim = classifyClaimable([
      row('b', { milestoneOrder: 2, status: 'In Progress', claimedBy: 'r' }),
      row('a', { milestoneOrder: 1 }),
      row('done', { milestoneOrder: 0, isDone: true, status: 'Done' }),
      row('blocked', { milestoneOrder: 0, status: 'Blocked' }),
      row('parked', { milestoneOrder: 0, stage: 'Parked' }),
      row('sub', { milestoneOrder: 0, parentTaskId: 'a' }),
    ]);
    assert.deepEqual(ids(claim.openBuild), ['a', 'b']);
  });
});

/** A read-only ctx over task rows: `withIndex` equality and `take`, nothing else. */
function readCtx(tasks: Array<Partial<Doc<'tasks'>> & { _id: string }>) {
  let reads = 0;
  const ctx = {
    db: {
      query: (table: string) => {
        assert.equal(table, 'tasks');
        const wanted: Array<[string, unknown]> = [];
        const chain = {
          withIndex: (_index: string, range: (q: { eq: (field: string, value: unknown) => unknown }) => unknown) => {
            const q = {
              eq: (field: string, value: unknown) => {
                wanted.push([field, value]);
                return q;
              },
            };
            range(q);
            return chain;
          },
          take: async (n: number) => {
            reads += 1;
            return tasks
              .filter((task) => wanted.every(([field, value]) => (task as Record<string, unknown>)[field] === value))
              .slice(0, n);
          },
          collect: () => {
            throw new Error('whole-table read');
          },
        };
        return chain;
      },
    },
  };
  return { ctx: ctx as unknown as QueryCtx, reads: () => reads };
}

const milestone = { _id: M, orgId: 'org-1' } as unknown as Doc<'milestones'>;
const doc = (id: string, fields: Partial<Doc<'tasks'>> = {}) =>
  ({
    _id: id,
    orgId: 'org-1',
    milestoneId: M,
    name: id,
    status: 'To Do',
    isDone: false,
    source: PORTAL,
    ...fields,
  }) as unknown as Partial<Doc<'tasks'>> & { _id: string };

describe('loadMilestoneTaskSet', () => {
  it('reads subtasks with no milestone, so an open one keeps the milestone from shipping', async () => {
    const { ctx } = readCtx([
      doc('a', { isDone: true, status: 'Done' }),
      doc('sub', { milestoneId: undefined, parentTaskId: 'a' as Doc<'tasks'>['_id'] }),
      doc('foreign', { orgId: 'org-2' as Doc<'tasks'>['orgId'], milestoneId: undefined, parentTaskId: 'a' as Doc<'tasks'>['_id'] }),
    ]);
    const loaded = await loadMilestoneTaskSet(ctx, milestone);
    assert.ok(loaded.ok);
    assert.deepEqual(ids(loaded.set.tasks), ['a', 'sub']);
    assert.equal(loaded.set.allDone, false);
    assert.deepEqual(loaded.set.canShip, { ok: false, reason: SHIP_NEEDS_DONE, open: 1 });
    assert.deepEqual(ids(loaded.set.waitingOnPerson), ['sub']);
    assert.equal(loaded.set.open[0].doc.name, 'sub');
  });

  it('keeps archived rows in docs for Restore, out of the set', async () => {
    const { ctx } = readCtx([doc('a', { isDone: true }), doc('old', { archivedAt: 5 })]);
    const loaded = await loadMilestoneTaskSet(ctx, milestone);
    assert.ok(loaded.ok);
    assert.deepEqual(loaded.docs.map((task) => task._id), ['a', 'old']);
    assert.deepEqual(ids(loaded.set.tasks), ['a']);
  });

  it('refuses over the cap instead of reading part of the set', async () => {
    const many = Array.from({ length: MILESTONE_TASK_SET_CAP + 1 }, (_, index) => doc(`t${index}`, { isDone: true }));
    const { ctx } = readCtx(many);
    assert.deepEqual(await loadMilestoneTaskSet(ctx, milestone), { ok: false, reason: TOO_MANY_TASKS });
  });
});

describe('loadClaimableTasks', () => {
  it('reads only the linked tasks: one indexed read, no subtask reads', async () => {
    const { ctx, reads } = readCtx([doc('a', { milestoneOrder: 0 }), doc('b', { milestoneOrder: 1 })]);
    const claim = await loadClaimableTasks(ctx, milestone);
    assert.ok(claim.ok);
    assert.equal(claim.nextClaimable?.id, 'a');
    assert.equal(reads(), 1);
    assert.equal('allDone' in claim, false);
  });
});
