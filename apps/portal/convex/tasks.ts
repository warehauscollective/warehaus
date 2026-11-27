import {
  TASK_LINK_KINDS,
  TASK_LINK_READ_CAP,
  TASK_STAGES,
  TASK_UNAVAILABLE,
  clientMaySeeTaskDescription,
  clientSeesTask,
  isOrgVisibleToClients,
  stageMoveRule,
  statusMoveRule,
  visibleChildIds,
  LIVE_TASK_STATUSES,
  readTaskPlatform,
  taskPlatformBlockedMessage,
} from '@warehaus/portal-sync';
import { v } from 'convex/values';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { action, internalMutation, internalQuery, type MutationCtx } from './_generated/server';
import { buildTaskTimeline } from './_lib/activityFeed';
import { RESTORED_TASK_STATUS } from './_lib/closeout';
import {
  SnapshotLog,
  UNDO_TASK_CAP,
  archiveTaskTree,
  restoreTaskSnapshots,
  restoreTaskTree,
  taskSnapshotArg,
  writeTaskStatus,
  type TaskSnapshot,
} from './_lib/closeoutStore';
import { resolveShipLink, verifyPullMerged } from './_lib/githubPull';
import { assertHostMatchesOrg, isStaff, PortalAuthError, resolveIdentityFromContact } from './_lib/identity';
import {
  applyTaskChanges,
  type TaskChange,
  type TaskChangeOptions,
  type TaskChangeResult,
} from './_lib/taskChange';
import { linearEnv, serveTasks, serveTasksByOrg } from './_lib/taskPlatformRead';
import { staffRowsFor, staffVisibleClients } from './_lib/staffRead';
import { userFacingErrorMessage } from './_lib/userFacingError';
import { adminMutation, adminQuery, clientQuery } from './_lib/wrappers';

/** Load the task and apply a staff task change (ADR-0003). */
async function changeTask(
  ctx: MutationCtx,
  taskId: Id<'tasks'>,
  changes: TaskChange[],
  options: TaskChangeOptions,
): Promise<TaskChangeResult> {
  const task = await ctx.db.get(taskId);
  if (!task) return { ok: false, code: 'refused', error: 'Task not found' };
  return applyTaskChanges(ctx, task, changes, options);
}

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

    const visible = rows
      .filter((task) => task.archivedAt == null)
      .filter((task) =>
        clientSeesTask(task, projectById.get(task.projectId) ?? null, orgVisible),
      )
      .map((task) => {
        const description = descriptionForClient(task);
        return description == null ? toClientTask(task) : { ...toClientTask(task), description };
      });
    return serveTasks(org?.taskPlatform, visible);
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
      clientSeesTask(row, project, orgVisible);
    if (!visible || !row || !project || row.archivedAt != null) {
      throw new PortalAuthError(TASK_UNAVAILABLE, 'FORBIDDEN');
    }
    const blocked = taskPlatformBlockedMessage(
      readTaskPlatform({ platform: org?.taskPlatform, tasks: [row], env: linearEnv() }),
    );
    if (blocked) throw new PortalAuthError(blocked, 'FORBIDDEN');
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
      !clientSeesTask(parent, project, orgVisible)
    ) {
      throw new PortalAuthError(TASK_UNAVAILABLE, 'FORBIDDEN');
    }
    const blocked = taskPlatformBlockedMessage(
      readTaskPlatform({ platform: org?.taskPlatform, tasks: [parent], env: linearEnv() }),
    );
    if (blocked) throw new PortalAuthError(blocked, 'FORBIDDEN');
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
    return children.filter((row) => ids.has(row._id) && row.archivedAt == null).map(toClientTask);
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
    const clients = await staffVisibleClients(ctx);
    const projects = await staffRowsFor(ctx, 'projects', clients);
    const projectById = new Map(projects.map((p) => [p._id, p] as const));
    const platformByOrg = new Map<string, 'notion' | 'linear' | undefined>(
      clients.map((client) => [client._id, client.taskPlatform]),
    );
    const rows = serveTasksByOrg(await staffRowsFor(ctx, 'tasks', clients), (orgId) => platformByOrg.get(orgId));
    return rows
      .filter((row) => row.archivedAt == null)
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
          orgId: row.orgId,
          assigneeName: row.assigneeName ?? null,
          assigneeContactId: row.assigneeContactId ?? null,
          estimate: row.estimate ?? null,
          priority: row.priority ?? null,
          source: row.source ?? null,
          description: row.description ?? null,
          descriptionSource: row.descriptionSource ?? null,
          milestoneId: row.milestoneId ?? null,
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
    /** What the task is waiting on. A move to Blocked saves it with the status, as one task change. */
    nextAction: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<TaskChangeResult> =>
    changeTask(
      ctx,
      args.taskId,
      [
        { field: 'status', status: args.status },
        ...(args.nextAction !== undefined ? [{ field: 'nextAction' as const, nextAction: args.nextAction }] : []),
      ],
      {
        actor: 'staff',
        actorId: ctx.identity.contactId,
        expectedLastEditedTime: args.expectedLastEditedTime,
      },
    ),
});

