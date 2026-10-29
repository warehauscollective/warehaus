/**
 * Staff stage moves patch tasks.stage before any Notion write.
 * notionOutbox is still the only Notion write. enqueueStage does not call Notion.
 * When NOTION_WRITEBACK_ENABLED is not exactly "true", the stage is saved
 * and no outbox row is inserted. enqueueStatus does not patch tasks.status.
 */

import {
  planTaskCreate,
  planTaskDescriptionWrite,
  planTaskResourceWrite,
  isNotionWritebackEnabled,
  isTaskStage,
  notionOnlyStageReason,
  planTaskStageWrite,
  stageOutboxActor,
  taskCreateProjectGate,
  taskStatusIdempotencyKey,
  unstagedMoveAllowed,
  validateTaskStatusUpdate,
  type MoveActor,
  type TaskWriteProperties,
} from '@warehaus/portal-sync';
import { v } from 'convex/values';
import { internal } from '../_generated/api';
import type { Id } from '../_generated/dataModel';
import { internalMutation, type MutationCtx } from '../_generated/server';

type EnqueueStatusResult =
  | { ok: false; error: string }
  | { ok: true; outboxId: Id<'notionOutbox'>; duplicate: boolean };

type StageEnqueueResult =
  | { ok: false; error: string }
  | { ok: true; pending: boolean; outboxId?: Id<'notionOutbox'>; duplicate?: boolean };

function writebackOn(): boolean {
  return isNotionWritebackEnabled(process.env.NOTION_WRITEBACK_ENABLED);
}

async function listTaskStageRows(ctx: MutationCtx, notionPageId: string) {
  return ctx.db
    .query('notionOutbox')
    .withIndex('by_notionPageId', (q) => q.eq('notionPageId', notionPageId))
    .collect();
}

/** Queued or failed task-stage rows. Leaves inflight, done, and conflict. */
async function deleteUnsentTaskStageRows(
  ctx: MutationCtx,
  notionPageId: string,
  keepKey?: string,
): Promise<void> {
  const rows = await listTaskStageRows(ctx, notionPageId);
  for (const row of rows) {
    if (row.kind !== 'task-stage') continue;
    if (row.status !== 'queued' && row.status !== 'failed') continue;
    if (keepKey && row.idempotencyKey === keepKey) continue;
    await ctx.db.delete(row._id);
  }
}

