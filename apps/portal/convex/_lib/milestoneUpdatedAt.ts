/**
 * Milestone `updatedAt` is the last real write. Absent on older rows.
 * It is not creation time, and nothing backfills it.
 *
 * Linear task sync is a live read. It does not write Convex task rows, so
 * there is no Linear task document to stamp. Notion pulls and every Convex
 * task create, update, and archive call `stampParentMilestone`.
 */

import type { Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';

export function displayUpdatedAt(
  stored: number | null | undefined,
  loaded: readonly (number | null | undefined)[],
): number | null {
  if (typeof stored === 'number' && Number.isFinite(stored)) return stored;
  let best: number | null = null;
  for (const value of loaded) {
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    if (best == null || value > best) best = value;
  }
  return best;
}

/** Spread onto a milestone patch so the write records `updatedAt`. */
export function touched<T extends object>(patch: T, now = Date.now()): T & { updatedAt: number } {
  return { ...patch, updatedAt: now };
}

type StampTask = {
  milestoneId?: Id<'milestones'> | string | null;
  parentTaskId?: Id<'tasks'> | string | null;
};

/**
 * One patch, and only the milestone this task belongs to.
 * A nested task with no milestone of its own uses its parent task's milestone.
 * A task with neither is left alone. This does not scan and does not write the task.
 */
export async function stampParentMilestone(
  ctx: Pick<MutationCtx, 'db'>,
  task: StampTask,
  now: number,
): Promise<void> {
  let milestoneId = task.milestoneId ?? null;
  if (!milestoneId && task.parentTaskId) {
    const parent = await ctx.db.get(task.parentTaskId as Id<'tasks'>);
    milestoneId = parent?.milestoneId ?? null;
  }
  if (!milestoneId) return;
  await ctx.db.patch(milestoneId as Id<'milestones'>, { updatedAt: now });
}
