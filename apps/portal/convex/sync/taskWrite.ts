/**
 * B1 calls this internal mutation from an adminMutation.
 * Staff-only: the public wrapper must be adminMutation.
 * A stage row stores the actor passed into enqueueStage.
 * It does not change the task row and it does not call Notion.
 * The outbox worker does that after the row is queued.
 */

import {
  planTaskCreate,
  planTaskDescriptionWrite,
  planTaskResourceWrite,
  planTaskStageWrite,
  stageOutboxActor,
  taskCreateProjectGate,
  taskStatusIdempotencyKey,
  validateTaskStatusUpdate,
  type MoveActor,
} from '@warehaus/portal-sync';
import { v } from 'convex/values';
import { internal } from '../_generated/api';
import type { Id } from '../_generated/dataModel';
import { internalMutation } from '../_generated/server';

type EnqueueStatusResult =
  | { ok: false; error: string }
  | { ok: true; outboxId: Id<'notionOutbox'>; duplicate: boolean };

export const enqueueStatus = internalMutation({
  args: {
    taskId: v.id('tasks'),
    status: v.string(),
    expectedLastEditedTime: v.string(),
    idempotencyKey: v.optional(v.string()),
    actorId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<EnqueueStatusResult> => {
    const validated = validateTaskStatusUpdate(args.status);
    if (!validated.ok) return { ok: false as const, error: validated.errors.join('; ') };
    if (!args.expectedLastEditedTime) {
      return { ok: false as const, error: 'Updates require the last read time' };
    }

    const task = await ctx.db.get(args.taskId);
    if (!task) return { ok: false as const, error: 'Task not found' };

    const idempotencyKey =
      args.idempotencyKey ??
      taskStatusIdempotencyKey(task.notionPageId, args.status, args.expectedLastEditedTime);

    return ctx.runMutation(internal.sync.outbox.enqueue, {
      idempotencyKey,
      kind: 'task-status',
      orgId: task.orgId,
      database: 'tasks',
      notionPageId: task.notionPageId,
      expectedLastEditedTime: args.expectedLastEditedTime,
      payload: JSON.stringify({ properties: { Status: args.status } }),
      actor: 'staff' as const,
      actorId: args.actorId,
      schedule: true,
    });
  },
});

export const enqueueStage = internalMutation({
  args: {
    taskId: v.id('tasks'),
    stage: v.string(),
    pullRequestLink: v.optional(v.string()),
    expectedLastEditedTime: v.string(),
    actorId: v.optional(v.string()),
    actor: v.optional(v.union(v.literal('staff'), v.literal('client'))),
  },
  handler: async (ctx, args): Promise<EnqueueStatusResult> => {
    const actor: MoveActor = args.actor === 'client' ? 'client' : 'staff';
    const task = await ctx.db.get(args.taskId);
    if (!task) return { ok: false as const, error: 'Task not found' };
    const planned = planTaskStageWrite({
      actor,
      stage: args.stage,
      pullRequestLink: args.pullRequestLink,
      notionPageId: task.notionPageId,
      expectedLastEditedTime: args.expectedLastEditedTime,
    });
    if (!planned.ok) return { ok: false as const, error: planned.error };
    return ctx.runMutation(internal.sync.outbox.enqueue, {
      idempotencyKey: planned.idempotencyKey,
      kind: 'task-stage',
      orgId: task.orgId,
      database: 'tasks',
      notionPageId: task.notionPageId,
      expectedLastEditedTime: args.expectedLastEditedTime,
      payload: JSON.stringify({ properties: planned.properties }),
      actor: stageOutboxActor(actor),
      actorId: args.actorId,
      schedule: true,
    });
  },
});

export const enqueueCreate = internalMutation({
  args: {
    orgId: v.id('clients'),
    name: v.string(),
    status: v.string(),
    projectNotionId: v.string(),
    externalId: v.string(),
    date: v.optional(v.string()),
    stage: v.optional(v.string()),
    actorId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<EnqueueStatusResult> => {
    const project = await ctx.db
      .query('projects')
      .withIndex('by_notionPageId', (q) => q.eq('notionPageId', args.projectNotionId))
      .unique();
    const projectGate = taskCreateProjectGate(project, args.orgId);
    if (!projectGate.ok) return { ok: false as const, error: projectGate.error };
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
    return ctx.runMutation(internal.sync.outbox.enqueue, {
      idempotencyKey: planned.idempotencyKey,
      kind: 'create',
      orgId: args.orgId,
      database: 'tasks',
      payload: JSON.stringify({ properties: planned.properties }),
      actor: 'staff' as const,
      actorId: args.actorId,
      schedule: true,
    });
  },
});

export const enqueueDescription = internalMutation({
  args: {
    taskId: v.id('tasks'),
    description: v.string(),
    expectedLastEditedTime: v.string(),
    actorId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<EnqueueStatusResult> => {
    const task = await ctx.db.get(args.taskId);
    if (!task) return { ok: false as const, error: 'Task not found' };
    if (task.descriptionSource === 'body') {
      return { ok: false as const, error: 'Edit in Notion' };
    }
    const planned = planTaskDescriptionWrite({
      actor: 'staff',
      description: args.description,
      notionPageId: task.notionPageId,
      expectedLastEditedTime: args.expectedLastEditedTime,
    });
    if (!planned.ok) return { ok: false as const, error: planned.error };
    return ctx.runMutation(internal.sync.outbox.enqueue, {
      idempotencyKey: planned.idempotencyKey,
      kind: 'task-description',
      orgId: task.orgId,
      database: 'tasks',
      notionPageId: task.notionPageId,
      expectedLastEditedTime: args.expectedLastEditedTime,
      payload: JSON.stringify({ properties: planned.properties }),
      actor: 'staff' as const,
      actorId: args.actorId,
      schedule: true,
    });
  },
});

export const enqueueResources = internalMutation({
  args: {
    taskId: v.id('tasks'),
    resourceNotionIds: v.array(v.string()),
    expectedLastEditedTime: v.string(),
    actorId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<EnqueueStatusResult> => {
    const task = await ctx.db.get(args.taskId);
    if (!task) return { ok: false as const, error: 'Task not found' };
    const planned = planTaskResourceWrite({
      actor: 'staff',
      resourceNotionIds: args.resourceNotionIds,
      notionPageId: task.notionPageId,
      expectedLastEditedTime: args.expectedLastEditedTime,
    });
    if (!planned.ok) return { ok: false as const, error: planned.error };
    return ctx.runMutation(internal.sync.outbox.enqueue, {
      idempotencyKey: planned.idempotencyKey,
      kind: 'update',
      orgId: task.orgId,
      database: 'tasks',
      notionPageId: task.notionPageId,
      expectedLastEditedTime: args.expectedLastEditedTime,
      payload: JSON.stringify({ properties: planned.properties }),
      actor: 'staff' as const,
      actorId: args.actorId,
      schedule: true,
    });
  },
});
