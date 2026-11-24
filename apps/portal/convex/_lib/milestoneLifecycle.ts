/**
 * Status change (see GLOSSARY.md, ADR-0001 amendment 2026-11-24). The one
 * writer of a milestone's Status. It decides the move, checks the Shipped
 * gate itself from the milestone task set, writes the status and one
 * activity row, and runs what each status asks for on the way in and out.
 * No caller tells it the tasks are ready.
 *
 * Causes:
 * - `set`: a person, the staff API or AI names a status. Shipped needs the
 *   task set's `canShip`.
 * - `advance`: the play button. One step, never Shipped.
 * - `complete`: Mark complete, after its leftover writes, and an undo back to
 *   Shipped. Needs no open task; an empty milestone may complete.
 * - `merge`: a merged pull request. Ships only when `canShip`.
 * - `request_changes`: a review asking for changes. Ready to Ship to Building.
 *
 * Effects:
 * - Entering Ready to Ship from an earlier status: store the local preview
 *   link if missing, close the old approval note, write Peter's approval
 *   note, add a feed line. Coming back from Shipped is a reopen: none of it.
 * - Leaving Ready to Ship: close the open approval note.
 * - Entering Planning: queue planning. Leaving it: drop a queued plan.
 */

import type { Doc } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import { queuePlanning } from '../planningQueue';
import { LOCAL_PREVIEW_DEFAULT, approvalNote, eventType, milestoneBranch } from './agentRun';
import { detailActivitySummary } from './milestoneDetails';
import { currentIteration } from './milestoneReview';
import { writeMilestoneActivity } from './milestones';
import { SHIPPED_NEEDS_DONE, STATUS_ACTIVITY, transitionMilestone, type MilestoneStatus, type TransitionFailure } from './milestoneStatus';
import { loadMilestoneTaskSet } from './milestoneTaskSet';

export type StatusChangeCause = 'set' | 'advance' | 'complete' | 'merge' | 'request_changes';

export type StatusChangeInput = {
  cause: StatusChangeCause;
  /** Required for `set`. Optional check for `advance`. */
  to?: string | null;
  /** The status the caller last saw. */
  expected?: string | null;
  /** AI is locked out of an approved milestone and never sets Shipped. */
  actor?: 'human' | 'ai';
  /** Name on the activity row and the notes, such as "Peter", "Staff API", "Runner studio-mini", "GitHub". */
  actorName: string;
  /** Who a note is from, when it differs from the name, such as `runner:studio-mini`. */
  noteAuthor?: string;
  at: number;
  /** The feed line on entering Ready to Ship. Default: "Moved to Ready to Ship by {actorName}". */
  readyLine?: string;
  /** The pull request for Peter's note, when the caller knows a newer one than the milestone. */
  prUrl?: string | null;
  /** A feed line only this cause knows, such as the merged pull request. */
  event?: { type: string; summary: string; key?: string };
};

export type StatusChange =
  | { ok: true; from: MilestoneStatus; status: MilestoneStatus; wrote: boolean }
  | { ok: false; reason: string; code: TransitionFailure; open?: number };

const TRANSITION_CAUSE = {
  set: 'set',
  advance: 'advance',
  complete: 'set',
  merge: 'merge',
  request_changes: 'request_changes',
} as const;

/** The Shipped gate for this cause, from the task set. Null when it passes. */
async function shippedGate(
  ctx: MutationCtx,
  milestone: Doc<'milestones'>,
  cause: StatusChangeCause,
): Promise<{ reason: string; open?: number } | null> {
  const loaded = await loadMilestoneTaskSet(ctx, milestone);
  if (!loaded.ok) return { reason: loaded.reason };
  if (cause === 'complete') {
    const open = loaded.set.open.length;
    return open === 0 ? null : { reason: SHIPPED_NEEDS_DONE, open };
  }
  const ship = loaded.set.canShip;
  return ship.ok ? null : { reason: ship.reason, open: ship.open };
}

