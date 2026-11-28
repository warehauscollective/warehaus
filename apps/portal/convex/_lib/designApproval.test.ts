/**
 * Approve designs: Peter records a milestone's design approval from the tile,
 * before build. Staff-only record, one Activity row, no status change.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Doc } from '../_generated/dataModel';
import type { MilestoneRoadmapView } from './milestones';
import { approveDesign, listForProject } from '../milestones';
import {
  DESIGN_APPROVAL_NEEDS_DESIGN,
  DESIGN_APPROVAL_NEEDS_DONE_DESIGN,
  DESIGN_APPROVAL_TOO_LATE,
  ONLY_PETER_DESIGNS,
  approveDesignDecision,
  designApprovalLine,
  peterMayApproveDesign,
} from './designApproval';
import { memoryCtx, type MemoryCtx } from './memoryCtx.testkit';
import { PORTAL_MILESTONE_TASK_SOURCE } from './milestoneTasks';
import { seedMilestoneWorld } from './seedRows.testkit';

type Result = { ok: true; designApprovedAt: number; already: boolean };

const rejectsWith = (text: string) => (err: Error) => String((err as { data?: unknown }).data ?? err.message).includes(text);
const doneGate = { visual: true, doneDesign: 1 };

/** A milestone with one build task and, when asked, one design task. */
function world(t: MemoryCtx, options: { status?: string; design?: 'open' | 'done' } = {}) {
  const seeded = seedMilestoneWorld(t, { status: options.status ?? 'Building' });
  const task = (fields: Record<string, unknown>) =>
    seeded.task({ source: PORTAL_MILESTONE_TASK_SOURCE, notionPageId: `${PORTAL_MILESTONE_TASK_SOURCE}:${Math.random()}`, ...fields });
  if (options.design) {
    task({
      name: 'Design the card',
      kind: 'design',
      milestoneOrder: 0,
      ...(options.design === 'done' ? { status: 'Done', isDone: true } : {}),
    });
  }
  task({ name: 'Build the card', milestoneOrder: 1 });
  return seeded;
}

/** The tile Peter is sent: the milestone as `listForProject` returns it. */
async function peterMilestoneRoadmap(t: MemoryCtx, projectId: string, milestoneId: string): Promise<MilestoneRoadmapView> {
  const views = await t.call<MilestoneRoadmapView[]>(listForProject, { projectId }, { as: 'peter' });
  const view = views.find((milestone) => milestone.id === milestoneId);
  assert.ok(view);
  return view;
}

describe('Approve designs gate', () => {
  it('shows only to Peter, before build, until he approves', () => {
    const base = { staff: true, isPeter: true, status: 'Building', gate: doneGate };
    assert.equal(peterMayApproveDesign(base), true);
    for (const status of ['Idea', 'Planning', 'Awaiting Go']) assert.equal(peterMayApproveDesign({ ...base, status }), true);
    assert.equal(peterMayApproveDesign({ ...base, isPeter: false }), false);
    assert.equal(peterMayApproveDesign({ ...base, staff: false }), false);
    for (const status of ['Ready to Ship', 'Shipped', 'Parked']) assert.equal(peterMayApproveDesign({ ...base, status }), false);
    assert.equal(peterMayApproveDesign({ ...base, designApprovedAt: 1 }), false);
  });

  it('shows only on a visual milestone with a design task done', () => {
    const base = { staff: true, isPeter: true, status: 'Building' };
    assert.equal(peterMayApproveDesign(base), false);
    assert.equal(peterMayApproveDesign({ ...base, gate: null }), false);
    assert.equal(peterMayApproveDesign({ ...base, gate: { visual: false, doneDesign: 0 } }), false);
    assert.equal(peterMayApproveDesign({ ...base, gate: { visual: true, doneDesign: 0 } }), false);
    assert.equal(peterMayApproveDesign({ ...base, gate: { visual: true, doneDesign: 2 } }), true);
  });

  it('keeps the first approval and refuses after build', () => {
    assert.deepEqual(approveDesignDecision({ status: 'Planning', gate: doneGate }), { ok: true, already: false });
    assert.deepEqual(approveDesignDecision({ status: 'Planning', designApprovedAt: 5 }), { ok: true, already: true });
    assert.deepEqual(approveDesignDecision({ status: 'Ready to Ship', gate: doneGate }), {
      ok: false,
      reason: DESIGN_APPROVAL_TOO_LATE,
    });
  });

  it('refuses with a plain reason until a design task is done', () => {
    assert.deepEqual(approveDesignDecision({ status: 'Building' }), { ok: false, reason: DESIGN_APPROVAL_NEEDS_DESIGN });
    assert.deepEqual(approveDesignDecision({ status: 'Building', gate: { visual: false, doneDesign: 0 } }), {
      ok: false,
      reason: DESIGN_APPROVAL_NEEDS_DESIGN,
    });
    assert.deepEqual(approveDesignDecision({ status: 'Building', gate: { visual: true, doneDesign: 0 } }), {
      ok: false,
      reason: DESIGN_APPROVAL_NEEDS_DONE_DESIGN,
    });
  });

  it('gives the runner one line once approved, and nothing before', () => {
    assert.equal(designApprovalLine(undefined), '');
    assert.equal(
      designApprovalLine(Date.UTC(2026, 10, 25, 18)),
      'Design: approved by Peter in the Portal on 2026-11-25. Build tasks can go ahead.',
    );
  });
});

