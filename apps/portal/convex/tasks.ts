import {
  TASK_STAGES,
  TASK_UNAVAILABLE,
  clientMaySeeTask,
  clientMaySeeTaskDescription,
  isOrgVisibleToClients,
  stageMoveRule,
  statusMoveRule,
  visibleChildIds,
  LIVE_TASK_STATUSES,
} from '@warehaus/portal-sync';
import { v } from 'convex/values';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { buildTaskTimeline } from './_lib/activityFeed';
import { adminMutation, adminQuery, clientQuery } from './_lib/wrappers';
import { isStaff, PortalAuthError } from './_lib/identity';

type TaskWriteResult =
  | { ok: false; error: string }
  | { ok: true; pending?: boolean; outboxId?: Id<'notionOutbox'>; duplicate?: boolean };

/** CLIENT serializer — never emit Priority, Estimate, Owner, parent, resources, or a SERVER description. */
function descriptionForClient(row: { description?: string | null; publishToWarehaus: boolean }): string | null {
  if (!clientMaySeeTaskDescription({ publishToWarehaus: row.publishToWarehaus })) return null;
  return row.description ?? null;
}

function toClientTask(row: {
  _id: string;
  orgId: string;
  projectId: string;
  name: string;
  status: string;
  isDone: boolean;
  date?: string;
  stage?: string | null;
  publishToWarehaus: boolean;
  lastEditedTime?: string | null;
}) {
  return {
    id: row._id,
    orgId: row.orgId,
    projectId: row.projectId,
    name: row.name,
    status: row.status,
    isDone: row.isDone,
    date: row.date ?? null,
    stage: row.publishToWarehaus ? (row.stage ?? null) : null,
    lastEditedTime: row.lastEditedTime ?? null,
  };
}

function projectGate(project: {
  name: string;
  type: string[];
  publishToWarehaus: boolean;
  archive: boolean;
  syncHiddenAt?: number;
} | null, orgVisible: boolean) {
  if (!project) {
    return {
      name: '',
      types: [],
      publishToWarehaus: false,
      archive: false,
      hidden: true,
      orgVisible,
    };
  }
  return {
    name: project.name,
    types: project.type,
    publishToWarehaus: project.publishToWarehaus,
    archive: project.archive,
    hidden: project.syncHiddenAt != null,
    orgVisible,
  };
}

export const listForClient = clientQuery({
  args: {},
  handler: async (ctx) => {
    const org = await ctx.db.get(ctx.orgId);
    const orgVisible = isOrgVisibleToClients(org);
    const projects = await ctx.db
      .query('projects')
      .withIndex('by_orgId', (q) => q.eq('orgId', ctx.orgId))
      .collect();
    const projectById = new Map(projects.map((project) => [project._id, project]));
    const rows = await ctx.db
      .query('tasks')
      .withIndex('by_orgId', (q) => q.eq('orgId', ctx.orgId))
      .collect();

    return rows
      .filter((task) =>
        clientMaySeeTask({
          publishToWarehaus: task.publishToWarehaus,
          hidden: task.syncHiddenAt != null,
          project: projectGate(projectById.get(task.projectId) ?? null, orgVisible),
        }),
      )
      .map((task) => {
        const description = descriptionForClient(task);
        return description == null ? toClientTask(task) : { ...toClientTask(task), description };
      });
  },
});

export const getForClient = clientQuery({
  args: { taskId: v.id('tasks') },
  handler: async (ctx, { taskId }) => {
    const row = await ctx.db.get(taskId);
    const org = await ctx.db.get(ctx.orgId);
    const orgVisible = isOrgVisibleToClients(org);
    const project = row ? await ctx.db.get(row.projectId) : null;
    const visible =
      row &&
      row.orgId === ctx.orgId &&
      clientMaySeeTask({
        publishToWarehaus: row.publishToWarehaus,
        hidden: row.syncHiddenAt != null,
        project: projectGate(project, orgVisible),
      });
    if (!visible || !row || !project) {
      throw new PortalAuthError(TASK_UNAVAILABLE, 'FORBIDDEN');
    }
    const description = descriptionForClient(row);
    return {
      ...toClientTask(row),
      ...(description == null ? {} : { description }),
      projectName: project.name,
      projectStatus: project.status,
      projectEndDate: project.endDate ?? null,
    };
  },
});

