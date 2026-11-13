/**
 * Staff-only /api/v1. Tokens are hashed. Writes that mirror a Notion task use
 * the outbox: kind `update` for field and link patches, kind `create` for a
 * new task, and kind `task-stage` for stage moves. Milestones and comments
 * stay in Convex. There is no Notion database or comment write for them.
 */

import { ConvexError, v } from 'convex/values';
import {
  applyFieldWrite,
  authorizeApiCall,
  idempotencyDecision,
  idempotencyMaterial,
  pageLimit,
  planApiComment,
  planApiLink,
  planApiLinkPatch,
  planApiTaskCreate,
  planApiTaskUpdate,
  takeRateLimit,
  taskListPlan,
  unknownFieldError,
  visibilityWriteError,
  type FieldStamp,
} from '@warehaus/portal-sync';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import {
  httpAction,
  internalMutation,
  internalQuery,
  type ActionCtx,
  type MutationCtx,
} from './_generated/server';
import { sha256Hex } from './_lib/tokenCrypto';
import { ensureSourceLinks } from './_lib/taskSourceLinks';
import { createMilestoneDecision, contentEditDecision, workStatusDecision, writeMilestoneActivity } from './_lib/milestones';

const PAGE_CAP = 50;

type ApiResult = { status: number; body: unknown };

function fail(status: number, error: string): ApiResult {
  return { status, body: { error } };
}

function staffTask(row: Doc<'tasks'>) {
  return {
    id: row._id,
    orgId: row.orgId,
    projectId: row.projectId,
    name: row.name,
    status: row.status,
    stage: row.stage ?? null,
    priority: row.priority ?? null,
    nextAction: row.nextAction ?? null,
    isDone: row.isDone,
    updatedAt: row.updatedAt ?? null,
    lastEditedTime: row.lastEditedTime ?? null,
    notionPageId: row.notionPageId,
    publishToWarehaus: row.publishToWarehaus,
    milestoneId: row.milestoneId ?? null,
    description: row.description ?? null,
    fieldStamps: row.fieldStamps ?? null,
  };
}

function staffMilestone(row: Doc<'milestones'>) {
  return {
    id: row._id,
    orgId: row.orgId,
    projectId: row.projectId,
    name: row.name,
    objective: row.objective,
    goals: row.goals,
    workStatus: row.workStatus,
    approval: row.approval,
    publishToWarehaus: row.publishToWarehaus,
  };
}

async function openIdempotency(
  ctx: MutationCtx,
  args: { tokenId: Id<'apiTokens'>; key: string; requestHash: string },
): Promise<{ action: 'start' } | ApiResult> {
  const existing = await ctx.db
    .query('apiIdempotency')
    .withIndex('by_tokenId_key', (q) => q.eq('tokenId', args.tokenId).eq('key', args.key))
    .unique();
  const decision = idempotencyDecision({
    existing: existing
      ? { requestHash: existing.requestHash, status: existing.status, body: existing.body }
      : null,
    requestHash: args.requestHash,
  });
  if (decision.action === 'start') return { action: 'start' };
  if (decision.action === 'mismatch') {
    return fail(409, 'Idempotency key was already used for a different request');
  }
  try {
    return { status: decision.status, body: JSON.parse(decision.body) as unknown };
  } catch {
    return fail(500, 'Stored response could not be read');
  }
}

async function finishIdempotency(
  ctx: MutationCtx,
  args: { tokenId: Id<'apiTokens'>; key: string; requestHash: string },
  result: ApiResult,
): Promise<ApiResult> {
  await ctx.db.insert('apiIdempotency', {
    tokenId: args.tokenId,
    key: args.key,
    requestHash: args.requestHash,
    status: result.status,
    body: JSON.stringify(result.body),
    createdAt: Date.now(),
  });
  return result;
}

const idemArgs = {
  tokenId: v.id('apiTokens'),
  key: v.string(),
  requestHash: v.string(),
};

