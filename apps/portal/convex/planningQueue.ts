/**
 * Queues one planning run when a milestone enters Planning with no tasks.
 * Idempotent per milestone and iteration. Indexed, bounded reads only.
 */

import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';
import {
  PLANNING_RATE_SCAN,
  planningEnqueueDecision,
  recentPlanningRuns,
} from './_lib/agentRun';
import { currentIteration } from './_lib/milestoneReview';

const TASK_SCAN = 100;

export async function liveTaskCount(ctx: MutationCtx, milestone: Doc<'milestones'>): Promise<number> {
  const tasks = await ctx.db
    .query('tasks')
    .withIndex('by_orgId_milestoneId', (q) => q.eq('orgId', milestone.orgId).eq('milestoneId', milestone._id))
    .take(TASK_SCAN);
  return tasks.filter((task) => task.archivedAt == null).length;
}

export async function planningRunsInWindow(ctx: MutationCtx, milestoneId: Id<'milestones'>, now: number): Promise<number> {
  const runs = await ctx.db
    .query('agentRuns')
    .withIndex('by_milestone', (q) => q.eq('milestoneId', milestoneId))
    .order('desc')
    .take(PLANNING_RATE_SCAN);
  return recentPlanningRuns(runs, now);
}

/**
 * Enqueues a planning run, or writes nothing when one is already queued for
 * this iteration, tasks already exist, or the hourly cap is spent.
 */
export async function queuePlanning(
  ctx: MutationCtx,
  milestone: Doc<'milestones'>,
  options?: { regenerate?: boolean; now?: number },
): Promise<{ enqueued: boolean; reason?: string }> {
  const now = options?.now ?? Date.now();
  const iteration = currentIteration(milestone.iteration);
  const decision = planningEnqueueDecision({
    status: milestone.status,
    taskCount: await liveTaskCount(ctx, milestone),
    planning: milestone.planning ?? null,
    planningIteration: milestone.planningIteration ?? null,
    iteration,
    regenerate: options?.regenerate === true,
    recentRuns: await planningRunsInWindow(ctx, milestone._id, now),
  });
  if (!decision.enqueue) return { enqueued: false, ...(decision.reason ? { reason: decision.reason } : {}) };
  await ctx.db.patch(milestone._id, {
    planning: 'queued',
    planningIteration: iteration,
    planningBlockedReason: undefined,
    ...(decision.replace ? { planningReplace: true } : { planningReplace: undefined }),
  });
  return { enqueued: true };
}
