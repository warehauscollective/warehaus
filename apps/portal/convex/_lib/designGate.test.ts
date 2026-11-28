/**
 * The design gate: task kinds, the Building phase, the runner's claim, the
 * Approve designs Ask, Approve designs unlocking build, and Request design
 * changes keeping it locked.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Doc } from '../_generated/dataModel';
import { internalMutation, type MutationCtx } from '../_generated/server';
import { approveDesign, requestDesignChanges, setTaskKind } from '../milestones';
import {
  DESIGN_APPROVAL_NEEDS_DESIGN,
  DESIGN_APPROVAL_NEEDS_DONE_DESIGN,
  DESIGN_CHANGES_AFTER_APPROVAL,
  DESIGN_CHANGES_NEED_DESIGN,
  ONLY_PETER_DESIGN_CHANGES,
} from './designApproval';
import {
  DESIGN_ASK_PREFIX,
  designAskDue,
  designGate,
  parseTaskKind,
  taskKind,
  type GateRow,
} from './designGate';
import { syncDesignAsk } from './designGateStore';
import { changeMilestoneStatus } from './milestoneLifecycle';
import { classifyClaimable, type ClaimRow } from './milestoneTaskSet';
import { PORTAL_MILESTONE_TASK_SOURCE } from './milestoneTasks';
import { memoryCtx, type MemoryCtx } from './memoryCtx.testkit';
import { seedMilestoneWorld } from './seedRows.testkit';

const design = (fields: Partial<GateRow> = {}): GateRow => ({ kind: 'design', status: 'To Do', isDone: false, ...fields });
const build = (fields: Partial<GateRow> = {}): GateRow => ({ status: 'To Do', isDone: false, ...fields });
const done = { status: 'Done', isDone: true };

const row = (id: string, order: number, fields: Partial<ClaimRow> = {}): ClaimRow => ({
  id,
  milestoneId: 'm',
  status: 'To Do',
  isDone: false,
  source: PORTAL_MILESTONE_TASK_SOURCE,
  milestoneOrder: order,
  ...fields,
});

/** Runs raw mutation code inside the memory ctx. */
async function mutate(t: MemoryCtx, body: (ctx: MutationCtx) => Promise<void>) {
  await t.call(internalMutation({ args: {}, handler: body }), {});
}

const rejectsWith = (text: string) => (err: Error) => String((err as { data?: unknown }).data ?? err.message).includes(text);

describe('task kind', () => {
  it('reads a missing kind as build and accepts the labels', () => {
    assert.equal(taskKind({}), 'build');
    assert.equal(taskKind({ kind: null }), 'build');
    assert.equal(taskKind({ kind: 'design' }), 'design');
    assert.equal(parseTaskKind(' Design '), 'design');
    assert.equal(parseTaskKind('BUILD'), 'build');
    assert.equal(parseTaskKind('figma'), null);
    assert.equal(parseTaskKind(3), null);
  });
});

describe('designGate', () => {
  it('leaves a milestone with no design task alone', () => {
    const gate = designGate([build(), build({ ...done })], null);
    assert.deepEqual([gate.visual, gate.buildLocked, gate.phase], [false, false, 'build']);
    assert.equal(designAskDue(gate), false);
  });

  it('is Designs while a design task is open, then Waiting on design approval, then Build', () => {
    assert.equal(designGate([design(), build()], null).phase, 'designs');
    const waiting = designGate([design(done), build()], null);
    assert.deepEqual([waiting.phase, waiting.buildLocked, designAskDue(waiting)], ['design-approval', true, true]);
    const approved = designGate([design(done), build()], 1);
    assert.deepEqual([approved.phase, approved.buildLocked, designAskDue(approved)], ['build', false, false]);
  });

  it('ignores archived, Parked and subtask design rows', () => {
    const gate = designGate(
      [design({ archived: true }), design({ stage: 'Parked' }), design({ parentTaskId: 'p' }), build()],
      null,
    );
    assert.equal(gate.visual, false);
  });

  it('asks for nothing when no build work is left', () => {
    assert.equal(designAskDue(designGate([design(done), build(done)], null)), false);
  });
});