export const consumeToken = internalMutation({
  args: {
    tokenHash: v.string(),
    method: v.union(v.literal('GET'), v.literal('POST')),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query('apiTokens')
      .withIndex('by_tokenHash', (q) => q.eq('tokenHash', args.tokenHash))
      .unique();
    if (!row || row.revokedAt != null) return { ok: false as const, status: 401, error: 'Unauthorized' };
    const now = Date.now();
    const rate = takeRateLimit({
      windowStartedAt: row.windowStartedAt,
      windowCount: row.windowCount,
      limit: row.rateLimit,
      windowMs: row.rateWindowMs,
      now,
    });
    if (!rate.ok) return { ok: false as const, status: 429, error: 'Rate limit exceeded' };
    const auth = authorizeApiCall({ token: { scope: row.scope, revokedAt: null }, method: args.method });
    await ctx.db.patch(row._id, {
      windowStartedAt: rate.windowStartedAt,
      windowCount: rate.windowCount,
      ...(auth.ok ? { lastUsedAt: now } : {}),
    });
    if (!auth.ok) return { ok: false as const, status: auth.status, error: 'This token is read-only' };
    return { ok: true as const, tokenId: row._id, name: row.name, scope: row.scope };
  },
});

export const rememberResult = internalMutation({
  args: { ...idemArgs, status: v.number(), body: v.string() },
  handler: async (ctx, args): Promise<ApiResult> => {
    const opened = await openIdempotency(ctx, args);
    if (!('action' in opened)) return opened;
    return finishIdempotency(ctx, args, { status: args.status, body: JSON.parse(args.body) as unknown });
  },
});

export const backfillTaskLinks = internalMutation({
  args: { cursor: v.union(v.string(), v.null()), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 25, 1), 25);
    const page = await ctx.db.query('tasks').paginate({ numItems: limit, cursor: args.cursor });
    for (const task of page.page) {
      await ensureSourceLinks(ctx, {
        orgId: task.orgId,
        taskId: task._id,
        pullRequestUrl: task.pullRequestUrl,
        figmaFrame: task.figmaFrame,
        repoBranch: task.repoBranch,
      });
    }
    return {
      scanned: page.page.length,
      done: page.isDone,
      nextCursor: page.isDone ? null : page.continueCursor,
    };
  },
});

const listArgs = {
  projectId: v.optional(v.id('projects')),
  status: v.optional(v.string()),
  stage: v.optional(v.string()),
  updatedSince: v.optional(v.number()),
  cursor: v.union(v.string(), v.null()),
  limit: v.number(),
};

export const listTasks = internalQuery({
  args: listArgs,
  handler: async (ctx, args) => {
    const plan = taskListPlan({
      projectId: args.projectId,
      status: args.status,
      stage: args.stage,
      updatedSince: args.updatedSince,
    });
    if (!plan.ok) return fail(400, plan.error);
    const opts = { numItems: Math.min(args.limit, PAGE_CAP), cursor: args.cursor };
    const projectId = args.projectId;
    const page = await (async () => {
      switch (plan.index) {
        case 'by_projectId':
          if (!projectId) return null;
          return ctx.db.query('tasks').withIndex('by_projectId', (q) => q.eq('projectId', projectId)).paginate(opts);
        case 'by_projectId_status':
          if (!projectId || !args.status) return null;
          return ctx.db
            .query('tasks')
            .withIndex('by_projectId_status', (q) => q.eq('projectId', projectId).eq('status', args.status!))
            .paginate(opts);
        case 'by_projectId_stage':
          if (!projectId || !args.stage) return null;
          return ctx.db
            .query('tasks')
            .withIndex('by_projectId_stage', (q) => q.eq('projectId', projectId).eq('stage', args.stage!))
            .paginate(opts);
        case 'by_projectId_updatedAt':
          if (!projectId || args.updatedSince == null) return null;
          return ctx.db
            .query('tasks')
            .withIndex('by_projectId_updatedAt', (q) => q.eq('projectId', projectId).gte('updatedAt', args.updatedSince!))
            .paginate(opts);
        case 'by_status':
          if (!args.status) return null;
          return ctx.db.query('tasks').withIndex('by_status', (q) => q.eq('status', args.status!)).paginate(opts);
        case 'by_stage':
          if (!args.stage) return null;
          return ctx.db.query('tasks').withIndex('by_stage', (q) => q.eq('stage', args.stage!)).paginate(opts);
        case 'by_updatedAt':
          if (args.updatedSince == null) return null;
          return ctx.db
            .query('tasks')
            .withIndex('by_updatedAt', (q) => q.gte('updatedAt', args.updatedSince!))
            .paginate(opts);
        default:
          return null;
      }
    })();
    if (!page) return fail(400, 'Choose a project, status, stage, or updatedSince');
    return {
      status: 200,
      body: {
        items: page.page.map((row) => {
          const task = staffTask(row);
          return {
            id: task.id,
            orgId: task.orgId,
            projectId: task.projectId,
            name: task.name,
            status: task.status,
            stage: task.stage,
            priority: task.priority,
            nextAction: task.nextAction,
            isDone: task.isDone,
            updatedAt: task.updatedAt,
            lastEditedTime: task.lastEditedTime,
            notionPageId: task.notionPageId,
            publishToWarehaus: task.publishToWarehaus,
            milestoneId: task.milestoneId,
          };
        }),
        nextCursor: page.isDone ? null : page.continueCursor,
        hasMore: !page.isDone,
      },
    };
  },
});

