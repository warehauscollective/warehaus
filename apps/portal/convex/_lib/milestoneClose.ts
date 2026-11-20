/**
 * Indexed, bounded read of one milestone's tasks.
 * Used only when staff set Shipped or Complete. No new index.
 */

import type { Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import { finishedMilestoneDecision, type CloseTask } from './milestoneDetails';

export const MILESTONE_CLOSE_CAP = 200;

export async function milestoneCloseGate(
  ctx: QueryCtx | MutationCtx,
  milestone: { _id: Id<'milestones'>; orgId: Id<'clients'> },
  label: 'Shipped' | 'Complete',
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const rows = await ctx.db
    .query('tasks')
    .withIndex('by_orgId_milestoneId', (q) => q.eq('orgId', milestone.orgId).eq('milestoneId', milestone._id))
    .take(MILESTONE_CLOSE_CAP + 1);
  if (rows.length > MILESTONE_CLOSE_CAP) {
    return { ok: false, reason: 'This milestone has too many tasks to close at once.' };
  }
  const tasks: CloseTask[] = rows.map((row) => ({
    stage: row.stage ?? null,
    status: row.status,
    isDone: row.isDone,
  }));
  return finishedMilestoneDecision(tasks, label);
}
