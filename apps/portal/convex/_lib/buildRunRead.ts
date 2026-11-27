import type { Doc } from '../_generated/dataModel';
import type { QueryCtx } from '../_generated/server';
import { buildRunFactsForAudience, type BuildRunFacts } from './buildRun';
import { isBlockedTask } from './milestoneTasks';

/**
 * The Building indicator's facts for one milestone, already cut down for the
 * audience. The one place a roadmap view reads agentRuns: one indexed read
 * for a running run, only while the milestone is Building. A client gets
 * whether a run is going and nothing else (decision 0012); never the run row,
 * its reason, or the blocked flag.
 */
export async function milestoneBuildRun(
  ctx: QueryCtx,
  milestone: Doc<'milestones'>,
  tasks: readonly Doc<'tasks'>[],
  audience: 'staff' | 'client',
): Promise<BuildRunFacts | undefined> {
  if (milestone.status !== 'Building') return undefined;
  const run = await ctx.db
    .query('agentRuns')
    .withIndex('by_milestone_status', (q) => q.eq('milestoneId', milestone._id).eq('status', 'running'))
    .first();
  const facts: BuildRunFacts = {
    running: run != null,
    ...(run?.aliveAt != null ? { aliveAt: run.aliveAt } : {}),
    ...(run?.kind === 'task' && run.taskId ? { taskId: run.taskId } : {}),
    blocked: tasks.some((task) => task.milestoneId === milestone._id && isBlockedTask(task)),
  };
  return buildRunFactsForAudience(facts, audience);
}