export const getTask = internalQuery({
  args: { taskId: v.id('tasks') },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) return fail(404, 'Task not found');
    const links = await ctx.db
      .query('taskLinks')
      .withIndex('by_taskId', (q) => q.eq('taskId', task._id))
      .take(PAGE_CAP + 1);
    const comments = await ctx.db
      .query('taskComments')
      .withIndex('by_taskId_createdAt', (q) => q.eq('taskId', task._id))
      .order('desc')
      .take(PAGE_CAP + 1);
    return {
      status: 200,
      body: {
        ...staffTask(task),
        links: links.slice(0, PAGE_CAP).map(linkView),
        linksTruncated: links.length > PAGE_CAP,
        comments: comments.slice(0, PAGE_CAP).map(commentView),
        commentsTruncated: comments.length > PAGE_CAP,
      },
    };
  },
});

function linkView(row: Doc<'taskLinks'>) {
  return {
    id: row._id,
    taskId: row.taskId,
    kind: row.kind,
    url: row.url,
    title: row.title ?? null,
    addedBy: row.addedBy,
    createdAt: row.createdAt,
  };
}

function commentView(row: Doc<'taskComments'>) {
  return {
    id: row._id,
    taskId: row.taskId,
    body: row.body,
    addedBy: row.addedBy,
    createdAt: row.createdAt,
  };
}

export const listMilestones = internalQuery({
  args: { projectId: v.id('projects'), cursor: v.union(v.string(), v.null()), limit: v.number() },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) return fail(404, 'Project not found');
    const page = await ctx.db
      .query('milestones')
      .withIndex('by_projectId', (q) => q.eq('projectId', args.projectId))
      .paginate({ numItems: Math.min(args.limit, PAGE_CAP), cursor: args.cursor });
    return {
      status: 200,
      body: {
        items: page.page.map(staffMilestone),
        nextCursor: page.isDone ? null : page.continueCursor,
        hasMore: !page.isDone,
      },
    };
  },
});

export const listComments = internalQuery({
  args: { taskId: v.id('tasks'), cursor: v.union(v.string(), v.null()), limit: v.number() },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) return fail(404, 'Task not found');
    const page = await ctx.db
      .query('taskComments')
      .withIndex('by_taskId_createdAt', (q) => q.eq('taskId', args.taskId))
      .order('desc')
      .paginate({ numItems: Math.min(args.limit, PAGE_CAP), cursor: args.cursor });
    return {
      status: 200,
      body: {
        items: page.page.map(commentView),
        nextCursor: page.isDone ? null : page.continueCursor,
        hasMore: !page.isDone,
      },
    };
  },
});

export const listLinks = internalQuery({
  args: { taskId: v.id('tasks'), cursor: v.union(v.string(), v.null()), limit: v.number() },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) return fail(404, 'Task not found');
    const page = await ctx.db
      .query('taskLinks')
      .withIndex('by_taskId', (q) => q.eq('taskId', args.taskId))
      .paginate({ numItems: Math.min(args.limit, PAGE_CAP), cursor: args.cursor });
    return {
      status: 200,
      body: {
        items: page.page.map(linkView),
        nextCursor: page.isDone ? null : page.continueCursor,
        hasMore: !page.isDone,
      },
    };
  },
});