/** Published sub-tasks only, each by its own publish flag. No resource join. */
export const listSubtasksForClient = clientQuery({
  args: { taskId: v.id('tasks') },
  handler: async (ctx, { taskId }) => {
    const parent = await ctx.db.get(taskId);
    const org = await ctx.db.get(ctx.orgId);
    const orgVisible = isOrgVisibleToClients(org);
    const project = parent ? await ctx.db.get(parent.projectId) : null;
    if (
      !parent ||
      parent.orgId !== ctx.orgId ||
      !clientMaySeeTask({
        publishToWarehaus: parent.publishToWarehaus,
        hidden: parent.syncHiddenAt != null,
        project: projectGate(project, orgVisible),
      })
    ) {
      throw new PortalAuthError(TASK_UNAVAILABLE, 'FORBIDDEN');
    }
    const rows = await ctx.db
      .query('tasks')
      .withIndex('by_orgId_projectId', (q) => q.eq('orgId', ctx.orgId).eq('projectId', parent.projectId))
      .collect();
    const children = rows.filter((row) => row.parentTaskId === parent._id);
    const ids = new Set(
      visibleChildIds(
        children.map((row) => ({
          id: row._id,
          publishToWarehaus: row.publishToWarehaus,
          hidden: row.syncHiddenAt != null,
        })),
      ),
    );
    return children.filter((row) => ids.has(row._id)).map(toClientTask);
  },
});

export const moveRules = clientQuery({
  args: {},
  handler: async (ctx) => {
    const actor = isStaff(ctx.identity) ? 'staff' : 'client';
    return {
      actor,
      statuses: LIVE_TASK_STATUSES.map((status) => ({ status, rule: statusMoveRule(actor, status) })),
      stages: TASK_STAGES.map((stage) => ({ stage, rule: stageMoveRule(actor, stage) })),
    };
  },
});

