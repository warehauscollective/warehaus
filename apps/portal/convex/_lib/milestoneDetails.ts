/**
 * Editable milestone details. Pure rules. The mutations call these and skip
 * a write when `wrote` is false.
 *
 * Title, objective, owner, and due date stay read-only. `textBlurSave` is the
 * rule for a later text field: blur saves a real change, an unchanged blur
 * does not write, and Escape discards.
 */

import type { MilestoneWorkStatus } from './milestones';

/** Both addresses already used for Peter in this repo. Compared lowercased. */
export const PETER_EMAILS = ['peter@warehaus.co', 'peter@warehaus.studio'] as const;

export const MILESTONE_STAGES = [
  'Idea',
  'Planning',
  'Awaiting Go',
  'Building',
  'Ready to Ship',
  'Shipped',
  'Parked',
] as const;

export const PETER_ONLY_STAGES = ['Awaiting Go', 'Ready to Ship'] as const;

export const MILESTONE_DETAIL_STATUSES = ['draft', 'in_progress', 'in_review', 'complete'] as const;

export const DETAIL_STATUS_LABEL = {
  draft: 'Draft',
  in_progress: 'In progress',
  in_review: 'In review',
  complete: 'Complete',
} as const;

export const DETAIL_ACTIVITY = {
  status: 'milestone.status',
  stage: 'milestone.stage',
  publish: 'milestone.publish',
  project: 'milestone.project',
} as const;

export type MilestoneStage = (typeof MILESTONE_STAGES)[number];
export type MilestoneDetailStatus = (typeof MILESTONE_DETAIL_STATUSES)[number];
export type DetailActivityType = (typeof DETAIL_ACTIVITY)[keyof typeof DETAIL_ACTIVITY];

const STAGE_SET = new Set<string>(MILESTONE_STAGES);
const STATUS_SET = new Set<string>(MILESTONE_DETAIL_STATUSES);

export function isPeterEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return (PETER_EMAILS as readonly string[]).includes(normalized);
}

export function isMilestoneStage(value: string): value is MilestoneStage {
  return STAGE_SET.has(value);
}

export function isDetailStatus(value: string): value is MilestoneDetailStatus {
  return STATUS_SET.has(value);
}

/** Stored stage, or the same label the detail page already derived. */
export function effectiveStage(input: {
  stage?: string | null;
  workStatus: MilestoneWorkStatus;
  approval: string;
}): MilestoneStage {
  if (input.stage && isMilestoneStage(input.stage)) return input.stage;
  if (input.approval === 'approved') return 'Shipped';
  if (input.workStatus === 'draft') return 'Planning';
  return 'Building';
}

/** Stored status, or the work-status equivalent. Approval stays on its own row. */
export function effectiveDetailStatus(input: {
  detailStatus?: string | null;
  workStatus: MilestoneWorkStatus;
}): MilestoneDetailStatus {
  if (input.detailStatus && isDetailStatus(input.detailStatus)) return input.detailStatus;
  if (input.workStatus === 'draft') return 'draft';
  if (input.workStatus === 'ready') return 'in_review';
  return 'in_progress';
}

export function detailStatusLabel(status: MilestoneDetailStatus): string {
  return DETAIL_STATUS_LABEL[status];
}

/** Work status kept in step with the picker. Complete does not invent a fourth work status. */
export function workStatusForDetail(status: MilestoneDetailStatus): MilestoneWorkStatus | null {
  if (status === 'draft') return 'draft';
  if (status === 'in_progress') return 'active';
  if (status === 'in_review') return 'ready';
  return null;
}

export function stageOptionLock(input: { stage: MilestoneStage; peter: boolean }): 'peter' | 'shipped' | null {
  if (input.stage === 'Shipped') return 'shipped';
  if (!input.peter && (input.stage === 'Awaiting Go' || input.stage === 'Ready to Ship')) return 'peter';
  return null;
}

/**
 * Awaiting Go and Ready to Ship are Peter's. Leaving Awaiting Go, including
 * to Building, is also Peter's. Shipped is never set by hand. The same value
 * is a no-op, including Shipped, so a repeat click does not write.
 */
