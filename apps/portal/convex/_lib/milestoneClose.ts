/**
 * Indexed, bounded read of the tasks a milestone close looks at.
 * Same set the roadmap shows, including subtasks that have no milestoneId.
 * Used when staff set Shipped and when a merge would ship. No new index.
 */

import type { Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import { closeTasksForMilestone, finishedMilestoneDecision, type CloseSource } from './milestoneDetails';

export const MILESTONE_CLOSE_CAP = 200;
const TOO_MANY = 'This milestone has too many tasks to close at once.';

export async function milestoneCloseGate(
  ctx: QueryCtx | MutationCtx,
  milestone: { _id: Id<'milestones'>; orgId: Id<'clients'> },
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const linked = await ctx.db
    .query('tasks')
    .withIndex('by_orgId_milestoneId', (q) => q.eq('orgId', milestone.orgId).eq('milestoneId', milestone._id))
    .take(MILESTONE_CLOSE_CAP + 1);
  if (linked.length > MILESTONE_CLOSE_CAP) return { ok: false, reason: TOO_MANY };

  const byId = new Map<string, CloseSource>();
  for (const row of linked) byId.set(row._id, toCloseSource(row));
  const linkedIds = new Set(linked.map((row) => row._id as string));
  const parents = linked.filter((row) => !row.parentTaskId || !linkedIds.has(row.parentTaskId));
  for (const parent of parents) {
    const children = await ctx.db
      .query('tasks')
      .withIndex('by_parentTaskId', (q) => q.eq('parentTaskId', parent._id))
      .take(MILESTONE_CLOSE_CAP + 1);
    if (children.length > MILESTONE_CLOSE_CAP) return { ok: false, reason: TOO_MANY };
    for (const child of children) {
      if (child.orgId !== milestone.orgId) continue;
      if (!byId.has(child._id)) byId.set(child._id, toCloseSource(child));
    }
  }
  const counted = closeTasksForMilestone(milestone._id, [...byId.values()]);
  if (counted.length > MILESTONE_CLOSE_CAP) return { ok: false, reason: TOO_MANY };
  return finishedMilestoneDecision(counted);
}

function toCloseSource(row: {
  _id: string;
  parentTaskId?: string;
  milestoneId?: string;
  stage?: string | null;
  status: string;
  isDone: boolean;
  archivedAt?: number;
}): CloseSource {
  return {
    id: row._id,
    parentTaskId: row.parentTaskId ?? null,
    milestoneId: row.milestoneId ?? null,
    stage: row.stage ?? null,
    status: row.status,
    isDone: row.isDone,
    archived: row.archivedAt != null,
  };
}
