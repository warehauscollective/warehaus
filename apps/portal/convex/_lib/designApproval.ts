/**
 * Approve designs: Peter records that a milestone's design is approved, from
 * the tile, before build. It is a record, not a gate: the runner is told, and
 * a milestone with no design work still runs.
 */
import type { MilestoneStatus } from './milestoneStatus';

/** Statuses where the design can still be approved. Review and ship come after build. */
export const DESIGN_APPROVAL_STATUSES: readonly MilestoneStatus[] = ['Idea', 'Planning', 'Awaiting Go', 'Building'];

export const DESIGN_APPROVAL_TOO_LATE = 'Designs are approved before build. This milestone is past that.';
export const ONLY_PETER_DESIGNS = 'Only Peter can approve designs';

/** Approve designs on the tile. Peter only, before build, until he has approved. */
export function peterMayApproveDesign(input: {
  staff: boolean;
  isPeter: boolean;
  status: string;
  designApprovedAt?: number | null;
}): boolean {
  return Boolean(
    input.staff &&
      input.isPeter &&
      (DESIGN_APPROVAL_STATUSES as readonly string[]).includes(input.status) &&
      !input.designApprovedAt,
  );
}

/** What an Approve designs press does. A second press keeps the first approval. */
export function approveDesignDecision(input: {
  status: string;
  designApprovedAt?: number | null;
}): { ok: true; already: boolean } | { ok: false; reason: string } {
  if (input.designApprovedAt) return { ok: true, already: true };
  if (!(DESIGN_APPROVAL_STATUSES as readonly string[]).includes(input.status)) {
    return { ok: false, reason: DESIGN_APPROVAL_TOO_LATE };
  }
  return { ok: true, already: false };
}

/** The line the runner's task prompt carries once the design is approved. Empty before that. */
export function designApprovalLine(designApprovedAt?: number | null): string {
  if (!designApprovedAt) return '';
  const day = new Date(designApprovedAt).toISOString().slice(0, 10);
  return `Design: approved by Peter in the Portal on ${day}. Build tasks can go ahead.`;
}