export const moveStage = adminMutation({
  args: {
    taskId: v.id('tasks'),
    stage: v.string(),
    expectedLastEditedTime: v.string(),
    pullRequestLink: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<TaskChangeResult> =>
    changeTask(ctx, args.taskId, [{ field: 'stage', stage: args.stage, pullRequestLink: args.pullRequestLink }], {
      actor: 'staff',
      actorId: ctx.identity.contactId,
      expectedLastEditedTime: args.expectedLastEditedTime,
    }),
});

/**
 * Staff set Shipped. GitHub is read once here, then the existing stage outbox runs.
 * The public stage mutation cannot skip this check.
 */
export const prepareShipped = internalQuery({
  args: {
    authUserId: v.string(),
    hostSlug: v.optional(v.string()),
    taskId: v.id('tasks'),
    expectedLastEditedTime: v.string(),
    pullRequestLink: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const contact = await ctx.db
      .query('contacts')
      .withIndex('by_authUserId', (q) => q.eq('authUserId', args.authUserId))
      .unique();
    const client = contact ? await ctx.db.get(contact.orgId) : null;
    const identity = resolveIdentityFromContact({
      authUserId: args.authUserId,
      contact: contact
        ? {
            _id: contact._id,
            orgId: contact.orgId,
            name: contact.name,
            email: contact.email,
            authUserId: contact.authUserId,
            role: contact.role,
            portalAccess: contact.portalAccess,
          }
        : null,
      client: client
        ? { _id: client._id, slug: client.slug, portalAccess: client.portalAccess }
        : null,
    });
    assertHostMatchesOrg(identity, args.hostSlug);
    if (!isStaff(identity)) throw new PortalAuthError('Staff role required', 'FORBIDDEN');
    const task = await ctx.db.get(args.taskId);
    if (!task) return { ok: false as const, error: 'Task not found' };
    if (!args.expectedLastEditedTime.trim()) {
      return { ok: false as const, error: 'Updates require the last read time' };
    }
    const links = await ctx.db
      .query('taskLinks')
      .withIndex('by_taskId', (q) => q.eq('taskId', task._id))
      .take(50);
    const resolved = resolveShipLink({
      explicit: args.pullRequestLink,
      stored: task.pullRequestUrl,
      links: links.filter((row) => row.kind === 'PR').map((row) => row.url),
    });
    if (!resolved.ok) return resolved;
    return { ok: true as const, link: resolved.link, actorId: identity.contactId };
  },
});

export const commitShipped = action({
  args: {
    hostSlug: v.optional(v.string()),
    taskId: v.id('tasks'),
    expectedLastEditedTime: v.string(),
    pullRequestLink: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<TaskChangeResult | { ok: false; error: string }> => {
    const auth = await ctx.auth.getUserIdentity();
    if (!auth) return { ok: false, error: 'Not authenticated' };
    let prepared: { ok: true; link: string; actorId: string } | { ok: false; error: string };
    try {
      prepared = await ctx.runQuery(internal.tasks.prepareShipped, {
        authUserId: auth.subject,
        hostSlug: args.hostSlug,
        taskId: args.taskId,
        expectedLastEditedTime: args.expectedLastEditedTime,
        pullRequestLink: args.pullRequestLink,
      });
    } catch (err) {
      return { ok: false, error: userFacingErrorMessage(err, 'Could not set Shipped.') };
    }
    if (!prepared.ok) return prepared;
    const verified = await verifyPullMerged({ link: prepared.link });
    if (!verified.ok) return verified;
    return ctx.runMutation(internal.tasks.saveShipped, {
      taskId: args.taskId,
      pullRequestLink: verified.link,
      expectedLastEditedTime: args.expectedLastEditedTime,
      actorId: prepared.actorId,
    });
  },
});

/** Shipped after `commitShipped` confirmed the merge on GitHub. Only that action calls this. */
export const saveShipped = internalMutation({
  args: {
    taskId: v.id('tasks'),
    pullRequestLink: v.string(),
    expectedLastEditedTime: v.string(),
    actorId: v.string(),
  },
  handler: async (ctx, args): Promise<TaskChangeResult> =>
    changeTask(
      ctx,
      args.taskId,
      [{ field: 'stage', stage: 'Shipped', pullRequestLink: args.pullRequestLink, verifiedMerge: true }],
      { actor: 'staff', actorId: args.actorId, expectedLastEditedTime: args.expectedLastEditedTime },
    ),
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
    /** Required. A task only exists inside a milestone. */
    milestoneId: v.id('milestones'),
  },
  handler: async (ctx, args): Promise<{ ok: false; error: string } | { ok: true; taskId: Id<'tasks'>; duplicate: boolean }> => {
    return ctx.runMutation(internal.sync.taskWrite.createInMilestone, {
      ...args,
      actorId: ctx.identity.contactId,
    });
  },
});

export const updateLiveFields = adminMutation({
  args: {
    taskId: v.id('tasks'),
    expectedLastEditedTime: v.string(),
    estimate: v.optional(v.union(v.string(), v.null())),
    priority: v.optional(v.union(v.string(), v.null())),
    source: v.optional(v.union(v.string(), v.null())),
    publishToWarehaus: v.optional(v.boolean()),
    nextAction: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args): Promise<TaskChangeResult> => {
    const changes: TaskChange[] = [];
    if (args.estimate !== undefined) changes.push({ field: 'estimate', estimate: args.estimate });
    if (args.priority !== undefined) changes.push({ field: 'priority', priority: args.priority });
    if (args.source !== undefined) changes.push({ field: 'source', source: args.source });
    if (args.publishToWarehaus !== undefined) changes.push({ field: 'publishToWarehaus', publishToWarehaus: args.publishToWarehaus });
    if (args.nextAction !== undefined) changes.push({ field: 'nextAction', nextAction: args.nextAction });
    return changeTask(ctx, args.taskId, changes, {
      actor: 'staff',
      actorId: ctx.identity.contactId,
      expectedLastEditedTime: args.expectedLastEditedTime,
    });
  },
});

export const updateDescription = adminMutation({
  args: {
    taskId: v.id('tasks'),
    description: v.string(),
    expectedLastEditedTime: v.string(),
  },
  handler: async (ctx, args): Promise<TaskChangeResult> =>
    changeTask(ctx, args.taskId, [{ field: 'description', description: args.description }], {
      actor: 'staff',
      actorId: ctx.identity.contactId,
      expectedLastEditedTime: args.expectedLastEditedTime,
    }),
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
      clientSeesTask(row, project, orgVisible);
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

/**
 * Staff Sources panel. One indexed page, capped. Clients cannot call this.
 * Returns the rows as stored. Does not write.
 */
export const linksForStaff = adminQuery({
  args: { taskId: v.id('tasks') },
  handler: async (ctx, { taskId }) => {
    const task = await ctx.db.get(taskId);
    if (!task) return { items: [], truncated: false };
    const rows = await ctx.db
      .query('taskLinks')
      .withIndex('by_taskId', (q) => q.eq('taskId', task._id))
      .take(TASK_LINK_READ_CAP + 1);
    const page = rows.slice(0, TASK_LINK_READ_CAP);
    page.sort((a, b) => a.createdAt - b.createdAt);
    return {
      items: page.map((row) => ({
        id: row._id,
        kind: row.kind,
        url: row.url,
        title: row.title ?? null,
        addedBy: row.addedBy,
        createdAt: row.createdAt,
        state: row.state ?? null,
      })),
      truncated: rows.length > TASK_LINK_READ_CAP,
    };
  },
});

const ASSIGNEE_TAKE = 40;

/** Staff who can be assigned on this client. One indexed page, capped. */
export const assigneeChoices = adminQuery({
  args: { orgId: v.id('clients') },
  handler: async (ctx, { orgId }) => {
    const contacts = await ctx.db
      .query('contacts')
      .withIndex('by_orgId', (q) => q.eq('orgId', orgId))
      .take(ASSIGNEE_TAKE);
    return contacts
      .filter(
        (contact) =>
          contact.orgId === orgId &&
          contact.role === 'Warehaus Staff' &&
          contact.portalAccess === 'Enabled' &&
          contact.syncHiddenAt == null &&
          contact.name.trim().length > 0,
      )
      .map((contact) => ({ id: contact._id, name: contact.name.trim() }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

type FieldSave =
  | { ok: false; error: string }
  | { ok: true; wrote: boolean; notion: 'off' | 'queued' | 'portal' };

export const setAssignee = adminMutation({
  args: {
    taskId: v.id('tasks'),
    assigneeContactId: v.union(v.id('contacts'), v.null()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<
    Extract<TaskChangeResult, { ok: false }> | (Extract<TaskChangeResult, { ok: true }> & { assigneeName: string | null })
  > => {
    const result = await changeTask(ctx, args.taskId, [{ field: 'assignee', assigneeContactId: args.assigneeContactId }], {
      actor: 'staff',
      actorId: ctx.identity.contactId,
    });
    return result.ok ? { ...result, assigneeName: result.assigneeName ?? null } : result;
  },
});

export const setDueDate = adminMutation({
  args: {
    taskId: v.id('tasks'),
    date: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args): Promise<TaskChangeResult> =>
    changeTask(ctx, args.taskId, [{ field: 'date', date: args.date }], {
      actor: 'staff',
      actorId: ctx.identity.contactId,
    }),
});

export const moveProject = adminMutation({
  args: {
    taskId: v.id('tasks'),
    projectId: v.id('projects'),
  },
  handler: async (ctx, args): Promise<FieldSave & { projectName?: string }> => {
    const task = await ctx.db.get(args.taskId);
    if (!task || task.archivedAt != null) return { ok: false, error: 'Task not found' };
    if (task.projectId === args.projectId) return { ok: true, wrote: false, notion: 'portal' };
    const project = await ctx.db.get(args.projectId);
    if (!project || project.orgId !== task.orgId || project.archive || project.syncHiddenAt != null) {
      return { ok: false, error: 'Choose a project on this client' };
    }
    await ctx.db.patch(task._id, {
      projectId: project._id,
      portalProjectId: project._id,
      milestoneId: undefined,
      milestoneOrder: undefined,
    });
    return { ok: true, wrote: true, notion: 'portal', projectName: project.name };
  },
});

export const addLink = adminMutation({
  args: {
    taskId: v.id('tasks'),
    kind: v.union(
      v.literal('chat request'),
      v.literal('PR'),
      v.literal('deploy'),
      v.literal('agent'),
      v.literal('Figma frame'),
      v.literal('Notion page or doc'),
      v.literal('Repo branch'),
    ),
    url: v.string(),
    title: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<FieldSave & { id?: Id<'taskLinks'> }> => {
    if (!(TASK_LINK_KINDS as readonly string[]).includes(args.kind)) {
      return { ok: false, error: 'Choose a source kind' };
    }
    const task = await ctx.db.get(args.taskId);
    if (!task || task.archivedAt != null) return { ok: false, error: 'Task not found' };
    const url = args.url.trim();
    if (!url || url.length > 2000) return { ok: false, error: 'Add a link' };
    const title = args.title?.trim() ?? '';
    const existing = await ctx.db
      .query('taskLinks')
      .withIndex('by_taskId_url', (q) => q.eq('taskId', task._id).eq('url', url))
      .unique();
    if (existing) return { ok: true, wrote: false, notion: 'portal', id: existing._id };
    const page = await ctx.db
      .query('taskLinks')
      .withIndex('by_taskId', (q) => q.eq('taskId', task._id))
      .take(TASK_LINK_READ_CAP + 1);
    if (page.length >= TASK_LINK_READ_CAP) return { ok: false, error: 'This task already has 50 sources' };
    const id = await ctx.db.insert('taskLinks', {
      orgId: task.orgId,
      taskId: task._id,
      kind: args.kind,
      url,
      ...(title ? { title } : {}),
      addedBy: 'staff',
      createdAt: Date.now(),
    });
    return { ok: true, wrote: true, notion: 'portal', id };
  },
});

export const removeLink = adminMutation({
  args: {
    taskId: v.id('tasks'),
    linkId: v.id('taskLinks'),
  },
  handler: async (ctx, args): Promise<FieldSave> => {
    const link = await ctx.db.get(args.linkId);
    if (!link || link.taskId !== args.taskId) return { ok: false, error: 'Source not found' };
    await ctx.db.delete(link._id);
    return { ok: true, wrote: true, notion: 'portal' };
  },
});

/** Archive leaves the board and lists and is not deleted. `previous` is each task as it was, for Undo. */
export const archiveTask = adminMutation({
  args: { taskId: v.id('tasks') },
  handler: async (ctx, args): Promise<FieldSave & { previous?: TaskSnapshot[] }> => {
    const task = await ctx.db.get(args.taskId);
    if (!task) return { ok: false, error: 'Task not found' };
    const log = new SnapshotLog();
    const result = await archiveTaskTree(ctx, task, Date.now(), ctx.identity.contactId, log);
    return { ok: true, wrote: result.wrote, notion: result.notion, previous: log.list() };
  },
});

/**
 * Mark complete on a task. Sets Done, with no confirm. A Done task writes
 * nothing. A task with a Notion page sends the status through the outbox.
 */
export const markDone = adminMutation({
  args: { taskId: v.id('tasks') },
  handler: async (ctx, args): Promise<FieldSave & { previous?: TaskSnapshot[] }> => {
    const task = await ctx.db.get(args.taskId);
    if (!task || task.archivedAt != null) return { ok: false, error: 'Task not found' };
    const log = new SnapshotLog();
    const result = await writeTaskStatus(ctx, task, 'Done', ctx.identity.contactId, log);
    return { ok: true, wrote: result.wrote, notion: result.notion, previous: log.list() };
  },
});

/**
 * Restore. An archived task comes back with the subtasks archived with it.
 * The Notion page is not touched. A Done task reopens as To Do.
 */
export const restoreTask = adminMutation({
  args: { taskId: v.id('tasks') },
  handler: async (
    ctx,
    args,
  ): Promise<FieldSave & { restored?: 'archived' | 'completed' | null; previous?: TaskSnapshot[] }> => {
    const task = await ctx.db.get(args.taskId);
    if (!task) return { ok: false, error: 'Task not found' };
    const log = new SnapshotLog();
    if (task.archivedAt != null) {
      await restoreTaskTree(ctx, task, log);
      return { ok: true, wrote: true, notion: 'portal', restored: 'archived', previous: log.list() };
    }
    if (!task.isDone && task.status !== 'Done') {
      return { ok: true, wrote: false, notion: 'portal', restored: null, previous: [] };
    }
    const result = await writeTaskStatus(ctx, task, RESTORED_TASK_STATUS, ctx.identity.contactId, log);
    return { ok: true, wrote: result.wrote, notion: result.notion, restored: 'completed', previous: log.list() };
  },
});

/** Undo for a task Mark complete, Archive or Restore. Puts each task back as `previous` had it. */
export const undoTaskChange = adminMutation({
  args: { tasks: v.array(taskSnapshotArg) },
  handler: async (ctx, args): Promise<FieldSave> => {
    if (args.tasks.length > UNDO_TASK_CAP) return { ok: false, error: 'Too many tasks to undo at once.' };
    const wrote = await restoreTaskSnapshots(ctx, null, args.tasks, ctx.identity.contactId);
    return { ok: true, wrote: wrote > 0, notion: 'portal' };
  },
});

export const setResources = adminMutation({
  args: {
    taskId: v.id('tasks'),
    resourceNotionIds: v.array(v.string()),
    expectedLastEditedTime: v.string(),
  },
  handler: async (ctx, args): Promise<TaskChangeResult> =>
    changeTask(ctx, args.taskId, [{ field: 'resources', resourceNotionIds: args.resourceNotionIds }], {
      actor: 'staff',
      actorId: ctx.identity.contactId,
      expectedLastEditedTime: args.expectedLastEditedTime,
    }),
});
