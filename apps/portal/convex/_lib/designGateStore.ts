/**
 * Keeps the Approve designs Ask in step with the design gate. Called after
 * anything that can finish a design task or settle the designs: a runner
 * finishing a task, a staff task change, Approve designs and Request design
 * changes. At most one design Ask is open per milestone.
 */

import type { Doc } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import { closeAsk, openAsk, openAsksOnMilestone } from './askStore';
import { designAskBody, designAskDue, designGate, taskKind, type GateRow, type TaskKind } from './designGate';
import { loadMilestoneTaskSet } from './milestoneTaskSet';

export async function syncDesignAsk(
  ctx: MutationCtx,
  milestone: Doc<'milestones'>,
  input: { addedBy: string; at: number; rows?: readonly GateRow[] },
): Promise<'opened' | 'closed' | 'unchanged'> {
  let rows = input.rows;
  if (!rows) {
    const loaded = await loadMilestoneTaskSet(ctx, milestone);
    if (!loaded.ok) return 'unchanged';
    rows = loaded.set.tasks;
  }
  const gate = designGate(rows, milestone.designApprovedAt);
  const due = milestone.status === 'Building' && milestone.archivedAt == null && designAskDue(gate);
  const open = (await openAsksOnMilestone(ctx, milestone._id)).filter((ask) => ask.reason === 'design');
  if (due) {
    if (open.length > 0) return 'unchanged';
    await openAsk(ctx, milestone, {
      reason: 'design',
      body: designAskBody({ milestoneName: milestone.name, designDone: gate.doneDesign }),
      addedBy: input.addedBy,
      at: input.at,
    });
    return 'opened';
  }
  if (open.length === 0) return 'unchanged';
  for (const ask of open) await closeAsk(ctx, ask);
  return 'closed';
}

/**
 * Sets a task's kind (staff, the staff API, the MCP). Missing reads as build,
 * so build on a task with no kind writes nothing. Then the Approve designs
 * Ask follows the new task set.
 */
export async function setTaskKind(
  ctx: MutationCtx,
  task: Doc<'tasks'>,
  kind: TaskKind,
  input: { addedBy: string; at: number },
): Promise<{ wrote: boolean }> {
  if (taskKind(task) === kind) return { wrote: false };
  await ctx.db.patch(task._id, { kind, updatedAt: input.at });
  if (task.milestoneId) {
    const milestone = await ctx.db.get(task.milestoneId);
    if (milestone) await syncDesignAsk(ctx, milestone, input);
  }
  return { wrote: true };
}
