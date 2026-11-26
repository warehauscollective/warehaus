/**
 * Approve designs: Peter records a milestone's design approval from the tile,
 * before build. Staff-only record, one Activity row, no status change.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Doc } from '../_generated/dataModel';
import { approveDesign } from '../milestones';
import {
  DESIGN_APPROVAL_TOO_LATE,
  ONLY_PETER_DESIGNS,
  approveDesignDecision,
  designApprovalLine,
  peterMayApproveDesign,
} from './designApproval';
import { memoryCtx } from './memoryCtx.testkit';
import { seedMilestoneWorld } from './seedRows.testkit';

type Result = { ok: true; designApprovedAt: number; already: boolean };

describe('Approve designs gate', () => {
  it('shows only to Peter, before build, until he approves', () => {
    const base = { staff: true, isPeter: true, status: 'Building' };
    assert.equal(peterMayApproveDesign(base), true);
    for (const status of ['Idea', 'Planning', 'Awaiting Go']) assert.equal(peterMayApproveDesign({ ...base, status }), true);
    assert.equal(peterMayApproveDesign({ ...base, isPeter: false }), false);
    assert.equal(peterMayApproveDesign({ ...base, staff: false }), false);
    for (const status of ['Ready to Ship', 'Shipped', 'Parked']) assert.equal(peterMayApproveDesign({ ...base, status }), false);
    assert.equal(peterMayApproveDesign({ ...base, designApprovedAt: 1 }), false);
  });

  it('keeps the first approval and refuses after build', () => {
    assert.deepEqual(approveDesignDecision({ status: 'Planning' }), { ok: true, already: false });
    assert.deepEqual(approveDesignDecision({ status: 'Planning', designApprovedAt: 5 }), { ok: true, already: true });
    assert.deepEqual(approveDesignDecision({ status: 'Ready to Ship' }), { ok: false, reason: DESIGN_APPROVAL_TOO_LATE });
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
    const { milestoneId } = seedMilestoneWorld(t, { status: 'Building' });
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
    const { milestoneId } = seedMilestoneWorld(t, { status: 'Planning' });
    await assert.rejects(t.call(approveDesign, { milestoneId }, { as: 'staff' }), (err: Error) =>
      String((err as { data?: unknown }).data ?? err.message).includes(ONLY_PETER_DESIGNS),
    );
    assert.equal((t.row(milestoneId) as Doc<'milestones'>).designApprovedAt, undefined);

    const late = seedMilestoneWorld(t, { status: 'Ready to Ship' });
    await assert.rejects(t.call(approveDesign, { milestoneId: late.milestoneId }, { as: 'peter' }), (err: Error) =>
      String((err as { data?: unknown }).data ?? err.message).includes(DESIGN_APPROVAL_TOO_LATE),
    );
    assert.equal(t.rows('activity').length, 0);
  });
});