describe('runner claim under the design gate', () => {
  it('offers only design tasks until the designs are approved', () => {
    const rows = [row('b1', 0), row('d1', 1, { kind: 'design' }), row('b2', 2)];
    assert.equal(classifyClaimable(rows).nextClaimable?.id, 'd1');
    assert.deepEqual(classifyClaimable(rows).openBuild.map((task) => task.id), ['d1']);
    assert.equal(classifyClaimable(rows, { designApprovedAt: 1 }).nextClaimable?.id, 'b1');
  });

  it('holds build tasks once every design task is done, until approval', () => {
    const rows = [row('d1', 0, { kind: 'design', status: 'Done', isDone: true }), row('b1', 1)];
    assert.equal(classifyClaimable(rows).nextClaimable, null);
    assert.equal(classifyClaimable(rows, { designApprovedAt: 5 }).nextClaimable?.id, 'b1');
  });

  it('changes nothing on a milestone with no design task', () => {
    const rows = [row('b2', 1), row('b1', 0)];
    assert.equal(classifyClaimable(rows).nextClaimable?.id, 'b1');
  });
});

function visualWorld(t: MemoryCtx, status = 'Building') {
  const world = seedMilestoneWorld(t, { status });
  const task = (fields: Record<string, unknown>) =>
    world.task({ source: PORTAL_MILESTONE_TASK_SOURCE, notionPageId: `${PORTAL_MILESTONE_TASK_SOURCE}:${Math.random()}`, ...fields });
  const designId = task({ name: 'Design the card', kind: 'design', milestoneOrder: 0 });
  const buildId = task({ name: 'Build the card', milestoneOrder: 1 });
  return { ...world, task, designId, buildId };
}

const designAsks = (t: MemoryCtx, milestoneId: string) =>
  t.rows('milestoneNotes').filter((note) => note.milestoneId === milestoneId && note.reason === 'design');

describe('Approve designs Ask', () => {
  it('opens once when the last design task is done, and approval closes it', async () => {
    const t = memoryCtx();
    const { milestoneId, designId } = visualWorld(t);
    await mutate(t, async (ctx) => {
      const milestone = (await ctx.db.get(milestoneId as never)) as Doc<'milestones'>;
      assert.equal(await syncDesignAsk(ctx, milestone, { addedBy: 'test', at: 1 }), 'unchanged');
      await ctx.db.patch(designId as never, { status: 'Done', isDone: true } as never);
      assert.equal(await syncDesignAsk(ctx, milestone, { addedBy: 'test', at: 2 }), 'opened');
      assert.equal(await syncDesignAsk(ctx, milestone, { addedBy: 'test', at: 3 }), 'unchanged');
    });
    const asks = designAsks(t, milestoneId);
    assert.equal(asks.length, 1);
    assert.equal(asks[0].open, true);
    assert.ok(String(asks[0].body).startsWith(DESIGN_ASK_PREFIX));

    await t.call(approveDesign, { milestoneId }, { as: 'peter' });
    assert.equal(designAsks(t, milestoneId)[0].open, undefined);
  });

  it('closes when the milestone leaves Building', async () => {
    const t = memoryCtx();
    const { milestoneId, designId } = visualWorld(t);
    await mutate(t, async (ctx) => {
      await ctx.db.patch(designId as never, { status: 'Done', isDone: true } as never);
      const milestone = (await ctx.db.get(milestoneId as never)) as Doc<'milestones'>;
      await syncDesignAsk(ctx, milestone, { addedBy: 'test', at: 1 });
      const moved = await changeMilestoneStatus(ctx, milestone, {
        cause: 'set',
        to: 'Awaiting Go',
        actorName: 'Maya',
        at: 2,
      });
      assert.equal(moved.ok, true);
    });
    assert.equal(designAsks(t, milestoneId)[0].open, undefined);
  });
});

