/**
 * Asks (see GLOSSARY.md, ADR-0006 multi-platform point 11). An Ask is a
 * milestone note that waits on one named staff member: an approval request or
 * a blocked task. `open` is set while it waits and cleared when it is
 * answered. `waitingOn` stays, so an answered Ask still says who it waited on.
 *
 * Approval Asks go to Peter, the only approver. Blocked Asks default to Peter
 * until milestones or tasks have an owner.
 *
 * Every read here is indexed and bounded.
 */

import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import { PETER_EMAILS } from './milestoneReview';

export type AskReason = 'approval' | 'blocked';

/** Open Asks a single read returns. */
export const OPEN_ASK_LIMIT = 20;

/** Open Asks read for one milestone. A milestone holds a handful at most. */
const MILESTONE_ASK_LIMIT = 20;

/** Peter's staff contact, or null when this deployment has none. Two indexed reads at most. */
export async function peterContactId(ctx: QueryCtx): Promise<Id<'contacts'> | null> {
  for (const email of PETER_EMAILS) {
    const contact = await ctx.db
      .query('contacts')
      .withIndex('by_email', (q) => q.eq('email', email))
      .unique();
    if (contact && contact.role === 'Warehaus Staff') return contact._id;
  }
  return null;
}

/**
 * Writes one open Ask on a milestone. With no `waitingOn` it waits on Peter.
 * A deployment with no Peter contact still gets the Ask, waiting on no one,
 * so a blocked task is never silent; it shows in the unfiltered open list.
 */
export async function openAsk(
  ctx: MutationCtx,
  milestone: Doc<'milestones'>,
  input: {
    reason: AskReason;
    body: string;
    addedBy: string;
    at: number;
    taskId?: Id<'tasks'>;
    waitingOn?: Id<'contacts'>;
  },
): Promise<Id<'milestoneNotes'>> {
  const waitingOn = input.waitingOn ?? (await peterContactId(ctx));
  return ctx.db.insert('milestoneNotes', {
    orgId: milestone.orgId,
    milestoneId: milestone._id,
    body: input.body,
    addedBy: input.addedBy,
    createdAt: input.at,
    open: true,
    reason: input.reason,
    ...(waitingOn ? { waitingOn } : {}),
    ...(input.taskId ? { taskId: input.taskId } : {}),
  });
}

/** The open Asks on one milestone, whoever they wait on. */
export async function openAsksOnMilestone(ctx: QueryCtx, milestoneId: Id<'milestones'>): Promise<Doc<'milestoneNotes'>[]> {
  return ctx.db
    .query('milestoneNotes')
    .withIndex('by_milestone_open', (q) => q.eq('milestoneId', milestoneId).eq('open', true))
    .take(MILESTONE_ASK_LIMIT);
}

/** Marks an Ask answered. It leaves the open lists and keeps who it waited on. */
export async function closeAsk(ctx: MutationCtx, ask: Doc<'milestoneNotes'>): Promise<void> {
  if (ask.open !== true) return;
  await ctx.db.patch(ask._id, { open: undefined });
}

/** Closes the open Asks on a milestone that `match` picks. Returns how many. */
export async function closeAsksOnMilestone(
  ctx: MutationCtx,
  milestoneId: Id<'milestones'>,
  match: (ask: Doc<'milestoneNotes'>) => boolean,
): Promise<number> {
  let closed = 0;
  for (const ask of await openAsksOnMilestone(ctx, milestoneId)) {
    if (!match(ask)) continue;
    await closeAsk(ctx, ask);
    closed += 1;
  }
  return closed;
}

/**
 * Open Asks across milestones, newest first. With `waitingOn`, only the Asks
 * waiting on that person. One indexed read, at most `limit` rows.
 */
export async function openAsks(
  ctx: QueryCtx,
  input: { waitingOn?: Id<'contacts'>; limit?: number } = {},
): Promise<Doc<'milestoneNotes'>[]> {
  const limit = Math.max(1, Math.min(input.limit ?? OPEN_ASK_LIMIT, 100));
  const waitingOn = input.waitingOn;
  if (waitingOn) {
    return ctx.db
      .query('milestoneNotes')
      .withIndex('by_waitingOn_open', (q) => q.eq('waitingOn', waitingOn).eq('open', true))
      .order('desc')
      .take(limit);
  }
  return ctx.db
    .query('milestoneNotes')
    .withIndex('by_open', (q) => q.eq('open', true))
    .order('desc')
    .take(limit);
}
