/**
 * Milestone rules. Portal-only. A milestone is one objective on one project.
 * Approval is a human decision in the portal. AI cannot set it.
 * Approval does not close, delete, or rewrite tasks.
 */

import type { BuildRunFacts } from './buildRun';
import { clientMaySeeProject } from '@warehaus/portal-sync';
import {
  DEFAULT_MILESTONE_STATUS,
  SHIPPED_ON_MERGE,
  UNKNOWN_STATUS,
  isMilestoneStatus,
  type MilestoneStatus,
} from './milestoneStatus';
import type { BuildingPhase, TaskKind } from './designGate';
import type { MilestoneCreatedVia, TaskOrigin } from './milestoneTasks';
import { classifyMilestoneTasks, roadmapCounts, taskSetGroups } from './milestoneTaskSet';

export const MILESTONE_APPROVALS = ['unreviewed', 'approved', 'changes_requested'] as const;

export const MILESTONE_ACTIVITY = {
  ready: 'milestone.ready',
  approved: 'milestone.approved',
  designApproved: 'milestone.design_approved',
  designChangesRequested: 'milestone.design_changes_requested',
  changesRequested: 'milestone.changes_requested',
  status: 'milestone.status',
  publish: 'milestone.publish',
  project: 'milestone.project',
} as const;

export type MilestoneApproval = (typeof MILESTONE_APPROVALS)[number];
export type MilestoneActor = 'human' | 'ai';
export type MilestoneActivityType = (typeof MILESTONE_ACTIVITY)[keyof typeof MILESTONE_ACTIVITY];

export const AI_CANNOT_DECIDE = 'AI cannot set milestone approval';
export const AI_LOCKED = 'AI cannot edit an approved milestone or change its tasks';
export const HUMAN_CONTENT_LOCKED =
  'Approved milestones stay as accepted until a human requests changes';
export const AI_CANNOT_PUBLISH = 'AI cannot publish a milestone';
/** The objective is the short brief on the card. A note can be longer. */
export const MILESTONE_OBJECTIVE_LIMIT = 2000;
export const OBJECTIVE_TOO_LONG = `Objective must be ${MILESTONE_OBJECTIVE_LIMIT} characters or fewer`;

export type MilestoneProjectGate = {
  name?: string | null;
  types?: readonly string[] | null;
  publishToWarehaus: boolean;
  archive: boolean;
  hidden: boolean;
  orgVisible: boolean;
};

type Rule = { ok: true } | { ok: false; reason: string };

/** Ordered text lines. Empty lines drop. Nothing becomes a checkbox or a task. */
export function normalizeGoals(goals: readonly string[]): string[] {
  return goals.map((goal) => goal.trim()).filter((goal) => goal.length > 0);
}

export function clientMaySeeMilestone(input: {
  publishToWarehaus: boolean;
  project: MilestoneProjectGate;
}): boolean {
  if (!input.publishToWarehaus) return false;
  return clientMaySeeProject(input.project);
}

export function clientMaySeeLinkedResource(input: {
  publishToWarehaus: boolean;
  archive: boolean;
  hidden: boolean;
  granolaOk: boolean;
  project: MilestoneProjectGate | null;
}): boolean {
  if (!input.publishToWarehaus || input.archive || input.hidden || !input.granolaOk) return false;
  if (!input.project) return true;
  return clientMaySeeProject(input.project);
}

