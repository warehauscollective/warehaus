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
import { internalMutation } from './_generated/server';
import { PortalAuthError } from './_lib/identity';
import {
  applyHumanDecision,
  attachTaskDecision,
  buildRoadmap,
  clientMaySeeLinkedResource,
  clientMaySeeMilestone,
  contentEditDecision,
  createMilestoneDecision,
  detachTaskDecision,
  milestoneActivityName,
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
  milestone: { orgId: Id<'clients'>; projectId: Id<'projects'>; name: string },
  type: MilestoneActivityType,
  at: number,
) {
  await ctx.db.insert('activity', {
    orgId: milestone.orgId,
    projectId: milestone.projectId,
    name: milestoneActivityName(type, milestone.name),
    type,
    tone: type === 'milestone.changes_requested' ? 'warn' : type === 'milestone.approved' ? 'success' : 'accent',
    timestamp: at,
  });
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
    note: milestone.note ?? null,
    approverName: approver?.name ?? null,
    decidedAt: milestone.decidedAt ?? null,
    publishToWarehaus: milestone.publishToWarehaus,
    resources: await milestoneResources(ctx, milestone, audience, orgVisible),
    openCount: roadmap.openCount,
    doneCount: roadmap.doneCount,
    countIsDecision: false,
    rows: roadmap.rows,
  };
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

async function linkTask(
  ctx: MutationCtx,
  actor: 'human' | 'ai',
  milestoneId: Id<'milestones'>,
  taskId: Id<'tasks'>,
) {
  const milestone = await loadMilestone(ctx, milestoneId);
  const task = await ctx.db.get(taskId);
  if (!task) fail('Task not found');
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
  if (!decision.ok) fail(decision.reason);
  if (decision.alreadyAttached) return { ok: true as const };
  const siblings = await ctx.db
    .query('tasks')
    .withIndex('by_orgId_milestoneId', (q) => q.eq('orgId', milestone.orgId).eq('milestoneId', milestone._id))
    .collect();
  const link = taskLinkPatch(milestone._id, nextMilestoneOrder(siblings.map((row) => row.milestoneOrder)));
  await ctx.db.patch(task._id, { milestoneId: milestone._id, milestoneOrder: link.milestoneOrder });
  return { ok: true as const };
}

export const attachTask = adminMutation({
  args: { milestoneId: v.id('milestones'), taskId: v.id('tasks') },
  handler: async (ctx, args) => linkTask(ctx, 'human', args.milestoneId, args.taskId),
});

export const attachTaskFromAi = internalMutation({
  args: { milestoneId: v.id('milestones'), taskId: v.id('tasks') },
  handler: async (ctx, args) => linkTask(ctx, 'ai', args.milestoneId, args.taskId),
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

async function decideMilestone(
  ctx: MutationCtx,
  milestone: Doc<'milestones'>,
  approverContactId: Id<'contacts'>,
  decision: 'approved' | 'changes_requested',
  note: string,
) {
  const tasks = await ctx.db
    .query('tasks')
    .withIndex('by_orgId_milestoneId', (q) => q.eq('orgId', milestone.orgId).eq('milestoneId', milestone._id))
    .collect();
  const applied = applyHumanDecision({
    actor: 'human',
    decision,
    note,
    approverContactId,
    at: Date.now(),
    tasks: tasks.map((task) => ({
      id: task._id,
      isDone: task.isDone,
      status: task.status,
      stage: task.stage ?? null,
    })),
  });
  if (!applied.ok) fail(applied.reason);
  await ctx.db.patch(milestone._id, {
    approval: applied.patch.approval,
    note: applied.patch.note,
    approverContactId,
    decidedAt: applied.patch.decidedAt,
    ...(applied.patch.workStatus ? { workStatus: applied.patch.workStatus } : {}),
  });
  await logMilestone(ctx, milestone, applied.activityType, applied.patch.decidedAt);
  return { ok: true as const, taskWrites: applied.taskWrites.length };
}

export const decide = adminMutation({
  args: {
    milestoneId: v.id('milestones'),
    decision: decisionArg,
    note: v.string(),
  },
  handler: async (ctx, args) => {
    const milestone = await loadMilestone(ctx, args.milestoneId);
    return decideMilestone(ctx, milestone, ctx.identity.contactId as Id<'contacts'>, args.decision, args.note);
  },
});

export const decideAsClient = clientMutation({
  args: {
    milestoneId: v.id('milestones'),
    decision: decisionArg,
    note: v.string(),
  },
  handler: async (ctx, args) => {
    const milestone = await loadMilestone(ctx, args.milestoneId);
    if (milestone.orgId !== ctx.orgId) fail('Milestone not found');
    const project = await ctx.db.get(milestone.projectId);
    const org = await ctx.db.get(ctx.orgId);
    const visible = clientMaySeeMilestone({
      publishToWarehaus: milestone.publishToWarehaus,
      project: projectGate(project, isOrgVisibleToClients(org)),
    });
    if (!visible) fail('Milestone not found');
    return decideMilestone(ctx, milestone, ctx.identity.contactId as Id<'contacts'>, args.decision, args.note);
  },
});
