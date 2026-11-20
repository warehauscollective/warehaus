/**
 * Editable milestone details. Pure rules. The mutations call these and skip
 * a write when `wrote` is false.
 *
 * Title and objective stay read-only. Owner and due date save on pick, and an
 * unchanged pick does not write. `textBlurSave` is the rule for a later text
 * field: blur saves a real change, an unchanged blur does not write, and
 * Escape discards.
 */

import type { MilestoneWorkStatus } from './milestones';

export const MILESTONE_STAGES = [
  'Idea',
  'Planning',
  'Awaiting Go',
  'Building',
  'Ready to Ship',
  'Shipped',
  'Parked',
] as const;

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

export function isMilestoneStage(value: string): value is MilestoneStage {
  return STAGE_SET.has(value);
}

export function isDetailStatus(value: string): value is MilestoneDetailStatus {
  return STATUS_SET.has(value);
}

/**
 * Stored stage wins, including Shipped. Shipped is never derived.
 * With nothing stored, ready work is Ready to Ship and approve keeps that.
 */
export function effectiveStage(input: {
  stage?: string | null;
  workStatus: MilestoneWorkStatus;
  approval?: string | null;
}): MilestoneStage {
  if (input.stage && isMilestoneStage(input.stage)) return input.stage;
  if (input.workStatus === 'draft') return 'Planning';
  if (input.workStatus === 'ready') return 'Ready to Ship';
  // Approve keeps the work-status stage. It does not pick a new one.
  void input.approval;
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

/**
 * Work status kept in step with the picker. Complete does not invent a fourth
 * work status. In review sets work status ready. It never sets a protocol stage,
 * so it cannot land on Ready to Ship.
 */
export function workStatusForDetail(status: MilestoneDetailStatus): MilestoneWorkStatus | null {
  if (status === 'draft') return 'draft';
  if (status === 'in_progress') return 'active';
  if (status === 'in_review') return 'ready';
  return null;
}

/** A work-status write. The patch has no stage. */
export function workStatusWrite(workStatus: MilestoneWorkStatus): { workStatus: MilestoneWorkStatus } {
  return { workStatus };
}

export const MILESTONE_STAGE_HINT =
  'Staff can set Shipped when every task that is not Parked is Done. Saves as soon as you pick.';

export const MILESTONE_STATUS_HINT =
  'Complete is available when every task that is not Parked is Done. Saves as soon as you pick.';

export type CloseTask = {
  stage?: string | null;
  status?: string | null;
  isDone?: boolean;
};

/** Shipped and Complete share this gate. Parked tasks do not count. */
export function finishedMilestoneDecision(
  tasks: readonly CloseTask[],
  label: 'Shipped' | 'Complete',
): { ok: true } | { ok: false; reason: string } {
  const counted = tasks.filter((task) => task.stage !== 'Parked');
  if (counted.length === 0) {
    return { ok: false, reason: `${label} needs at least one task that is not Parked.` };
  }
  const pending = counted.some((task) => task.isDone !== true && task.status !== 'Done');
  if (pending) {
    return { ok: false, reason: `${label} needs every task that is not Parked to be Done.` };
  }
  return { ok: true };
}

export function milestoneCanClose(
  rows: readonly (CloseTask & { children?: readonly CloseTask[] })[],
): boolean {
  const flat: CloseTask[] = [];
  for (const row of rows) {
    flat.push(row);
    for (const child of row.children ?? []) flat.push(child);
  }
  return finishedMilestoneDecision(flat, 'Shipped').ok;
}

export function stageOptionLock(stage: MilestoneStage, canClose = false): 'shipped' | null {
  if (stage !== 'Shipped' || canClose) return null;
  return 'shipped';
}

/**
 * Staff can set any stage. Shipped is allowed only when `tasksReady` is true,
 * which means every non-Parked task is Done. The same value is a no-op.
 */
export function stageChangeDecision(input: {
  from: MilestoneStage;
  to: string;
  tasksReady?: boolean;
}): { ok: true; stage: MilestoneStage; wrote: boolean } | { ok: false; reason: string } {
  if (!isMilestoneStage(input.to)) return { ok: false, reason: 'Unknown stage' };
  if (input.to === input.from) return { ok: true, stage: input.to, wrote: false };
  if (input.to === 'Shipped' && input.tasksReady !== true) {
    return { ok: false, reason: 'Shipped needs every task that is not Parked to be Done.' };
  }
  return { ok: true, stage: input.to, wrote: true };
}

export function detailStatusDecision(input: {
  from: MilestoneDetailStatus;
  to: string;
}):
  | { ok: true; status: MilestoneDetailStatus; wrote: boolean; workStatus: MilestoneWorkStatus | null; stage: null }
  | { ok: false; reason: string } {
  if (!isDetailStatus(input.to)) return { ok: false, reason: 'Unknown status' };
  if (input.to === input.from) return { ok: true, status: input.to, wrote: false, workStatus: null, stage: null };
  return { ok: true, status: input.to, wrote: true, workStatus: workStatusForDetail(input.to), stage: null };
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
  /** Lane count, the same number the Tasks tab shows. Omit for other activity. */
  tasks?: number;
}): string {
  const when = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(input.at);
  const tasks = input.tasks == null ? '' : ` · ${input.tasks === 1 ? '1 task' : `${input.tasks} tasks`}`;
  return `${input.actor} · ${input.from} → ${input.to}${tasks} · ${when} ET`;
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
 * Tasks that count on the Tasks tab: a parent, or a task whose parent is not
 * in this set. Subtasks nested under a moved parent are not a second lane.
 */
export function movedLaneCount(tasks: readonly MoveTask[], movingIds: readonly string[]): number {
  const moving = new Set(movingIds);
  const ids = new Set(tasks.map((task) => task.id));
  return tasks.filter((task) => moving.has(task.id) && (!task.parentTaskId || !ids.has(task.parentTaskId))).length;
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

/** Clients do not approve or request changes. Peter reviews under the build protocol. */
export function clientReviewDecision(): { ok: false; reason: string } {
  return { ok: false, reason: 'Clients cannot review a milestone' };
}

/** Clients see Creator and Visibility read-only. Approval and Last review stay staff-only. */
export function clientSeesDetailsRow(
  row: 'creator' | 'visibility' | 'approval' | 'review' | 'owner' | 'due' | 'created' | 'project' | 'status' | 'stage',
  staff: boolean,
): boolean {
  if (row === 'approval' || row === 'review') return staff;
  return true;
}

/** A real calendar day. Rejects 2026-02-31 and any other shape. */
export function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** Nov 20, 2026. Null when the stored day is missing or not a calendar day. */
export function formatDueDate(value: string | null | undefined): string | null {
  if (!value || !isCalendarDate(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year!, month! - 1, day!)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Owner saves on pick. The same person, or clearing an empty owner, writes nothing. */
export function ownerChangeDecision(input: {
  from: string | null;
  to: string | null;
  allowed: boolean;
}):
  | { ok: true; wrote: false }
  | { ok: true; wrote: true; ownerContactId: string | null }
  | { ok: false; reason: string } {
  if (input.to && !input.allowed) return { ok: false, reason: 'Choose a person on this client' };
  if ((input.from ?? null) === (input.to ?? null)) return { ok: true, wrote: false };
  return { ok: true, wrote: true, ownerContactId: input.to };
}

/** Due date saves on pick. The same day, or clearing an empty date, writes nothing. */
export function dueDateChangeDecision(input: {
  from: string | null;
  to: string | null;
}):
  | { ok: true; wrote: false }
  | { ok: true; wrote: true; dueDate: string | null }
  | { ok: false; reason: string } {
  if (input.to && !isCalendarDate(input.to)) return { ok: false, reason: 'Choose a real date' };
  if ((input.from ?? null) === (input.to ?? null)) return { ok: true, wrote: false };
  return { ok: true, wrote: true, dueDate: input.to };
}