export function createMilestoneDecision(input: {
  actor: MilestoneActor;
  name: string;
  objective: string;
  goals: readonly string[];
  /** Missing means Planning. A new milestone cannot start at Shipped. */
  status?: string;
  publishToWarehaus?: boolean;
  approval?: string;
}):
  | {
      ok: true;
      milestone: {
        name: string;
        objective: string;
        goals: string[];
        status: MilestoneStatus;
        approval: 'unreviewed';
        publishToWarehaus: false;
      };
      activityType: 'milestone.ready' | null;
    }
  | { ok: false; reason: string } {
  if (input.approval != null && input.approval !== 'unreviewed') {
    return { ok: false, reason: input.actor === 'ai' ? AI_CANNOT_DECIDE : 'A new milestone starts unreviewed' };
  }
  if (input.publishToWarehaus === true) {
    return {
      ok: false,
      reason: input.actor === 'ai' ? AI_CANNOT_PUBLISH : 'New milestones stay unpublished',
    };
  }
  const name = input.name.trim();
  const objective = input.objective.trim();
  if (!name) return { ok: false, reason: 'Name is required' };
  if (!objective) return { ok: false, reason: 'Objective is required' };
  if (objective.length > MILESTONE_OBJECTIVE_LIMIT) return { ok: false, reason: OBJECTIVE_TOO_LONG };
  const status = input.status ?? DEFAULT_MILESTONE_STATUS;
  if (!isMilestoneStatus(status)) return { ok: false, reason: UNKNOWN_STATUS };
  if (status === 'Shipped') return { ok: false, reason: SHIPPED_ON_MERGE };
  return {
    ok: true,
    milestone: {
      name,
      objective,
      goals: normalizeGoals(input.goals),
      status,
      approval: 'unreviewed',
      publishToWarehaus: false,
    },
    activityType: status === 'Ready to Ship' ? MILESTONE_ACTIVITY.ready : null,
  };
}

export function contentEditDecision(input: {
  actor: MilestoneActor;
  approval: MilestoneApproval;
  patch: {
    name?: string;
    objective?: string;
    goals?: readonly string[];
    approval?: string;
    publishToWarehaus?: boolean;
  };
}):
  | {
      ok: true;
      patch: { name?: string; objective?: string; goals?: string[] };
    }
  | { ok: false; reason: string } {
  if (input.patch.approval != null) {
    return { ok: false, reason: input.actor === 'ai' ? AI_CANNOT_DECIDE : 'Use the approval action' };
  }
  if (input.patch.publishToWarehaus != null) {
    return {
      ok: false,
      reason: input.actor === 'ai' ? AI_CANNOT_PUBLISH : 'Use the publish action',
    };
  }
  if (input.actor === 'ai' && input.approval === 'approved') {
    return { ok: false, reason: AI_LOCKED };
  }
  if (input.actor === 'human' && input.approval === 'approved') {
    return { ok: false, reason: HUMAN_CONTENT_LOCKED };
  }
  const patch: { name?: string; objective?: string; goals?: string[] } = {};
  if (input.patch.name != null) {
    const name = input.patch.name.trim();
    if (!name) return { ok: false, reason: 'Name is required' };
    patch.name = name;
  }
  if (input.patch.objective != null) {
    const objective = input.patch.objective.trim();
    if (!objective) return { ok: false, reason: 'Objective is required' };
    if (objective.length > MILESTONE_OBJECTIVE_LIMIT) return { ok: false, reason: OBJECTIVE_TOO_LONG };
    patch.objective = objective;
  }
  if (input.patch.goals != null) patch.goals = normalizeGoals(input.patch.goals);
  return { ok: true, patch };
}

export function resourceEditDecision(input: {
  actor: MilestoneActor;
  approval: MilestoneApproval;
}): Rule {
  if (input.actor === 'ai' && input.approval === 'approved') return { ok: false, reason: AI_LOCKED };
  if (input.actor === 'human' && input.approval === 'approved') {
    return { ok: false, reason: HUMAN_CONTENT_LOCKED };
  }
  return { ok: true };
}

export function publishDecision(input: {
  actor: MilestoneActor;
  publishToWarehaus: boolean;
}): { ok: true; publishToWarehaus: boolean } | { ok: false; reason: string } {
  if (input.actor !== 'human') return { ok: false, reason: AI_CANNOT_PUBLISH };
  return { ok: true, publishToWarehaus: input.publishToWarehaus };
}

export function resourceLinkDecision(
  milestoneOrgId: string,
  resourceOrgId: string | null,
): Rule {
  if (!resourceOrgId) return { ok: false, reason: 'Resource not found' };
  if (resourceOrgId !== milestoneOrgId) return { ok: false, reason: 'Resource belongs to another client' };
  return { ok: true };
}

export type TaskLinkInput = {
  id: string;
  orgId: string;
  projectId: string;
  parentTaskId: string | null;
  milestoneId: string | null;
};