describe('approveDesign', () => {
  it('saves Peter and the time, writes one staff Activity row, and leaves status alone', async () => {
    const t = memoryCtx();
    const { milestoneId } = world(t, { design: 'done' });
    const result = await t.call<Result>(approveDesign, { milestoneId }, { as: 'peter' });
    assert.equal(result.ok, true);
    assert.equal(result.already, false);
    const row = t.row(milestoneId) as Doc<'milestones'>;
    assert.equal(row.designApprovedAt, result.designApprovedAt);
    assert.ok(row.designApproverContactId);
    assert.equal(row.status, 'Building');
    assert.equal(row.approval, 'unreviewed');
    const activity = t.rows('activity').filter((a) => a.milestoneId === milestoneId);
    assert.deepEqual(activity.map((a) => [a.type, a.summary]), [['milestone.design_approved', 'Designs approved by Peter']]);

    const again = await t.call<Result>(approveDesign, { milestoneId }, { as: 'peter' });
    assert.deepEqual([again.already, again.designApprovedAt], [true, result.designApprovedAt]);
    assert.equal(t.rows('activity').filter((a) => a.milestoneId === milestoneId).length, 1);
  });

  it('refuses other staff and a milestone past build, writing nothing', async () => {
    const t = memoryCtx();
    const { milestoneId } = world(t, { status: 'Planning', design: 'done' });
    await assert.rejects(t.call(approveDesign, { milestoneId }, { as: 'staff' }), rejectsWith(ONLY_PETER_DESIGNS));
    assert.equal((t.row(milestoneId) as Doc<'milestones'>).designApprovedAt, undefined);

    const late = world(t, { status: 'Ready to Ship', design: 'done' });
    await assert.rejects(
      t.call(approveDesign, { milestoneId: late.milestoneId }, { as: 'peter' }),
      rejectsWith(DESIGN_APPROVAL_TOO_LATE),
    );
    assert.equal(t.rows('activity').length, 0);
  });
});

describe('Approve designs waits for a done design task', () => {
  it('gives no button and refuses the mutation on a milestone with no design task', async () => {
    const t = memoryCtx();
    const { milestoneId, projectId } = world(t);
    const tile = await peterMilestoneRoadmap(t, projectId, milestoneId);
    assert.deepEqual(tile.designGate, { visual: false, buildLocked: false, phase: 'build', doneDesign: 0 });
    assert.equal(peterMayApproveDesign({ staff: true, isPeter: true, status: tile.status, gate: tile.designGate }), false);

    await assert.rejects(t.call(approveDesign, { milestoneId }, { as: 'peter' }), rejectsWith(DESIGN_APPROVAL_NEEDS_DESIGN));
    assert.equal((t.row(milestoneId) as Doc<'milestones'>).designApprovedAt, undefined);
    assert.equal(t.rows('activity').length, 0);
  });

  it('gives no button and refuses the mutation while the design task is open', async () => {
    const t = memoryCtx();
    const { milestoneId, projectId } = world(t, { design: 'open' });
    const tile = await peterMilestoneRoadmap(t, projectId, milestoneId);
    assert.deepEqual(tile.designGate, { visual: true, buildLocked: true, phase: 'designs', doneDesign: 0 });
    assert.equal(peterMayApproveDesign({ staff: true, isPeter: true, status: tile.status, gate: tile.designGate }), false);

    await assert.rejects(
      t.call(approveDesign, { milestoneId }, { as: 'peter' }),
      rejectsWith(DESIGN_APPROVAL_NEEDS_DONE_DESIGN),
    );
    assert.equal((t.row(milestoneId) as Doc<'milestones'>).designApprovedAt, undefined);
  });

  it('gives the button and accepts the mutation once a design task is done', async () => {
    const t = memoryCtx();
    const { milestoneId, projectId } = world(t, { design: 'done' });
    const tile = await peterMilestoneRoadmap(t, projectId, milestoneId);
    assert.deepEqual(tile.designGate, { visual: true, buildLocked: true, phase: 'design-approval', doneDesign: 1 });
    assert.equal(peterMayApproveDesign({ staff: true, isPeter: true, status: tile.status, gate: tile.designGate }), true);

    const result = await t.call<Result>(approveDesign, { milestoneId }, { as: 'peter' });
    assert.equal(result.already, false);
    const after = await peterMilestoneRoadmap(t, projectId, milestoneId);
    assert.equal(peterMayApproveDesign({ staff: true, isPeter: true, status: after.status, designApprovedAt: after.designApprovedAt, gate: after.designGate }), false);
  });
});