describe('approveDesign under the design gate', () => {
  it('refuses a milestone with no design task, and one whose design task is still open', async () => {
    const t = memoryCtx();
    const plain = seedMilestoneWorld(t, { status: 'Building' });
    plain.task({ source: PORTAL_MILESTONE_TASK_SOURCE });
    await assert.rejects(
      t.call(approveDesign, { milestoneId: plain.milestoneId }, { as: 'peter' }),
      rejectsWith(DESIGN_APPROVAL_NEEDS_DESIGN),
    );
    const { milestoneId } = visualWorld(t);
    await assert.rejects(t.call(approveDesign, { milestoneId }, { as: 'peter' }), rejectsWith(DESIGN_APPROVAL_NEEDS_DONE_DESIGN));
    for (const id of [plain.milestoneId, milestoneId]) {
      assert.equal((t.row(id) as Doc<'milestones'>).designApprovedAt, undefined);
    }
    assert.equal(t.rows('activity').length, 0);
  });

  it('approves once one design task is done, even while another is open, and unlocks build', async () => {
    const t = memoryCtx();
    const { milestoneId, designId, task } = visualWorld(t);
    task({ name: 'Design the sheet', kind: 'design', milestoneOrder: 2 });
    await mutate(t, async (ctx) => {
      await ctx.db.patch(designId as never, { status: 'Done', isDone: true } as never);
    });
    await t.call(approveDesign, { milestoneId }, { as: 'peter' });
    const milestone = t.row(milestoneId) as Doc<'milestones'>;
    assert.ok(milestone.designApprovedAt);
    const rows = t.rows('tasks').filter((row) => row.milestoneId === milestoneId) as Doc<'tasks'>[];
    assert.equal(designGate(rows.map((row) => ({ ...row, archived: row.archivedAt != null })), milestone.designApprovedAt).buildLocked, false);
  });
});

describe('requestDesignChanges', () => {
  it('adds design tasks that name what they revise, closes the Ask and keeps build locked', async () => {
    const t = memoryCtx();
    const { milestoneId, designId } = visualWorld(t);
    await mutate(t, async (ctx) => {
      await ctx.db.patch(designId as never, { status: 'Done', isDone: true } as never);
      const milestone = (await ctx.db.get(milestoneId as never)) as Doc<'milestones'>;
      await syncDesignAsk(ctx, milestone, { addedBy: 'test', at: 1 });
    });
    const result = await t.call<{ ok: true; taskIds: string[] }>(
      requestDesignChanges,
      { milestoneId, notes: 'More room at 390.', taskIds: [designId], newTasks: ['Review card at 390', ' '] },
      { as: 'peter' },
    );
    assert.equal(result.taskIds.length, 1);
    const added = t.row(result.taskIds[0]) as Doc<'tasks'>;
    assert.deepEqual([added.name, added.kind, added.origin, added.status], ['Review card at 390', 'design', 'review', 'To Do']);
    assert.ok(added.description?.includes('Revises: Design the card.'));
    assert.equal(designAsks(t, milestoneId)[0].open, undefined);
    const milestone = t.row(milestoneId) as Doc<'milestones'>;
    assert.equal(milestone.designApprovedAt, undefined);
    assert.equal(milestone.status, 'Building');
  });

  it('refuses other staff, an approved milestone and one with no design task', async () => {
    const t = memoryCtx();
    const { milestoneId, designId } = visualWorld(t);
    await assert.rejects(
      t.call(requestDesignChanges, { milestoneId, notes: 'x' }, { as: 'staff' }),
      rejectsWith(ONLY_PETER_DESIGN_CHANGES),
    );
    await mutate(t, async (ctx) => {
      await ctx.db.patch(designId as never, { status: 'Done', isDone: true } as never);
    });
    await t.call(approveDesign, { milestoneId }, { as: 'peter' });
    await assert.rejects(
      t.call(requestDesignChanges, { milestoneId, notes: 'x' }, { as: 'peter' }),
      rejectsWith(DESIGN_CHANGES_AFTER_APPROVAL),
    );
    const plain = seedMilestoneWorld(t, { status: 'Building' });
    plain.task({ source: PORTAL_MILESTONE_TASK_SOURCE });
    await assert.rejects(
      t.call(requestDesignChanges, { milestoneId: plain.milestoneId, notes: 'x' }, { as: 'peter' }),
      rejectsWith(DESIGN_CHANGES_NEED_DESIGN),
    );
  });
});

describe('setTaskKind', () => {
  it('lets staff mark a milestone task as design, and writes nothing for the same kind', async () => {
    const t = memoryCtx();
    const { buildId } = visualWorld(t);
    const same = await t.call<{ wrote: boolean }>(setTaskKind, { taskId: buildId, kind: 'build' }, { as: 'staff' });
    assert.equal(same.wrote, false);
    const changed = await t.call<{ wrote: boolean }>(setTaskKind, { taskId: buildId, kind: 'design' }, { as: 'staff' });
    assert.equal(changed.wrote, true);
    assert.equal((t.row(buildId) as Doc<'tasks'>).kind, 'design');
  });
});