/** Staff tasks across orgs, including unpublished. Hidden rows stay flagged. */
export const listForStaff = adminQuery({
  args: {},
  handler: async (ctx) => {
    const projects = await ctx.db.query('projects').collect();
    const projectById = new Map(projects.map((p) => [p._id, p] as const));
    const rows = await ctx.db.query('tasks').collect();
    return rows
      .map((row) => {
        const project = projectById.get(row.projectId);
        return {
          ...toClientTask({ ...row, publishToWarehaus: true }),
          stage: row.stage ?? null,
          publishToWarehaus: row.publishToWarehaus,
          parentTaskId: row.parentTaskId ?? null,
          pullRequestUrl: row.pullRequestUrl ?? null,
          projectName: project?.name ?? null,
          projectStatus: project?.status ?? null,
          projectEndDate: project?.endDate ?? null,
          estimate: row.estimate ?? null,
          priority: row.priority ?? null,
          source: row.source ?? null,
          description: row.description ?? null,
          descriptionSource: row.descriptionSource ?? null,
          notionPageId: row.notionPageId,
          lastSyncedAt: row.lastSyncedAt,
          syncHidden: row.syncHiddenAt != null,
          syncNotice: row.syncNotice ?? null,
          ...(row.stagePendingAt != null ? { stagePending: true as const } : {}),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const moveStatus = adminMutation({
  args: {
    taskId: v.id('tasks'),
    status: v.string(),
    expectedLastEditedTime: v.string(),
  },
  handler: async (ctx, args): Promise<TaskWriteResult> => {
    return ctx.runMutation(internal.sync.taskWrite.enqueueStatus, {
      taskId: args.taskId,
      status: args.status,
      expectedLastEditedTime: args.expectedLastEditedTime,
      actorId: ctx.identity.contactId,
    });
  },
});

export const moveStage = adminMutation({
  args: {
    taskId: v.id('tasks'),
    stage: v.string(),
    expectedLastEditedTime: v.string(),
    pullRequestLink: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<TaskWriteResult> => {
    return ctx.runMutation(internal.sync.taskWrite.enqueueStage, {
      taskId: args.taskId,
      stage: args.stage,
      expectedLastEditedTime: args.expectedLastEditedTime,
      pullRequestLink: args.pullRequestLink,
      actor: 'staff',
      actorId: ctx.identity.contactId,
    });
  },
});

export const createTask = adminMutation({
  args: {
    orgId: v.id('clients'),
    name: v.string(),
    status: v.string(),
    projectNotionId: v.string(),
    externalId: v.string(),
    date: v.optional(v.string()),
    stage: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<TaskWriteResult> => {
    return ctx.runMutation(internal.sync.taskWrite.enqueueCreate, {
      ...args,
      actorId: ctx.identity.contactId,
    });
  },
});

export const updateDescription = adminMutation({
  args: {
    taskId: v.id('tasks'),
    description: v.string(),
    expectedLastEditedTime: v.string(),
  },
  handler: async (ctx, args): Promise<TaskWriteResult> => {
    return ctx.runMutation(internal.sync.taskWrite.enqueueDescription, {
      taskId: args.taskId,
      description: args.description,
      expectedLastEditedTime: args.expectedLastEditedTime,
      actorId: ctx.identity.contactId,
    });
  },
});

export const activityForClient = clientQuery({
  args: { taskId: v.id('tasks') },
  handler: async (ctx, { taskId }) => {
    const row = await ctx.db.get(taskId);
    const org = await ctx.db.get(ctx.orgId);
    const orgVisible = isOrgVisibleToClients(org);
    const project = row ? await ctx.db.get(row.projectId) : null;
    const visible =
      row &&
      row.orgId === ctx.orgId &&
      clientMaySeeTask({
        publishToWarehaus: row.publishToWarehaus,
        hidden: row.syncHiddenAt != null,
        project: projectGate(project, orgVisible),
      });
    if (!visible || !row || !project) throw new PortalAuthError(TASK_UNAVAILABLE, 'FORBIDDEN');
    const audits = await ctx.db
      .query('auditEvents')
      .withIndex('by_notionPageId', (q) => q.eq('notionPageId', row.notionPageId))
      .collect();
    return buildTaskTimeline({
      audience: 'client',
      task: row,
      project,
      orgVisible,
      audits,
      outbox: [],
    });
  },
});

export const activityForStaff = adminQuery({
  args: { taskId: v.id('tasks') },
  handler: async (ctx, { taskId }) => {
    const row = await ctx.db.get(taskId);
    if (!row) throw new PortalAuthError(TASK_UNAVAILABLE, 'FORBIDDEN');
    const project = await ctx.db.get(row.projectId);
    const audits = await ctx.db
      .query('auditEvents')
      .withIndex('by_notionPageId', (q) => q.eq('notionPageId', row.notionPageId))
      .collect();
    const outbox = await ctx.db
      .query('notionOutbox')
      .withIndex('by_notionPageId', (q) => q.eq('notionPageId', row.notionPageId))
      .order('desc')
      .take(40);
    return buildTaskTimeline({
      audience: 'staff',
      task: row,
      project: project ?? undefined,
      orgVisible: true,
      audits,
      outbox,
    });
  },
});

export const setResources = adminMutation({
  args: {
    taskId: v.id('tasks'),
    resourceNotionIds: v.array(v.string()),
    expectedLastEditedTime: v.string(),
  },
  handler: async (ctx, args): Promise<TaskWriteResult> => {
    return ctx.runMutation(internal.sync.taskWrite.enqueueResources, {
      ...args,
      actorId: ctx.identity.contactId,
    });
  },
});
