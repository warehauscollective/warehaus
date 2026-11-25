/**
 * The Portal task create (stored in the portal only) and the pending-stage drain. Every task field
 * change goes through `applyTaskChanges` (convex/_lib/taskChange.ts).
 */

import { planTaskCreate, stageDrainWrite, taskCreateProjectGate } from '@warehaus/portal-sync';
import { v } from 'convex/values';
import { deleteUnsentStageRows } from '../_lib/taskChange';
import { taskMilestoneGate } from '../_lib/milestoneTasks';
import type { Id } from '../_generated/dataModel';
import { internalMutation } from '../_generated/server';
import { insertMilestoneTask } from '../_lib/milestoneTaskCreate';
import { writebackAllowed } from './notion';
import { insertOutboxRow } from './outbox';

type CreateResult = { ok: false; error: string } | { ok: true; taskId: Id<'tasks'>; duplicate: boolean };

/**
 * Portal New task. The task is stored in the portal only, inside its
 * milestone (convex/_lib/milestoneTaskCreate.ts). Nothing goes to Notion.
 */
export const createInMilestone = internalMutation({
  args: {
    orgId: v.id('clients'),
    name: v.string(),
    status: v.string(),
    projectNotionId: v.string(),
    externalId: v.string(),
    date: v.optional(v.string()),
    stage: v.optional(v.string()),
    milestoneId: v.optional(v.id('milestones')),
    actorId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<CreateResult> => {
    const project = await ctx.db
      .query('projects')
      .withIndex('by_notionPageId', (q) => q.eq('notionPageId', args.projectNotionId))
      .unique();
    const projectGate = taskCreateProjectGate(project, args.orgId);
    if (!projectGate.ok) return { ok: false as const, error: projectGate.error };
    if (!project) return { ok: false as const, error: 'Project is not in this client' };
    const milestone = args.milestoneId ? await ctx.db.get(args.milestoneId) : null;
    const milestoneGate = taskMilestoneGate(milestone, { orgId: args.orgId, projectId: project._id });
    if (!milestoneGate.ok) return { ok: false as const, error: milestoneGate.reason };
    if (!milestone) return { ok: false as const, error: 'Milestone not found' };
    // Same name, status, date and stage rules as before. The Notion properties are not sent.
    const planned = planTaskCreate({
      actor: 'staff',
      name: args.name,
      status: args.status,
      projectNotionId: args.projectNotionId,
      externalId: args.externalId,
      date: args.date,
      stage: args.stage,
    });
    if (!planned.ok) return { ok: false as const, error: planned.error };
    const inserted = await insertMilestoneTask(ctx, {
      project,
      milestone,
      name: String(planned.properties.Name),
      status: args.status,
      date: args.date,
      stage: args.stage,
      via: 'ui',
      ref: args.externalId,
    });
    if (!inserted.ok) return { ok: false as const, error: inserted.reason };
    return { ok: true as const, taskId: inserted.taskId, duplicate: inserted.duplicate };
  },
});

/** Most pending stages one drain looks at, oldest first. */
export const DRAIN_PENDING_TAKE = 100;

/**
 * Flag off inserts nothing. Flag on queues the latest pending stage once per
 * task. Reads only tasks with a pending stage, oldest first, capped. A
 * confirmed write clears the pending mark, so later drains reach the rest.
 */
export const drainPendingStages = internalMutation({
  args: {},
  handler: async (ctx) => {
    if (!writebackAllowed()) return { inserted: 0, reused: 0 };
    const tasks = await ctx.db
      .query('tasks')
      .withIndex('by_stagePendingAt', (q) => q.gte('stagePendingAt', 0))
      .take(DRAIN_PENDING_TAKE);
    let inserted = 0;
    let reused = 0;
    for (const task of tasks) {
      const planned = stageDrainWrite(task, task.notionPageId);
      if (!planned) continue;
      await deleteUnsentStageRows(ctx, task.notionPageId, planned.idempotencyKey);
      const queued = await insertOutboxRow(ctx, {
        idempotencyKey: planned.idempotencyKey,
        kind: 'task-stage',
        orgId: task.orgId,
        database: 'tasks',
        notionPageId: task.notionPageId,
        expectedLastEditedTime: planned.base,
        properties: planned.properties,
        actor: 'staff',
        actorId: task.stagePendingBy,
      });
      if (queued.duplicate) reused += 1;
      else inserted += 1;
    }
    return { inserted, reused };
  },
});