export type AttachFailureCode = 'not_found' | 'wrong_project' | 'permission' | 'already_attached';

/** Map a known attach sentence to the code the staff API and MCP tool return. */
export function attachFailureCode(reason: string): AttachFailureCode | 'failed' {
  if (reason === 'Milestone not found' || reason === 'Task not found') return 'not_found';
  if (reason === 'Task is on another project') return 'wrong_project';
  if (
    reason === 'Task belongs to another client' ||
    reason === AI_LOCKED ||
    reason === 'This token is read-only'
  ) {
    return 'permission';
  }
  if (reason === 'Task is already on a milestone') return 'already_attached';
  return 'failed';
}

export function attachFailureStatus(code: AttachFailureCode | 'failed'): 400 | 403 | 404 | 409 {
  if (code === 'not_found') return 404;
  if (code === 'permission') return 403;
  if (code === 'already_attached') return 409;
  return 400;
}

export function attachTaskDecision(input: {
  actor: MilestoneActor;
  milestone: { id: string; orgId: string; projectId: string; approval: MilestoneApproval };
  task: TaskLinkInput;
}): { ok: true; alreadyAttached: boolean } | { ok: false; reason: string; code: AttachFailureCode } {
  if (input.actor === 'ai' && input.milestone.approval === 'approved') {
    return { ok: false, reason: AI_LOCKED, code: 'permission' };
  }
  if (input.task.orgId !== input.milestone.orgId) {
    return { ok: false, reason: 'Task belongs to another client', code: 'permission' };
  }
  if (input.task.projectId !== input.milestone.projectId) {
    return { ok: false, reason: 'Task is on another project', code: 'wrong_project' };
  }
  if (input.task.milestoneId === input.milestone.id) return { ok: true, alreadyAttached: true };
  if (input.task.milestoneId) {
    return { ok: false, reason: 'Task is already on a milestone', code: 'already_attached' };
  }
  return { ok: true, alreadyAttached: false };
}

/** Link fields only. Status, stage, and isDone stay on the task. */
export function taskLinkPatch(
  milestoneId: string,
  milestoneOrder: number,
): { milestoneId: string; milestoneOrder: number } {
  return { milestoneId, milestoneOrder };
}

export function detachTaskDecision(input: {
  actor: MilestoneActor;
  milestone: { id: string; approval: MilestoneApproval };
  task: { milestoneId: string | null };
}): Rule {
  if (input.actor === 'ai' && input.milestone.approval === 'approved') {
    return { ok: false, reason: AI_LOCKED };
  }
  if (input.task.milestoneId !== input.milestone.id) {
    return { ok: false, reason: 'Task is not on this milestone' };
  }
  return { ok: true };
}

export type RoadmapTaskInput = {
  id: string;
  name: string;
  status: string;
  isDone: boolean;
  stage: string | null;
  pullRequestUrl: string | null;
  parentTaskId: string | null;
  milestoneId: string | null;
  milestoneOrder: number | null;
  resourceCount: number;
  publishToWarehaus: boolean;
  hidden: boolean;
  /** Archived tasks stay on the row but do not block Shipped. */
  archived?: boolean;
  source?: string | null;
  origin?: TaskOrigin | null;
  round?: number | null;
  kind?: TaskKind | null;
  portalOwned?: boolean;
  detail?: string | null;
  runner?: string | null;
  commit?: string | null;
  blockedReason?: string | null;
  nextAction?: string | null;
};

export type RoadmapChild = {
  id: string;
  name: string;
  status: string;
  isDone: boolean;
  stage: string | null;
  resourceCount: number;
  pullRequestUrl?: string;
  source?: string | null;
  /** Staff only. Where the task came from. Absent for clients, including the key. */
  origin?: TaskOrigin;
  /** Staff only. Review iteration that asked for the task. */
  round?: number;
  /** Staff only, and only on a design task. A task with no kind is build. */
  kind?: 'design';
  /** Staff only. True when the portal owns the task, so it can be edited and removed here. */
  portalOwned?: boolean;
  /** Staff only, and only on a task the portal owns. */
  detail?: string;
  /** Staff only. Runner id working the task. */
  runner?: string;
  /** Staff only. Short commit the runner pushed for the task. */
  commit?: string;
  /** Staff only. Why the runner stopped on the task. */
  blockedReason?: string;
  /** Staff only. The task's next action. On a Blocked task it is what the task is waiting on. */
  nextAction?: string;
  archived?: boolean;
  /** True only when this task's milestoneId is the milestone being shown. */
  onMilestone?: boolean;
};