async function insertStageOutbox(
  ctx: MutationCtx,
  input: {
    orgId: Id<'clients'>;
    notionPageId: string;
    properties: TaskWriteProperties;
    idempotencyKey: string;
    expectedLastEditedTime: string;
    actor: MoveActor;
    actorId?: string;
  },
): Promise<StageEnqueueResult> {
  await deleteUnsentTaskStageRows(ctx, input.notionPageId, input.idempotencyKey);
  const queued = await ctx.runMutation(internal.sync.outbox.enqueue, {
    idempotencyKey: input.idempotencyKey,
    kind: 'task-stage',
    orgId: input.orgId,
    database: 'tasks',
    notionPageId: input.notionPageId,
    expectedLastEditedTime: input.expectedLastEditedTime,
    payload: JSON.stringify({ properties: input.properties }),
    actor: stageOutboxActor(input.actor),
    actorId: input.actorId,
    schedule: true,
  });
  if (!queued.ok) return queued;
  return { ok: true, pending: true, outboxId: queued.outboxId, duplicate: queued.duplicate };
}

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
  handler: async (ctx, args): Promise<StageEnqueueResult> => {
    const actor: MoveActor = args.actor === 'client' ? 'client' : 'staff';
    const task = await ctx.db.get(args.taskId);
    if (!task) return { ok: false as const, error: 'Task not found' };
    if (!args.expectedLastEditedTime) {
      return { ok: false as const, error: 'Updates require the last read time' };
    }
    const baseEditedTime = typeof task.lastEditedTime === 'string' ? task.lastEditedTime : '';
    if (!baseEditedTime) {
      return { ok: false as const, error: 'Updates require the last read time' };
    }
    const planned = planTaskStageWrite({
      actor,
      stage: args.stage,
      pullRequestLink: args.pullRequestLink,
      notionPageId: task.notionPageId,
      expectedLastEditedTime: baseEditedTime,
    });
    if (!planned.ok) return { ok: false as const, error: planned.error };
    const currentStage = typeof task.stage === 'string' ? task.stage : '';
    const leavingNotionOnly = notionOnlyStageReason(currentStage);
    if (leavingNotionOnly) return { ok: false as const, error: leavingNotionOnly };
    if (!isTaskStage(currentStage) && !unstagedMoveAllowed(args.stage)) {
      return { ok: false as const, error: 'Tasks with no stage can move to Idea or Planning.' };
    }

    const alreadyPending = typeof task.stagePendingAt === 'number';
    const preMove = currentStage || null;
    const synced = alreadyPending ? (task.stageSynced ?? null) : preMove;
    const link = planned.properties['GitHub Issue/PR'];
    await ctx.db.patch(task._id, {
      stage: args.stage,
      stagePendingAt: alreadyPending ? task.stagePendingAt : Date.now(),
      stagePendingBaseEditedTime: baseEditedTime,
      ...(alreadyPending ? {} : { stageSynced: synced }),
      stagePendingPullRequest: typeof link === 'string' ? link : undefined,
      ...(args.actorId ? { stagePendingActorId: args.actorId } : {}),
    });

    if (args.stage === synced) {
      const rows = await listTaskStageRows(ctx, task.notionPageId);
      const inflight = rows.some((row) => row.kind === 'task-stage' && row.status === 'inflight');
      if (!inflight) {
        await ctx.db.patch(task._id, {
          stagePendingAt: undefined,
          stagePendingBaseEditedTime: undefined,
          stagePendingPullRequest: undefined,
          stagePendingActorId: undefined,
        });
        await deleteUnsentTaskStageRows(ctx, task.notionPageId);
        return { ok: true, pending: false };
      }
    }

    if (!writebackOn()) return { ok: true, pending: true };
    return insertStageOutbox(ctx, {
      orgId: task.orgId,
      notionPageId: task.notionPageId,
      properties: planned.properties,
      idempotencyKey: planned.idempotencyKey,
      expectedLastEditedTime: baseEditedTime,
      actor,
      actorId: args.actorId,
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

/** Flag off inserts nothing. Flag on queues the latest pending stage once per task. */
export const drainPendingStages = internalMutation({
  args: {},
  handler: async (ctx) => {
    if (!writebackOn()) return { inserted: 0, reused: 0 };
    const tasks = await ctx.db.query('tasks').collect();
    let inserted = 0;
    let reused = 0;
    for (const task of tasks) {
      if (typeof task.stagePendingAt !== 'number') continue;
      const stage = typeof task.stage === 'string' ? task.stage : '';
      const base = task.stagePendingBaseEditedTime ?? '';
      if (!stage || !base) continue;
      const planned = planTaskStageWrite({
        actor: 'staff',
        stage,
        pullRequestLink: task.stagePendingPullRequest,
        notionPageId: task.notionPageId,
        expectedLastEditedTime: base,
      });
      if (!planned.ok) continue;
      const queued = await insertStageOutbox(ctx, {
        orgId: task.orgId,
        notionPageId: task.notionPageId,
        properties: planned.properties,
        idempotencyKey: planned.idempotencyKey,
        expectedLastEditedTime: base,
        actor: 'staff',
        actorId: typeof task.stagePendingActorId === 'string' ? task.stagePendingActorId : undefined,
      });
      if (!queued.ok) continue;
      if (queued.duplicate) reused += 1;
      else if (queued.outboxId) inserted += 1;
    }
    return { inserted, reused };
  },
});
