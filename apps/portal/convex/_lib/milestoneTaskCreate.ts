/**
 * One staff-created task inside a milestone, stored in the portal only: no
 * Notion page and no outbox row. The staff API (`portalApi.createTask`) and
 * the Portal New task control (`tasks.createTask`) both land here.
 *
 * A Notion create would be unpublished, the pull gate would skip it, and the
 * task would never reach its milestone. So nothing is sent to Notion.
 */
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import { nextMilestoneOrder } from './milestones';
import { loadLinkedTasks } from './milestoneTaskSet';
import { PORTAL_MILESTONE_TASK_SOURCE, stageForNewMilestoneTask } from './milestoneTasks';

export type MilestoneTaskInput = {
  project: Doc<'projects'>;
  milestone: Doc<'milestones'>;
  /** Already checked: trimmed and not empty. */
  name: string;
  /** Already checked: a live task status. */
  status: string;
  date?: string;
  /** Already checked. Defaults to the stage the milestone's status maps to. */
  stage?: string;
  /** Who made it (`api`, `ui`) and the caller's own id, so a retry finds the same row. */
  via: 'api' | 'ui';
  ref: string;
};

export function milestoneTaskKey(milestoneId: string, via: 'api' | 'ui', ref: string): string {
  return `${PORTAL_MILESTONE_TASK_SOURCE}:${milestoneId}:${via}:${ref}`;
}

export async function insertMilestoneTask(
  ctx: MutationCtx,
  input: MilestoneTaskInput,
): Promise<{ ok: true; taskId: Id<'tasks'>; key: string; duplicate: boolean } | { ok: false; reason: string }> {
  const key = milestoneTaskKey(input.milestone._id, input.via, input.ref);
  const existing = await ctx.db
    .query('tasks')
    .withIndex('by_notionPageId', (q) => q.eq('notionPageId', key))
    .first();
  if (existing) return { ok: true, taskId: existing._id, key, duplicate: true };
  const siblings = await loadLinkedTasks(ctx, input.milestone);
  if (!siblings.ok) return { ok: false, reason: siblings.reason };
  const at = Date.now();
  const taskId = await ctx.db.insert('tasks', {
    orgId: input.project.orgId,
    projectId: input.project._id,
    notionPageId: key,
    externalId: key,
    lastSyncedAt: at,
    name: input.name,
    status: input.status,
    isDone: input.status === 'Done',
    ...(input.date ? { date: input.date } : {}),
    stage: input.stage ?? stageForNewMilestoneTask(input.milestone.status),
    publishToWarehaus: false,
    source: PORTAL_MILESTONE_TASK_SOURCE,
    origin: 'manual',
    milestoneId: input.milestone._id,
    milestoneOrder: nextMilestoneOrder(siblings.rows.map((row) => row.milestoneOrder)),
    updatedAt: at,
  });
  return { ok: true, taskId, key, duplicate: false };
}
