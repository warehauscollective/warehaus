/**
 * Portal-only milestone on a task created through the outbox.
 * Notion properties never include this id. The task row gets it here, once.
 */

import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import { nextMilestoneOrder, taskLinkPatch } from './milestones';

export function milestoneIdFromPayload(payload: string): string | null {
  try {
    const parsed = JSON.parse(payload) as { milestoneId?: unknown };
    return typeof parsed.milestoneId === 'string' && parsed.milestoneId.length > 0 ? parsed.milestoneId : null;
  } catch {
    return null;
  }
}

type TaskLinkRow = {
  _id: string;
  orgId: string;
  projectId: string;
  parentTaskId?: string | null;
  milestoneId?: string | null;
};

type MilestoneLinkRow = {
  _id: string;
  orgId: string;
  projectId: string;
};

/** Patch for a top-level task on the same project. An existing link is left alone. */
export function createdTaskMilestonePatch(input: {
  task: TaskLinkRow;
  milestone: MilestoneLinkRow | null;
  orders: readonly (number | null | undefined)[];
}): { milestoneId: string; milestoneOrder: number } | null {
  const { task, milestone } = input;
  if (!milestone) return null;
  if (task.milestoneId) return null;
  if (task.parentTaskId) return null;
  if (task.orgId !== milestone.orgId || task.projectId !== milestone.projectId) return null;
  return taskLinkPatch(milestone._id, nextMilestoneOrder(input.orders));
}

export async function linkTaskToCreateMilestone(
  ctx: MutationCtx,
  task: Doc<'tasks'>,
  milestoneId: string,
): Promise<boolean> {
  const milestone = await ctx.db.get(milestoneId as Id<'milestones'>);
  if (!milestone) return false;
  if (!createdTaskMilestonePatch({ task, milestone, orders: [] })) return false;
  const siblings = await ctx.db
    .query('tasks')
    .withIndex('by_orgId_milestoneId', (q) => q.eq('orgId', milestone.orgId).eq('milestoneId', milestone._id))
    .collect();
  const patch = createdTaskMilestonePatch({
    task,
    milestone,
    orders: siblings.map((row) => row.milestoneOrder),
  });
  if (!patch) return false;
  await ctx.db.patch(task._id, { milestoneId: milestone._id, milestoneOrder: patch.milestoneOrder });
  return true;
}