async function closeApprovalNotes(ctx: MutationCtx, milestone: Doc<'milestones'>) {
  const open = await ctx.db
    .query('milestoneNotes')
    .withIndex('by_milestone_needsPeter', (q) => q.eq('milestoneId', milestone._id).eq('needsPeter', 'open'))
    .take(20);
  for (const note of open) {
    if (note.reason === 'approval') await ctx.db.patch(note._id, { needsPeter: undefined });
  }
}

function openCountLine(open: number): string | null {
  if (open <= 0) return null;
  return `Heads up: ${open === 1 ? '1 task is' : `${open} tasks are`} still open.`;
}

async function enterReadyToShip(ctx: MutationCtx, milestone: Doc<'milestones'>, input: StatusChangeInput) {
  const localPreviewUrl = milestone.localPreviewUrl ?? LOCAL_PREVIEW_DEFAULT;
  if (!milestone.localPreviewUrl) await ctx.db.patch(milestone._id, { localPreviewUrl });
  await closeApprovalNotes(ctx, milestone);
  const loaded = await loadMilestoneTaskSet(ctx, milestone);
  const open = loaded.ok ? loaded.set.open.length : 0;
  const body = approvalNote({
    milestoneName: milestone.name,
    iteration: currentIteration(milestone.iteration),
    branch: milestone.branch ?? milestoneBranch(milestone.name),
    prUrl: input.prUrl ?? milestone.prUrl ?? null,
    prNumber: milestone.previewPrNumber ?? null,
    localPreviewUrl,
  });
  const heads = openCountLine(open);
  await ctx.db.insert('milestoneNotes', {
    orgId: milestone.orgId,
    milestoneId: milestone._id,
    body: heads ? `${body}\n${heads}` : body,
    addedBy: input.noteAuthor ?? input.actorName,
    createdAt: input.at,
    needsPeter: 'open',
    reason: 'approval',
  });
  await ctx.db.insert('agentEvents', {
    orgId: milestone.orgId,
    milestoneId: milestone._id,
    type: eventType('ready'),
    summary: input.readyLine ?? `Moved to Ready to Ship by ${input.actorName}`,
    at: input.at + 1,
  });
}

/**
 * Change a milestone's Status. `wrote: false` means nothing changed and
 * nothing was written. A refusal writes nothing.
 */
export async function changeMilestoneStatus(
  ctx: MutationCtx,
  milestone: Doc<'milestones'>,
  input: StatusChangeInput,
): Promise<StatusChange> {
  // The gate is checked below, from the task set. Here only the move itself is decided.
  const moved = transitionMilestone({
    from: milestone.status,
    cause: TRANSITION_CAUSE[input.cause],
    to: input.cause === 'complete' ? 'Shipped' : input.to,
    expected: input.expected,
    actor: input.actor,
    approval: milestone.approval,
    tasksReady: true,
  });
  if (!moved.ok) return moved;
  if (!moved.wrote) return moved;
  if (moved.status === 'Shipped') {
    const refused = await shippedGate(ctx, milestone, input.cause);
    if (refused) return { ok: false, code: 'shipped', ...refused };
  }

  const from = moved.from;
  const to = moved.status;
  await ctx.db.patch(milestone._id, { status: to });
  await writeMilestoneActivity(
    ctx as unknown as Parameters<typeof writeMilestoneActivity>[0],
    milestone,
    STATUS_ACTIVITY,
    input.at,
    detailActivitySummary({ actor: input.actorName, from, to, at: input.at }),
  );

  const current = (await ctx.db.get(milestone._id)) ?? { ...milestone, status: to };
  if (from === 'Ready to Ship') await closeApprovalNotes(ctx, current);
  if (to === 'Ready to Ship' && from !== 'Shipped') await enterReadyToShip(ctx, current, input);
  if (to === 'Planning') await queuePlanning(ctx, current);
  else if (current.planning === 'queued') {
    await ctx.db.patch(current._id, { planning: undefined, planningReplace: undefined });
  }
  if (input.event) {
    await ctx.db.insert('agentEvents', {
      orgId: milestone.orgId,
      milestoneId: milestone._id,
      type: eventType(input.event.type),
      summary: input.event.summary,
      ...(input.event.key ? { key: input.event.key } : {}),
      at: input.at,
    });
  }
  return moved;
}
