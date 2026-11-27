/**
 * Staff-only /api/v1. Tokens are hashed. Writes that mirror a Notion task use
 * the outbox: kind `update` for field and link patches and kind `task-stage`
 * for stage moves. A task created here lives inside a milestone and is stored
 * in the portal only, like a staff add. Milestones and comments stay in Convex. There is no Notion database or comment write for them.
 */

import { ConvexError, v } from 'convex/values';
import {
  authorizeApiCall,
  bearerToken,
  claimIdempotency,
  createProjectExternalId,
  IDEMPOTENCY_IN_PROGRESS_ERROR,
  idempotencyKeyError,
  idempotencyMaterial,
  pageLimit,
  planApiComment,
  planApiLink,
  planApiLinkPatch,
  planApiTaskCreate,
  takeRateLimit,
  taskListPlan,
  unknownFieldError,
  visibilityWriteError,
} from '@warehaus/portal-sync';
import { internal } from './_generated/api';
import { GRILLING_INSTRUCTIONS, GRILLING_INSTRUCTIONS_VERSION } from './_lib/grillingInstructions';
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
import {
  attachFailureCode,
  attachFailureStatus,
  contentEditDecision,
  createMilestoneDecision,
  writeMilestoneActivity,
  type AttachFailureCode,
} from './_lib/milestones';
import {
  PORTAL_MILESTONE_TASK_SOURCE,
  isPortalOwnedTask,
  taskMilestoneGate,
  taskOrigin,
} from './_lib/milestoneTasks';
import {
  BOT_STATUS_BUILDING,
  STATUS_EVENT_LIMIT,
  STATUS_NOTE_LIMIT,
  STATUS_REVIEW_LIMIT,
  STATUS_TASK_LIMIT,
  createdViaDecision,
  noteDecision,
  proposedTasksDecision,
  statusForBotCreate,
} from './_lib/milestoneBot';
import { currentIteration, NEW_ITERATION_TASK_DONE } from './_lib/milestoneReview';
import { reviewPreviews } from './_lib/previewLink';
import { uniqueMilestoneBranch } from './_lib/milestoneBranchStore';
import { planningForNewMilestone } from './_lib/agentRun';
import { ASK_PERSON_MAX, ASK_PERSON_PETER, openAsks, staffContactForPerson } from './_lib/askStore';
import { resolveShipLink, verifyPullMerged } from './_lib/githubPull';
import { changeMilestoneStatus } from './_lib/milestoneLifecycle';
import { apiStatusFields, apiStatusInput } from './_lib/milestoneStatus';
import { contextSourceForToken } from './_lib/projectContext';
import { convexFailureText } from './_lib/userFacingError';
import { applyTaskChanges, type TaskChange } from './_lib/taskChange';
import { staffMayReadOrg, staffOrgs, staffTask } from './_lib/staffRead';
import { insertMilestoneTask } from './_lib/milestoneTaskCreate';

const PAGE_CAP = 50;

type ApiResult = { status: number; body: unknown };

function fail(status: number, error: string, code?: string): ApiResult {
  return { status, body: code ? { error, code } : { error } };
}

const ATTACH_FALLBACK = 'The milestone link failed before a reason was returned';

function attachError(error: string, code: AttachFailureCode | 'failed'): ApiResult {
  const text = error === 'Request failed' ? ATTACH_FALLBACK : error;
  return fail(attachFailureStatus(code), text, code);
}

function staffMilestone(row: Doc<'milestones'>) {
  return {
    id: row._id,
    orgId: row.orgId,
    projectId: row.projectId,
    name: row.name,
    objective: row.objective,
    goals: row.goals,
    // `status` is the field. `stage` and `workStatus` are aliases for one release.
    ...apiStatusFields(row.status),
    approval: row.approval,
    publishToWarehaus: row.publishToWarehaus,
  };
}

async function openIdempotency(
  ctx: MutationCtx,
  args: { tokenId: Id<'apiTokens'>; key: string; requestHash: string },
): Promise<{ action: 'start'; id: Id<'apiIdempotency'> } | ApiResult> {
  const existing = await ctx.db
    .query('apiIdempotency')
    .withIndex('by_tokenId_key', (q) => q.eq('tokenId', args.tokenId).eq('key', args.key))
    .unique();
  const now = Date.now();
  const claim = claimIdempotency(
    existing
      ? {
          requestHash: existing.requestHash,
          state: existing.state,
          status: existing.status,
          body: existing.body,
          createdAt: existing.createdAt,
        }
      : null,
    args.requestHash,
    now,
  );
  if (claim.action === 'reclaim') {
    if (!existing) return fail(409, IDEMPOTENCY_IN_PROGRESS_ERROR);
    return { action: 'start', id: existing._id };
  }
  if (claim.action === 'start') {
    const id = await ctx.db.insert('apiIdempotency', {
      tokenId: args.tokenId,
      key: args.key,
      requestHash: args.requestHash,
      state: 'pending',
      createdAt: now,
    });
    return { action: 'start', id };
  }
  if (claim.action === 'in_progress') {
    return fail(409, IDEMPOTENCY_IN_PROGRESS_ERROR);
  }
  if (claim.action === 'mismatch') {
    return fail(409, 'Idempotency key was already used for a different request');
  }
  try {
    return { status: claim.status, body: JSON.parse(claim.body) as unknown };
  } catch {
    return fail(500, 'Stored response could not be read');
  }
}