export const createTask = internalMutation({
  args: {
    ...idemArgs,
    tokenName: v.string(),
    projectId: v.id('projects'),
    name: v.string(),
    status: v.string(),
    date: v.optional(v.string()),
    stage: v.optional(v.string()),
    milestoneId: v.optional(v.id('milestones')),
  },
  handler: async (ctx, args): Promise<ApiResult> => {
    const opened = await openIdempotency(ctx, args);
    if (!('action' in opened)) return opened;
    const project = await ctx.db.get(args.projectId);
    if (!project) return finishIdempotency(ctx, args, fail(404, 'Project not found'));
    const externalId = `wh_tsk_${(await sha256Hex(`${args.tokenId}:${args.key}`)).slice(0, 24)}`;
    const planned = planApiTaskCreate({
      name: args.name,
      status: args.status,
      projectNotionId: project.notionPageId,
      externalId,
      date: args.date,
      stage: args.stage,
    });
    if (!planned.ok) return finishIdempotency(ctx, args, fail(400, planned.error));
    const queued = await ctx.runMutation(internal.sync.outbox.enqueue, {
      idempotencyKey: planned.idempotencyKey,
      kind: 'create',
      orgId: project.orgId,
      database: 'tasks',
      payload: JSON.stringify({
        properties: planned.properties,
        ...(args.milestoneId ? { milestoneId: args.milestoneId } : {}),
      }),
      actor: 'staff' as const,
      actorId: args.tokenName,
      schedule: true,
    });
    if (!queued.ok) return fail(400, queued.error);
    return finishIdempotency(ctx, args, {
      status: 200,
      body: { externalId, outboxId: queued.outboxId, duplicate: queued.duplicate },
    });
  },
});

