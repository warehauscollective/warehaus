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
  clientSeesProject,
  isOrgVisibleToClients,
} from '@warehaus/portal-sync';
import { v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { httpAction, internalAction, internalMutation, internalQuery } from './_generated/server';
import { internal } from './_generated/api';
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
  roadmapViewForAudience,
  milestoneLastChange,
  showsUpdatedStamp,
  nextMilestoneOrder,
  publishDecision,
  resourceEditDecision,
  resourceLinkDecision,
  taskLinkPatch,
  type MilestoneActivityType,
  type MilestoneProjectGate,
  type MilestoneRoadmapView,
  type RoadmapTaskInput,
} from './_lib/milestones';
import {
  detailActivitySummary,
  dueDateChangeDecision,
  clientReviewDecision,
  movedLaneCount,
  ownerChangeDecision,
  projectMoveDecision,
  publishChangeDecision,
  taskIdsToMove,
} from './_lib/milestoneDetails';
import { loadLinkedTasks, loadMilestoneTaskSet, loadedTask } from './_lib/milestoneTaskSet';
import { changeMilestoneStatus, type StatusChange } from './_lib/milestoneLifecycle';
import {
  MILESTONE_ARCHIVED,
  RESTORED_MILESTONE_STATUS,
  parkedMilestoneTarget,
  planArchiveMilestone,
  planMarkComplete,
  shippedLockedReason,
  type CloseoutWrite,
} from './_lib/closeout';
import {
  SnapshotLog,
  UNDO_TASK_CAP,
  archiveTaskTree,
  detachTaskFromMilestone,
  moveTasksToMilestone,
  parkTask,
  restoreTaskSnapshots,
  restoreTaskTree,
  taskSnapshotArg,
  writeTaskStatus,
} from './_lib/closeoutStore';
import { STATUS_STALE, type MilestoneStatus } from './_lib/milestoneStatus';
import {
  addTaskDecision,
  editTaskDecision,
  isPortalOwnedTask,
  PORTAL_MILESTONE_TASK_SOURCE,
  removeTaskDecision,
  reorderDecision,
  taskOrigin,
  type MilestoneCreatedVia,
} from './_lib/milestoneTasks';
import { normalizeLocalPreviewUrl, tileLinkChangeDecision, type TileLinkField } from './_lib/tileLinks';
import { closeAsksOnMilestone, peterContactId } from './_lib/askStore';
import {
  MILESTONE_ONE_NAME,
  MILESTONE_ONE_OBJECTIVE,
  planMilestoneOne,
  summarizeMilestoneOne,
} from './_lib/milestoneOneSeed';
import {
  ALREADY_REVIEWED,
  chatContactError,
  currentIteration,
  historyPageLimit,
  isPeterEmail,
  NEW_ITERATION_TASK_DONE,
  normalizeLocalPreview,
  planReview,
  requestChangesTarget,
  CHAT_CHANGES_NOTE,
  previewStatusPatch,
  RETRY_WAITS_ON_TOKENS,
  reviewChatLine,
  roadmapReviewForAudience,
  reviewForAudience,
  type ReviewSource,
} from './_lib/milestoneReview';
import {
  planAttachPreviewLink,
  planClearPreviewLink,
  reviewPreviews,
  reviewRetryLiveOnClient,
} from './_lib/previewLink';
import {
  approveDesignDecision,
  ONLY_PETER_DESIGN_CHANGES,
  ONLY_PETER_DESIGNS,
  requestDesignChangesDecision,
} from './_lib/designApproval';
import { designGate, taskKind, TASK_KIND_NEEDS_MILESTONE } from './_lib/designGate';
import { stageForNewMilestoneTask } from './_lib/milestoneTasks';
import { setTaskKind as writeTaskKind, syncDesignAsk } from './_lib/designGateStore';
import {
  PREVIEW_DELETED_ACTIVITY,
  PREVIEW_READY_ACTIVITY,
  VERCEL_TEAM_ID,
  assertReviewConvexUrl,
  authorizeReviewPreview,
  deleteVercelDeployment,
  previewDeleteAfterFailure,
  previewDeletedActivity,
  removalAfterDelete,
  retryActorAllowed,
  retryPreviewPatch,
  reviewPreviewSetPatch,
  type ReviewPreviewRecord,
  type ReviewPreviewState,
} from './_lib/reviewPreview';
import { adminMutation, adminQuery, clientMutation, clientQuery } from './_lib/wrappers';
import { uniqueMilestoneBranch } from './_lib/milestoneBranchStore';
import { planningForNewMilestone } from './_lib/agentRun';
import { milestoneBuildRun } from './_lib/buildRunRead';

const statusArg = v.union(
  v.literal('Idea'),
  v.literal('Planning'),
  v.literal('Awaiting Go'),
  v.literal('Building'),
  v.literal('Ready to Ship'),
  v.literal('Shipped'),
  v.literal('Parked'),
);
const decisionArg = v.union(v.literal('approved'), v.literal('changes_requested'));
const createdViaArg = v.union(v.literal('grok'), v.literal('claude'), v.literal('other'));

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
  summary?: string,
) {
  await writeMilestoneActivity(
    ctx as unknown as Parameters<typeof writeMilestoneActivity>[0],
    milestone,
    type,
    at,
    summary,
  );
}

/** A refused status change, worded for the caller. A locked Shipped names the open count and Mark complete. */
function statusRefusal(change: Extract<StatusChange, { ok: false }>): string {
  return change.code === 'shipped' && change.open != null ? shippedLockedReason(change.open) : change.reason;
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
      archived: task.archivedAt != null,
      source: task.source ?? null,
      origin: taskOrigin({ origin: task.origin, source: task.source }),
      round: task.round ?? null,
      kind: taskKind(task),
      portalOwned: isPortalOwnedTask({ source: task.source, notionPageId: task.notionPageId }),
      detail: task.description ?? null,
      runner: task.claimedBy ?? null,
      commit: task.lastCommitSha ?? null,
      blockedReason: task.blockedReason ?? null,
      nextAction: task.nextAction ?? null,
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
      ...(resource.type ? { type: resource.type } : {}),
    });
  }
  return resources;
}

/**
 * When a live milestone last changed, for the staff page header. One indexed
 * single-row read: the newest activity row. Run and planning changes arrive
 * through the tasks they touch and `loopChangedAt`, so no agent table is read
 * here. Only called while the milestone is Planning or Building.
 */
async function lastChangeFor(
  ctx: QueryCtx,
  milestone: Doc<'milestones'>,
  tasks: readonly Doc<'tasks'>[],
): Promise<number | null> {
  const activity = await ctx.db
    .query('activity')
    .withIndex('by_milestoneId_timestamp', (q) => q.eq('milestoneId', milestone._id))
    .order('desc')
    .first();
  return milestoneLastChange([
    milestone._creationTime,
    milestone.decidedAt,
    milestone.loopChangedAt,
    activity?.timestamp,
    ...tasks.filter((task) => task.milestoneId === milestone._id).map((task) => task.updatedAt),
  ]);
}