async function finishIdempotency(
  ctx: MutationCtx,
  id: Id<'apiIdempotency'>,
  result: ApiResult,
): Promise<ApiResult> {
  const row = await ctx.db.get(id);
  if (!row) return result;
  await ctx.db.patch(id, {
    state: 'done',
    status: result.status,
    body: JSON.stringify(result.body),
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
    return finishIdempotency(ctx, opened.id, { status: args.status, body: JSON.parse(args.body) as unknown });
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
  milestoneId: v.optional(v.id('milestones')),
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
      milestoneId: args.milestoneId,
      status: args.status,
      stage: args.stage,
      updatedSince: args.updatedSince,
    });
    if (!plan.ok) return fail(400, plan.error);
    const opts = { numItems: Math.min(args.limit, PAGE_CAP), cursor: args.cursor };
    const projectId = args.projectId;
    const visibleOrg = staffOrgs(ctx).visible;
    let milestone: Doc<'milestones'> | null = null;
    if (plan.index === 'by_milestone') {
      if (!args.milestoneId) return fail(400, 'Milestone id is required');
      milestone = await ctx.db.get(args.milestoneId);
      if (!milestone || !(await visibleOrg(milestone.orgId))) return fail(404, 'Milestone not found');
      if (projectId && projectId !== milestone.projectId) {
        return fail(400, 'Milestone is on a different project');
      }
    }
    const page = await (async () => {
      switch (plan.index) {
        case 'by_milestone': {
          const milestoneRow = milestone;
          if (!milestoneRow) return null;
          return ctx.db
            .query('tasks')
            .withIndex('by_orgId_milestoneId', (q) =>
              q.eq('orgId', milestoneRow.orgId).eq('milestoneId', milestoneRow._id),
            )
            .paginate(opts);
        }
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
    if (!page) return fail(400, 'Choose a project, milestone, status, stage, or updatedSince');
    // Concealed orgs are dropped after the page is read, so a page can be shorter than `limit` while `hasMore` is true.
    const visible = [];
    for (const row of page.page) {
      if (await visibleOrg(row.orgId)) visible.push(row);
    }
    return {
      status: 200,
      body: {
        items: visible.map((row) => {
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
            source: task.source,
            portalOwned: task.portalOwned,
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
    if (!task || !(await staffMayReadOrg(ctx, task.orgId))) return fail(404, 'Task not found');
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
    if (!project || !(await staffMayReadOrg(ctx, project.orgId))) return fail(404, 'Project not found');
    const page = await ctx.db
      .query('milestones')
      .withIndex('by_projectId', (q) => q.eq('projectId', args.projectId))
      .paginate({ numItems: Math.min(args.limit, PAGE_CAP), cursor: args.cursor });
    return {
      status: 200,
      body: {
        items: page.page.filter((row) => row.archivedAt == null).map(staffMilestone),
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
    if (!task || !(await staffMayReadOrg(ctx, task.orgId))) return fail(404, 'Task not found');
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
    if (!task || !(await staffMayReadOrg(ctx, task.orgId))) return fail(404, 'Task not found');
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

/**
 * One task inside a milestone. It is stored in the portal only, the way a staff
 * add or a create_milestone task list is: no Notion page and no outbox row. A
 * Notion create would land unpublished, the pull gate would skip it, and the
 * task would never reach the milestone.
 */
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
    if (!project || !(await staffMayReadOrg(ctx, project.orgId))) {
      return finishIdempotency(ctx, opened.id, fail(404, 'Project not found'));
    }
    const milestone = args.milestoneId ? await ctx.db.get(args.milestoneId) : null;
    const milestoneGate = taskMilestoneGate(milestone, { orgId: project.orgId, projectId: project._id });
    if (!milestoneGate.ok || !milestone) {
      return finishIdempotency(ctx, opened.id, fail(400, milestoneGate.ok ? 'Milestone not found' : milestoneGate.reason));
    }
    const externalId = `wh_tsk_${(await sha256Hex(`${args.tokenId}:${args.key}`)).slice(0, 24)}`;
    // Same name, status, date and stage rules as before. The Notion properties are not sent.
    const planned = planApiTaskCreate({
      name: args.name,
      status: args.status,
      projectNotionId: project.notionPageId,
      externalId,
      date: args.date,
      stage: args.stage,
    });
    if (!planned.ok) return finishIdempotency(ctx, opened.id, fail(400, planned.error));
    const inserted = await insertMilestoneTask(ctx, {
      project,
      milestone,
      name: String(planned.properties.Name),
      status: args.status,
      date: args.date,
      stage: args.stage,
      via: 'api',
      ref: externalId,
    });
    if (!inserted.ok) return finishIdempotency(ctx, opened.id, fail(400, inserted.reason));
    return finishIdempotency(ctx, opened.id, {
      status: 200,
      body: { id: inserted.taskId, externalId: inserted.key, milestoneId: milestone._id, duplicate: inserted.duplicate },
    });
  },
});

export const updateTask = internalMutation({
  args: {
    ...idemArgs,
    tokenName: v.string(),
    taskId: v.id('tasks'),
    /** Required for a Notion-backed task. Ignored for a Portal-only task, which has no Notion edit time. */
    expectedLastEditedTime: v.optional(v.string()),
    status: v.optional(v.string()),
    priority: v.optional(v.union(v.string(), v.null())),
    nextAction: v.optional(v.union(v.string(), v.null())),
    stage: v.optional(v.string()),
    pullRequestLink: v.optional(v.string()),
    /** Set by the HTTP action after GitHub confirms the merge. Not a request field. */
    verifiedMerge: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<ApiResult> => {
    const opened = await openIdempotency(ctx, args);
    if (!('action' in opened)) return opened;
    const task = await ctx.db.get(args.taskId);
    if (!task || !(await staffMayReadOrg(ctx, task.orgId))) {
      return finishIdempotency(ctx, opened.id, fail(404, 'Task not found'));
    }
    const changes: TaskChange[] = [];
    if (args.status !== undefined) changes.push({ field: 'status', status: args.status });
    if (args.priority !== undefined) changes.push({ field: 'priority', priority: args.priority });
    if (args.nextAction !== undefined) changes.push({ field: 'nextAction', nextAction: args.nextAction });
    if (args.stage !== undefined) {
      changes.push({
        field: 'stage',
        stage: args.stage,
        pullRequestLink: args.pullRequestLink,
        verifiedMerge: args.verifiedMerge === true,
      });
    }
    const now = Date.now();
    const result = await applyTaskChanges(ctx, task, changes, {
      actor: 'api',
      actorId: args.tokenName,
      // Missing still means stale for a Notion-backed task. applyTaskChanges skips the check for Portal-only tasks.
      expectedLastEditedTime: args.expectedLastEditedTime ?? '',
      at: now,
    });
    if (!result.ok) {
      const status = result.code === 'stale' || result.code === 'conflict' ? 409 : 400;
      return finishIdempotency(ctx, opened.id, fail(status, result.error, result.code));
    }
    return finishIdempotency(ctx, opened.id, {
      status: 200,
      body: { id: task._id, updatedAt: result.wrote ? now : task.updatedAt, notion: result.notion },
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
    status: v.optional(v.string()),
    stage: v.optional(v.string()),
    workStatus: v.optional(v.string()),
    tokenName: v.optional(v.string()),
    /** Validated by proposedTasksDecision. 3 to 10 tasks, or none. */
    proposedTasks: v.optional(v.any()),
    createdVia: v.optional(v.any()),
  },
  handler: async (ctx, args): Promise<ApiResult> => {
    const opened = await openIdempotency(ctx, args);
    if (!('action' in opened)) return opened;
    const project = await ctx.db.get(args.projectId);
    if (!project || !(await staffMayReadOrg(ctx, project.orgId))) {
      return finishIdempotency(ctx, opened.id, fail(404, 'Project not found'));
    }
    const wanted = apiStatusInput(args);
    if (!wanted.ok) return finishIdempotency(ctx, opened.id, fail(400, wanted.reason));
    const proposed = proposedTasksDecision(args.proposedTasks);
    if (!proposed.ok) return finishIdempotency(ctx, opened.id, fail(400, proposed.reason));
    // A createdVia on the request is ignored. The token name decides.
    const via = createdViaDecision({ tokenName: args.tokenName ?? '' });
    const status = statusForBotCreate(wanted.status);
    if (!status.ok) return finishIdempotency(ctx, opened.id, fail(400, status.reason));
    const created = createMilestoneDecision({
      actor: 'human',
      name: args.name,
      objective: args.objective,
      goals: args.goals,
      status: status.status,
    });
    if (!created.ok) return finishIdempotency(ctx, opened.id, fail(400, created.reason));
    const milestoneId = await ctx.db.insert('milestones', {
      orgId: project.orgId,
      projectId: project._id,
      name: created.milestone.name,
      objective: created.milestone.objective,
      goals: created.milestone.goals,
      status: created.milestone.status,
      approval: created.milestone.approval,
      publishToWarehaus: created.milestone.publishToWarehaus,
      createdVia: via.createdVia,
      branch: await uniqueMilestoneBranch(ctx, created.milestone.name),
      // A bot that sends its own task list skips planning. One that sends none is planned.
      ...(planningForNewMilestone({ taskCount: proposed.tasks.length, status: created.milestone.status })
        ? { planning: 'queued' as const, planningIteration: 1 }
        : {}),
    });
    // The milestone and its task list land in one transaction. The tasks are
    // stored in the portal only: no Notion page and no outbox row.
    const at = Date.now();
    const taskIds: Id<'tasks'>[] = [];
    for (const [index, task] of proposed.tasks.entries()) {
      const key = `${PORTAL_MILESTONE_TASK_SOURCE}:${milestoneId}:brief:${index}`;
      taskIds.push(
        await ctx.db.insert('tasks', {
          orgId: project.orgId,
          projectId: project._id,
          notionPageId: key,
          externalId: key,
          lastSyncedAt: at,
          name: task.title,
          ...(task.detail ? { description: task.detail, descriptionSource: 'property' as const } : {}),
          status: 'To Do',
          isDone: NEW_ITERATION_TASK_DONE,
          stage: 'Awaiting Go',
          publishToWarehaus: false,
          source: PORTAL_MILESTONE_TASK_SOURCE,
          origin: 'brief',
          milestoneId,
          milestoneOrder: index,
          updatedAt: at,
        }),
      );
    }
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
    return finishIdempotency(ctx, opened.id, {
      status: 200,
      body: { id: milestoneId, status: created.milestone.status, createdVia: via.createdVia, taskIds },
    });
  },
});

/**
 * One milestone for a bot: status, the ordered checklist, both previews, the
 * pull request, and the latest reviews, notes and events. Every read is
 * indexed and capped.
 */
export const getMilestoneStatus = internalQuery({
  args: { milestoneId: v.id('milestones') },
  handler: async (ctx, args): Promise<ApiResult> => {
    const milestone = await ctx.db.get(args.milestoneId);
    if (!milestone || !(await staffMayReadOrg(ctx, milestone.orgId))) return fail(404, 'Milestone not found');
    const tasks = await ctx.db
      .query('tasks')
      .withIndex('by_orgId_milestoneId', (q) => q.eq('orgId', milestone.orgId).eq('milestoneId', milestone._id))
      .take(STATUS_TASK_LIMIT);
    const ordered = tasks
      .filter((task) => task.archivedAt == null)
      .sort((a, b) => (a.milestoneOrder ?? Number.MAX_SAFE_INTEGER) - (b.milestoneOrder ?? Number.MAX_SAFE_INTEGER));
    const reviews = await ctx.db
      .query('milestoneReviews')
      .withIndex('by_org_milestone_iteration', (q) => q.eq('orgId', milestone.orgId).eq('milestoneId', milestone._id))
      .order('desc')
      .take(STATUS_REVIEW_LIMIT);
    const notes = await ctx.db
      .query('milestoneNotes')
      .withIndex('by_milestone_createdAt', (q) => q.eq('milestoneId', milestone._id))
      .order('desc')
      .take(STATUS_NOTE_LIMIT);
    const recent = await ctx.db
      .query('activity')
      .withIndex('by_milestoneId_timestamp', (q) => q.eq('milestoneId', milestone._id))
      .order('desc')
      .take(STATUS_EVENT_LIMIT);
    const previews = reviewPreviews(milestone);
    return {
      status: 200,
      body: {
        ...staffMilestone(milestone),
        iteration: currentIteration(milestone.iteration),
        createdVia: milestone.createdVia ?? null,
        dueDate: milestone.dueDate ?? null,
        tasks: ordered.map((task, index) => ({
          id: task._id,
          order: index + 1,
          name: task.name,
          status: task.status,
          isDone: task.isDone,
          origin: taskOrigin({ origin: task.origin, source: task.source }),
          round: task.round ?? null,
        })),
        taskCounts: {
          total: ordered.length,
          done: ordered.filter((task) => task.isDone).length,
        },
        previews: { local: previews.local, vercel: previews.vercel },
        branch: milestone.branch ?? null,
        pullRequest: {
          url: milestone.prUrl ?? null,
          number: milestone.previewPrNumber ?? null,
          title: milestone.previewPrTitle ?? null,
          branch: milestone.previewBranch ?? null,
          commit: milestone.previewCommit ?? null,
        },
        reviews: reviews.map((review) => ({
          iteration: review.iteration,
          decision: review.decision,
          notes: review.notes,
          decidedAt: review.decidedAt,
          source: review.source,
          createdTaskCount: review.createdTaskIds.length,
        })),
        notes: notes.map((note) => ({
          id: note._id,
          body: note.body,
          addedBy: note.addedBy,
          createdAt: note.createdAt,
          reason: note.reason ?? null,
          open: note.open === true,
          waitingOn: note.waitingOn ?? null,
        })),
        events: recent.map((row) => ({ type: row.type, summary: row.summary ?? null, at: row.timestamp })),
      },
    };
  },
});

/**
 * Open Asks: approval requests and blocked tasks, newest first. With
 * `waitingOn` or `person`, only the Asks waiting on that staff member. One
 * indexed read, at most 20. Grok Bot reads this to know what to raise, and
 * with whom.
 *
 * `person` is `peter`, a staff email or a staff contact id. A person who is
 * not staff is a 404, so a typo is not read as "nothing is waiting".
 * `personOptional` is for the old needs-peter route only: where Peter has no
 * contact, Asks wait on no one, and that route still lists them.
 */
export const listOpenAsks = internalQuery({
  args: {
    waitingOn: v.optional(v.id('contacts')),
    person: v.optional(v.string()),
    personOptional: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<ApiResult> => {
    let waitingOn = args.waitingOn;
    if (!waitingOn && args.person != null) {
      const contactId = await staffContactForPerson(ctx, args.person);
      if (!contactId && args.personOptional !== true) {
        return { status: 404, body: { error: 'No staff member matches that person' } };
      }
      waitingOn = contactId ?? undefined;
    }
    const open = await openAsks(ctx, { waitingOn });
    const people = new Map<string, { id: Id<'contacts'>; name: string } | null>();
    const items = [];
    for (const note of open) {
      if (!(await staffMayReadOrg(ctx, note.orgId))) continue;
      const milestone = await ctx.db.get(note.milestoneId);
      if (!milestone) continue;
      let waitingOn: { id: Id<'contacts'>; name: string } | null = null;
      if (note.waitingOn) {
        if (!people.has(note.waitingOn)) {
          const contact = await ctx.db.get(note.waitingOn);
          people.set(note.waitingOn, contact ? { id: contact._id, name: contact.name } : null);
        }
        waitingOn = people.get(note.waitingOn) ?? null;
      }
      items.push({
        id: note._id,
        milestoneId: milestone._id,
        milestoneName: milestone.name,
        projectId: milestone.projectId,
        reason: note.reason ?? null,
        waitingOn,
        body: note.body,
        status: milestone.status,
        iteration: currentIteration(milestone.iteration),
        createdAt: note.createdAt,
      });
    }
    return { status: 200, body: { items } };
  },
});

/** A staff note on a milestone. Staff only: no client query reads the notes table. */
export const addMilestoneNote = internalMutation({
  args: { ...idemArgs, tokenName: v.string(), milestoneId: v.id('milestones'), body: v.string() },
  handler: async (ctx, args): Promise<ApiResult> => {
    const opened = await openIdempotency(ctx, args);
    if (!('action' in opened)) return opened;
    const milestone = await ctx.db.get(args.milestoneId);
    if (!milestone || !(await staffMayReadOrg(ctx, milestone.orgId))) {
      return finishIdempotency(ctx, opened.id, fail(404, 'Milestone not found'));
    }
    const note = noteDecision(args.body);
    if (!note.ok) return finishIdempotency(ctx, opened.id, fail(400, note.reason));
    const id = await ctx.db.insert('milestoneNotes', {
      orgId: milestone.orgId,
      milestoneId: milestone._id,
      body: note.body,
      addedBy: args.tokenName,
      createdAt: Date.now(),
    });
    return finishIdempotency(ctx, opened.id, { status: 200, body: { id } });
  },
});

export const updateMilestone = internalMutation({
  args: {
    ...idemArgs,
    milestoneId: v.id('milestones'),
    name: v.optional(v.string()),
    objective: v.optional(v.string()),
    goals: v.optional(v.array(v.string())),
    status: v.optional(v.string()),
    stage: v.optional(v.string()),
    workStatus: v.optional(v.string()),
    tokenName: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<ApiResult> => {
    const opened = await openIdempotency(ctx, args);
    if (!('action' in opened)) return opened;
    const milestone = await ctx.db.get(args.milestoneId);
    if (!milestone || !(await staffMayReadOrg(ctx, milestone.orgId))) {
      return finishIdempotency(ctx, opened.id, fail(404, 'Milestone not found'));
    }
    const contentFields = args.name != null || args.objective != null || args.goals != null;
    const edited = contentFields
      ? contentEditDecision({
          actor: 'human',
          approval: milestone.approval,
          patch: { name: args.name, objective: args.objective, goals: args.goals },
        })
      : { ok: true as const, patch: {} };
    if (!edited.ok) return finishIdempotency(ctx, opened.id, fail(400, edited.reason));
    const wanted = apiStatusInput(args);
    if (!wanted.ok) return finishIdempotency(ctx, opened.id, fail(400, wanted.reason));
    if (wanted.status === 'Building') return finishIdempotency(ctx, opened.id, fail(400, BOT_STATUS_BUILDING));
    if (Object.keys(edited.patch).length === 0 && wanted.status == null) {
      return finishIdempotency(ctx, opened.id, fail(400, 'At least one field is required'));
    }
    // The status first: a refusal writes nothing, so the content edit must not land before it.
    if (wanted.status != null) {
      const moved = await changeMilestoneStatus(ctx, milestone, {
        cause: 'set',
        to: wanted.status,
        actorName: args.tokenName?.trim() || 'Staff API',
        at: Date.now(),
      });
      if (!moved.ok) return finishIdempotency(ctx, opened.id, fail(400, moved.reason));
    }
    // A repeat of the stored values writes nothing.
    if (Object.keys(edited.patch).length > 0) await ctx.db.patch(milestone._id, edited.patch);
    return finishIdempotency(ctx, opened.id, { status: 200, body: { id: milestone._id } });
  },
});

export const addComment = internalMutation({
  args: { ...idemArgs, tokenName: v.string(), taskId: v.id('tasks'), body: v.string() },
  handler: async (ctx, args): Promise<ApiResult> => {
    const opened = await openIdempotency(ctx, args);
    if (!('action' in opened)) return opened;
    const task = await ctx.db.get(args.taskId);
    if (!task || !(await staffMayReadOrg(ctx, task.orgId))) {
      return finishIdempotency(ctx, opened.id, fail(404, 'Task not found'));
    }
    const planned = planApiComment(args.body);
    if (!planned.ok) return finishIdempotency(ctx, opened.id, fail(400, planned.error));
    const id = await ctx.db.insert('taskComments', {
      orgId: task.orgId,
      taskId: task._id,
      body: planned.body,
      addedBy: args.tokenName,
      createdAt: Date.now(),
    });
    return finishIdempotency(ctx, opened.id, { status: 200, body: { id } });
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
    if (!task || !(await staffMayReadOrg(ctx, task.orgId))) {
      return finishIdempotency(ctx, opened.id, fail(404, 'Task not found'));
    }
    const planned = planApiLink({ kind: args.kind, url: args.url, title: args.title });
    if (!planned.ok) return finishIdempotency(ctx, opened.id, fail(400, planned.error));
    // A Portal-only task has no Notion page, so its link stays in the portal and needs no read time.
    if (planned.property && !isPortalOwnedTask(task)) {
      if (!args.expectedLastEditedTime) {
        return finishIdempotency(ctx, opened.id, fail(400, 'Updates require the last read time'));
      }
      if ((task.lastEditedTime ?? '') !== args.expectedLastEditedTime) {
        return finishIdempotency(ctx, opened.id, fail(409, 'Notion changed since the last read'));
      }
      const patch = planApiLinkPatch(planned.property, planned.url);
      if (!patch.ok) return finishIdempotency(ctx, opened.id, fail(400, patch.error));
      const queued = await ctx.runMutation(internal.sync.outbox.enqueue, {
        idempotencyKey: `api-link:${args.tokenId}:${args.key}`,
        kind: 'task-link',
        orgId: task.orgId,
        database: 'tasks',
        notionPageId: task.notionPageId,
        expectedLastEditedTime: args.expectedLastEditedTime,
        payload: JSON.stringify({ properties: patch.properties }),
        actor: 'staff' as const,
        actorId: args.tokenName,
        schedule: true,
      });
      if (!queued.ok) return finishIdempotency(ctx, opened.id, fail(400, queued.error));
    }
    const existing = await ctx.db
      .query('taskLinks')
      .withIndex('by_taskId', (q) => q.eq('taskId', task._id))
      .take(PAGE_CAP);
    const found = existing.find((row) => row.kind === planned.kind && row.url === planned.url);
    if (found) return finishIdempotency(ctx, opened.id, { status: 200, body: { id: found._id, duplicate: true } });
    const id = await ctx.db.insert('taskLinks', {
      orgId: task.orgId,
      taskId: task._id,
      kind: planned.kind,
      url: planned.url,
      ...(planned.title ? { title: planned.title } : {}),
      addedBy: args.tokenName,
      createdAt: Date.now(),
    });
    return finishIdempotency(ctx, opened.id, { status: 200, body: { id, duplicate: false } });
  },
});

export const openWrite = internalMutation({
  args: idemArgs,
  handler: async (ctx, args) => openIdempotency(ctx, args),
});

export const closeWrite = internalMutation({
  args: { id: v.id('apiIdempotency'), status: v.number(), body: v.string() },
  handler: async (ctx, args): Promise<ApiResult> => {
    return finishIdempotency(ctx, args.id, { status: args.status, body: JSON.parse(args.body) as unknown });
  },
});

export const attachTask = internalMutation({
  args: { ...idemArgs, milestoneId: v.id('milestones'), taskId: v.id('tasks') },
  handler: async (ctx, args): Promise<ApiResult> => {
    const opened = await openIdempotency(ctx, args);
    if (!('action' in opened)) return opened;
    const milestone = await ctx.db.get(args.milestoneId);
    const task = await ctx.db.get(args.taskId);
    if (!milestone || !(await staffMayReadOrg(ctx, milestone.orgId))) {
      return finishIdempotency(ctx, opened.id, attachError('Milestone not found', 'not_found'));
    }
    if (!task || !(await staffMayReadOrg(ctx, task.orgId))) {
      return finishIdempotency(ctx, opened.id, attachError('Task not found', 'not_found'));
    }
    try {
      const linked = await ctx.runMutation(internal.milestones.attachTaskForApi, {
        milestoneId: args.milestoneId,
        taskId: args.taskId,
      });
      if (!linked.ok) return finishIdempotency(ctx, opened.id, attachError(linked.error, linked.code));
      return finishIdempotency(ctx, opened.id, { status: 200, body: linked });
    } catch (error) {
      const message = convexFailureText(error);
      const code = attachFailureCode(message);
      return finishIdempotency(ctx, opened.id, attachError(message, code));
    }
  },
});

export const detachTask = internalMutation({
  args: { ...idemArgs, milestoneId: v.id('milestones'), taskId: v.id('tasks') },
  handler: async (ctx, args): Promise<ApiResult> => {
    const opened = await openIdempotency(ctx, args);
    if (!('action' in opened)) return opened;
    const milestone = await ctx.db.get(args.milestoneId);
    const task = await ctx.db.get(args.taskId);
    if (!milestone || !(await staffMayReadOrg(ctx, milestone.orgId))) {
      return finishIdempotency(ctx, opened.id, attachError('Milestone not found', 'not_found'));
    }
    if (!task || !(await staffMayReadOrg(ctx, task.orgId))) {
      return finishIdempotency(ctx, opened.id, attachError('Task not found', 'not_found'));
    }
    try {
      const linked = await ctx.runMutation(internal.milestones.detachTaskForApi, {
        milestoneId: args.milestoneId,
        taskId: args.taskId,
      });
      if (!linked.ok) return finishIdempotency(ctx, opened.id, attachError(linked.error, linked.code));
      return finishIdempotency(ctx, opened.id, { status: 200, body: linked });
    } catch (error) {
      const message = convexFailureText(error);
      const code = attachFailureCode(message);
      return finishIdempotency(ctx, opened.id, attachError(message, code));
    }
  },
});

/** Staff write reads the task's pull request link. Bounded to the task's link rows. */
export const taskPullRequest = internalQuery({
  args: { taskId: v.id('tasks') },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) return { ok: false as const, error: 'Task not found' };
    const links = await ctx.db
      .query('taskLinks')
      .withIndex('by_taskId', (q) => q.eq('taskId', task._id))
      .take(50);
    return {
      ok: true as const,
      pullRequestUrl: task.pullRequestUrl ?? null,
      links: links.filter((row) => row.kind === 'PR').map((row) => row.url),
    };
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
// `stage` and `workStatus` are aliases of `status` for one release.
const MILESTONE_CREATE_FIELDS = [
  'projectId',
  'name',
  'objective',
  'goals',
  'status',
  'stage',
  'workStatus',
  'proposedTasks',
  'createdVia',
];
const NOTE_FIELDS = ['milestoneId', 'body'];
const MILESTONE_UPDATE_FIELDS = ['milestoneId', 'name', 'objective', 'goals', 'status', 'stage', 'workStatus'];
const DETACH_FIELDS = ['milestoneId', 'taskId'];
const COMMENT_FIELDS = ['taskId', 'body'];
const LINK_FIELDS = ['taskId', 'kind', 'url', 'title', 'expectedLastEditedTime'];
const CLIENT_CREATE_FIELDS = ['companyName', 'primaryEmail', 'phone'];
const PROJECT_CREATE_FIELDS = ['name', 'clientId', 'client', 'externalId', 'publishToWarehaus'];
const ATTACH_FIELDS = ['milestoneId', 'taskId'];
const REVIEW_FIELDS = ['iteration', 'decision', 'notes', 'taskIds', 'newTasks'];
const CONTEXT_BRIEF_FIELDS = ['projectId', 'goal', 'audience', 'outOfScope', 'doneWhen'];
const CONTEXT_TERM_FIELDS = ['projectId', 'term', 'definition'];
const CONTEXT_DECISION_FIELDS = ['projectId', 'title', 'body'];
const REVIEW_PATH = /^\/api\/v1\/milestones\/([^/]+)\/review$/;
const CLIENT_NESTED_FIELDS = ['companyName', 'primaryEmail', 'phone'];

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function queryLimit(url: URL): number | null {
  return pageLimit(url.searchParams.get('limit'));
}

function projectShapeError(body: Record<string, unknown>): string | null {
  if (
    Object.prototype.hasOwnProperty.call(body, 'publishToWarehaus') &&
    body.publishToWarehaus !== true &&
    body.publishToWarehaus !== false
  ) {
    return 'publishToWarehaus must be true or false';
  }
  const hasId = typeof body.clientId === 'string' && body.clientId.length > 0;
  const hasClient = body.client != null;
  if (hasId === hasClient) return 'Provide a clientId or a new client';
  if (!hasClient) return null;
  const client = asRecord(body.client);
  if (!client) return 'Client must be an object';
  return unknownFieldError(client, CLIENT_NESTED_FIELDS);
}

type ApiActor = {
  tokenId: Id<'apiTokens'>;
  tokenName: string;
  key: string;
  requestHash: string;
};

/**
 * Idempotency fields only. `tokenName` belongs on mutations that store the
 * caller (`actorId`, `addedBy`, `updatedBy`). Convex rejects it everywhere else.
 */
function idempotencyActor(actor: ApiActor) {
  return {
    tokenId: actor.tokenId,
    key: actor.key,
    requestHash: actor.requestHash,
  };
}

async function finishAction(
  ctx: ActionCtx,
  actor: ApiActor,
  run: () => Promise<ApiResult>,
): Promise<ApiResult> {
  const opened = await ctx.runMutation(internal.portalApi.openWrite, idempotencyActor(actor));
  if (!('action' in opened)) return opened;
  let result: ApiResult;
  try {
    result = await run();
  } catch (error) {
    const message = error instanceof ConvexError && typeof error.data === 'string' ? error.data : 'Request failed';
    result = fail(400, message);
  }
  if (result.status === 409) return result;
  return ctx.runMutation(internal.portalApi.closeWrite, {
    id: opened.id,
    status: result.status,
    body: JSON.stringify(result.body),
  });
}

export const portalApiHttp = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  const method = request.method === 'GET' || request.method === 'POST' ? request.method : null;
  if (!method) return json({ error: 'Method not allowed' }, 405);
  const token = bearerToken(request.headers.get('authorization'));
  if (!token) return json({ error: 'Unauthorized' }, 401);
  if (method === 'GET' && url.pathname === '/api/v1/session') {
    const session = await ctx.runQuery(internal.portalCatalog.readSession, { tokenHash: await sha256Hex(token) });
    if (!session.ok) return json({ error: session.error }, session.status);
    return json({ name: session.name, scope: session.scope }, 200);
  }
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
          milestoneId: (url.searchParams.get('milestoneId') || undefined) as Id<'milestones'> | undefined,
          status: url.searchParams.get('status') || undefined,
          stage: url.searchParams.get('stage') || undefined,
          updatedSince: updatedSince ? Number(updatedSince) : undefined,
          cursor,
          limit,
        });
        return json(result.body, result.status);
      }
      if (url.pathname === '/api/v1/milestones/asks') {
        const person = url.searchParams.get('person')?.trim();
        if (person && person.length > ASK_PERSON_MAX) return json({ error: 'Person is too long' }, 400);
        const result = await ctx.runQuery(internal.portalApi.listOpenAsks, person ? { person } : {});
        return json(result.body, result.status);
      }
      // Old name for /api/v1/milestones/asks?person=peter. Kept for one release.
      if (url.pathname === '/api/v1/milestones/needs-peter') {
        const result = await ctx.runQuery(internal.portalApi.listOpenAsks, {
          person: ASK_PERSON_PETER,
          personOptional: true,
        });
        return json(result.body, result.status);
      }
      if (url.pathname === '/api/v1/milestones/item') {
        const id = url.searchParams.get('id');
        if (!id) return json({ error: 'Milestone id is required' }, 400);
        const result = await ctx.runQuery(internal.portalApi.getMilestoneStatus, {
          milestoneId: id as Id<'milestones'>,
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
      if (url.pathname === '/api/v1/clients/item' || url.pathname === '/api/v1/projects/item') {
        const id = url.searchParams.get('id');
        if (!id) return json({ error: 'Id is required' }, 400);
        const result =
          url.pathname === '/api/v1/clients/item'
            ? await ctx.runQuery(internal.portalCatalog.getClient, { clientId: id as Id<'clients'> })
            : await ctx.runQuery(internal.portalCatalog.getProject, { projectId: id as Id<'projects'> });
        return json(result.body, result.status);
      }
      if (url.pathname === '/api/v1/context/grilling') {
        return json({ version: GRILLING_INSTRUCTIONS_VERSION, instructions: GRILLING_INSTRUCTIONS }, 200);
      }
      if (url.pathname === '/api/v1/context') {
        const projectId = url.searchParams.get('projectId');
        if (!projectId) return json({ error: 'Project id is required' }, 400);
        const result = await ctx.runQuery(internal.projectContextApi.read, { projectId: projectId as Id<'projects'> });
        return json(result.body, result.status);
      }
      if (url.pathname === '/api/v1/clients') {
        const result = await ctx.runQuery(internal.portalCatalog.listClients, { cursor, limit });
        return json(result.body, result.status);
      }
      if (url.pathname === '/api/v1/projects') {
        const result = await ctx.runQuery(internal.portalCatalog.listProjects, {
          orgId: (url.searchParams.get('orgId') || undefined) as Id<'clients'> | undefined,
          cursor,
          limit,
        });
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
  const keyError = idempotencyKeyError(idempotencyKey);
  if (keyError || !idempotencyKey) return json({ error: keyError ?? 'Idempotency key is required' }, 400);
  const requestHash = await sha256Hex(idempotencyMaterial(method, url.pathname, rawBody));
  const idem = { tokenId: consumed.tokenId, key: idempotencyKey, requestHash };

  const reviewMilestoneId = REVIEW_PATH.exec(url.pathname)?.[1] ?? null;
  if (reviewMilestoneId) {
    const unknown = unknownFieldError(parsed, REVIEW_FIELDS);
    const iteration = parsed.iteration;
    const decision = parsed.decision;
    const notes = typeof parsed.notes === 'string' ? parsed.notes : '';
    const taskIds = Array.isArray(parsed.taskIds)
      ? parsed.taskIds.filter((id): id is string => typeof id === 'string')
      : [];
    const newTasks = Array.isArray(parsed.newTasks)
      ? parsed.newTasks.filter((line): line is string => typeof line === 'string')
      : [];
    const shape =
      unknown ??
      (typeof iteration !== 'number' || !Number.isInteger(iteration) || iteration < 1
        ? 'Iteration is required'
        : decision !== 'approve' && decision !== 'request_changes'
          ? 'Decision must be approve or request_changes'
          : parsed.taskIds != null && !Array.isArray(parsed.taskIds)
            ? 'taskIds must be a list'
            : parsed.newTasks != null && !Array.isArray(parsed.newTasks)
              ? 'newTasks must be a list of task titles'
              : null);
    if (shape) {
      const result = await ctx.runMutation(internal.portalApi.rememberResult, {
        ...idem,
        status: 400,
        body: JSON.stringify({ error: shape }),
      });
      return json(result.body, result.status);
    }
    const result = await finishAction(ctx, { ...idem, tokenName: consumed.name }, async () => {
      const applied = await ctx.runMutation(internal.milestones.reviewForApi, {
        milestoneId: reviewMilestoneId as Id<'milestones'>,
        iteration: iteration as number,
        decision: String(decision),
        notes,
        taskIds: taskIds as Id<'tasks'>[],
        ...(newTasks.length > 0 ? { newTasks } : {}),
        tokenName: consumed.name,
      });
      if (!applied.ok) return { status: applied.status, body: { error: applied.error } };
      return {
        status: 200,
        body: {
          idempotent: applied.idempotent,
          iteration: applied.iteration,
          decision: applied.decision,
          approval: applied.approval,
          ...apiStatusFields(applied.milestoneStatus),
          createdTaskIds: applied.createdTaskIds,
        },
      };
    });
    return json(result.body, result.status);
  }

  const visibility = visibilityWriteError(
    parsed,
    url.pathname === '/api/v1/projects' ? ['publishToWarehaus'] : [],
  );
  const allowed =
    url.pathname === '/api/v1/tasks'
      ? TASK_CREATE_FIELDS
      : url.pathname === '/api/v1/tasks/update'
        ? TASK_UPDATE_FIELDS
        : url.pathname === '/api/v1/milestones'
          ? MILESTONE_CREATE_FIELDS
          : url.pathname === '/api/v1/milestones/update'
            ? MILESTONE_UPDATE_FIELDS
            : url.pathname === '/api/v1/milestones/note'
              ? NOTE_FIELDS
            : url.pathname === '/api/v1/comments'
              ? COMMENT_FIELDS
              : url.pathname === '/api/v1/links'
                ? LINK_FIELDS
                : url.pathname === '/api/v1/clients'
                  ? CLIENT_CREATE_FIELDS
                  : url.pathname === '/api/v1/projects'
                    ? PROJECT_CREATE_FIELDS
                      : url.pathname === '/api/v1/milestones/attach'
                      ? ATTACH_FIELDS
                      : url.pathname === '/api/v1/milestones/detach'
                        ? DETACH_FIELDS
                        : url.pathname === '/api/v1/context/brief'
                          ? CONTEXT_BRIEF_FIELDS
                          : url.pathname === '/api/v1/context/terms'
                            ? CONTEXT_TERM_FIELDS
                            : url.pathname === '/api/v1/context/decisions'
                              ? CONTEXT_DECISION_FIELDS
                              : null;
  if (!allowed) return json({ error: 'Not found' }, 404);
  const shape = url.pathname === '/api/v1/projects' ? projectShapeError(parsed) : null;
  const unknown = unknownFieldError(parsed, allowed);
  if (visibility || unknown || shape) {
    const result = await ctx.runMutation(internal.portalApi.rememberResult, {
      ...idem,
      status: 400,
      body: JSON.stringify({ error: visibility ?? unknown ?? shape }),
    });
    return json(result.body, result.status);
  }

  try {
    const result = await dispatchWrite(ctx, url.pathname, parsed, { ...idem, tokenName: consumed.name });
    return json(result.body, result.status);
  } catch (error) {
    if (url.pathname === '/api/v1/milestones/attach' || url.pathname === '/api/v1/milestones/detach') {
      const message = convexFailureText(error);
      const code = attachFailureCode(message);
      return json(attachError(message, code).body, attachFailureStatus(code));
    }
    if (error instanceof ConvexError && typeof error.data === 'string') return json({ error: error.data }, 400);
    return json({ error: 'Request failed' }, 400);
  }
});

/** Shape check for a context write. Text rules and limits are enforced by the store. */
function contextBodyError(path: string, body: Record<string, unknown>): string | null {
  if (typeof body.projectId !== 'string' || !body.projectId) return 'Project id is required';
  const required =
    path === '/api/v1/context/terms' ? ['term', 'definition'] : path === '/api/v1/context/decisions' ? ['title'] : [];
  for (const key of required) {
    if (typeof body[key] !== 'string' || !(body[key] as string).trim()) return `${key} is required`;
  }
  for (const [key, value] of Object.entries(body)) {
    if (value != null && typeof value !== 'string') return `${key} must be text`;
  }
  if (path === '/api/v1/context/brief') {
    const sent = ['goal', 'audience', 'outOfScope', 'doneWhen'].some((key) => typeof body[key] === 'string');
    if (!sent) return 'Send at least one brief field';
  }
  return null;
}

async function dispatchWrite(
  ctx: ActionCtx,
  path: string,
  body: Record<string, unknown>,
  actor: ApiActor,
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
    const stage = typeof body.stage === 'string' ? body.stage : undefined;
    const pullRequestLink = typeof body.pullRequestLink === 'string' ? body.pullRequestLink : undefined;
    let verifiedMerge = false;
    let verifiedLink = pullRequestLink;
    if (stage === 'Shipped') {
      const looked = await ctx.runQuery(internal.portalApi.taskPullRequest, {
        taskId: body.taskId as Id<'tasks'>,
      });
      if (!looked.ok) return fail(404, looked.error);
      const resolved = resolveShipLink({
        explicit: pullRequestLink,
        stored: looked.pullRequestUrl,
        links: looked.links,
      });
      if (!resolved.ok) return fail(400, resolved.error);
      const verified = await verifyPullMerged({ link: resolved.link });
      if (!verified.ok) return fail(400, verified.error);
      verifiedMerge = true;
      verifiedLink = verified.link;
    }
    return ctx.runMutation(internal.portalApi.updateTask, {
      ...actor,
      taskId: body.taskId as Id<'tasks'>,
      expectedLastEditedTime: String(body.expectedLastEditedTime ?? ''),
      status: typeof body.status === 'string' ? body.status : undefined,
      priority: body.priority === null || typeof body.priority === 'string' ? body.priority : undefined,
      nextAction: body.nextAction === null || typeof body.nextAction === 'string' ? body.nextAction : undefined,
      stage,
      pullRequestLink: verifiedLink,
      verifiedMerge,
    });
  }
  if (path === '/api/v1/milestones') {
    return ctx.runMutation(internal.portalApi.createMilestone, {
      ...actor,
      ...(body.proposedTasks !== undefined ? { proposedTasks: body.proposedTasks } : {}),
      projectId: body.projectId as Id<'projects'>,
      name: String(body.name ?? ''),
      objective: String(body.objective ?? ''),
      goals: Array.isArray(body.goals) ? body.goals.filter((goal): goal is string => typeof goal === 'string') : [],
      status: typeof body.status === 'string' ? body.status : undefined,
      stage: typeof body.stage === 'string' ? body.stage : undefined,
      workStatus: typeof body.workStatus === 'string' ? body.workStatus : undefined,
    });
  }
  if (path === '/api/v1/milestones/update') {
    return ctx.runMutation(internal.portalApi.updateMilestone, {
      ...idempotencyActor(actor),
      milestoneId: body.milestoneId as Id<'milestones'>,
      name: typeof body.name === 'string' ? body.name : undefined,
      objective: typeof body.objective === 'string' ? body.objective : undefined,
      goals: Array.isArray(body.goals) ? body.goals.filter((goal): goal is string => typeof goal === 'string') : undefined,
      status: typeof body.status === 'string' ? body.status : undefined,
      stage: typeof body.stage === 'string' ? body.stage : undefined,
      workStatus: typeof body.workStatus === 'string' ? body.workStatus : undefined,
      tokenName: actor.tokenName,
    });
  }
  if (path === '/api/v1/milestones/note') {
    return ctx.runMutation(internal.portalApi.addMilestoneNote, {
      ...actor,
      milestoneId: body.milestoneId as Id<'milestones'>,
      body: typeof body.body === 'string' ? body.body : '',
    });
  }
  if (path === '/api/v1/context/brief' || path === '/api/v1/context/terms' || path === '/api/v1/context/decisions') {
    const shape = contextBodyError(path, body);
    if (shape) {
      return ctx.runMutation(internal.portalApi.rememberResult, {
        ...idempotencyActor(actor),
        status: 400,
        body: JSON.stringify({ error: shape }),
      });
    }
    const projectId = body.projectId as Id<'projects'>;
    const text = (key: string) => (typeof body[key] === 'string' ? (body[key] as string) : undefined);
    return finishAction(ctx, actor, async () => {
      if (path === '/api/v1/context/brief') {
        return ctx.runMutation(internal.projectContextApi.saveBrief, {
          projectId,
          tokenName: actor.tokenName,
          goal: text('goal'),
          audience: text('audience'),
          outOfScope: text('outOfScope'),
          doneWhen: text('doneWhen'),
        });
      }
      if (path === '/api/v1/context/terms') {
        return ctx.runMutation(internal.projectContextApi.upsertTerm, {
          projectId,
          tokenName: actor.tokenName,
          term: String(body.term),
          definition: String(body.definition),
        });
      }
      return ctx.runMutation(internal.projectContextApi.recordDecision, {
        projectId,
        tokenName: actor.tokenName,
        title: String(body.title),
        body: text('body'),
      });
    });
  }
  if (path === '/api/v1/comments') {
    return ctx.runMutation(internal.portalApi.addComment, {
      ...actor,
      taskId: body.taskId as Id<'tasks'>,
      body: String(body.body ?? ''),
    });
  }
  if (path === '/api/v1/milestones/attach') {
    return ctx.runMutation(internal.portalApi.attachTask, {
      ...idempotencyActor(actor),
      milestoneId: body.milestoneId as Id<'milestones'>,
      taskId: body.taskId as Id<'tasks'>,
    });
  }
  if (path === '/api/v1/milestones/detach') {
    return ctx.runMutation(internal.portalApi.detachTask, {
      ...idempotencyActor(actor),
      milestoneId: body.milestoneId as Id<'milestones'>,
      taskId: body.taskId as Id<'tasks'>,
    });
  }
  if (path === '/api/v1/clients') {
    return finishAction(ctx, actor, async () => {
      const homeOrgId = await ctx.runQuery(internal.portalCatalog.tokenHomeOrg, { tokenId: actor.tokenId });
      if (!homeOrgId) return fail(400, 'This token has no home org');
      const created = await ctx.runAction(internal.clientCreate.createForToken, {
        orgId: homeOrgId,
        companyName: String(body.companyName ?? ''),
        primaryEmail: typeof body.primaryEmail === 'string' ? body.primaryEmail : undefined,
        phone: typeof body.phone === 'string' ? body.phone : undefined,
      });
      if (!created.ok) return fail(created.status ?? 400, created.error);
      return { status: 200, body: created };
    });
  }
  if (path === '/api/v1/projects') {
    return finishAction(ctx, actor, async () => {
      const nested = asRecord(body.client);
      let clientId = typeof body.clientId === 'string' ? body.clientId : '';
      let clientReused = false;
      if (!clientId) {
        const homeOrgId = await ctx.runQuery(internal.portalCatalog.tokenHomeOrg, { tokenId: actor.tokenId });
        if (!homeOrgId) return fail(400, 'This token has no home org');
        const createdClient = await ctx.runAction(internal.clientCreate.createForToken, {
          orgId: homeOrgId,
          companyName: String(nested?.companyName ?? ''),
          primaryEmail: typeof nested?.primaryEmail === 'string' ? nested.primaryEmail : undefined,
          phone: typeof nested?.phone === 'string' ? nested.phone : undefined,
        });
        if (!createdClient.ok) return fail(400, createdClient.error);
        clientId = createdClient.clientId;
        clientReused = createdClient.reused;
      }
      const externalId =
        typeof body.externalId === 'string' && body.externalId
          ? body.externalId
          : createProjectExternalId((await sha256Hex(`${actor.tokenId}:${actor.key}`)).slice(0, 20));
      const created = await ctx.runAction(internal.projectCreate.createForToken, {
        orgId: clientId as Id<'clients'>,
        name: String(body.name ?? ''),
        externalId,
        publishToWarehaus: body.publishToWarehaus === true,
      });
      if (!created.ok) return fail(created.status ?? 400, created.error);
      return {
        status: 200,
        body: { ...created, clientId, ...(nested ? { clientReused } : {}) },
      };
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
