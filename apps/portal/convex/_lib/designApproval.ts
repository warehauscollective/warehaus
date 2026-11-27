/**
 * Approve designs and Request design changes: Peter's two answers to the
 * design gate (`designGate.ts`). On a visual milestone the approval unlocks
 * the build tasks. A milestone with no design task is not held, and an
 * approval there is only recorded and told to the runner.
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

export const ONLY_PETER_DESIGN_CHANGES = 'Only Peter can request design changes';
export const DESIGN_CHANGES_NEED_NOTES = 'Say what needs to change in the designs.';
export const DESIGN_CHANGES_AFTER_APPROVAL = 'The designs are already approved.';
export const DESIGN_CHANGES_NEED_DESIGN = 'This milestone has no design tasks.';
export const DESIGN_CHANGE_TASK_LIMIT = 10;
const TITLE_MAX = 200;

export type DesignChangeDraft = { name: string; description: string };

function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`;
}

/**
 * What Request design changes adds: one design task per line Peter wrote, or
 * one task from his notes. Each says which design tasks it revises. Build
 * stays locked because the designs stay unapproved. Pure.
 */
export function requestDesignChangesDecision(input: {
  status: string;
  designApprovedAt?: number | null;
  visual: boolean;
  notes: string;
  revises: readonly string[];
  newTasks?: readonly string[];
}): { ok: true; drafts: DesignChangeDraft[] } | { ok: false; reason: string } {
  if (!(DESIGN_APPROVAL_STATUSES as readonly string[]).includes(input.status)) {
    return { ok: false, reason: DESIGN_APPROVAL_TOO_LATE };
  }
  if (input.designApprovedAt) return { ok: false, reason: DESIGN_CHANGES_AFTER_APPROVAL };
  if (!input.visual) return { ok: false, reason: DESIGN_CHANGES_NEED_DESIGN };
  const notes = input.notes.trim();
  if (!notes) return { ok: false, reason: DESIGN_CHANGES_NEED_NOTES };
  const revises = input.revises.length > 0 ? `\n\nRevises: ${input.revises.join(', ')}.` : '';
  const lines = (input.newTasks ?? []).map((line) => line.trim()).filter(Boolean).slice(0, DESIGN_CHANGE_TASK_LIMIT);
  const description = `Design changes Peter asked for:\n${notes}${revises}`;
  const drafts =
    lines.length > 0
      ? lines.map((line) => ({ name: clip(line, TITLE_MAX), description }))
      : [{ name: clip(`Design changes: ${notes}`, TITLE_MAX), description }];
  return { ok: true, drafts };
}
