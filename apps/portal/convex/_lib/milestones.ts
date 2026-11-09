/**
 * Milestone rules. Portal-only. A milestone is one objective on one project.
 * Approval is a human decision in the portal. AI cannot set it.
 * Approval does not close, delete, or rewrite tasks.
 */

import { clientMaySeeProject } from '@warehaus/portal-sync';

export const MILESTONE_WORK_STATUSES = ['draft', 'active', 'ready'] as const;
export const MILESTONE_APPROVALS = ['unreviewed', 'approved', 'changes_requested'] as const;
export const HUMAN_DECISIONS = ['approved', 'changes_requested'] as const;

export const MILESTONE_ACTIVITY = {
  ready: 'milestone.ready',
  approved: 'milestone.approved',
  changesRequested: 'milestone.changes_requested',
} as const;

export type MilestoneWorkStatus = (typeof MILESTONE_WORK_STATUSES)[number];
export type MilestoneApproval = (typeof MILESTONE_APPROVALS)[number];
export type HumanDecision = (typeof HUMAN_DECISIONS)[number];
export type MilestoneActor = 'human' | 'ai';
export type MilestoneActivityType = (typeof MILESTONE_ACTIVITY)[keyof typeof MILESTONE_ACTIVITY];

export const AI_CANNOT_DECIDE = 'AI cannot set milestone approval';
export const AI_LOCKED = 'AI cannot edit an approved milestone or change its tasks';
export const HUMAN_CONTENT_LOCKED =
  'Approved milestones stay as accepted until a human requests changes';
export const AI_CANNOT_PUBLISH = 'AI cannot publish a milestone';

export type MilestoneProjectGate = {
  name?: string | null;
  types?: readonly string[] | null;
  publishToWarehaus: boolean;
  archive: boolean;
  hidden: boolean;
  orgVisible: boolean;
};

type Rule = { ok: true } | { ok: false; reason: string };

export function isWorkStatus(value: string): value is MilestoneWorkStatus {
  return (MILESTONE_WORK_STATUSES as readonly string[]).includes(value);
}

