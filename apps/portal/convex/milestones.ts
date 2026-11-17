/**
 * Portal milestones. Stored here only — there is no Notion milestones database.
 *
 * A human in the portal approves or requests changes. Those two mutations are
 * the only writers of `approved` and `changes_requested`. AI mutations have
 * no approval argument. While a milestone is approved, AI cannot edit it or
 * add or remove its tasks. Approval does not close tasks.
 * Clients do not receive an unpublished milestone.
 */

import {
  clientMayOpenGranolaRecap,
  clientMaySeeProject,
  isOrgVisibleToClients,
} from '@warehaus/portal-sync';
import { v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { internalMutation, internalQuery } from './_generated/server';
import { PortalAuthError } from './_lib/identity';
import {
  attachTaskDecision,
  buildRoadmap,
  type AttachFailureCode,
  clientMaySeeLinkedResource,
  clientMaySeeMilestone,
  contentEditDecision,
  createMilestoneDecision,
  detachTaskDecision,
  writeMilestoneActivity,
  nextMilestoneOrder,
  publishDecision,
  resourceEditDecision,
  resourceLinkDecision,
  taskLinkPatch,
  workStatusDecision,
  type MilestoneActivityType,
  type MilestoneProjectGate,
  type MilestoneRoadmapView,
  type RoadmapTaskInput,
} from './_lib/milestones';
import {
  MILESTONE_ONE_NAME,
  MILESTONE_ONE_OBJECTIVE,
  planMilestoneOne,
  summarizeMilestoneOne,
} from './_lib/milestoneOneSeed';
import {
  ALREADY_REVIEWED,
  PETER_EMAILS,
  currentIteration,
  historyPageLimit,
  isPeterEmail,
  NEW_ITERATION_TASK_DONE,
  normalizeLocalPreview,
  planReview,
  reviewChatLine,
  reviewNotesForAudience,
  reviewForAudience,
  type ReviewSource,
} from './_lib/milestoneReview';
import { adminMutation, adminQuery, clientMutation, clientQuery } from './_lib/wrappers';

const workStatusArg = v.union(v.literal('draft'), v.literal('active'), v.literal('ready'));
const decisionArg = v.union(v.literal('approved'), v.literal('changes_requested'));

function fail(reason: string): never {
  throw new PortalAuthError(reason, 'FORBIDDEN');
}

function projectGate(project: Doc<'projects'> | null, orgVisible: boolean): MilestoneProjectGate {
  return {
    name: project?.name,
    types: project?.type ?? [],
    publishToWarehaus: project?.publishToWarehaus ?? false,
    archive: project?.archive ?? false,
    hidden: project?.syncHiddenAt != null,
    orgVisible,
  };
}

async function loadMilestone(ctx: QueryCtx | MutationCtx, milestoneId: Id<'milestones'>) {
  const milestone = await ctx.db.get(milestoneId);
  if (!milestone) fail('Milestone not found');
  return milestone;
}

async function logMilestone(
  ctx: MutationCtx,
  milestone: { _id: Id<'milestones'>; orgId: Id<'clients'>; projectId: Id<'projects'>; name: string },
  type: MilestoneActivityType,
  at: number,
) {
  await writeMilestoneActivity(
    ctx as {
      db: {
        insert: (
          table: 'activity',
          value: {
            orgId: string;
            projectId: string;
            milestoneId: string;
            name: string;
            type: MilestoneActivityType;
            tone: 'warn' | 'success' | 'accent';
            timestamp: number;
          },
        ) => Promise<unknown>;
      };
    },
    milestone,
    type,
    at,
  );
}

async function replaceResources(
  ctx: MutationCtx,
  milestone: Doc<'milestones'>,
  resourceIds: readonly Id<'sharedResources'>[],
) {
  const gate = resourceEditDecision({
    actor: 'human',
    approval: milestone.approval,
  });
  if (!gate.ok) fail(gate.reason);
  await writeResourceLinks(ctx, milestone, resourceIds);
}

async function writeResourceLinks(
  ctx: MutationCtx,
  milestone: Doc<'milestones'>,
  resourceIds: readonly Id<'sharedResources'>[],
) {
  if (new Set(resourceIds).size !== resourceIds.length) fail('Resource is listed twice');
  for (const resourceId of resourceIds) {
    const resource = await ctx.db.get(resourceId);
    const link = resourceLinkDecision(milestone.orgId, resource?.orgId ?? null);
    if (!link.ok) fail(link.reason);
  }
  const existing = await ctx.db
    .query('milestoneResources')
    .withIndex('by_orgId_milestoneId', (q) => q.eq('orgId', milestone.orgId).eq('milestoneId', milestone._id))
    .collect();
  for (const row of existing) {
    if (row.orgId === milestone.orgId) await ctx.db.delete(row._id);
  }
  for (let sortOrder = 0; sortOrder < resourceIds.length; sortOrder += 1) {
    const resourceId = resourceIds[sortOrder];
    if (!resourceId) continue;
    await ctx.db.insert('milestoneResources', {
      orgId: milestone.orgId,
      milestoneId: milestone._id,
      resourceId,
      sortOrder,
    });
  }
}

async function countTaskResources(
  ctx: QueryCtx,
  orgId: Id<'clients'>,
  taskId: Id<'tasks'>,
  audience: 'staff' | 'client',
  orgVisible: boolean,
): Promise<number> {
  const links = await ctx.db
    .query('taskResources')
    .withIndex('by_orgId_taskId', (q) => q.eq('orgId', orgId).eq('taskId', taskId))
    .collect();
  let count = 0;
  for (const link of links) {
    if (link.orgId !== orgId) continue;
    const resource = await ctx.db.get(link.resourceId);
    if (!resource || resource.orgId !== orgId) continue;
    if (audience === 'staff') {
      count += 1;
      continue;
    }
    const resourceProject = resource.projectId ? await ctx.db.get(resource.projectId) : null;
    if (resource.projectId && !resourceProject) continue;
    if (
      clientMaySeeLinkedResource({
        publishToWarehaus: resource.publishToWarehaus,
        archive: resource.archive,
        hidden: resource.syncHiddenAt != null,
        granolaOk: clientMayOpenGranolaRecap(resource),
        project: resource.projectId ? projectGate(resourceProject, orgVisible) : null,
      })
    ) {
      count += 1;
    }
  }
  return count;
}

async function roadmapTasks(
  ctx: QueryCtx,
  orgId: Id<'clients'>,
  tasks: readonly Doc<'tasks'>[],
  audience: 'staff' | 'client',
  orgVisible: boolean,
): Promise<RoadmapTaskInput[]> {
  const rows: RoadmapTaskInput[] = [];
  for (const task of tasks) {
    rows.push({
      id: task._id,
      name: task.name,
      status: task.status,
      isDone: task.isDone,
      stage: task.stage ?? null,
      pullRequestUrl: task.pullRequestUrl ?? null,
      parentTaskId: task.parentTaskId ?? null,
      milestoneId: task.milestoneId ?? null,
      milestoneOrder: task.milestoneOrder ?? null,
      resourceCount: await countTaskResources(ctx, orgId, task._id, audience, orgVisible),
      publishToWarehaus: task.publishToWarehaus,
      hidden: task.syncHiddenAt != null,
    });
  }
  return rows;
}

async function milestoneResources(
  ctx: QueryCtx,
  milestone: Doc<'milestones'>,
  audience: 'staff' | 'client',
  orgVisible: boolean,
) {
  const links = await ctx.db
    .query('milestoneResources')
    .withIndex('by_orgId_milestoneId', (q) => q.eq('orgId', milestone.orgId).eq('milestoneId', milestone._id))
    .collect();
  const ordered = links.filter((link) => link.orgId === milestone.orgId).sort((a, b) => a.sortOrder - b.sortOrder);
  const resources: MilestoneRoadmapView['resources'] = [];
  for (const link of ordered) {
    const resource = await ctx.db.get(link.resourceId);
    if (!resource || resource.orgId !== milestone.orgId) continue;
    if (audience === 'client') {
      const resourceProject = resource.projectId ? await ctx.db.get(resource.projectId) : null;
      if (resource.projectId && !resourceProject) continue;
      const visible = clientMaySeeLinkedResource({
        publishToWarehaus: resource.publishToWarehaus,
        archive: resource.archive,
        hidden: resource.syncHiddenAt != null,
        granolaOk: clientMayOpenGranolaRecap(resource),
        project: resource.projectId ? projectGate(resourceProject, orgVisible) : null,
      });
      if (!visible) continue;
    }
    resources.push({
      id: resource._id,
      title: resource.title,
      url: resource.blobUrl ?? resource.url ?? null,
    });
  }
  return resources;
}

async function toRoadmap(
  ctx: QueryCtx,
  milestone: Doc<'milestones'>,
  tasks: readonly Doc<'tasks'>[],
  audience: 'staff' | 'client',
  orgVisible: boolean,
): Promise<MilestoneRoadmapView> {
  const inputs = await roadmapTasks(ctx, milestone.orgId, tasks, audience, orgVisible);
  const roadmap = buildRoadmap({
    audience,
    milestoneId: milestone._id,
    tasks: inputs,
    projectVisibleToClient: true,
  });
  const approver = milestone.approverContactId ? await ctx.db.get(milestone.approverContactId) : null;
  const view: MilestoneRoadmapView = {
    id: milestone._id,
    name: milestone.name,
    objective: milestone.objective,
    goals: milestone.goals,
    workStatus: milestone.workStatus,
    approval: milestone.approval,
    note: reviewNotesForAudience(audience, milestone.note),
    approverName: audience === 'staff' ? (approver?.name ?? null) : null,
    decidedAt: milestone.decidedAt ?? null,
    publishToWarehaus: milestone.publishToWarehaus,
    resources: await milestoneResources(ctx, milestone, audience, orgVisible),
    openCount: roadmap.openCount,
    doneCount: roadmap.doneCount,
    countIsDecision: false,
    rows: roadmap.rows,
  };
  const review = reviewForAudience(audience, await staffReview(ctx, milestone, audience));
  if (review) view.review = review;
  if (audience === 'staff') {
    view.attachableTasks = tasks
      .filter((task) => !task.parentTaskId && !task.milestoneId)
      .map((task) => ({ id: task._id, name: task.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const choices = await ctx.db
      .query('sharedResources')
      .withIndex('by_orgId', (q) => q.eq('orgId', milestone.orgId))
      .collect();
    view.resourceChoices = choices
      .filter((resource) => resource.orgId === milestone.orgId)
      .filter((resource) => !resource.projectId || resource.projectId === milestone.projectId)
      .map((resource) => ({ id: resource._id, title: resource.title }))
      .sort((a, b) => a.title.localeCompare(b.title));
  }
  return view;
}

async function listOnProject(
  ctx: QueryCtx,
  project: Doc<'projects'>,
  audience: 'staff' | 'client',
  orgVisible: boolean,
): Promise<MilestoneRoadmapView[]> {
  if (audience === 'client' && !clientMaySeeProject(projectGate(project, orgVisible))) return [];
  const milestones = await ctx.db
    .query('milestones')
    .withIndex('by_orgId_projectId', (q) => q.eq('orgId', project.orgId).eq('projectId', project._id))
    .collect();
  const visible = milestones
    .filter((milestone) => milestone.orgId === project.orgId && milestone.projectId === project._id)
    .filter((milestone) =>
      audience === 'staff'
        ? true
        : clientMaySeeMilestone({
            publishToWarehaus: milestone.publishToWarehaus,
            project: projectGate(project, orgVisible),
          }),
    )
    .sort((a, b) => a._creationTime - b._creationTime);
  const tasks = await ctx.db
    .query('tasks')
    .withIndex('by_orgId_projectId', (q) => q.eq('orgId', project.orgId).eq('projectId', project._id))
    .collect();
  const views: MilestoneRoadmapView[] = [];
  for (const milestone of visible) {
    views.push(await toRoadmap(ctx, milestone, tasks, audience, orgVisible));
  }
  return views;
}

export const listForProject = adminQuery({
  args: { projectId: v.id('projects') },
  handler: async (ctx, { projectId }) => {
    const project = await ctx.db.get(projectId);
    if (!project) return [];
    return listOnProject(ctx, project, 'staff', true);
  },
});

export const listForClientProject = clientQuery({
  args: { projectId: v.id('projects') },
  handler: async (ctx, { projectId }) => {
    const project = await ctx.db.get(projectId);
    if (!project || project.orgId !== ctx.orgId) return [];
    const org = await ctx.db.get(ctx.orgId);
    return listOnProject(ctx, project, 'client', isOrgVisibleToClients(org));
  },
});

async function insertMilestone(
  ctx: MutationCtx,
  actor: 'human' | 'ai',
  project: Doc<'projects'>,
  args: {
    name: string;
    objective: string;
    goals: string[];
    workStatus?: 'draft' | 'active' | 'ready';
    resourceIds?: Id<'sharedResources'>[];
  },
) {
  const created = createMilestoneDecision({
    actor,
    name: args.name,
    objective: args.objective,
    goals: args.goals,
    workStatus: args.workStatus,
  });
  if (!created.ok) fail(created.reason);
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
  const milestone = await ctx.db.get(milestoneId);
  if (!milestone) fail('Milestone not found');
  if (args.resourceIds) {
    if (actor === 'ai' && milestone.approval === 'approved') fail('AI cannot edit an approved milestone or change its tasks');
    await writeResourceLinks(ctx, milestone, args.resourceIds);
  }
  if (created.activityType) {
    await logMilestone(ctx, milestone, created.activityType, Date.now());
  }
  return milestoneId;
}

export const create = adminMutation({
  args: {
    projectId: v.id('projects'),
    name: v.string(),
    objective: v.string(),
    goals: v.array(v.string()),
    workStatus: v.optional(workStatusArg),
    resourceIds: v.optional(v.array(v.id('sharedResources'))),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) fail('Project not found');
    const id = await insertMilestone(ctx, 'human', project, args);
    return { id };
  },
});

export const createFromAi = internalMutation({
  args: {
    orgId: v.id('clients'),
    projectId: v.id('projects'),
    name: v.string(),
    objective: v.string(),
    goals: v.array(v.string()),
    workStatus: v.optional(workStatusArg),
    resourceIds: v.optional(v.array(v.id('sharedResources'))),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project || project.orgId !== args.orgId) fail('Project not found');
    const id = await insertMilestone(ctx, 'ai', project, args);
    return { id };
  },
});

export const save = adminMutation({
  args: {
    milestoneId: v.id('milestones'),
    name: v.optional(v.string()),
    objective: v.optional(v.string()),
    goals: v.optional(v.array(v.string())),
    resourceIds: v.optional(v.array(v.id('sharedResources'))),
  },
  handler: async (ctx, args) => {
    const milestone = await loadMilestone(ctx, args.milestoneId);
    const edited = contentEditDecision({
      actor: 'human',
      approval: milestone.approval,
      patch: { name: args.name, objective: args.objective, goals: args.goals },
    });
    if (!edited.ok) fail(edited.reason);
    if (args.resourceIds) await replaceResources(ctx, milestone, args.resourceIds);
    if (Object.keys(edited.patch).length > 0) await ctx.db.patch(milestone._id, edited.patch);
    return { ok: true as const };
  },
});

export const saveFromAi = internalMutation({
  args: {
    milestoneId: v.id('milestones'),
    name: v.optional(v.string()),
    objective: v.optional(v.string()),
    goals: v.optional(v.array(v.string())),
    workStatus: v.optional(workStatusArg),
    resourceIds: v.optional(v.array(v.id('sharedResources'))),
  },
  handler: async (ctx, args) => {
    const milestone = await loadMilestone(ctx, args.milestoneId);
    const edited = contentEditDecision({
      actor: 'ai',
      approval: milestone.approval,
      patch: { name: args.name, objective: args.objective, goals: args.goals },
    });
    if (!edited.ok) fail(edited.reason);
    if (args.workStatus != null) {
      const status = workStatusDecision({
        actor: 'ai',
        approval: milestone.approval,
        from: milestone.workStatus,
        to: args.workStatus,
      });
      if (!status.ok) fail(status.reason);
      await ctx.db.patch(milestone._id, { workStatus: status.workStatus });
      if (status.activityType) await logMilestone(ctx, milestone, status.activityType, Date.now());
    }
    if (args.resourceIds) {
      const resources = resourceEditDecision({ actor: 'ai', approval: milestone.approval });
      if (!resources.ok) fail(resources.reason);
      await writeResourceLinks(ctx, milestone, args.resourceIds);
    }
    if (Object.keys(edited.patch).length > 0) {
      await ctx.db.patch(milestone._id, edited.patch);
    }
    return { ok: true as const };
  },
});

export const setWorkStatus = adminMutation({
  args: { milestoneId: v.id('milestones'), workStatus: workStatusArg },
  handler: async (ctx, args) => {
    const milestone = await loadMilestone(ctx, args.milestoneId);
    const status = workStatusDecision({
      actor: 'human',
      approval: milestone.approval,
      from: milestone.workStatus,
      to: args.workStatus,
    });
    if (!status.ok) fail(status.reason);
    await ctx.db.patch(milestone._id, { workStatus: status.workStatus });
    if (status.activityType) await logMilestone(ctx, milestone, status.activityType, Date.now());
    return { ok: true as const };
  },
});

export const setPublish = adminMutation({
  args: { milestoneId: v.id('milestones'), publishToWarehaus: v.boolean() },
  handler: async (ctx, args) => {
    const milestone = await loadMilestone(ctx, args.milestoneId);
    const published = publishDecision({ actor: 'human', publishToWarehaus: args.publishToWarehaus });
    if (!published.ok) fail(published.reason);
    await ctx.db.patch(milestone._id, { publishToWarehaus: published.publishToWarehaus });
    return { ok: true as const };
  },
});

type TaskLinkResult = { ok: true } | { ok: false; code: AttachFailureCode; error: string };

async function linkTask(
  ctx: MutationCtx,
  actor: 'human' | 'ai',
  milestoneId: Id<'milestones'>,
  taskId: Id<'tasks'>,
): Promise<TaskLinkResult> {
  const milestone = await ctx.db.get(milestoneId);
  if (!milestone) return { ok: false, code: 'not_found', error: 'Milestone not found' };
  const task = await ctx.db.get(taskId);
  if (!task) return { ok: false, code: 'not_found', error: 'Task not found' };
  const decision = attachTaskDecision({
    actor,
    milestone: {
      id: milestone._id,
      orgId: milestone.orgId,
      projectId: milestone.projectId,
      approval: milestone.approval,
    },
    task: {
      id: task._id,
      orgId: task.orgId,
      projectId: task.projectId,
      parentTaskId: task.parentTaskId ?? null,
      milestoneId: task.milestoneId ?? null,
    },
  });
  if (!decision.ok) return { ok: false, code: decision.code, error: decision.reason };
  if (decision.alreadyAttached) return { ok: true };
  const siblings = await ctx.db
    .query('tasks')
    .withIndex('by_orgId_milestoneId', (q) => q.eq('orgId', milestone.orgId).eq('milestoneId', milestone._id))
    .collect();
  const link = taskLinkPatch(milestone._id, nextMilestoneOrder(siblings.map((row) => row.milestoneOrder)));
  await ctx.db.patch(task._id, { milestoneId: milestone._id, milestoneOrder: link.milestoneOrder });
  return { ok: true };
}

function raiseLink(result: TaskLinkResult) {
  if (!result.ok) fail(result.error);
  return { ok: true as const };
}

export const attachTask = adminMutation({
  args: { milestoneId: v.id('milestones'), taskId: v.id('tasks') },
  handler: async (ctx, args) => raiseLink(await linkTask(ctx, 'human', args.milestoneId, args.taskId)),
});

/** Staff API. Same human link rules as the portal button. Already-linked tasks are not rewritten. */
export const attachTaskForApi = internalMutation({
  args: { milestoneId: v.id('milestones'), taskId: v.id('tasks') },
  handler: async (ctx, args) => linkTask(ctx, 'human', args.milestoneId, args.taskId),
});

export const attachTaskFromAi = internalMutation({
  args: { milestoneId: v.id('milestones'), taskId: v.id('tasks') },
  handler: async (ctx, args) => raiseLink(await linkTask(ctx, 'ai', args.milestoneId, args.taskId)),
});

async function unlinkTask(ctx: MutationCtx, actor: 'human' | 'ai', milestoneId: Id<'milestones'>, taskId: Id<'tasks'>) {
  const milestone = await loadMilestone(ctx, milestoneId);
  const task = await ctx.db.get(taskId);
  if (!task) fail('Task not found');
  const decision = detachTaskDecision({
    actor,
    milestone: { id: milestone._id, approval: milestone.approval },
    task: { milestoneId: task.milestoneId ?? null },
  });
  if (!decision.ok) fail(decision.reason);
  await ctx.db.patch(task._id, { milestoneId: undefined, milestoneOrder: undefined });
  return { ok: true as const };
}

export const detachTask = adminMutation({
  args: { milestoneId: v.id('milestones'), taskId: v.id('tasks') },
  handler: async (ctx, args) => unlinkTask(ctx, 'human', args.milestoneId, args.taskId),
});

export const detachTaskFromAi = internalMutation({
  args: { milestoneId: v.id('milestones'), taskId: v.id('tasks' ) },
  handler: async (ctx, args) => unlinkTask(ctx, 'ai', args.milestoneId, args.taskId),
});

/**
 * Retired. This mutation does not call applyHumanDecision and does not write milestone.note.
 * Approve and requestChanges are the only review writers. They do not close tasks.
 */
export const decide = adminMutation({
  args: {
    milestoneId: v.id('milestones'),
    decision: decisionArg,
    note: v.string(),
  },
  handler: async () => {
    fail('Use approve or request changes.');
  },
});

async function staffReview(
  ctx: QueryCtx,
  milestone: Doc<'milestones'>,
  audience: 'staff' | 'client',
): Promise<import('./_lib/milestones').MilestoneReviewView | null> {
  if (audience !== 'staff') return null;
  const history = await ctx.db
    .query('milestoneReviews')
    .withIndex('by_org_milestone_iteration', (q) => q.eq('orgId', milestone.orgId).eq('milestoneId', milestone._id))
    .order('desc')
    .take(historyPageLimit(20));
  const rows = [];
  for (const row of history) {
    if (row.orgId !== milestone.orgId || row.milestoneId !== milestone._id) continue;
    const contact = await ctx.db.get(row.decidedBy);
    rows.push({
      iteration: row.iteration,
      decision: row.decision,
      notes: row.notes,
      decidedByName: contact?.name ?? 'Peter',
      decidedAt: row.decidedAt,
      source: row.source,
      taskCount: row.createdTaskIds.length,
    });
  }
  return {
    iteration: currentIteration(milestone.iteration),
    previewUrl: milestone.previewUrl || null,
    prNumber: milestone.previewPrNumber ?? null,
    prTitle: milestone.previewPrTitle ?? null,
    branch: milestone.previewBranch ?? null,
    commit: milestone.previewCommit ?? null,
    builtAt: milestone.previewBuiltAt ?? null,
    designCheck: milestone.designCheck ?? 'pending',
    designCheckNote: milestone.designCheckNote ?? null,
    history: rows,
  };
}

async function peterContactId(ctx: MutationCtx): Promise<Id<'contacts'> | null> {
  for (const email of PETER_EMAILS) {
    const contact = await ctx.db
      .query('contacts')
      .withIndex('by_email', (q) => q.eq('email', email))
      .unique();
    if (contact && contact.role === 'Warehaus Staff') return contact._id;
  }
  return null;
}

async function applyMilestoneReview(
  ctx: MutationCtx,
  args: {
    milestoneId: Id<'milestones'>;
    iteration: number;
    decision: string;
    notes: string;
    taskIds: readonly Id<'tasks'>[];
    source: ReviewSource;
    actorEmail: string | null;
    actorRole: 'Warehaus Staff' | 'Client Admin' | 'Client Member' | null;
    tokenName: string | null;
    contactId: Id<'contacts'> | null;
  },
) {
  const milestone = await ctx.db.get(args.milestoneId);
  if (!milestone) return { ok: false as const, status: 404, error: 'Milestone not found' };
  const existing = await ctx.db
    .query('milestoneReviews')
    .withIndex('by_milestone_iteration', (q) => q.eq('milestoneId', milestone._id).eq('iteration', args.iteration))
    .unique();
  if (existing && existing.orgId !== milestone.orgId) {
    return { ok: false as const, status: 404, error: 'Milestone not found' };
  }
  const appliesTo = [];
  for (const taskId of args.taskIds) {
    const task = await ctx.db.get(taskId);
    if (!task || task.orgId !== milestone.orgId || task.projectId !== milestone.projectId) continue;
    if (task.milestoneId && task.milestoneId !== milestone._id) continue;
    appliesTo.push({ id: task._id, name: task.name });
  }
  const planned = planReview({
    actor: {
      source: args.source,
      role: args.actorRole,
      email: args.actorEmail,
      tokenName: args.tokenName,
    },
    currentIteration: currentIteration(milestone.iteration),
    workStatus: milestone.workStatus,
    hasPreview: Boolean(milestone.previewUrl),
    iteration: args.iteration,
    decision: args.decision,
    notes: args.notes,
    existing: existing ? { decision: existing.decision, notes: existing.notes } : null,
    appliesTo,
  });
  if (!planned.ok) return { ok: false as const, status: 400, error: planned.reason };
  if (planned.idempotent) {
    if (!existing) return { ok: false as const, status: 409, error: ALREADY_REVIEWED };
    return {
      ok: true as const,
      status: 200,
      idempotent: true,
      iteration: existing.iteration,
      decision: existing.decision,
      approval: milestone.approval,
      workStatus: milestone.workStatus,
      createdTaskIds: existing.createdTaskIds,
    };
  }
  const contactId =
    args.source === 'portal'
      ? args.contactId
      : await peterContactId(ctx);
  if (!contactId) return { ok: false as const, status: 403, error: 'Only Peter can approve a milestone' };
  const decidedAt = Date.now();
  if (planned.decision === 'approve') {
    await ctx.db.patch(milestone._id, {
      approval: 'approved',
      approverContactId: contactId,
      decidedAt,
      workStatus: 'ready',
    });
    await ctx.db.insert('milestoneReviews', {
      orgId: milestone.orgId,
      milestoneId: milestone._id,
      iteration: args.iteration,
      decision: 'approve',
      notes: planned.notes,
      decidedBy: contactId,
      decidedAt,
      source: args.source,
      prNumber: milestone.previewPrNumber,
      commit: milestone.previewCommit,
      createdTaskIds: [],
    });
    await logMilestone(ctx, milestone, 'milestone.approved', decidedAt);
    return {
      ok: true as const,
      status: 200,
      idempotent: false,
      iteration: args.iteration,
      decision: 'approve' as const,
      approval: 'approved' as const,
      workStatus: 'ready' as const,
      createdTaskIds: [],
    };
  }
  const createdTaskIds: Id<'tasks'>[] = [];
  let order = nextMilestoneOrder(
    (
      await ctx.db
        .query('tasks')
        .withIndex('by_orgId_milestoneId', (q) => q.eq('orgId', milestone.orgId).eq('milestoneId', milestone._id))
        .collect()
    ).map((task) => task.milestoneOrder),
  );
  for (const [index, draft] of planned.tasks.entries()) {
    const taskId = await ctx.db.insert('tasks', {
      orgId: milestone.orgId,
      projectId: milestone.projectId,
      notionPageId: `portal-review:${milestone._id}:${planned.nextIteration}:${index}`,
      externalId: `portal-review:${milestone._id}:${planned.nextIteration}:${index}`,
      lastSyncedAt: decidedAt,
      name: draft.name,
      description: draft.description,
      descriptionSource: 'property',
      status: 'To Do',
      isDone: NEW_ITERATION_TASK_DONE,
      stage: 'Building',
      publishToWarehaus: false,
      source: 'portal-review',
      milestoneId: milestone._id,
      milestoneOrder: order,
      parentTaskId: draft.parentTaskId ? (draft.parentTaskId as Id<'tasks'>) : undefined,
      updatedAt: decidedAt,
    });
    createdTaskIds.push(taskId);
    order += 1;
  }
  await ctx.db.patch(milestone._id, {
    approval: 'changes_requested',
    approverContactId: contactId,
    decidedAt,
    workStatus: 'active',
    iteration: planned.nextIteration,
    previewUrl: '',
    designCheck: 'pending',
    designCheckNote: undefined,
  });
  await ctx.db.insert('milestoneReviews', {
    orgId: milestone.orgId,
    milestoneId: milestone._id,
    iteration: args.iteration,
    decision: 'request_changes',
    notes: planned.notes,
    decidedBy: contactId,
    decidedAt,
    source: args.source,
    prNumber: milestone.previewPrNumber,
    commit: milestone.previewCommit,
    createdTaskIds,
  });
  await logMilestone(ctx, milestone, 'milestone.changes_requested', decidedAt);
  return {
    ok: true as const,
    status: 200,
    idempotent: false,
    iteration: planned.nextIteration,
    decision: 'request_changes' as const,
    approval: 'changes_requested' as const,
    workStatus: 'active' as const,
    createdTaskIds,
  };
}

function peterPortalActor(identity: { role: string; email: string; contactId: string }) {
  if (identity.role !== 'Warehaus Staff' || !isPeterEmail(identity.email)) {
    fail('Only Peter can approve a milestone');
  }
  return identity.contactId as Id<'contacts'>;
}

export const approve = adminMutation({
  args: { milestoneId: v.id('milestones'), iteration: v.number(), notes: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const contactId = peterPortalActor(ctx.identity);
    const result = await applyMilestoneReview(ctx, {
      milestoneId: args.milestoneId,
      iteration: args.iteration,
      decision: 'approve',
      notes: args.notes ?? '',
      taskIds: [],
      source: 'portal',
      actorEmail: ctx.identity.email,
      actorRole: 'Warehaus Staff',
      tokenName: null,
      contactId,
    });
    if (!result.ok) fail(result.error);
    return result;
  },
});

export const requestChanges = adminMutation({
  args: {
    milestoneId: v.id('milestones'),
    iteration: v.number(),
    notes: v.string(),
    taskIds: v.optional(v.array(v.id('tasks'))),
  },
  handler: async (ctx, args) => {
    const contactId = peterPortalActor(ctx.identity);
    const result = await applyMilestoneReview(ctx, {
      milestoneId: args.milestoneId,
      iteration: args.iteration,
      decision: 'request_changes',
      notes: args.notes,
      taskIds: args.taskIds ?? [],
      source: 'portal',
      actorEmail: ctx.identity.email,
      actorRole: 'Warehaus Staff',
      tokenName: null,
      contactId,
    });
    if (!result.ok) fail(result.error);
    return result;
  },
});

/** Staff posts the localhost preview. Does not write Notion and does not approve. */
export const setReviewBuild = adminMutation({
  args: {
    milestoneId: v.id('milestones'),
    previewUrl: v.string(),
    prNumber: v.number(),
    prTitle: v.string(),
    branch: v.string(),
    commit: v.string(),
    builtAt: v.optional(v.number()),
    designCheck: v.optional(v.union(v.literal('pass'), v.literal('fixes'), v.literal('pending'))),
    designCheckNote: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const milestone = await loadMilestone(ctx, args.milestoneId);
    const previewUrl = normalizeLocalPreview(args.previewUrl);
    if (!previewUrl) fail('Preview must be a localhost:3100 link');
    const next = {
      previewUrl,
      previewPrNumber: args.prNumber,
      previewPrTitle: args.prTitle.trim(),
      previewBranch: args.branch.trim(),
      previewCommit: args.commit.trim(),
      previewBuiltAt: args.builtAt ?? Date.now(),
      designCheck: args.designCheck ?? 'pending',
      designCheckNote: args.designCheckNote?.trim() || undefined,
    };
    const unchanged =
      milestone.previewUrl === next.previewUrl &&
      milestone.previewPrNumber === next.previewPrNumber &&
      milestone.previewPrTitle === next.previewPrTitle &&
      milestone.previewBranch === next.previewBranch &&
      milestone.previewCommit === next.previewCommit &&
      milestone.designCheck === next.designCheck &&
      (milestone.designCheckNote ?? undefined) === next.designCheckNote;
    if (!unchanged) await ctx.db.patch(milestone._id, next);
    const iteration = currentIteration(milestone.iteration);
    return {
      ok: true as const,
      wrote: !unchanged,
      chat: reviewChatLine({ prNumber: args.prNumber, iteration, previewUrl }),
    };
  },
});

export const reviewForStaff = adminQuery({
  args: { milestoneId: v.id('milestones'), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const milestone = await ctx.db.get(args.milestoneId);
    if (!milestone) return null;
    const view = await staffReview(ctx, milestone, 'staff');
    if (!view) return null;
    const limit = historyPageLimit(args.limit);
    return { ...view, history: view.history.slice(0, limit) };
  },
});

export const reviewForApi = internalMutation({
  args: {
    milestoneId: v.id('milestones'),
    iteration: v.number(),
    decision: v.string(),
    notes: v.string(),
    taskIds: v.array(v.id('tasks')),
    tokenName: v.string(),
  },
  handler: async (ctx, args) =>
    applyMilestoneReview(ctx, {
      ...args,
      source: 'chat',
      actorEmail: null,
      actorRole: null,
      tokenName: args.tokenName,
      contactId: null,
    }),
});

export const decideAsClient = clientMutation({
  args: {
    milestoneId: v.id('milestones'),
    decision: decisionArg,
    note: v.string(),
  },
  handler: async () => {
    fail('Clients cannot review a milestone');
  },
});

/**
 * One-time backfill. One milestone named exactly "Milestone One" for each
 * project that still has top-level tasks with no milestone. Assigned tasks
 * stay on the milestone they already have. Subtasks stay on their parent.
 *
 * Dry run, writes nothing:
 *   npx convex run milestones:previewMilestoneOne
 *   npx convex run milestones:migrateMilestoneOne
 * Apply once on the shared dev deployment only, after that deploy is current:
 *   npx convex run milestones:migrateMilestoneOne '{"apply":true}'
 * Do not run this on production unique-turtle-383. Do not pass --prod.
 */
async function milestoneOneReport(ctx: QueryCtx) {
  const projects = await ctx.db.query('projects').collect();
  const milestones = await ctx.db.query('milestones').collect();
  const tasks = await ctx.db.query('tasks').collect();
  const plan = planMilestoneOne({
    projects: projects.map((project) => ({ id: project._id, name: project.name })),
    milestones: milestones.map((milestone) => ({
      id: milestone._id,
      projectId: milestone.projectId,
      name: milestone.name,
      createdAt: milestone._creationTime,
    })),
    tasks: tasks.map((task) => ({
      id: task._id,
      projectId: task.projectId,
      parentTaskId: task.parentTaskId ?? null,
      milestoneId: task.milestoneId ?? null,
    })),
  });
  return {
    counts: summarizeMilestoneOne(plan.projects, plan.orphans),
    projects: plan.projects,
    projectDocs: projects,
  };
}

export const previewMilestoneOne = internalQuery({
  args: {},
  handler: async (ctx) => {
    const report = await milestoneOneReport(ctx);
    return { dryRun: true as const, wrote: false as const, counts: report.counts, projects: report.projects };
  },
});

export const migrateMilestoneOne = internalMutation({
  args: { apply: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const report = await milestoneOneReport(ctx);
    if (args.apply !== true) {
      return { dryRun: true as const, wrote: false as const, counts: report.counts, projects: report.projects };
    }
    const byId = new Map(report.projectDocs.map((project) => [project._id as string, project]));
    let created = 0;
    let attached = 0;
    for (const row of report.projects) {
      if (row.action === 'skip') continue;
      const project = byId.get(row.projectId);
      if (!project) continue;
      let milestoneId = row.milestoneId;
      if (row.action === 'reuse') {
        if (!milestoneId) continue;
      } else if (row.action === 'create') {
        milestoneId = await insertMilestone(ctx, 'human', project, {
          name: MILESTONE_ONE_NAME,
          objective: MILESTONE_ONE_OBJECTIVE,
          goals: [],
        });
        created += 1;
      }
      if (!milestoneId) continue;
      for (const taskId of row.taskIds) {
        await linkTask(ctx, 'human', milestoneId as Id<'milestones'>, taskId as Id<'tasks'>);
        attached += 1;
      }
    }
    return {
      dryRun: false as const,
      wrote: created > 0 || attached > 0,
      created,
      attached,
      counts: report.counts,
      projects: report.projects,
    };
  },
});
