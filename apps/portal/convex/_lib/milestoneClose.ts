/**
 * Indexed, bounded read of the tasks a milestone close looks at.
 * Same set the roadmap shows, including subtasks that have no milestoneId.
 * Used when staff set Shipped, when a merge would ship, and by Mark complete
 * and Archive. No new index.
 */

import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import { isOpenCloseTask } from './closeout';
import { closeTasksForMilestone, finishedMilestoneDecision, type CloseSource } from './milestoneDetails';

export const MILESTONE_CLOSE_CAP = 200;
const TOO_MANY = 'This milestone has too many tasks to close at once.';

/** Tasks linked to the milestone, plus the subtasks of each row. Capped. */
export async function milestoneCloseTasks(
  ctx: QueryCtx | MutationCtx,
  milestone: { _id: Id<'milestones'>; orgId: Id<'clients'> },
): Promise<{ ok: true; tasks: Doc<'tasks'>[] } | { ok: false; reason: string }> {
  const linked = await ctx.db
    .query('tasks')
    .withIndex('by_orgId_milestoneId', (q) => q.eq('orgId', milestone.orgId).eq('milestoneId', milestone._id))
    .take(MILESTONE_CLOSE_CAP + 1);
  if (linked.length > MILESTONE_CLOSE_CAP) return { ok: false, reason: TOO_MANY };

  const byId = new Map<string, Doc<'tasks'>>();
  for (const row of linked) byId.set(row._id, row);
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
      if (!byId.has(child._id)) byId.set(child._id, child);
    }
  }
  if (byId.size > MILESTONE_CLOSE_CAP) return { ok: false, reason: TOO_MANY };
  return { ok: true, tasks: [...byId.values()] };
}

/** `open` is the number of tasks still open. It is set whenever the tasks could be read. */
export async function milestoneCloseGate(
  ctx: QueryCtx | MutationCtx,
  milestone: { _id: Id<'milestones'>; orgId: Id<'clients'> },
): Promise<{ ok: true } | { ok: false; reason: string; open?: number }> {
  const loaded = await milestoneCloseTasks(ctx, milestone);
  if (!loaded.ok) return loaded;
  const counted = closeTasksForMilestone(milestone._id, loaded.tasks.map(toCloseSource));
  if (counted.length > MILESTONE_CLOSE_CAP) return { ok: false, reason: TOO_MANY };
  const decision = finishedMilestoneDecision(counted);
  if (decision.ok) return decision;
  return { ...decision, open: counted.filter(isOpenCloseTask).length };
}

export function toCloseSource(row: {
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