export const updateTask = internalMutation({
  args: {
    ...idemArgs,
    tokenName: v.string(),
    taskId: v.id('tasks'),
    expectedLastEditedTime: v.string(),
    status: v.optional(v.string()),
    priority: v.optional(v.union(v.string(), v.null())),
    nextAction: v.optional(v.union(v.string(), v.null())),
    stage: v.optional(v.string()),
    pullRequestLink: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<ApiResult> => {
    const opened = await openIdempotency(ctx, args);
    if (!('action' in opened)) return opened;
    const task = await ctx.db.get(args.taskId);
    if (!task) return finishIdempotency(ctx, args, fail(404, 'Task not found'));
    if ((task.lastEditedTime ?? '') !== args.expectedLastEditedTime) {
      return finishIdempotency(ctx, args, fail(409, 'Notion changed since the last read'));
    }
    const planned = planApiTaskUpdate({
      notionPageId: task.notionPageId,
      expectedLastEditedTime: args.expectedLastEditedTime,
      ...(args.status !== undefined ? { status: args.status } : {}),
      ...(args.priority !== undefined ? { priority: args.priority } : {}),
      ...(args.nextAction !== undefined ? { nextAction: args.nextAction } : {}),
      ...(args.stage !== undefined ? { stage: args.stage, pullRequestLink: args.pullRequestLink } : {}),
    });
    if (!planned.ok) return finishIdempotency(ctx, args, fail(400, planned.error));

    const now = Date.now();
    const stamps: {
      status?: FieldStamp;
      stage?: FieldStamp;
      priority?: FieldStamp;
      nextAction?: FieldStamp;
    } = { ...(task.fieldStamps ?? {}) };
    const conflicts: string[] = [];
    const consider = (
      field: 'status' | 'stage' | 'priority' | 'nextAction',
      current: string | null,
      next: string | null,
    ) => {
      const decision = applyFieldWrite({
        field,
        origin: 'api',
        currentValue: current,
        currentStamp: task.fieldStamps?.[field] ?? null,
        nextValue: next,
        updatedAt: now,
        updatedBy: args.tokenName,
      });
      if (!decision.apply) conflicts.push(decision.reason);
      else stamps[field] = decision.stamp;
    };
    if (args.status !== undefined) consider('status', task.status, args.status);
    if (args.priority !== undefined) consider('priority', task.priority ?? null, args.priority);
    if (args.nextAction !== undefined) consider('nextAction', task.nextAction ?? null, args.nextAction);
    if (args.stage !== undefined) consider('stage', task.stage ?? null, args.stage);
    if (conflicts.length > 0) return finishIdempotency(ctx, args, fail(409, conflicts[0]!));

    const fieldWrite = planned.writes.find((write) => write.kind === 'update');
    const stageWrite = planned.writes.find((write) => write.kind === 'task-stage');
    if (fieldWrite) {
      const queued = await ctx.runMutation(internal.sync.outbox.enqueue, {
        idempotencyKey: `api-update:${args.tokenId}:${args.key}`,
        kind: 'update',
        orgId: task.orgId,
        database: 'tasks',
        notionPageId: task.notionPageId,
        expectedLastEditedTime: args.expectedLastEditedTime,
        payload: JSON.stringify({ properties: fieldWrite.properties }),
        actor: 'staff' as const,
        actorId: args.tokenName,
        schedule: true,
      });
      if (!queued.ok) return fail(400, queued.error);
    }
    if (stageWrite && args.stage) {
      const queued = await ctx.runMutation(internal.sync.taskWrite.enqueueStage, {
        taskId: task._id,
        stage: args.stage,
        pullRequestLink: args.pullRequestLink,
        expectedLastEditedTime: args.expectedLastEditedTime,
        actorId: args.tokenName,
        actor: 'staff',
      });
      if (!queued.ok) return fail(400, queued.error);
    }

    const clear = (value: string | null | undefined) => {
      const text = value?.trim() ?? '';
      return text.length > 0 ? text : undefined;
    };
    await ctx.db.patch(task._id, {
      ...(args.status !== undefined ? { status: args.status, isDone: args.status === 'Done' } : {}),
      ...(args.priority !== undefined ? { priority: clear(args.priority) } : {}),
      ...(args.nextAction !== undefined ? { nextAction: clear(args.nextAction) } : {}),
      fieldStamps: stamps,
      updatedAt: now,
    });
    return finishIdempotency(ctx, args, {
      status: 200,
      body: { id: task._id, updatedAt: now },
    });
  },
});

export const createMilestone = internalMutation({
  args: {
    ...idemArgs,
    projectId: v.id('projects'),
    name: v.string(),
    objective: v.string(),
    goals: v.array(v.string()),
    workStatus: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<ApiResult> => {
    const opened = await openIdempotency(ctx, args);
    if (!('action' in opened)) return opened;
    const project = await ctx.db.get(args.projectId);
    if (!project) return finishIdempotency(ctx, args, fail(404, 'Project not found'));
    const created = createMilestoneDecision({
      actor: 'human',
      name: args.name,
      objective: args.objective,
      goals: args.goals,
      workStatus: args.workStatus,
    });
    if (!created.ok) return finishIdempotency(ctx, args, fail(400, created.reason));
    const milestoneId = await ctx.db.insert('milestones', {
      orgId: project.orgId,
      projectId: project._id,
      name: created.milestone.name,
      objective: created.milestone.objective,
      goals: created.milestone.goals,
      workStatus: created.milestone.workStatus,
      approval: created.milestone.approval,
      publishToWarehaus: created.milestone.publishToWarehaus,
    });
    if (created.activityType) {
      const milestone = await ctx.db.get(milestoneId);
      if (milestone) {
        await writeMilestoneActivity(
          ctx as Parameters<typeof writeMilestoneActivity>[0],
          milestone,
          created.activityType,
          Date.now(),
        );
      }
    }
    return finishIdempotency(ctx, args, { status: 200, body: { id: milestoneId } });
  },
});

export const updateMilestone = internalMutation({
  args: {
    ...idemArgs,
    milestoneId: v.id('milestones'),
    name: v.optional(v.string()),
    objective: v.optional(v.string()),
    goals: v.optional(v.array(v.string())),
    workStatus: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<ApiResult> => {
    const opened = await openIdempotency(ctx, args);
    if (!('action' in opened)) return opened;
    const milestone = await ctx.db.get(args.milestoneId);
    if (!milestone) return finishIdempotency(ctx, args, fail(404, 'Milestone not found'));
    const edited = contentEditDecision({
      actor: 'human',
      approval: milestone.approval,
      patch: { name: args.name, objective: args.objective, goals: args.goals },
    });
    if (!edited.ok) return finishIdempotency(ctx, args, fail(400, edited.reason));
    let workStatus = milestone.workStatus;
    let activity: 'milestone.ready' | null = null;
    if (args.workStatus != null) {
      const status = workStatusDecision({
        actor: 'human',
        approval: milestone.approval,
        from: milestone.workStatus,
        to: args.workStatus,
      });
      if (!status.ok) return finishIdempotency(ctx, args, fail(400, status.reason));
      workStatus = status.workStatus;
      activity = status.activityType;
    }
    if (Object.keys(edited.patch).length === 0 && args.workStatus == null) {
      return finishIdempotency(ctx, args, fail(400, 'At least one field is required'));
    }
    await ctx.db.patch(milestone._id, {
      ...edited.patch,
      ...(args.workStatus != null ? { workStatus } : {}),
    });
    if (activity) {
      await writeMilestoneActivity(
        ctx as Parameters<typeof writeMilestoneActivity>[0],
        milestone,
        activity,
        Date.now(),
      );
    }
    return finishIdempotency(ctx, args, { status: 200, body: { id: milestone._id } });
  },
});

export const addComment = internalMutation({
  args: { ...idemArgs, tokenName: v.string(), taskId: v.id('tasks'), body: v.string() },
  handler: async (ctx, args): Promise<ApiResult> => {
    const opened = await openIdempotency(ctx, args);
    if (!('action' in opened)) return opened;
    const task = await ctx.db.get(args.taskId);
    if (!task) return finishIdempotency(ctx, args, fail(404, 'Task not found'));
    const planned = planApiComment(args.body);
    if (!planned.ok) return finishIdempotency(ctx, args, fail(400, planned.error));
    const id = await ctx.db.insert('taskComments', {
      orgId: task.orgId,
      taskId: task._id,
      body: planned.body,
      addedBy: args.tokenName,
      createdAt: Date.now(),
    });
    return finishIdempotency(ctx, args, { status: 200, body: { id } });
  },
});

export const addLink = internalMutation({
  args: {
    ...idemArgs,
    tokenName: v.string(),
    taskId: v.id('tasks'),
    kind: v.string(),
    url: v.string(),
    title: v.optional(v.string()),
    expectedLastEditedTime: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<ApiResult> => {
    const opened = await openIdempotency(ctx, args);
    if (!('action' in opened)) return opened;
    const task = await ctx.db.get(args.taskId);
    if (!task) return finishIdempotency(ctx, args, fail(404, 'Task not found'));
    const planned = planApiLink({ kind: args.kind, url: args.url, title: args.title });
    if (!planned.ok) return finishIdempotency(ctx, args, fail(400, planned.error));
    if (planned.property) {
      if (!args.expectedLastEditedTime) {
        return finishIdempotency(ctx, args, fail(400, 'Updates require the last read time'));
      }
      if ((task.lastEditedTime ?? '') !== args.expectedLastEditedTime) {
        return finishIdempotency(ctx, args, fail(409, 'Notion changed since the last read'));
      }
      const patch = planApiLinkPatch(planned.property, planned.url);
      if (!patch.ok) return finishIdempotency(ctx, args, fail(400, patch.error));
      const queued = await ctx.runMutation(internal.sync.outbox.enqueue, {
        idempotencyKey: `api-link:${args.tokenId}:${args.key}`,
        kind: 'update',
        orgId: task.orgId,
        database: 'tasks',
        notionPageId: task.notionPageId,
        expectedLastEditedTime: args.expectedLastEditedTime,
        payload: JSON.stringify({ properties: patch.properties }),
        actor: 'staff' as const,
        actorId: args.tokenName,
        schedule: true,
      });
      if (!queued.ok) return fail(400, queued.error);
    }
    const existing = await ctx.db
      .query('taskLinks')
      .withIndex('by_taskId', (q) => q.eq('taskId', task._id))
      .take(PAGE_CAP);
    const found = existing.find((row) => row.kind === planned.kind && row.url === planned.url);
    if (found) return finishIdempotency(ctx, args, { status: 200, body: { id: found._id, duplicate: true } });
    const id = await ctx.db.insert('taskLinks', {
      orgId: task.orgId,
      taskId: task._id,
      kind: planned.kind,
      url: planned.url,
      ...(planned.title ? { title: planned.title } : {}),
      addedBy: args.tokenName,
      createdAt: Date.now(),
    });
    return finishIdempotency(ctx, args, { status: 200, body: { id, duplicate: false } });
  },
});

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const TASK_UPDATE_FIELDS = ['taskId', 'expectedLastEditedTime', 'status', 'priority', 'nextAction', 'stage', 'pullRequestLink'];
const TASK_CREATE_FIELDS = ['projectId', 'name', 'status', 'date', 'stage', 'milestoneId'];
const MILESTONE_CREATE_FIELDS = ['projectId', 'name', 'objective', 'goals', 'workStatus'];
const MILESTONE_UPDATE_FIELDS = ['milestoneId', 'name', 'objective', 'goals', 'workStatus'];
const COMMENT_FIELDS = ['taskId', 'body'];
const LINK_FIELDS = ['taskId', 'kind', 'url', 'title', 'expectedLastEditedTime'];

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function queryLimit(url: URL): number | null {
  return pageLimit(url.searchParams.get('limit'));
}

export const portalApiHttp = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  const method = request.method === 'GET' || request.method === 'POST' ? request.method : null;
  if (!method) return json({ error: 'Method not allowed' }, 405);
  const header = request.headers.get('authorization');
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header ?? '');
  const token = match?.[1] ?? '';
  if (!token.startsWith('whp_')) return json({ error: 'Unauthorized' }, 401);
  const consumed = await ctx.runMutation(internal.portalApi.consumeToken, {
    tokenHash: await sha256Hex(token),
    method,
  });
  if (!consumed.ok) return json({ error: consumed.error }, consumed.status);

  if (method === 'GET') {
    const limit = queryLimit(url);
    if (limit == null) return json({ error: 'Limit must be from 1 to 50' }, 400);
    const cursor = url.searchParams.get('cursor');
    try {
      if (url.pathname === '/api/v1/tasks/item') {
        const taskId = url.searchParams.get('id');
        if (!taskId) return json({ error: 'Task id is required' }, 400);
        const result = await ctx.runQuery(internal.portalApi.getTask, { taskId: taskId as Id<'tasks'> });
        return json(result.body, result.status);
      }
      if (url.pathname === '/api/v1/tasks') {
        const updatedSince = url.searchParams.get('updatedSince');
        const result = await ctx.runQuery(internal.portalApi.listTasks, {
          projectId: (url.searchParams.get('projectId') || undefined) as Id<'projects'> | undefined,
          status: url.searchParams.get('status') || undefined,
          stage: url.searchParams.get('stage') || undefined,
          updatedSince: updatedSince ? Number(updatedSince) : undefined,
          cursor,
          limit,
        });
        return json(result.body, result.status);
      }
      if (url.pathname === '/api/v1/milestones') {
        const projectId = url.searchParams.get('projectId');
        if (!projectId) return json({ error: 'Project id is required' }, 400);
        const result = await ctx.runQuery(internal.portalApi.listMilestones, {
          projectId: projectId as Id<'projects'>,
          cursor,
          limit,
        });
        return json(result.body, result.status);
      }
      if (url.pathname === '/api/v1/comments' || url.pathname === '/api/v1/links') {
        const taskId = url.searchParams.get('taskId');
        if (!taskId) return json({ error: 'Task id is required' }, 400);
        const result =
          url.pathname === '/api/v1/comments'
            ? await ctx.runQuery(internal.portalApi.listComments, { taskId: taskId as Id<'tasks'>, cursor, limit })
            : await ctx.runQuery(internal.portalApi.listLinks, { taskId: taskId as Id<'tasks'>, cursor, limit });
        return json(result.body, result.status);
      }
    } catch {
      return json({ error: 'Request failed' }, 400);
    }
    return json({ error: 'Not found' }, 404);
  }

  const rawBody = await request.text();
  if (rawBody.length > 100_000) return json({ error: 'Request is too large' }, 400);
  let parsed: Record<string, unknown> | null = null;
  if (rawBody.trim()) {
    try {
      parsed = asRecord(JSON.parse(rawBody));
    } catch {
      parsed = null;
    }
  } else {
    parsed = {};
  }
  if (!parsed) return json({ error: 'Request body must be a JSON object' }, 400);
  const idempotencyKey = request.headers.get('idempotency-key');
  if (!idempotencyKey || idempotencyKey.trim() !== idempotencyKey || idempotencyKey.length > 200) {
    return json({ error: 'Idempotency key is required' }, 400);
  }
  const requestHash = await sha256Hex(idempotencyMaterial(method, url.pathname, rawBody));
  const idem = { tokenId: consumed.tokenId, key: idempotencyKey, requestHash };

  const visibility = visibilityWriteError(parsed);
  const allowed =
    url.pathname === '/api/v1/tasks'
      ? TASK_CREATE_FIELDS
      : url.pathname === '/api/v1/tasks/update'
        ? TASK_UPDATE_FIELDS
        : url.pathname === '/api/v1/milestones'
          ? MILESTONE_CREATE_FIELDS
          : url.pathname === '/api/v1/milestones/update'
            ? MILESTONE_UPDATE_FIELDS
            : url.pathname === '/api/v1/comments'
              ? COMMENT_FIELDS
              : url.pathname === '/api/v1/links'
                ? LINK_FIELDS
                : null;
  if (!allowed) return json({ error: 'Not found' }, 404);
  const unknown = unknownFieldError(parsed, allowed);
  if (visibility || unknown) {
    const result = await ctx.runMutation(internal.portalApi.rememberResult, {
      ...idem,
      status: 400,
      body: JSON.stringify({ error: visibility ?? unknown }),
    });
    return json(result.body, result.status);
  }

  try {
    const result = await dispatchWrite(ctx, url.pathname, parsed, { ...idem, tokenName: consumed.name });
    return json(result.body, result.status);
  } catch (error) {
    if (error instanceof ConvexError && typeof error.data === 'string') return json({ error: error.data }, 400);
    return json({ error: 'Request failed' }, 400);
  }
});

async function dispatchWrite(
  ctx: ActionCtx,
  path: string,
  body: Record<string, unknown>,
  actor: { tokenId: Id<'apiTokens'>; tokenName: string; key: string; requestHash: string },
): Promise<ApiResult> {
  if (path === '/api/v1/tasks') {
    return ctx.runMutation(internal.portalApi.createTask, {
      ...actor,
      projectId: body.projectId as Id<'projects'>,
      name: String(body.name ?? ''),
      status: String(body.status ?? ''),
      date: typeof body.date === 'string' ? body.date : undefined,
      stage: typeof body.stage === 'string' ? body.stage : undefined,
      milestoneId: typeof body.milestoneId === 'string' ? (body.milestoneId as Id<'milestones'>) : undefined,
    });
  }
  if (path === '/api/v1/tasks/update') {
    return ctx.runMutation(internal.portalApi.updateTask, {
      ...actor,
      taskId: body.taskId as Id<'tasks'>,
      expectedLastEditedTime: String(body.expectedLastEditedTime ?? ''),
      status: typeof body.status === 'string' ? body.status : undefined,
      priority: body.priority === null || typeof body.priority === 'string' ? body.priority : undefined,
      nextAction: body.nextAction === null || typeof body.nextAction === 'string' ? body.nextAction : undefined,
      stage: typeof body.stage === 'string' ? body.stage : undefined,
      pullRequestLink: typeof body.pullRequestLink === 'string' ? body.pullRequestLink : undefined,
    });
  }
  if (path === '/api/v1/milestones') {
    return ctx.runMutation(internal.portalApi.createMilestone, {
      ...actor,
      projectId: body.projectId as Id<'projects'>,
      name: String(body.name ?? ''),
      objective: String(body.objective ?? ''),
      goals: Array.isArray(body.goals) ? body.goals.filter((goal): goal is string => typeof goal === 'string') : [],
      workStatus: typeof body.workStatus === 'string' ? body.workStatus : undefined,
    });
  }
  if (path === '/api/v1/milestones/update') {
    return ctx.runMutation(internal.portalApi.updateMilestone, {
      ...actor,
      milestoneId: body.milestoneId as Id<'milestones'>,
      name: typeof body.name === 'string' ? body.name : undefined,
      objective: typeof body.objective === 'string' ? body.objective : undefined,
      goals: Array.isArray(body.goals) ? body.goals.filter((goal): goal is string => typeof goal === 'string') : undefined,
      workStatus: typeof body.workStatus === 'string' ? body.workStatus : undefined,
    });
  }
  if (path === '/api/v1/comments') {
    return ctx.runMutation(internal.portalApi.addComment, {
      ...actor,
      taskId: body.taskId as Id<'tasks'>,
      body: String(body.body ?? ''),
    });
  }
  return ctx.runMutation(internal.portalApi.addLink, {
    ...actor,
    taskId: body.taskId as Id<'tasks'>,
    kind: String(body.kind ?? ''),
    url: String(body.url ?? ''),
    title: typeof body.title === 'string' ? body.title : undefined,
    expectedLastEditedTime: typeof body.expectedLastEditedTime === 'string' ? body.expectedLastEditedTime : undefined,
  });
}