/** The design gate as the tile and the task rows show it. Staff only. */
function roadmapDesignGate(inputs: readonly RoadmapTaskInput[], milestone: Doc<'milestones'>) {
  const gate = designGate(
    inputs.filter((task) => task.milestoneId === milestone._id),
    milestone.designApprovedAt,
  );
  return { visual: gate.visual, buildLocked: gate.buildLocked, phase: gate.phase };
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
  const approver =
    audience === 'staff' && milestone.approverContactId ? await ctx.db.get(milestone.approverContactId) : null;
  const updatedAt =
    audience === 'staff' && showsUpdatedStamp(milestone.status) ? await lastChangeFor(ctx, milestone, tasks) : null;
  const buildRun = await milestoneBuildRun(ctx, milestone, tasks, audience);
  const view: MilestoneRoadmapView = {
    id: milestone._id,
    name: milestone.name,
    objective: milestone.objective,
    goals: milestone.goals,
    status: milestone.status,
    ...roadmapReviewForAudience(audience, milestone),
    approverName: audience === 'staff' ? (approver?.name ?? null) : null,
    publishToWarehaus: milestone.publishToWarehaus,
    createdAt: milestone._creationTime,
    ownerContactId: milestone.ownerContactId ?? null,
    ownerName: await ownerNameFor(ctx, milestone),
    dueDate: milestone.dueDate ?? null,
    ...(audience === 'staff' && milestone.localPreviewUrl ? { localPreviewUrl: milestone.localPreviewUrl } : {}),
    ...(audience === 'staff' && milestone.figmaUrl ? { figmaUrl: milestone.figmaUrl } : {}),
    ...(audience === 'staff' && milestone.designApprovedAt ? { designApprovedAt: milestone.designApprovedAt } : {}),
    ...(audience === 'staff' ? { designGate: roadmapDesignGate(inputs, milestone) } : {}),
    creatorName: await creatorNameFor(ctx, milestone),
    ...(audience === 'staff' && milestone.createdVia ? { createdVia: milestone.createdVia } : {}),
    ...(audience === 'staff' && milestone.planning ? { planning: milestone.planning } : {}),
    ...(audience === 'staff' && milestone.planningBlockedReason
      ? { planningBlockedReason: milestone.planningBlockedReason }
      : {}),
    ...(audience === 'staff' && milestone.branch ? { branch: milestone.branch } : {}),
    ...(audience === 'staff' && milestone.prUrl ? { prUrl: milestone.prUrl } : {}),
    ...(updatedAt != null ? { updatedAt } : {}),
    ...(buildRun ? { buildRun } : {}),
    resources: await milestoneResources(ctx, milestone, audience, orgVisible),
    openCount: roadmap.openCount,
    doneCount: roadmap.doneCount,
    ...(roadmap.canClose != null ? { canClose: roadmap.canClose } : {}),
    countIsDecision: false,
    rows: roadmap.rows,
  };
  const review = reviewForAudience(audience, await staffReview(ctx, milestone, audience));
  if (review) view.review = review;
  if (audience === 'staff') {
    view.attachableTasks = tasks
      .filter((task) => !task.milestoneId)
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
  return roadmapViewForAudience(view, audience);
}

async function listOnProject(
  ctx: QueryCtx,
  project: Doc<'projects'>,
  audience: 'staff' | 'client',
  orgVisible: boolean,
): Promise<MilestoneRoadmapView[]> {
  if (audience === 'client' && !clientSeesProject(project, orgVisible)) return [];
  const milestones = await ctx.db
    .query('milestones')
    .withIndex('by_orgId_projectId', (q) => q.eq('orgId', project.orgId).eq('projectId', project._id))
    .collect();
  const visible = milestones
    .filter((milestone) => milestone.orgId === project.orgId && milestone.projectId === project._id)
    .filter((milestone) => milestone.archivedAt == null)
    .filter((milestone) =>
      audience === 'staff'
        ? true
        : clientMaySeeMilestone({
            publishToWarehaus: milestone.publishToWarehaus,
            project: projectGate(project, orgVisible),
          }),
    )
    .sort((a, b) => a._creationTime - b._creationTime);
  const tasks = (
    await ctx.db
      .query('tasks')
      .withIndex('by_orgId_projectId', (q) => q.eq('orgId', project.orgId).eq('projectId', project._id))
      .collect()
  ).filter((task) => task.archivedAt == null);
  const views: MilestoneRoadmapView[] = [];
  for (const milestone of visible) {
    views.push(await toRoadmap(ctx, milestone, tasks, audience, orgVisible));
  }
  return views;
}

/**
 * The Archived filter. Staff only. Archived milestones on one project, and
 * the project's archived tasks. Two indexed reads, the same ones the roadmap
 * makes. `milestoneId` on a task is its own link, or its parent's.
 */
export const listArchivedForProject = adminQuery({
  args: { projectId: v.id('projects') },
  handler: async (ctx, { projectId }) => {
    const project = await ctx.db.get(projectId);
    if (!project) return { milestones: [], tasks: [] };
    const milestones = (
      await ctx.db
        .query('milestones')
        .withIndex('by_orgId_projectId', (q) => q.eq('orgId', project.orgId).eq('projectId', project._id))
        .collect()
    )
      .filter((milestone) => milestone.archivedAt != null)
      .sort((a, b) => (b.archivedAt ?? 0) - (a.archivedAt ?? 0));
    const tasks = await ctx.db
      .query('tasks')
      .withIndex('by_orgId_projectId', (q) => q.eq('orgId', project.orgId).eq('projectId', project._id))
      .collect();
    const byId = new Map(tasks.map((task) => [task._id as string, task]));
    const views: MilestoneRoadmapView[] = [];
    for (const milestone of milestones) {
      // The tasks archived with the milestone show on its card. Tasks archived earlier stay out.
      const shown = tasks.filter((task) => task.archivedAt == null || task.archivedAt === milestone.archivedAt);
      views.push(await toRoadmap(ctx, milestone, shown, 'staff', true));
    }
    return {
      milestones: views.map((view, index) => ({ ...view, archivedAt: milestones[index]?.archivedAt ?? null })),
      tasks: tasks
        .filter((task) => task.archivedAt != null)
        .sort((a, b) => (b.archivedAt ?? 0) - (a.archivedAt ?? 0))
        .map((task) => {
          const parent = task.parentTaskId ? byId.get(task.parentTaskId) : undefined;
          return {
            id: task._id,
            name: task.name,
            status: task.status,
            isDone: task.isDone,
            stage: task.stage ?? null,
            parentTaskId: task.parentTaskId ?? null,
            milestoneId: task.milestoneId ?? parent?.milestoneId ?? null,
            archivedAt: task.archivedAt ?? null,
          };
        }),
    };
  },
});

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

async function personName(
  ctx: QueryCtx,
  orgId: Id<'clients'>,
  contactId: Id<'contacts'> | undefined,
): Promise<string | null> {
  if (!contactId) return null;
  const contact = await ctx.db.get(contactId);
  if (!contact || contact.orgId !== orgId) return null;
  const name = contact.name.trim();
  return name || null;
}

async function ownerNameFor(ctx: QueryCtx, milestone: Doc<'milestones'>): Promise<string | null> {
  return personName(ctx, milestone.orgId, milestone.ownerContactId);
}

async function creatorNameFor(ctx: QueryCtx, milestone: Doc<'milestones'>): Promise<string | null> {
  return personName(ctx, milestone.orgId, milestone.createdByContactId);
}

const OWNER_TAKE = 40;

/** Staff on this client who can own a milestone. One indexed read, capped. */
async function ownerChoicesFor(ctx: QueryCtx, orgId: Id<'clients'>) {
  const contacts = await ctx.db
    .query('contacts')
    .withIndex('by_orgId', (q) => q.eq('orgId', orgId))
    .take(OWNER_TAKE);
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
}

async function ownerAllowed(
  ctx: QueryCtx | MutationCtx,
  orgId: Id<'clients'>,
  contactId: Id<'contacts'> | null,
): Promise<boolean> {
  if (!contactId) return true;
  const contact = await ctx.db.get(contactId);
  return (
    contact != null &&
    contact.orgId === orgId &&
    contact.role === 'Warehaus Staff' &&
    contact.portalAccess === 'Enabled' &&
    contact.syncHiddenAt == null
  );
}

async function insertMilestone(
  ctx: MutationCtx,
  actor: 'human' | 'ai',
  project: Doc<'projects'>,
  args: {
    name: string;
    objective: string;
    goals: string[];
    status?: MilestoneStatus;
    resourceIds?: Id<'sharedResources'>[];
    ownerContactId?: Id<'contacts'>;
    dueDate?: string;
    createdByContactId?: Id<'contacts'>;
    createdVia?: MilestoneCreatedVia;
  },
) {
  const created = createMilestoneDecision({
    actor,
    name: args.name,
    objective: args.objective,
    goals: args.goals,
    status: args.status,
  });
  if (!created.ok) fail(created.reason);
  const milestoneId = await ctx.db.insert('milestones', {
    orgId: project.orgId,
    projectId: project._id,
    name: created.milestone.name,
    objective: created.milestone.objective,
    goals: created.milestone.goals,
    status: created.milestone.status,
    approval: created.milestone.approval,
    publishToWarehaus: created.milestone.publishToWarehaus,
    ...(args.ownerContactId ? { ownerContactId: args.ownerContactId } : {}),
    ...(args.dueDate ? { dueDate: args.dueDate } : {}),
    ...(args.createdByContactId ? { createdByContactId: args.createdByContactId } : {}),
    ...(args.createdVia ? { createdVia: args.createdVia } : {}),
    branch: await uniqueMilestoneBranch(ctx, created.milestone.name),
    // A milestone made here has no tasks yet, whoever made it. The runner plans it.
    ...(planningForNewMilestone({ taskCount: 0, status: created.milestone.status })
      ? { planning: 'queued' as const, planningIteration: 1 }
      : {}),
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
    status: v.optional(statusArg),
    resourceIds: v.optional(v.array(v.id('sharedResources'))),
    ownerContactId: v.optional(v.id('contacts')),
    dueDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) fail('Project not found');
    if (args.dueDate) {
      const dated = dueDateChangeDecision({ from: null, to: args.dueDate });
      if (!dated.ok) fail(dated.reason);
    }
    if (args.ownerContactId) {
      const allowed = await ownerAllowed(ctx, project.orgId, args.ownerContactId);
      const owned = ownerChangeDecision({ from: null, to: args.ownerContactId, allowed });
      if (!owned.ok) fail(owned.reason);
    }
    const id = await insertMilestone(ctx, 'human', project, {
      ...args,
      createdVia: 'portal',
      ...(ctx.identity.contactId ? { createdByContactId: ctx.identity.contactId as Id<'contacts'> } : {}),
    });
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
    status: v.optional(statusArg),
    resourceIds: v.optional(v.array(v.id('sharedResources'))),
    /** Which assistant made it. Missing is stored as other. */
    createdVia: v.optional(createdViaArg),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project || project.orgId !== args.orgId) fail('Project not found');
    const id = await insertMilestone(ctx, 'ai', project, { ...args, createdVia: args.createdVia ?? 'other' });
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
    status: v.optional(statusArg),
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
    if (args.status != null) {
      const moved = await changeMilestoneStatus(ctx, milestone, {
        cause: 'set',
        to: args.status,
        actor: 'ai',
        actorName: 'AI',
        at: Date.now(),
      });
      if (!moved.ok) fail(moved.reason);
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

export const setPublish = adminMutation({
  args: { milestoneId: v.id('milestones'), publishToWarehaus: v.boolean() },
  handler: async (ctx, args) => {
    const milestone = await loadMilestone(ctx, args.milestoneId);
    const published = publishDecision({ actor: 'human', publishToWarehaus: args.publishToWarehaus });
    if (!published.ok) fail(published.reason);
    const change = publishChangeDecision(milestone.publishToWarehaus, published.publishToWarehaus);
    if (!change.wrote) return { ok: true as const, wrote: false as const };
    await ctx.db.patch(milestone._id, { publishToWarehaus: published.publishToWarehaus });
    const at = Date.now();
    await logMilestone(
      ctx,
      milestone,
      'milestone.publish',
      at,
      detailActivitySummary({
        actor: ctx.identity.name,
        from: milestone.publishToWarehaus ? 'Shared with client' : 'Not published',
        to: published.publishToWarehaus ? 'Shared with client' : 'Not published',
        at,
      }),
    );
    return { ok: true as const, wrote: true as const };
  },
});

/**
 * Staff pick a status from the menu, or undo a play. Shipped is allowed when
 * every task that is not Parked is Done. The same value writes nothing.
 * `expectedStatus` is what the caller last saw; when it no longer matches,
 * nothing is written.
 */
export const setStatus = adminMutation({
  args: {
    milestoneId: v.id('milestones'),
    status: statusArg,
    expectedStatus: v.optional(statusArg),
  },
  handler: async (ctx, args) => {
    const milestone = await loadMilestone(ctx, args.milestoneId);
    const moved = await changeMilestoneStatus(ctx, milestone, {
      cause: 'set',
      to: args.status,
      expected: args.expectedStatus,
      actorName: ctx.identity.name,
      at: Date.now(),
    });
    if (!moved.ok) fail(statusRefusal(moved));
    return { ok: true as const, wrote: moved.wrote, status: moved.status, previous: moved.from };
  },
});

/**
 * The play button. Staff only. One step forward: Idea, Planning, Awaiting
 * Go, Building, Ready to Ship. Never Shipped. A status that changed since
 * the caller read it is rejected. The same click sent twice writes once.
 */
export const advance = adminMutation({
  args: { milestoneId: v.id('milestones'), expectedStatus: statusArg },
  handler: async (ctx, args) => {
    const milestone = await loadMilestone(ctx, args.milestoneId);
    const moved = await changeMilestoneStatus(ctx, milestone, {
      cause: 'advance',
      expected: args.expectedStatus,
      actorName: ctx.identity.name,
      at: Date.now(),
    });
    if (!moved.ok) fail(moved.reason);
    return { ok: true as const, wrote: moved.wrote, status: moved.status, previous: moved.from };
  },
});

export const ownerChoices = adminQuery({
  args: { projectId: v.id('projects') },
  handler: async (ctx, { projectId }) => {
    const project = await ctx.db.get(projectId);
    if (!project) return [];
    return ownerChoicesFor(ctx, project.orgId);
  },
});

export const setOwner = adminMutation({
  args: {
    milestoneId: v.id('milestones'),
    ownerContactId: v.union(v.id('contacts'), v.null()),
  },
  handler: async (ctx, args) => {
    const milestone = await loadMilestone(ctx, args.milestoneId);
    const allowed = await ownerAllowed(ctx, milestone.orgId, args.ownerContactId);
    const decision = ownerChangeDecision({
      from: milestone.ownerContactId ?? null,
      to: args.ownerContactId,
      allowed,
    });
    if (!decision.ok) fail(decision.reason);
    if (!decision.wrote) return { ok: true as const, wrote: false as const };
    await ctx.db.patch(milestone._id, {
      ownerContactId: decision.ownerContactId ? (decision.ownerContactId as Id<'contacts'>) : undefined,
    });
    return { ok: true as const, wrote: true as const };
  },
});

export const setTileLink = adminMutation({
  args: {
    milestoneId: v.id('milestones'),
    field: v.union(v.literal('localPreview'), v.literal('figma')),
    url: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const milestone = await loadMilestone(ctx, args.milestoneId);
    const field = args.field as TileLinkField;
    const from = field === 'localPreview' ? (milestone.localPreviewUrl ?? null) : (milestone.figmaUrl ?? null);
    const decision = tileLinkChangeDecision({ field, from, to: args.url });
    if (!decision.ok) fail(decision.reason);
    if (!decision.wrote) return { ok: true as const, wrote: false as const };
    if (field === 'localPreview') {
      await ctx.db.patch(milestone._id, { localPreviewUrl: decision.url ?? undefined });
    } else {
      await ctx.db.patch(milestone._id, { figmaUrl: decision.url ?? undefined });
    }
    return { ok: true as const, wrote: true as const };
  },
});

export const setDueDate = adminMutation({
  args: {
    milestoneId: v.id('milestones'),
    dueDate: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const milestone = await loadMilestone(ctx, args.milestoneId);
    const decision = dueDateChangeDecision({
      from: milestone.dueDate ?? null,
      to: args.dueDate,
    });
    if (!decision.ok) fail(decision.reason);
    if (!decision.wrote) return { ok: true as const, wrote: false as const };
    await ctx.db.patch(milestone._id, { dueDate: decision.dueDate ?? undefined });
    return { ok: true as const, wrote: true as const };
  },
});

export const moveProject = adminMutation({
  args: { milestoneId: v.id('milestones'), projectId: v.id('projects') },
  handler: async (ctx, args) => {
    const milestone = await loadMilestone(ctx, args.milestoneId);
    const target = await ctx.db.get(args.projectId);
    const decision = projectMoveDecision({
      fromProjectId: milestone.projectId,
      toProjectId: args.projectId,
      sameOrg: target?.orgId === milestone.orgId,
    });
    if (!decision.ok) fail(decision.reason);
    if (!target) fail('Project not found');
    if (!decision.wrote) return { ok: true as const, wrote: false as const, movedTasks: 0 };
    const linked = await ctx.db
      .query('tasks')
      .withIndex('by_orgId_milestoneId', (q) => q.eq('orgId', milestone.orgId).eq('milestoneId', milestone._id))
      .collect();
    const seen = new Set<string>();
    const tasks: Doc<'tasks'>[] = [];
    for (const task of linked) {
      if (seen.has(task._id)) continue;
      seen.add(task._id);
      tasks.push(task);
    }
    const parents = linked.filter((task) => !task.parentTaskId).slice(0, 40);
    for (const task of parents) {
      const children = await ctx.db
        .query('tasks')
        .withIndex('by_parentTaskId', (q) => q.eq('parentTaskId', task._id))
        .take(50);
      for (const child of children) {
        if (child.orgId !== milestone.orgId || seen.has(child._id)) continue;
        seen.add(child._id);
        tasks.push(child);
      }
    }
    const moving = taskIdsToMove({
      tasks: tasks.map((task) => ({
        id: task._id,
        projectId: task.projectId,
        milestoneId: task.milestoneId ?? null,
        parentTaskId: task.parentTaskId ?? null,
      })),
      milestoneId: milestone._id,
      toProjectId: target._id,
    });
    const fromName = (await ctx.db.get(milestone.projectId))?.name ?? 'Previous project';
    const lanes = movedLaneCount(
      tasks.map((task) => ({
        id: task._id,
        projectId: task.projectId,
        milestoneId: task.milestoneId ?? null,
        parentTaskId: task.parentTaskId ?? null,
      })),
      moving,
    );
    await ctx.db.patch(milestone._id, { projectId: target._id });
    for (const taskId of moving) {
      const task = tasks.find((item) => item._id === taskId);
      if (task && task.projectId === target._id) continue;
      await ctx.db.patch(taskId as Id<'tasks'>, { projectId: target._id, portalProjectId: target._id });
    }
    const at = Date.now();
    await logMilestone(
      ctx,
      { ...milestone, projectId: target._id },
      'milestone.project',
      at,
      detailActivitySummary({
        actor: ctx.identity.name,
        from: fromName,
        to: target.name,
        at,
        tasks: lanes,
      }),
    );
    return { ok: true as const, wrote: true as const, movedTasks: lanes };
  },
});

export const listMoveTargets = adminQuery({
  args: { projectId: v.id('projects'), cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) return { projects: [], continueCursor: null, isDone: !project };
    const page = await ctx.db
      .query('projects')
      .withIndex('by_orgId', (q) => q.eq('orgId', project.orgId))
      .paginate({ numItems: 20, cursor: args.cursor ?? null });
    return {
      projects: page.page.map((row) => ({ id: row._id, name: row.name })),
      continueCursor: page.isDone ? null : page.continueCursor,
      isDone: page.isDone,
    };
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
  // One task. Attaching a subtask does not write the parent or its siblings.
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

/** Staff API. Same human unlink rules as the portal button. */
export const detachTaskForApi = internalMutation({
  args: { milestoneId: v.id('milestones'), taskId: v.id('tasks') },
  handler: async (ctx, args) => {
    const milestone = await ctx.db.get(args.milestoneId);
    if (!milestone) return { ok: false as const, code: 'not_found' as const, error: 'Milestone not found' };
    const task = await ctx.db.get(args.taskId);
    if (!task) return { ok: false as const, code: 'not_found' as const, error: 'Task not found' };
    const decision = detachTaskDecision({
      actor: 'human' as const,
      milestone: { id: milestone._id, approval: milestone.approval },
      task: { milestoneId: task.milestoneId ?? null },
    });
    if (!decision.ok) {
      return { ok: false as const, code: 'failed' as const, error: decision.reason };
    }
    await ctx.db.patch(task._id, { milestoneId: undefined, milestoneOrder: undefined });
    return { ok: true as const };
  },
});

export const detachTaskFromAi = internalMutation({
  args: { milestoneId: v.id('milestones'), taskId: v.id('tasks' ) },
  handler: async (ctx, args) => unlinkTask(ctx, 'ai', args.milestoneId, args.taskId),
});

/**
 * Retired. This mutation makes no review decision and does not write milestone.note.
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
    localPreviewUrl: reviewPreviews(milestone).local,
    vercelPreviewUrl: reviewPreviews(milestone).vercel,
    previewAttachedBy: milestone.previewAttachedBy ?? null,
    previewAttachedAt: milestone.previewAttachedAt ?? null,
    prNumber: milestone.previewPrNumber ?? null,
    prTitle: milestone.previewPrTitle ?? null,
    branch: milestone.previewBranch ?? null,
    commit: milestone.previewCommit ?? null,
    builtAt: milestone.previewBuiltAt ?? null,
    designCheck: milestone.designCheck ?? 'pending',
    designCheckNote: milestone.designCheckNote ?? null,
    previewBuild: milestone.previewBuild ?? null,
    previewBuildAttempt: milestone.previewBuildAttempt ?? null,
    previewBuildAt: milestone.previewBuildAt ?? null,
    previewDelete: milestone.previewDelete ?? null,
    previewDeleteAttempt: milestone.previewDeleteAttempt ?? null,
    previewDeleteAt: milestone.previewDeleteAt ?? null,
    deployFinishedAt: milestone.deployFinishedAt ?? null,
    history: rows,
  };
}

async function applyMilestoneReview(
  ctx: MutationCtx,
  args: {
    milestoneId: Id<'milestones'>;
    iteration: number;
    decision: string;
    notes: string;
    taskIds: readonly Id<'tasks'>[];
    newTasks?: readonly string[];
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
    status: milestone.status,
    hasPreview: reviewPreviews(milestone).any,
    iteration: args.iteration,
    decision: args.decision,
    notes: args.notes,
    existing: existing ? { decision: existing.decision, notes: existing.notes } : null,
    appliesTo,
    newTasks: args.newTasks,
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
      milestoneStatus: milestone.status,
      createdTaskIds: existing.createdTaskIds,
    };
  }
  const contactId =
    args.source === 'portal'
      ? args.contactId
      : await peterContactId(ctx);
  if (!contactId) return { ok: false as const, status: 403, error: chatContactError(planned.decision) };
  // Read before any write: new tasks go after the siblings, and a milestone over the cap is refused whole.
  const siblings = planned.decision === 'approve' ? ({ ok: true, rows: [] } as const) : await loadLinkedTasks(ctx, milestone);
  if (!siblings.ok) return { ok: false as const, status: 409, error: siblings.reason };
  const decidedAt = Date.now();
  // Peter answered. The open approval Ask on this milestone is closed.
  await closeAsksOnMilestone(ctx, milestone._id, (ask) => ask.reason === 'approval');
  if (planned.decision === 'approve') {
    const deploymentId = milestone.previewDeploymentId?.trim() || '';
    await ctx.db.patch(milestone._id, {
      approval: 'approved',
      approverContactId: contactId,
      decidedAt,
      ...(milestone.previewUrl ? { previewUrl: '' } : {}),
      ...(deploymentId ? { previewDelete: 'removing' as const } : {}),
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
    if (deploymentId) {
      await ctx.scheduler.runAfter(0, internal.milestones.deleteReviewPreview, {
        milestoneId: milestone._id,
        deploymentId,
        sha: milestone.previewCommit ?? '',
        scheduledAttempt: 0,
      });
    }
    return {
      ok: true as const,
      status: 200,
      idempotent: false,
      iteration: args.iteration,
      decision: 'approve' as const,
      approval: 'approved' as const,
      milestoneStatus: planned.status,
      createdTaskIds: [],
    };
  }
  const createdTaskIds: Id<'tasks'>[] = [];
  let order = nextMilestoneOrder(siblings.rows.map((task) => task.milestoneOrder));
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
      origin: draft.origin,
      round: draft.round,
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
    iteration: planned.nextIteration,
    previewUrl: '',
    designCheck: 'pending',
    designCheckNote: undefined,
    previewBuild: undefined,
    previewBuildAttempt: undefined,
    previewBuildAt: undefined,
    ...(milestone.previewDeploymentId ? { previewDeploymentId: undefined } : {}),
    ...(milestone.previewDelete ? { previewDelete: undefined } : {}),
    ...(milestone.previewDeleteAttempt != null ? { previewDeleteAttempt: undefined } : {}),
    ...(milestone.previewDeleteAt != null ? { previewDeleteAt: undefined } : {}),
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
  // Ready to Ship to Building through the one writer, which closes the approval note.
  const reviewed = (await ctx.db.get(milestone._id)) ?? milestone;
  const to = requestChangesTarget(args.source);
  const moved = await changeMilestoneStatus(ctx, reviewed, { cause: 'request_changes', to, actorName: 'Peter', at: decidedAt });
  if (!moved.ok) fail(moved.reason);
  if (to === 'Awaiting Go') {
    // A chat review leaves a note for staff, who start the build.
    await ctx.db.insert('milestoneNotes', {
      orgId: milestone.orgId,
      milestoneId: milestone._id,
      body: CHAT_CHANGES_NOTE,
      addedBy: args.tokenName ?? 'grok-bot',
      createdAt: decidedAt,
    });
  }
  return {
    ok: true as const,
    status: 200,
    idempotent: false,
    iteration: planned.nextIteration,
    decision: 'request_changes' as const,
    approval: 'changes_requested' as const,
    milestoneStatus: planned.status,
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

/**
 * Approve designs on the tile. Peter only, before build. Saves who and when,
 * and writes one staff-only Activity row. Status does not change and nothing
 * merges or deploys. A second press keeps the first approval and writes nothing.
 */
export const approveDesign = adminMutation({
  args: { milestoneId: v.id('milestones') },
  handler: async (ctx, args) => {
    if (ctx.identity.role !== 'Warehaus Staff' || !isPeterEmail(ctx.identity.email)) fail(ONLY_PETER_DESIGNS);
    const contactId = ctx.identity.contactId as Id<'contacts'>;
    const milestone = await loadMilestone(ctx, args.milestoneId);
    const decision = approveDesignDecision(milestone);
    if (!decision.ok) fail(decision.reason);
    if (decision.already) {
      return { ok: true as const, designApprovedAt: milestone.designApprovedAt as number, already: true };
    }
    const at = Date.now();
    await ctx.db.patch(milestone._id, { designApprovedAt: at, designApproverContactId: contactId });
    await logMilestone(ctx, milestone, 'milestone.design_approved', at, 'Designs approved by Peter');
    // Build tasks unlock; the Approve designs Ask is answered.
    await syncDesignAsk(ctx, { ...milestone, designApprovedAt: at }, { addedBy: ctx.identity.email, at });
    return { ok: true as const, designApprovedAt: at, already: false };
  },
});

/**
 * Request design changes, beside Approve designs. Peter only. Adds top-level
 * design tasks that say which design tasks they revise, answers the Approve
 * designs Ask, and leaves the designs unapproved, so build stays locked.
 * Status does not change.
 */
export async function applyDesignChanges(
  ctx: MutationCtx,
  input: {
    milestoneId: Id<'milestones'>;
    notes: string;
    taskIds: readonly Id<'tasks'>[];
    newTasks?: readonly string[];
    actor: string;
  },
): Promise<{ ok: true; taskIds: Id<'tasks'>[] } | { ok: false; error: string }> {
  const milestone = await ctx.db.get(input.milestoneId);
  if (!milestone || milestone.archivedAt != null) return { ok: false, error: 'Milestone not found' };
  const loaded = await loadMilestoneTaskSet(ctx, milestone);
  if (!loaded.ok) return { ok: false, error: loaded.reason };
  const byId = new Map(loaded.set.tasks.map((task) => [task.id as string, task]));
  const revises = input.taskIds.map((id) => byId.get(id)?.doc.name).filter((name): name is string => Boolean(name));
  const decision = requestDesignChangesDecision({
    status: milestone.status,
    designApprovedAt: milestone.designApprovedAt,
    visual: designGate(loaded.set.tasks, null).visual,
    notes: input.notes,
    revises,
    newTasks: input.newTasks,
  });
  if (!decision.ok) return { ok: false, error: decision.reason };
  const siblings = await loadLinkedTasks(ctx, milestone);
  if (!siblings.ok) return { ok: false, error: siblings.reason };
  let order = nextMilestoneOrder(siblings.rows.map((task) => task.milestoneOrder));
  const at = Date.now();
  const round = currentIteration(milestone.iteration);
  const created: Id<'tasks'>[] = [];
  for (const [index, draft] of decision.drafts.entries()) {
    const key = `${PORTAL_MILESTONE_TASK_SOURCE}:${milestone._id}:design:${at}:${index}`;
    created.push(
      await ctx.db.insert('tasks', {
        orgId: milestone.orgId,
        projectId: milestone.projectId,
        notionPageId: key,
        externalId: key,
        lastSyncedAt: at,
        name: draft.name,
        description: draft.description,
        descriptionSource: 'property' as const,
        status: 'To Do',
        isDone: NEW_ITERATION_TASK_DONE,
        stage: stageForNewMilestoneTask(milestone.status),
        publishToWarehaus: false,
        source: PORTAL_MILESTONE_TASK_SOURCE,
        origin: 'review',
        round,
        kind: 'design',
        milestoneId: milestone._id,
        milestoneOrder: order,
        updatedAt: at,
      }),
    );
    order += 1;
  }
  await ctx.db.insert('milestoneNotes', {
    orgId: milestone.orgId,
    milestoneId: milestone._id,
    body: `Design changes requested by ${input.actor}: ${input.notes.trim()}`,
    addedBy: input.actor,
    createdAt: at,
  });
  await logMilestone(
    ctx,
    milestone,
    'milestone.design_changes_requested',
    at,
    `Design changes requested · ${created.length === 1 ? '1 design task' : `${created.length} design tasks`} added`,
  );
  await syncDesignAsk(ctx, milestone, { addedBy: input.actor, at });
  return { ok: true, taskIds: created };
}

export const requestDesignChanges = adminMutation({
  args: {
    milestoneId: v.id('milestones'),
    notes: v.string(),
    /** Design tasks the changes revise. */
    taskIds: v.optional(v.array(v.id('tasks'))),
    /** One design task per line. Without them the notes become one task. */
    newTasks: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    if (ctx.identity.role !== 'Warehaus Staff' || !isPeterEmail(ctx.identity.email)) fail(ONLY_PETER_DESIGN_CHANGES);
    const result = await applyDesignChanges(ctx, {
      milestoneId: args.milestoneId,
      notes: args.notes,
      taskIds: args.taskIds ?? [],
      newTasks: args.newTasks,
      actor: 'Peter',
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
    /** One task per line. When present they replace the split of the notes into tasks. */
    newTasks: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const contactId = ctx.identity.contactId as Id<'contacts'>;
    const result = await applyMilestoneReview(ctx, {
      milestoneId: args.milestoneId,
      iteration: args.iteration,
      decision: 'request_changes',
      notes: args.notes,
      taskIds: args.taskIds ?? [],
      newTasks: args.newTasks,
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
    // The local build has its own field. previewUrl is the Vercel link.
    const localPreviewUrl = normalizeLocalPreviewUrl(`http://${previewUrl}`);
    if (!localPreviewUrl) fail('Preview must be a localhost:3100 link');
    const next = {
      localPreviewUrl,
      previewPrNumber: args.prNumber,
      previewPrTitle: args.prTitle.trim(),
      previewBranch: args.branch.trim(),
      previewCommit: args.commit.trim(),
      previewBuiltAt: args.builtAt ?? Date.now(),
      designCheck: args.designCheck ?? 'pending',
      designCheckNote: args.designCheckNote?.trim() || undefined,
    };
    const clearBuild = previewStatusPatch(milestone, { build: 'ready' });
    const unchanged =
      milestone.localPreviewUrl === next.localPreviewUrl &&
      milestone.previewPrNumber === next.previewPrNumber &&
      milestone.previewPrTitle === next.previewPrTitle &&
      milestone.previewBranch === next.previewBranch &&
      milestone.previewCommit === next.previewCommit &&
      milestone.designCheck === next.designCheck &&
      (milestone.designCheckNote ?? undefined) === next.designCheckNote &&
      clearBuild == null;
    if (!unchanged) await ctx.db.patch(milestone._id, { ...next, ...clearBuild });
    const iteration = currentIteration(milestone.iteration);
    return {
      ok: true as const,
      wrote: !unchanged,
      chat: reviewChatLine({ prNumber: args.prNumber, iteration, previewUrl }),
    };
  },
});

/** Records a preview build or preview-delete phase. Does not call GitHub or Vercel. */
export const recordPreviewStatus = adminMutation({
  args: {
    milestoneId: v.id('milestones'),
    build: v.optional(v.union(v.literal('building'), v.literal('failed'), v.literal('ready'))),
    buildAttempt: v.optional(v.number()),
    buildAt: v.optional(v.number()),
    deleteStatus: v.optional(v.union(v.literal('removing'), v.literal('failed'), v.literal('removed'))),
    deleteAttempt: v.optional(v.number()),
    deleteAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const milestone = await loadMilestone(ctx, args.milestoneId);
    const patch = previewStatusPatch(milestone, {
      build: args.build,
      buildAttempt: args.buildAttempt,
      buildAt: args.buildAt,
      deleteStatus: args.deleteStatus,
      deleteAttempt: args.deleteAttempt,
      deleteAt: args.deleteAt,
    });
    if (!patch) return { ok: true as const, wrote: false };
    await ctx.db.patch(milestone._id, patch);
    return { ok: true as const, wrote: true };
  },
});

function previewRecord(milestone: Doc<'milestones'>): ReviewPreviewRecord {
  const deleteStatus = milestone.previewDelete ?? null;
  let state: ReviewPreviewState | null = null;
  if (deleteStatus === 'removed') state = 'removed';
  else if (milestone.previewBuild === 'building' || milestone.previewBuild === 'failed') state = milestone.previewBuild;
  else if (milestone.previewUrl) state = 'ready';
  return {
    state,
    url: milestone.previewUrl || null,
    sha: milestone.previewCommit ?? null,
    deploymentId: milestone.previewDeploymentId ?? null,
    prNumber: milestone.previewPrNumber ?? null,
    iteration: currentIteration(milestone.iteration),
    branch: milestone.previewBranch ?? null,
    builtAt: milestone.previewBuiltAt ?? null,
    deleteState: deleteStatus === 'removing' || deleteStatus === 'failed' ? deleteStatus : null,
    deleteAttempts: milestone.previewDeleteAttempt ?? null,
    deleteFailedAt: milestone.previewDeleteAt ?? null,
  };
}

const previewStateArg = v.union(v.literal('building'), v.literal('ready'), v.literal('failed'), v.literal('removed'));
const previewOutcomeArg = v.union(
  v.literal('deleted'),
  v.literal('already-gone'),
  v.literal('failed'),
  v.literal('unconfigured'),
);

export const setReviewPreview = internalMutation({
  args: {
    milestoneId: v.id('milestones'),
    state: previewStateArg,
    url: v.optional(v.string()),
    sha: v.optional(v.string()),
    deploymentId: v.optional(v.string()),
    prNumber: v.optional(v.number()),
    iteration: v.optional(v.number()),
    branch: v.optional(v.string()),
    builtAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const milestone = await ctx.db.get(args.milestoneId);
    if (!milestone) return { ok: false as const, reason: 'Milestone not found' };
    const result = reviewPreviewSetPatch({
      current: previewRecord(milestone),
      next: {
        state: args.state,
        url: args.url ?? null,
        sha: args.sha ?? null,
        deploymentId: args.deploymentId ?? null,
        prNumber: args.prNumber ?? null,
        iteration: args.iteration ?? null,
        branch: args.branch ?? null,
        builtAt: args.builtAt ?? null,
      },
    });
    if (!result.ok) return result;
    if (!result.patch) return { ok: true as const, changed: false, previousDeploymentId: null };
    const ready = args.state === 'ready' ? previewStatusPatch(milestone, { build: 'ready' }) : null;
    await ctx.db.patch(args.milestoneId, {
      ...result.patch,
      ...(result.clearUrl ? { previewUrl: '' } : {}),
      ...(result.clearDeploymentId ? { previewDeploymentId: undefined } : {}),
      ...(ready ?? {}),
    });
    if (result.chat) {
      await ctx.db.insert('activity', {
        orgId: milestone.orgId,
        projectId: milestone.projectId,
        milestoneId: milestone._id,
        name: milestone.name,
        summary: result.chat,
        type: PREVIEW_READY_ACTIVITY,
        tone: 'accent',
        timestamp: Date.now(),
      });
    }
    return { ok: true as const, changed: true, previousDeploymentId: result.previousDeploymentId };
  },
});

async function applyPreviewOutcome(
  ctx: MutationCtx,
  milestone: Doc<'milestones'>,
  outcome: 'deleted' | 'already-gone' | 'failed' | 'unconfigured',
  sha?: string,
  scheduledAttempt?: number,
): Promise<boolean> {
  const record = previewRecord(milestone);
  if (!record.sha && sha) record.sha = sha;
  if (
    (outcome === 'failed' || outcome === 'unconfigured') &&
    scheduledAttempt != null &&
    (record.deleteAttempts ?? 0) > scheduledAttempt
  ) {
    return false;
  }
  const activity = previewDeletedActivity({
    orgId: milestone.orgId,
    projectId: milestone.projectId,
    milestoneId: milestone._id,
    name: milestone.name,
    sha: record.sha ?? milestone.previewCommit ?? null,
    outcome,
    timestamp: Date.now(),
  });
  const writeActivity = async () => {
    await ctx.db.insert('activity', {
      orgId: milestone.orgId,
      projectId: milestone.projectId,
      milestoneId: milestone._id,
      name: milestone.name,
      summary: activity.summary,
      type: activity.type,
      tone: activity.tone,
      timestamp: activity.timestamp,
    });
  };
  if (outcome === 'failed' || outcome === 'unconfigured') {
    if (!record.deploymentId && !record.url && record.state !== 'ready' && record.state !== 'building' && !record.deleteState) {
      return false;
    }
    const plan = previewDeleteAfterFailure({
      attempts: (record.deleteAttempts ?? 0) + 1,
      now: Date.now(),
      terminal: outcome === 'unconfigured',
    });
    if (record.deleteState === plan.state && record.deleteAttempts === plan.attempts && record.deleteFailedAt === plan.failedAt) {
      return false;
    }
    await ctx.db.patch(milestone._id, {
      previewDelete: plan.state,
      previewDeleteAttempt: plan.attempts,
      previewDeleteAt: plan.failedAt,
    });
    if (plan.delayMs != null && record.deploymentId) {
      await ctx.scheduler.runAfter(plan.delayMs, internal.milestones.deleteReviewPreview, {
        milestoneId: milestone._id,
        deploymentId: record.deploymentId,
        sha: record.sha ?? '',
        scheduledAttempt: plan.attempts,
      });
    }
    await writeActivity();
    return true;
  }
  if (milestone.approval === 'approved') {
    const removal = removalAfterDelete({ outcome, record, removedAt: Date.now() });
    if (!removal.patch) return false;
    await ctx.db.patch(milestone._id, removal.patch);
    await writeActivity();
    return true;
  }
  if (!record.state && !record.url && !record.deploymentId && record.prNumber == null && !record.deleteState) return false;
  await ctx.db.patch(milestone._id, {
    previewUrl: '',
    previewCommit: undefined,
    previewDeploymentId: undefined,
    previewPrNumber: undefined,
    previewBranch: undefined,
    previewBuiltAt: undefined,
    previewBuild: undefined,
    previewBuildAttempt: undefined,
    previewBuildAt: undefined,
    previewDelete: undefined,
    previewDeleteAttempt: undefined,
    previewDeleteAt: undefined,
  });
  await writeActivity();
  return true;
}

export const finishPreviewDelete = internalMutation({
  args: {
    milestoneId: v.id('milestones'),
    outcome: previewOutcomeArg,
    sha: v.string(),
    scheduledAttempt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const milestone = await ctx.db.get(args.milestoneId);
    if (!milestone) return { ok: false as const, reason: 'Milestone not found' };
    const wrote = await applyPreviewOutcome(ctx, milestone, args.outcome, args.sha, args.scheduledAttempt);
    return { ok: true as const, wrote };
  },
});

export const applyPreviewClose = internalMutation({
  args: { prNumber: v.number(), outcome: previewOutcomeArg },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query('milestones')
      .withIndex('by_previewPrNumber', (q) => q.eq('previewPrNumber', args.prNumber))
      .collect();
    let writes = 0;
    for (const milestone of rows) {
      if (milestone.previewPrNumber !== args.prNumber) continue;
      if (await applyPreviewOutcome(ctx, milestone, args.outcome)) writes += 1;
    }
    return { ok: true as const, writes };
  },
});

/**
 * Staff attach a Vercel preview link on production without running the preview worker.
 * Clients cannot call this. A repeat of the stored link writes nothing.
 */
export const attachPreviewLink = adminMutation({
  args: { milestoneId: v.id('milestones'), url: v.string() },
  handler: async (ctx, args) => {
    const milestone = await loadMilestone(ctx, args.milestoneId);
    const planned = planAttachPreviewLink({
      url: args.url,
      contactId: ctx.identity.contactId,
      now: Date.now(),
      current: {
        previewUrl: milestone.previewUrl,
        previewAttachedBy: milestone.previewAttachedBy,
        previewAttachedAt: milestone.previewAttachedAt,
        previewBuild: milestone.previewBuild,
        previewBuildAttempt: milestone.previewBuildAttempt,
        previewBuildAt: milestone.previewBuildAt,
      },
    });
    if (!planned.ok) return planned;
    if (!planned.wrote) return { ok: true as const, wrote: false as const };
    await ctx.db.patch(milestone._id, {
      ...planned.patch,
      previewAttachedBy: ctx.identity.contactId as Id<'contacts'>,
    });
    return { ok: true as const, wrote: true as const, previewUrl: planned.patch.previewUrl };
  },
});

/** Staff clear the attached link. A milestone with no link writes nothing. */
export const clearPreviewLink = adminMutation({
  args: { milestoneId: v.id('milestones') },
  handler: async (ctx, args) => {
    const milestone = await loadMilestone(ctx, args.milestoneId);
    const planned = planClearPreviewLink({
      previewUrl: milestone.previewUrl,
      previewAttachedBy: milestone.previewAttachedBy,
      previewAttachedAt: milestone.previewAttachedAt,
      previewBuild: milestone.previewBuild,
      previewBuildAttempt: milestone.previewBuildAttempt,
      previewBuildAt: milestone.previewBuildAt,
    });
    if (!planned.wrote) return { ok: true as const, wrote: false as const };
    await ctx.db.patch(milestone._id, planned.patch);
    return { ok: true as const, wrote: true as const };
  },
});

export const deleteReviewPreview = internalAction({
  args: {
    milestoneId: v.id('milestones'),
    deploymentId: v.string(),
    sha: v.string(),
    scheduledAttempt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const cloud = assertReviewConvexUrl(process.env.CONVEX_CLOUD_URL);
    if (!cloud.ok) return { ok: false as const, reason: cloud.reason };
    const result = await deleteVercelDeployment({
      token: process.env.VERCEL_TOKEN,
      teamId: VERCEL_TEAM_ID,
      deploymentId: args.deploymentId,
    });
    await ctx.runMutation(internal.milestones.finishPreviewDelete, {
      milestoneId: args.milestoneId,
      outcome: result.status,
      sha: args.sha,
      scheduledAttempt: args.scheduledAttempt,
    });
    return { ok: result.status === 'deleted' || result.status === 'already-gone', status: result.status };
  },
});

export const dispatchReviewPreview = internalAction({
  args: { prNumber: v.number(), milestoneId: v.id('milestones') },
  handler: async (ctx, args) => {
    const cloud = assertReviewConvexUrl(process.env.CONVEX_CLOUD_URL);
    if (!cloud.ok) return { ok: false as const, reason: cloud.reason };
    const token = process.env.REVIEW_PREVIEW_GITHUB_TOKEN?.trim();
    if (!token) return { ok: false as const, reason: RETRY_WAITS_ON_TOKENS };
    const response = await fetch(
      'https://api.github.com/repos/warehauscollective/warehaus/actions/workflows/portal-review-preview.yml/dispatches',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ref: 'main',
          inputs: { pr_number: String(args.prNumber), milestone_id: args.milestoneId },
        }),
      },
    );
    if (response.status === 204) return { ok: true as const };
    await ctx.runMutation(internal.milestones.setReviewPreview, {
      milestoneId: args.milestoneId,
      state: 'failed',
      prNumber: args.prNumber,
    });
    return { ok: false as const, reason: 'Retry did not start' };
  },
});

/**
 * Retry a failed preview build or a failed preview delete.
 * Peter cannot retry. Missing tokens write nothing.
 * A failed delete calls the Vercel DELETE again. A failed build dispatches the workflow.
 */
export const retryReviewPreview = adminMutation({
  args: { milestoneId: v.id('milestones') },
  handler: async (ctx, args) => {
    const actor = retryActorAllowed(ctx.identity.email);
    if (!actor.ok) return actor;
    if (!reviewRetryLiveOnClient(process.env.CONVEX_CLOUD_URL)) {
      return { ok: false as const, reason: RETRY_WAITS_ON_TOKENS };
    }
    const milestone = await loadMilestone(ctx, args.milestoneId);
    const record = previewRecord(milestone);
    if (!process.env.VERCEL_TOKEN?.trim()) return { ok: false as const, reason: RETRY_WAITS_ON_TOKENS };
    if (record.deleteState === 'failed' && record.deploymentId) {
      await ctx.db.patch(milestone._id, { previewDelete: 'removing' });
      await ctx.scheduler.runAfter(0, internal.milestones.deleteReviewPreview, {
        milestoneId: milestone._id,
        deploymentId: record.deploymentId,
        sha: record.sha ?? '',
        scheduledAttempt: record.deleteAttempts ?? 0,
      });
      return { ok: true as const, changed: true };
    }
    const next = retryPreviewPatch(record);
    if (!next.patch) return { ok: true as const, changed: false };
    if (!milestone.previewPrNumber) return { ok: false as const, reason: 'Pull request number is missing' };
    if (!process.env.REVIEW_PREVIEW_GITHUB_TOKEN?.trim()) return { ok: false as const, reason: RETRY_WAITS_ON_TOKENS };
    await ctx.db.patch(milestone._id, next.patch);
    await ctx.scheduler.runAfter(0, internal.milestones.dispatchReviewPreview, {
      milestoneId: milestone._id,
      prNumber: milestone.previewPrNumber,
    });
    return { ok: true as const, changed: true };
  },
});

/**
 * Stores the local preview link for a milestone, found by id or by branch.
 * Called by the runner or `preview:pr` through the review-preview route.
 * The same link again writes nothing.
 */
export const setLocalPreview = internalMutation({
  args: {
    milestoneId: v.optional(v.id('milestones')),
    branch: v.optional(v.string()),
    url: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const branch = args.branch?.trim() ?? '';
    const milestone = args.milestoneId
      ? await ctx.db.get(args.milestoneId)
      : branch
        ? await ctx.db
            .query('milestones')
            .withIndex('by_branch', (q) => q.eq('branch', branch))
            .first()
        : null;
    if (!milestone) return { ok: false as const, reason: 'Milestone not found' };
    const decision = tileLinkChangeDecision({
      field: 'localPreview',
      from: milestone.localPreviewUrl ?? null,
      to: args.url,
    });
    if (!decision.ok) return { ok: false as const, reason: decision.reason };
    if (!decision.wrote) return { ok: true as const, changed: false };
    await ctx.db.patch(milestone._id, { localPreviewUrl: decision.url ?? undefined });
    return { ok: true as const, changed: true };
  },
});

export const reviewPreviewHttp = httpAction(async (ctx, request) => {
  const cloud = assertReviewConvexUrl(process.env.CONVEX_CLOUD_URL);
  if (!cloud.ok) return new Response('Review previews run on shared dev only', { status: 403 });
  const auth = authorizeReviewPreview({
    configuredSecret: process.env.REVIEW_PREVIEW_SECRET,
    authorizationHeader: request.headers.get('authorization'),
  });
  if (auth === 'unconfigured') return new Response('Review preview is not configured', { status: 503 });
  if (auth === 'unauthorized') return new Response('Unauthorized', { status: 401 });
  let body: {
    op?: string;
    milestoneId?: Id<'milestones'>;
    state?: ReviewPreviewState;
    url?: string;
    sha?: string;
    deploymentId?: string;
    prNumber?: number;
    iteration?: number;
    branch?: string;
    builtAt?: number;
    outcome?: 'deleted' | 'already-gone' | 'failed' | 'unconfigured';
  };
  let local: { op?: string; milestoneId?: Id<'milestones'>; branch?: string; url?: string | null };
  try {
    body = (await request.json()) as typeof body;
    local = body as typeof local;
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }
  if (local.op === 'local') {
    if (!local.milestoneId && !local.branch) return new Response('Milestone id or branch is missing', { status: 400 });
    const result = await ctx.runMutation(internal.milestones.setLocalPreview, {
      ...(local.milestoneId ? { milestoneId: local.milestoneId } : {}),
      ...(local.branch ? { branch: local.branch } : {}),
      url: typeof local.url === 'string' ? local.url : null,
    });
    return Response.json(result, { status: result.ok ? 200 : 400 });
  }
  if (body.op === 'close') {
    if (!body.prNumber || body.prNumber < 1) return new Response('Pull request number is missing', { status: 400 });
    const result = await ctx.runMutation(internal.milestones.applyPreviewClose, {
      prNumber: body.prNumber,
      outcome: body.outcome ?? 'deleted',
    });
    return Response.json(result);
  }
  if (!body.milestoneId || !body.state) return new Response('Preview payload is incomplete', { status: 400 });
  const result = await ctx.runMutation(internal.milestones.setReviewPreview, {
    milestoneId: body.milestoneId,
    state: body.state,
    url: body.url,
    sha: body.sha,
    deploymentId: body.deploymentId,
    prNumber: body.prNumber,
    iteration: body.iteration,
    branch: body.branch,
    builtAt: body.builtAt,
  });
  return Response.json(result, { status: result.ok ? 200 : 400 });
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
    newTasks: v.optional(v.array(v.string())),
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
    fail(clientReviewDecision().reason);
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

// Tasks that live on a milestone. Rules are in _lib/milestoneTasks.ts.

async function tasksOnMilestone(ctx: QueryCtx | MutationCtx, milestone: Doc<'milestones'>) {
  const loaded = await loadLinkedTasks(ctx, milestone);
  if (!loaded.ok) fail(loaded.reason);
  return loaded.rows;
}

const TASK_CHOICE_TAKE = 100;

/** Milestones on one project that can take a new task. One indexed read, capped. */
export const taskChoices = adminQuery({
  args: { projectId: v.id('projects') },
  handler: async (ctx, { projectId }) => {
    const project = await ctx.db.get(projectId);
    if (!project) return [];
    const rows = await ctx.db
      .query('milestones')
      .withIndex('by_orgId_projectId', (q) => q.eq('orgId', project.orgId).eq('projectId', project._id))
      .take(TASK_CHOICE_TAKE);
    return rows
      .filter((row) => row.orgId === project.orgId && row.projectId === project._id && row.status !== 'Shipped')
      .filter((row) => row.archivedAt == null)
      .map((row) => ({ id: row._id, name: row.name, status: row.status }));
  },
});

/**
 * Staff add a task inside a milestone. The task is stored here only: it has
 * no Notion page and the outbox is not used. A Shipped milestone takes none.
 */
export const addTask = adminMutation({
  args: { milestoneId: v.id('milestones'), title: v.string(), detail: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const milestone = await loadMilestone(ctx, args.milestoneId);
    const decision = addTaskDecision({
      staff: true,
      milestoneStatus: milestone.status,
      title: args.title,
      detail: args.detail,
    });
    if (!decision.ok) fail(decision.reason);
    const siblings = await tasksOnMilestone(ctx, milestone);
    const at = Date.now();
    const key = `${PORTAL_MILESTONE_TASK_SOURCE}:${milestone._id}:${at}:${siblings.length}`;
    const taskId = await ctx.db.insert('tasks', {
      orgId: milestone.orgId,
      projectId: milestone.projectId,
      notionPageId: key,
      externalId: key,
      lastSyncedAt: at,
      name: decision.title,
      ...(decision.detail ? { description: decision.detail, descriptionSource: 'property' as const } : {}),
      status: 'To Do',
      isDone: NEW_ITERATION_TASK_DONE,
      stage: decision.stage,
      publishToWarehaus: false,
      source: PORTAL_MILESTONE_TASK_SOURCE,
      origin: decision.origin,
      milestoneId: milestone._id,
      milestoneOrder: nextMilestoneOrder(siblings.map((row) => row.milestoneOrder)),
      updatedAt: at,
    });
    return { ok: true as const, taskId };
  },
});

/** Title and detail of a task the portal owns, while it is still To do. */
export const editTask = adminMutation({
  args: {
    milestoneId: v.id('milestones'),
    taskId: v.id('tasks'),
    title: v.string(),
    detail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const milestone = await loadMilestone(ctx, args.milestoneId);
    const task = await ctx.db.get(args.taskId);
    if (!task || task.orgId !== milestone.orgId) fail('Task not found');
    const decision = editTaskDecision({
      staff: true,
      milestoneId: milestone._id,
      task,
      title: args.title,
      detail: args.detail,
    });
    if (!decision.ok) fail(decision.reason);
    if (!decision.wrote) return { ok: true as const, wrote: false };
    await ctx.db.patch(task._id, {
      ...decision.patch,
      ...(decision.patch.description !== undefined ? { descriptionSource: 'property' as const } : {}),
      ...(task.origin === 'planner' ? { origin: 'manual' as const } : {}),
      updatedAt: Date.now(),
    });
    return { ok: true as const, wrote: true };
  },
});

/** Deletes a task the portal owns, while it is still To do. A Notion task is detached instead. */
export const removeTask = adminMutation({
  args: { milestoneId: v.id('milestones'), taskId: v.id('tasks') },
  handler: async (ctx, args) => {
    const milestone = await loadMilestone(ctx, args.milestoneId);
    const task = await ctx.db.get(args.taskId);
    if (!task || task.orgId !== milestone.orgId) fail('Task not found');
    const decision = removeTaskDecision({ staff: true, milestoneId: milestone._id, task });
    if (!decision.ok) fail(decision.reason);
    await ctx.db.delete(task._id);
    return { ok: true as const };
  },
});

/** New top-to-bottom order for the milestone's tasks. Only rows that move are written. */
export const reorderTasks = adminMutation({
  args: { milestoneId: v.id('milestones'), taskIds: v.array(v.id('tasks')) },
  handler: async (ctx, args) => {
    const milestone = await loadMilestone(ctx, args.milestoneId);
    const current = await tasksOnMilestone(ctx, milestone);
    const decision = reorderDecision({
      staff: true,
      milestoneStatus: milestone.status,
      current: current.map((row) => ({ id: row._id, milestoneOrder: row.milestoneOrder })),
      taskIds: args.taskIds,
    });
    if (!decision.ok) fail(decision.reason);
    for (const write of decision.writes) {
      await ctx.db.patch(write.id as Id<'tasks'>, { milestoneOrder: write.milestoneOrder });
    }
    return { ok: true as const, wrote: decision.writes.length };
  },
});

// Mark complete, Archive, Restore and Undo. Rules are in _lib/closeout.ts.

const leftoversArg = v.union(v.literal('done'), v.literal('archive'), v.literal('park'));
const archiveTasksArg = v.union(v.literal('archive'), v.literal('detach'));

/** The project's Parked for later milestone, if it has one. One indexed read, capped. Never created here. */
async function parkedMilestoneFor(ctx: MutationCtx, milestone: Doc<'milestones'>): Promise<Doc<'milestones'> | null> {
  const rows = await ctx.db
    .query('milestones')
    .withIndex('by_orgId_projectId', (q) => q.eq('orgId', milestone.orgId).eq('projectId', milestone.projectId))
    .take(TASK_CHOICE_TAKE);
  const target = parkedMilestoneTarget(
    rows
      .filter((row) => row.orgId === milestone.orgId && row.projectId === milestone.projectId)
      .map((row) => ({ id: row._id as string, name: row.name, status: row.status, archived: row.archivedAt != null })),
    milestone._id,
  );
  return target ? (rows.find((row) => row._id === target.id) ?? null) : null;
}

async function applyCloseoutWrites(
  ctx: MutationCtx,
  writes: readonly CloseoutWrite[],
  tasks: readonly Doc<'tasks'>[],
  input: { at: number; actorId: string | undefined; parked: Doc<'milestones'> | null },
  log: SnapshotLog,
) {
  const byId = new Map(tasks.map((task) => [task._id as string, task]));
  const moving: Doc<'tasks'>[] = [];
  for (const write of writes) {
    const task = byId.get(write.id);
    if (!task) continue;
    if (write.kind === 'done') await writeTaskStatus(ctx, task, 'Done', input.actorId, log);
    else if (write.kind === 'archive') await archiveTaskTree(ctx, task, input.at, input.actorId, log);
    else if (write.kind === 'park') await parkTask(ctx, task, log, input.actorId);
    else if (write.kind === 'detach') await detachTaskFromMilestone(ctx, task, log);
    else moving.push(task);
  }
  if (moving.length > 0 && input.parked) await moveTasksToMilestone(ctx, moving, input.parked, log);
}

/**
 * Mark complete. Sets Shipped even when nothing merged. A milestone with no
 * open task needs no choice, and that includes one with no tasks at all.
 * Open tasks need `leftovers`, the only way past the close gate:
 * `done` sets them Done, `archive` archives them with their subtasks, and
 * `park` moves them to this project's "Parked for later" milestone, keeping
 * each task's status. With no such milestone they are set Parked in place.
 * Returns each task as it was, for Undo.
 */
export const markComplete = adminMutation({
  args: {
    milestoneId: v.id('milestones'),
    expectedStatus: statusArg,
    leftovers: v.optional(leftoversArg),
  },
  handler: async (ctx, args) => {
    const milestone = await loadMilestone(ctx, args.milestoneId);
    if (milestone.archivedAt != null) fail(MILESTONE_ARCHIVED);
    if (milestone.status === 'Shipped') {
      return { ok: true as const, wrote: false, status: milestone.status, previous: milestone.status, leftovers: null, tasks: [] };
    }
    // Before any leftover write, so a stale screen never moves a task.
    if (args.expectedStatus !== milestone.status) fail(STATUS_STALE);
    const loaded = await loadMilestoneTaskSet(ctx, milestone);
    if (!loaded.ok) fail(loaded.reason);
    const parked = args.leftovers === 'park' ? await parkedMilestoneFor(ctx, milestone) : null;
    const plan = planMarkComplete({
      milestoneId: milestone._id,
      tasks: loaded.docs.map(loadedTask),
      leftovers: args.leftovers,
      parkedMilestoneId: parked?._id ?? null,
    });
    if (!plan.ok) fail(plan.reason);
    const at = Date.now();
    const log = new SnapshotLog();
    await applyCloseoutWrites(ctx, plan.writes, loaded.docs, { at, actorId: ctx.identity.contactId, parked }, log);
    // The gate reads the tasks after the leftovers are handled. A refusal throws, so the writes above roll back.
    const moved = await changeMilestoneStatus(ctx, milestone, {
      cause: 'complete',
      expected: args.expectedStatus,
      actorName: ctx.identity.name,
      at,
    });
    if (!moved.ok) fail(moved.reason);
    return {
      ok: true as const,
      wrote: moved.wrote,
      status: moved.status,
      previous: moved.from,
      leftovers: plan.outcome,
      tasks: log.list(),
    };
  },
});

/**
 * Archive a milestone. It leaves lists, the board, the runner and the client
 * view, and is not deleted. Open tasks are archived with it (the same write
 * and Notion page archive as `tasks.archiveTask`), or moved to No milestone.
 * Tasks archived here carry the milestone's `archivedAt`, so Restore can
 * bring exactly those back.
 */
export const archive = adminMutation({
  args: { milestoneId: v.id('milestones'), openTasks: archiveTasksArg },
  handler: async (ctx, args) => {
    const milestone = await loadMilestone(ctx, args.milestoneId);
    if (milestone.archivedAt != null) {
      return { ok: true as const, wrote: false, archivedAt: milestone.archivedAt, tasks: [] };
    }
    const loaded = await loadMilestoneTaskSet(ctx, milestone);
    if (!loaded.ok) fail(loaded.reason);
    const plan = planArchiveMilestone({
      milestoneId: milestone._id,
      tasks: loaded.docs.map(loadedTask),
      openTasks: args.openTasks,
    });
    const at = Date.now();
    const log = new SnapshotLog();
    await applyCloseoutWrites(ctx, plan.writes, loaded.docs, { at, actorId: ctx.identity.contactId, parked: null }, log);
    await ctx.db.patch(milestone._id, {
      archivedAt: at,
      // A queued plan is not handed to the runner once the milestone is archived.
      ...(milestone.planning === 'queued' ? { planning: undefined, planningReplace: undefined } : {}),
    });
    return { ok: true as const, wrote: true, archivedAt: at, tasks: log.list() };
  },
});

/**
 * Restore. An archived milestone comes back with the tasks that were archived
 * with it. A completed milestone reopens as Ready to Ship: one step back, and
 * not a status the runner picks up. Anything else writes nothing.
 */
export const restore = adminMutation({
  args: { milestoneId: v.id('milestones') },
  handler: async (ctx, args) => {
    const milestone = await loadMilestone(ctx, args.milestoneId);
    if (milestone.archivedAt != null) {
      const loaded = await loadMilestoneTaskSet(ctx, milestone);
      if (!loaded.ok) fail(loaded.reason);
      const log = new SnapshotLog();
      for (const task of loaded.docs) {
        if (task.archivedAt !== milestone.archivedAt) continue;
        log.note(task);
        await ctx.db.patch(task._id, { archivedAt: undefined });
      }
      await ctx.db.patch(milestone._id, { archivedAt: undefined });
      return {
        ok: true as const,
        wrote: true,
        restored: 'archived' as const,
        status: milestone.status,
        previous: milestone.status,
        archivedAt: milestone.archivedAt,
        tasks: log.list(),
      };
    }
    if (milestone.status !== 'Shipped') {
      return {
        ok: true as const,
        wrote: false,
        restored: null,
        status: milestone.status,
        previous: milestone.status,
        archivedAt: null,
        tasks: [],
      };
    }
    // From Shipped back to Ready to Ship is a reopen: no approval note.
    const moved = await changeMilestoneStatus(ctx, milestone, {
      cause: 'set',
      to: RESTORED_MILESTONE_STATUS,
      actorName: ctx.identity.name,
      at: Date.now(),
    });
    if (!moved.ok) fail(moved.reason);
    return {
      ok: true as const,
      wrote: moved.wrote,
      restored: 'completed' as const,
      status: moved.status,
      previous: moved.from,
      archivedAt: null,
      tasks: [],
    };
  },
});

/**
 * Undo for Mark complete, Archive and Restore. The inverse write: the
 * milestone's previous status and archive time, and each task's previous
 * status, stage, milestone and archive time. Sent back as the first mutation
 * returned them.
 */
export const undoCloseout = adminMutation({
  args: {
    milestoneId: v.id('milestones'),
    /** The status before the change. Omit when the status did not change. */
    status: v.optional(statusArg),
    /** The archive time before the change. Null means not archived. Omit to leave it. */
    archivedAt: v.optional(v.union(v.number(), v.null())),
    tasks: v.array(taskSnapshotArg),
  },
  handler: async (ctx, args) => {
    const milestone = await loadMilestone(ctx, args.milestoneId);
    if (args.tasks.length > UNDO_TASK_CAP) fail('Too many tasks to undo at once.');
    const tasks = await restoreTaskSnapshots(ctx, milestone.orgId, args.tasks, ctx.identity.contactId);
    let wrote = tasks > 0;
    if (args.archivedAt !== undefined && (milestone.archivedAt ?? null) !== args.archivedAt) {
      await ctx.db.patch(milestone._id, { archivedAt: args.archivedAt ?? undefined });
      wrote = true;
    }
    if (args.status != null && args.status !== milestone.status) {
      // Back to Shipped undoes a Restore. It passes the same gate as Mark complete: no open task.
      const moved = await changeMilestoneStatus(ctx, milestone, {
        cause: args.status === 'Shipped' ? 'complete' : 'set',
        to: args.status,
        actorName: ctx.identity.name,
        at: Date.now(),
      });
      if (!moved.ok) fail(statusRefusal(moved));
      if (moved.wrote) wrote = true;
    }
    return { ok: true as const, wrote, tasks };
  },
});

const ORIGIN_BACKFILL_PAGE = 200;

/**
 * One page of the origin backfill. Marks tasks a change request made as
 * origin review. `dryRun` counts and writes nothing. Run until `isDone`.
 */
export const backfillTaskOrigins = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())), dryRun: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query('tasks')
      .paginate({ cursor: args.cursor ?? null, numItems: ORIGIN_BACKFILL_PAGE });
    let matched = 0;
    for (const task of page.page) {
      if (task.origin) continue;
      const origin = taskOrigin({ source: task.source });
      if (!origin) continue;
      matched += 1;
      if (!args.dryRun) await ctx.db.patch(task._id, { origin });
    }
    return {
      scanned: page.page.length,
      matched,
      wrote: args.dryRun ? 0 : matched,
      cursor: page.isDone ? null : page.continueCursor,
      isDone: page.isDone,
    };
  },
});

/** Staff set a milestone task's kind, Design or Build, from the task modal. */
export const setTaskKind = adminMutation({
  args: { taskId: v.id('tasks'), kind: v.union(v.literal('design'), v.literal('build')) },
  handler: async (ctx, args) => {
    if (ctx.identity.role !== 'Warehaus Staff') fail('Only staff can change a task kind');
    const task = await ctx.db.get(args.taskId);
    if (!task || task.archivedAt != null) fail('Task not found');
    if (!task.milestoneId) fail(TASK_KIND_NEEDS_MILESTONE);
    const result = await writeTaskKind(ctx, task, args.kind, { addedBy: ctx.identity.email, at: Date.now() });
    return { ok: true as const, wrote: result.wrote };
  },
});