export type RoadmapRow = RoadmapChild & {
  children: RoadmapChild[];
};

export function pullRequestHref(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function roadmapTask(
  task: RoadmapTaskInput,
  audience: 'staff' | 'client',
): RoadmapChild {
  const href = audience === 'staff' ? pullRequestHref(task.pullRequestUrl) : null;
  return {
    id: task.id,
    name: task.name,
    status: task.status,
    isDone: task.isDone,
    stage: task.stage,
    resourceCount: task.resourceCount,
    ...(task.archived ? { archived: true } : {}),
    ...(href ? { pullRequestUrl: href } : {}),
    ...(audience === 'staff' && task.source ? { source: task.source } : {}),
    ...(audience === 'staff' && task.origin ? { origin: task.origin } : {}),
    ...(audience === 'staff' && task.round != null ? { round: task.round } : {}),
    ...(audience === 'staff' && task.kind === 'design' ? { kind: 'design' as const } : {}),
    ...(audience === 'staff' && task.portalOwned ? { portalOwned: true } : {}),
    ...(audience === 'staff' && task.portalOwned && task.detail ? { detail: task.detail } : {}),
    ...(audience === 'staff' && task.runner ? { runner: task.runner } : {}),
    ...(audience === 'staff' && task.commit ? { commit: task.commit.slice(0, 7) } : {}),
    ...(audience === 'staff' && task.blockedReason ? { blockedReason: task.blockedReason } : {}),
    ...(audience === 'staff' && task.nextAction ? { nextAction: task.nextAction } : {}),
  };
}

function taskVisible(task: RoadmapTaskInput, audience: 'staff' | 'client', projectVisibleToClient: boolean): boolean {
  if (audience === 'staff') return true;
  if (!projectVisibleToClient || task.hidden || !task.publishToWarehaus) return false;
  return true;
}

function milestoneOrder(a: RoadmapTaskInput, b: RoadmapTaskInput): number {
  const orderA = a.milestoneOrder ?? Number.MAX_SAFE_INTEGER;
  const orderB = b.milestoneOrder ?? Number.MAX_SAFE_INTEGER;
  if (orderA !== orderB) return orderA - orderB;
  return a.name.localeCompare(b.name);
}

/**
 * The milestone's tasks. A row is a task linked to this milestone whose parent
 * is not also linked here. Subtasks of that row stay nested, including a
 * subtask with no link of its own. A subtask linked on its own is a row when
 * its parent is not on this milestone. A subtask linked to a different
 * milestone is not nested here, so it is not counted twice. The rows are the
 * milestone task set (taskSetGroups); Parked and archived tasks show but are
 * in neither count. The counts are context, not approval. No percent complete.
 */
export function buildRoadmap(input: {
  audience: 'staff' | 'client';
  milestoneId: string;
  tasks: readonly RoadmapTaskInput[];
  projectVisibleToClient: boolean;
}): {
  openCount: number;
  doneCount: number;
  /** Staff only: whether Shipped unlocks, from the whole task set. */
  canClose?: boolean;
  countIsDecision: false;
  rows: RoadmapRow[];
} {
  const visible = input.tasks.filter((task) => taskVisible(task, input.audience, input.projectVisibleToClient));
  const rows: RoadmapRow[] = taskSetGroups(input.milestoneId, visible, { keepArchived: true })
    .sort((a, b) => milestoneOrder(a.row, b.row))
    .map(({ row, children }) => ({
      ...roadmapTask(row, input.audience),
      onMilestone: true,
      children: [...children]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((task) => ({
          ...roadmapTask(task, input.audience),
          onMilestone: task.milestoneId === input.milestoneId,
        })),
    }));
  const { openCount, doneCount } = roadmapCounts(rows);
  return {
    openCount,
    doneCount,
    ...(input.audience === 'staff'
      ? { canClose: classifyMilestoneTasks(input.milestoneId, input.tasks).canShip.ok }
      : {}),
    countIsDecision: false,
    rows,
  };
}

export function nextMilestoneOrder(orders: readonly (number | null | undefined)[]): number {
  return orders.reduce<number>((max, order) => Math.max(max, order ?? -1), -1) + 1;
}

export function milestoneActivityName(type: MilestoneActivityType, milestoneName: string): string {
  if (type === MILESTONE_ACTIVITY.ready) return milestoneName;
  if (type === MILESTONE_ACTIVITY.approved) return milestoneName;
  return milestoneName;
}

/** Activity insert for one milestone. The id is what later reads filter on. */
export function milestoneActivityInsert(input: {
  orgId: string;
  projectId: string;
  milestoneId: string;
  name: string;
  summary?: string;
  type: MilestoneActivityType;
  timestamp: number;
}): {
  orgId: string;
  projectId: string;
  milestoneId: string;
  name: string;
  summary?: string;
  type: MilestoneActivityType;
  tone: 'warn' | 'success' | 'accent';
  timestamp: number;
} {
  return {
    orgId: input.orgId,
    projectId: input.projectId,
    milestoneId: input.milestoneId,
    name: milestoneActivityName(input.type, input.name),
    ...(input.summary ? { summary: input.summary } : {}),
    type: input.type,
    tone:
      input.type === 'milestone.changes_requested' || input.type === 'milestone.design_changes_requested'
        ? 'warn'
        : input.type === 'milestone.approved' || input.type === 'milestone.design_approved'
          ? 'success'
          : 'accent',
    timestamp: input.timestamp,
  };
}

export async function writeMilestoneActivity(
  ctx: {
    db: {
      insert: (
        table: 'activity',
        value: ReturnType<typeof milestoneActivityInsert>,
      ) => Promise<unknown>;
    };
  },
  milestone: { _id: string; orgId: string; projectId: string; name: string },
  type: MilestoneActivityType,
  at: number,
  summary?: string,
): Promise<void> {
  await ctx.db.insert(
    'activity',
    milestoneActivityInsert({
      orgId: milestone.orgId,
      projectId: milestone.projectId,
      milestoneId: milestone._id,
      name: milestone.name,
      summary,
      type,
      timestamp: at,
    }),
  );
}

export type MilestoneResourceView = {
  id: string;
  title: string;
  url: string | null;
  /** Resource type already stored on the row. Omitted when the row has none. */
  type?: string | null;
};

const CLIENT_ROADMAP_OMIT = [
  'canClose',
  'approval',
  'note',
  'approverName',
  'decidedAt',
  'creator',
  'localPreviewUrl',
  'figmaUrl',
  'createdVia',
  'planning',
  'planningBlockedReason',
  'branch',
  'prUrl',
  'review',
  'updatedAt',
] as const;

/**
 * When a milestone last changed: the newest of the times given. The row has
 * no updated field, so this is read from what changes with it: its own
 * creation and decision, its tasks, its activity, and its run feed.
 */
export function milestoneLastChange(times: readonly (number | null | undefined)[]): number | null {
  let latest: number | null = null;
  for (const time of times) {
    if (typeof time !== 'number' || !Number.isFinite(time)) continue;
    if (latest == null || time > latest) latest = time;
  }
  return latest;
}

/** The statuses whose page header carries the Updated stamp: the live loop. */
export function showsUpdatedStamp(status: string): boolean {
  return status === 'Planning' || status === 'Building';
}

/** Staff keep every field. Clients get a copy with the private keys removed, not nulled. */
export function roadmapViewForAudience<T extends object>(view: T, audience: 'staff' | 'client'): T {
  if (audience === 'staff') return view;
  const next = { ...view } as T & Record<string, unknown>;
  for (const key of CLIENT_ROADMAP_OMIT) delete next[key];
  return next;
}

/** Review surface for one milestone. `countIsDecision` is always false. */
export type MilestoneRoadmapView = {
  id: string;
  name: string;
  objective: string;
  goals: string[];
  /** The one Status field. Approval is the review result, not a status. */
  status: MilestoneStatus;
  /** Staff only. Absent for clients, including the key. */
  approval?: MilestoneApproval;
  note: string | null;
  approverName: string | null;
  /** Staff only. Absent for clients, including the key. */
  decidedAt?: number | null;
  publishToWarehaus: boolean;
  createdAt?: number | null;
  /** Contact id of the owner. Absent when unassigned. */
  ownerContactId?: string | null;
  /** Display name for the owner. Absent when unassigned. */
  ownerName?: string | null;
  /** Calendar day, YYYY-MM-DD. Absent when not set. */
  dueDate?: string | null;
  /** The person who created the milestone. Absent on older rows. Clients see it read-only. */
  creatorName?: string | null;
  resources: MilestoneResourceView[];
  openCount: number;
  doneCount: number;
  /** Staff only: whether Shipped unlocks, from the whole task set. Absent for clients, including the key. */
  canClose?: boolean;
  countIsDecision: false;
  rows: RoadmapRow[];
  attachableTasks?: { id: string; name: string }[];
  resourceChoices?: { id: string; title: string }[];
  /** Staff only. Absent for clients, including the key. */
  review?: MilestoneReviewView;
  /**
   * Staff-only localhost preview on the tile. Absent for clients, including
   * the key. Not the Vercel review link.
   */
  localPreviewUrl?: string | null;
  /** Staff-only Figma link on the tile. Absent for clients, including the key. */
  figmaUrl?: string | null;
  /** Staff only. When Peter approved the design. Absent for clients and until he approves. */
  designApprovedAt?: number;
  /** Staff only. The design gate: whether build waits, the Building phase, and how many design tasks are done. */
  designGate?: { visual: boolean; buildLocked: boolean; phase: BuildingPhase; doneDesign: number };
  /** Staff only. On a Shipped milestone with a recorded merge: whether a deploy run has covered it. */
  deploy?: 'not-deployed' | 'deployed';
  /** Staff only. Where the milestone was created. Absent for clients, including the key. */
  createdVia?: MilestoneCreatedVia;
  /** Staff only. A planning job waiting for, held by, or blocked on a runner. */
  planning?: 'queued' | 'running' | 'blocked';
  /** Staff only. Why a planning run is blocked. */
  planningBlockedReason?: string;
  /** Staff only. The milestone's one branch. */
  branch?: string;
  /** Staff only. The milestone's one pull request. */
  prUrl?: string;
  /** Staff only, and only while Planning or Building. When the milestone last changed. */
  updatedAt?: number;
  /**
   * Only while Building: whether a run is going and its last sign of life,
   * for the Building indicator. Clients get no `blocked`.
   */
  buildRun?: BuildRunFacts;
};

export type MilestoneReviewHistoryItem = {
  iteration: number;
  decision: 'approve' | 'request_changes';
  notes: string;
  decidedByName: string;
  decidedAt: number;
  source: 'portal' | 'chat';
  taskCount: number;
};

export type MilestoneReviewView = {
  iteration: number;
  previewUrl: string | null;
  /** The local build on Peter's Mac. Absent on older payloads. */
  localPreviewUrl?: string | null;
  /** The Vercel link for staff. Absent on older payloads. */
  vercelPreviewUrl?: string | null;
  /** Set when staff attach the link by hand. Absent on worker previews and older rows. */
  previewAttachedBy?: string | null;
  previewAttachedAt?: number | null;
  prNumber: number | null;
  prTitle: string | null;
  branch: string | null;
  commit: string | null;
  builtAt: number | null;
  designCheck: 'pass' | 'fixes' | 'pending';
  designCheckNote: string | null;
  previewBuild: 'building' | 'failed' | null;
  previewBuildAttempt: number | null;
  previewBuildAt: number | null;
  previewDelete: 'removing' | 'failed' | 'removed' | null;
  previewDeleteAttempt: number | null;
  previewDeleteAt: number | null;
  /** Absent until a production deploy finishes. Approval alone does not set it. */
  deployFinishedAt: number | null;
  history: MilestoneReviewHistoryItem[];
};