export function isHumanDecision(value: string): value is HumanDecision {
  return (HUMAN_DECISIONS as readonly string[]).includes(value);
}

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
  workStatus?: string;
  publishToWarehaus?: boolean;
  approval?: string;
}):
  | {
      ok: true;
      milestone: {
        name: string;
        objective: string;
        goals: string[];
        workStatus: MilestoneWorkStatus;
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
  const workStatus = input.workStatus ?? 'draft';
  if (!isWorkStatus(workStatus)) {
    return { ok: false, reason: 'Work status must be draft, active, or ready' };
  }
  return {
    ok: true,
    milestone: {
      name,
      objective,
      goals: normalizeGoals(input.goals),
      workStatus,
      approval: 'unreviewed',
      publishToWarehaus: false,
    },
    activityType: workStatus === 'ready' ? MILESTONE_ACTIVITY.ready : null,
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

export function workStatusDecision(input: {
  actor: MilestoneActor;
  approval: MilestoneApproval;
  from: MilestoneWorkStatus;
  to: string;
}):
  | { ok: true; workStatus: MilestoneWorkStatus; activityType: 'milestone.ready' | null }
  | { ok: false; reason: string } {
  if (!isWorkStatus(input.to)) {
    return { ok: false, reason: 'Work status must be draft, active, or ready' };
  }
  if (input.actor === 'ai' && input.approval === 'approved') return { ok: false, reason: AI_LOCKED };
  return {
    ok: true,
    workStatus: input.to,
    activityType: input.to === 'ready' && input.from !== 'ready' ? MILESTONE_ACTIVITY.ready : null,
  };
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

export function attachTaskDecision(input: {
  actor: MilestoneActor;
  milestone: { id: string; orgId: string; projectId: string; approval: MilestoneApproval };
  task: TaskLinkInput;
}): { ok: true; alreadyAttached: boolean } | { ok: false; reason: string } {
  if (input.actor === 'ai' && input.milestone.approval === 'approved') {
    return { ok: false, reason: AI_LOCKED };
  }
  if (input.task.orgId !== input.milestone.orgId) {
    return { ok: false, reason: 'Task belongs to another client' };
  }
  if (input.task.projectId !== input.milestone.projectId) {
    return { ok: false, reason: 'Task is on another project' };
  }
  if (input.task.parentTaskId) {
    return { ok: false, reason: 'Only a top-level task can join a milestone' };
  }
  if (input.task.milestoneId === input.milestone.id) return { ok: true, alreadyAttached: true };
  if (input.task.milestoneId) return { ok: false, reason: 'Task is already on a milestone' };
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

export function applyHumanDecision(input: {
  actor: MilestoneActor;
  decision: string;
  note: string;
  approverContactId: string;
  at: number;
  tasks: readonly { id: string; isDone: boolean; status: string; stage: string | null }[];
}):
  | {
      ok: true;
      patch: {
        approval: HumanDecision;
        note: string;
        approverContactId: string;
        decidedAt: number;
        workStatus?: 'active';
      };
      activityType: 'milestone.approved' | 'milestone.changes_requested';
      taskWrites: readonly [];
      tasks: typeof input.tasks;
    }
  | { ok: false; reason: string } {
  if (input.actor !== 'human') return { ok: false, reason: AI_CANNOT_DECIDE };
  if (!isHumanDecision(input.decision)) {
    return { ok: false, reason: 'Approval must be approved or changes requested' };
  }
  const note = input.note.trim();
  if (!note) return { ok: false, reason: 'A note is required' };
  if (!input.approverContactId.trim()) return { ok: false, reason: 'Approver is required' };
  return {
    ok: true,
    patch: {
      approval: input.decision,
      note,
      approverContactId: input.approverContactId,
      decidedAt: input.at,
      ...(input.decision === 'changes_requested' ? { workStatus: 'active' as const } : {}),
    },
    activityType:
      input.decision === 'approved' ? MILESTONE_ACTIVITY.approved : MILESTONE_ACTIVITY.changesRequested,
    taskWrites: [],
    tasks: input.tasks,
  };
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
};

export type RoadmapChild = {
  id: string;
  name: string;
  status: string;
  isDone: boolean;
  stage: string | null;
  resourceCount: number;
  pullRequestUrl?: string;
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
    ...(href ? { pullRequestUrl: href } : {}),
  };
}

function taskVisible(task: RoadmapTaskInput, audience: 'staff' | 'client', projectVisibleToClient: boolean): boolean {
  if (audience === 'staff') return true;
  if (!projectVisibleToClient || task.hidden || !task.publishToWarehaus) return false;
  return true;
}

/**
 * The milestone's tasks, parents in milestone order, subtasks nested under them.
 * Open and done counts include every shown row. They are context, not approval.
 * No percent complete.
 */
export function buildRoadmap(input: {
  audience: 'staff' | 'client';
  milestoneId: string;
  tasks: readonly RoadmapTaskInput[];
  projectVisibleToClient: boolean;
}): {
  openCount: number;
  doneCount: number;
  countIsDecision: false;
  rows: RoadmapRow[];
} {
  const visible = input.tasks.filter((task) => taskVisible(task, input.audience, input.projectVisibleToClient));
  const parents = visible
    .filter((task) => task.milestoneId === input.milestoneId && !task.parentTaskId)
    .sort((a, b) => {
      const orderA = a.milestoneOrder ?? Number.MAX_SAFE_INTEGER;
      const orderB = b.milestoneOrder ?? Number.MAX_SAFE_INTEGER;
      if (orderA !== orderB) return orderA - orderB;
      return a.name.localeCompare(b.name);
    });
  const rows: RoadmapRow[] = parents.map((parent) => {
    const children = visible
      .filter((task) => task.parentTaskId === parent.id)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((task) => roadmapTask(task, input.audience));
    return { ...roadmapTask(parent, input.audience), children };
  });
  const flat = rows.flatMap((row) => [row, ...row.children]);
  return {
    openCount: flat.filter((row) => !row.isDone).length,
    doneCount: flat.filter((row) => row.isDone).length,
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
  type: MilestoneActivityType;
  timestamp: number;
}): {
  orgId: string;
  projectId: string;
  milestoneId: string;
  name: string;
  type: MilestoneActivityType;
  tone: 'warn' | 'success' | 'accent';
  timestamp: number;
} {
  return {
    orgId: input.orgId,
    projectId: input.projectId,
    milestoneId: input.milestoneId,
    name: milestoneActivityName(input.type, input.name),
    type: input.type,
    tone:
      input.type === 'milestone.changes_requested'
        ? 'warn'
        : input.type === 'milestone.approved'
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
): Promise<void> {
  await ctx.db.insert(
    'activity',
    milestoneActivityInsert({
      orgId: milestone.orgId,
      projectId: milestone.projectId,
      milestoneId: milestone._id,
      name: milestone.name,
      type,
      timestamp: at,
    }),
  );
}

export type MilestoneResourceView = {
  id: string;
  title: string;
  url: string | null;
};

/** Review surface for one milestone. `countIsDecision` is always false. */
export type MilestoneRoadmapView = {
  id: string;
  name: string;
  objective: string;
  goals: string[];
  workStatus: MilestoneWorkStatus;
  approval: MilestoneApproval;
  note: string | null;
  approverName: string | null;
  decidedAt: number | null;
  publishToWarehaus: boolean;
  resources: MilestoneResourceView[];
  openCount: number;
  doneCount: number;
  countIsDecision: false;
  rows: RoadmapRow[];
  attachableTasks?: { id: string; name: string }[];
  resourceChoices?: { id: string; title: string }[];
};