export function stageChangeDecision(input: {
  peter: boolean;
  from: MilestoneStage;
  to: string;
}): { ok: true; stage: MilestoneStage; wrote: boolean } | { ok: false; reason: string } {
  if (!isMilestoneStage(input.to)) return { ok: false, reason: 'Unknown stage' };
  if (input.to === input.from) return { ok: true, stage: input.to, wrote: false };
  if (input.to === 'Shipped') return { ok: false, reason: 'Shipped is set by deploy main' };
  if (input.from === 'Awaiting Go' && !input.peter) {
    return { ok: false, reason: 'Only Peter can move a milestone out of Awaiting Go' };
  }
  if ((input.to === 'Awaiting Go' || input.to === 'Ready to Ship') && !input.peter) {
    return { ok: false, reason: 'Only Peter can set Awaiting Go or Ready to Ship' };
  }
  return { ok: true, stage: input.to, wrote: true };
}

export function detailStatusDecision(input: {
  from: MilestoneDetailStatus;
  to: string;
}):
  | { ok: true; status: MilestoneDetailStatus; wrote: boolean; workStatus: MilestoneWorkStatus | null }
  | { ok: false; reason: string } {
  if (!isDetailStatus(input.to)) return { ok: false, reason: 'Unknown status' };
  if (input.to === input.from) return { ok: true, status: input.to, wrote: false, workStatus: null };
  return { ok: true, status: input.to, wrote: true, workStatus: workStatusForDetail(input.to) };
}

export function publishChangeDecision(from: boolean, to: boolean): { wrote: boolean } {
  return { wrote: from !== to };
}

export function projectMoveDecision(input: {
  fromProjectId: string;
  toProjectId: string;
  sameOrg: boolean;
}): { ok: true; wrote: boolean } | { ok: false; reason: string } {
  if (!input.sameOrg) return { ok: false, reason: 'Project not found' };
  if (!input.toProjectId) return { ok: false, reason: 'Project not found' };
  if (input.fromProjectId === input.toProjectId) return { ok: true, wrote: false };
  return { ok: true, wrote: true };
}

/** Blur saves a changed value. An unchanged blur writes nothing. Escape discards. */
export function textBlurSave(input: { previous: string; next: string; escape: boolean }):
  | { action: 'discard' }
  | { action: 'skip' }
  | { action: 'save'; value: string } {
  if (input.escape) return { action: 'discard' };
  const value = input.next.trim();
  if (value === input.previous.trim()) return { action: 'skip' };
  return { action: 'save', value };
}

export function detailActivitySummary(input: {
  actor: string;
  from: string;
  to: string;
  at: number;
}): string {
  const when = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(input.at);
  return `${input.actor} · ${input.from} → ${input.to} · ${when} ET`;
}

export type MoveTask = {
  id: string;
  projectId: string;
  milestoneId: string | null;
  parentTaskId: string | null;
};

/** Milestone tasks and their subtasks. Tasks already on the destination are skipped. */
export function taskIdsToMove(input: {
  tasks: readonly MoveTask[];
  milestoneId: string;
  toProjectId: string;
}): string[] {
  const moving = new Set<string>();
  for (const task of input.tasks) {
    if (task.milestoneId === input.milestoneId) moving.add(task.id);
  }
  let grew = true;
  while (grew) {
    grew = false;
    for (const task of input.tasks) {
      if (moving.has(task.id) || !task.parentTaskId || !moving.has(task.parentTaskId)) continue;
      moving.add(task.id);
      grew = true;
    }
  }
  const byId = new Map(input.tasks.map((task) => [task.id, task]));
  return [...moving].filter((id) => byId.get(id)?.projectId !== input.toProjectId);
}

/**
 * A portal project move must survive the next Notion pull. Tasks.Projects is
 * SERVER, so the pull is not turned into a Notion write. Once Notion shows
 * the same project, the hold clears and later pulls can move the task again.
 */
export function heldTaskProjectId<T extends string>(input: {
  held: T | null | undefined;
  incoming: T;
}): { projectId: T; clearHold: boolean } {
  if (input.held && input.held !== input.incoming) {
    return { projectId: input.held, clearHold: false };
  }
  if (input.held && input.held === input.incoming) {
    return { projectId: input.incoming, clearHold: true };
  }
  return { projectId: input.incoming, clearHold: false };
}

/** Clients never see Creator or Visibility. Every other details row is text. */
export function clientSeesDetailsRow(row: 'creator' | 'visibility' | 'owner' | 'due' | 'created' | 'project' | 'status' | 'stage', staff: boolean): boolean {
  if (row === 'creator' || row === 'visibility') return staff;
  return true;
}
