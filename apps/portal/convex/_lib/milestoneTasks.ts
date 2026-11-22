/**
 * Rules for tasks that live on a milestone: where a task came from, who may
 * add, edit, remove and reorder one, and how the project page groups
 * milestones. Pure. No Convex imports, so the portal UI reads the same rules.
 */

import type { MilestoneStatus } from './milestoneStatus';

export const TASK_ORIGINS = ['brief', 'review', 'manual', 'planner'] as const;
export type TaskOrigin = (typeof TASK_ORIGINS)[number];

export const MILESTONE_CREATED_VIA = ['grok', 'claude', 'portal', 'other'] as const;
export type MilestoneCreatedVia = (typeof MILESTONE_CREATED_VIA)[number];

/** `source` on a task the portal created from a review. Never sent to Notion. */
export const PORTAL_REVIEW_TASK_SOURCE = 'portal-review';
/** `source` on a task staff added inside a milestone. Never sent to Notion. */
export const PORTAL_MILESTONE_TASK_SOURCE = 'portal-milestone';

export const MILESTONE_REQUIRED = 'Choose a milestone. A task only exists inside a milestone.';
export const TASK_TITLE_REQUIRED = 'Add a task title.';
export const TASK_TITLE_TOO_LONG = 'Keep the task title under 200 characters.';
export const SHIPPED_TAKES_NO_TASKS = 'This milestone has shipped. Add the task to a new milestone.';
export const TASK_NOT_ON_MILESTONE = 'That task is not on this milestone.';
export const TASK_EDIT_IN_SOURCE = 'This task syncs from Notion. Open the task to edit it.';
export const TASK_STARTED = 'Only a To do task can be changed here.';
export const REORDER_MISMATCH = 'The task list changed. Refresh and try again.';
export const REVIEW_TASK_LIMIT = 20;
export const TOO_MANY_REVIEW_TASKS = `Add up to ${REVIEW_TASK_LIMIT} task lines.`;

const TITLE_LIMIT = 200;
const DETAIL_LIMIT = 4000;

export function isTaskOrigin(value: unknown): value is TaskOrigin {
  return typeof value === 'string' && (TASK_ORIGINS as readonly string[]).includes(value);
}

export function isMilestoneCreatedVia(value: unknown): value is MilestoneCreatedVia {
  return typeof value === 'string' && (MILESTONE_CREATED_VIA as readonly string[]).includes(value);
}

/** A task the portal owns. It has no Notion page, so the portal may edit and delete it. */
export function isPortalOwnedTask(input: { source?: string | null; notionPageId?: string | null }): boolean {
  if (input.source === PORTAL_REVIEW_TASK_SOURCE || input.source === PORTAL_MILESTONE_TASK_SOURCE) return true;
  const page = input.notionPageId ?? '';
  return page.startsWith(`${PORTAL_REVIEW_TASK_SOURCE}:`) || page.startsWith(`${PORTAL_MILESTONE_TASK_SOURCE}:`);
}

/**
 * Where a task came from. Rows written before `origin` existed fall back to
 * their `source`, so a review task reads as review without a backfill.
 */
export function taskOrigin(input: { origin?: string | null; source?: string | null }): TaskOrigin | null {
  if (isTaskOrigin(input.origin)) return input.origin;
  if (input.source === PORTAL_REVIEW_TASK_SOURCE) return 'review';
  if (input.source === PORTAL_MILESTONE_TASK_SOURCE) return 'manual';
  return null;
}

export function originLabel(origin: TaskOrigin | null | undefined, round?: number | null): string | null {
  if (origin === 'brief') return 'Brief';
  if (origin === 'planner') return 'Planner';
  if (origin === 'manual') return 'Manual';
  if (origin === 'review') return round != null && round > 0 ? `Review ${round}` : 'Review';
  return null;
}

export function createdViaLabel(via: string | null | undefined): string | null {
  if (via === 'grok') return 'via Grok Bot';
  if (via === 'claude') return 'via Claude';
  if (via === 'portal') return 'via Portal';
  return null;
}

function cleanTitle(value: string): { ok: true; title: string } | { ok: false; reason: string } {
  const title = value.replace(/\s+/g, ' ').trim();
  if (!title) return { ok: false, reason: TASK_TITLE_REQUIRED };
  if (title.length > TITLE_LIMIT) return { ok: false, reason: TASK_TITLE_TOO_LONG };
  return { ok: true, title };
}

function cleanDetail(value: string | null | undefined): string {
  return (value ?? '').trim().slice(0, DETAIL_LIMIT);
}

/** The task stage a new milestone task starts on. Mirrors the milestone where the board has that lane. */
export function stageForNewMilestoneTask(status: MilestoneStatus): string {
  if (status === 'Idea' || status === 'Planning' || status === 'Awaiting Go' || status === 'Building') return status;
  return 'Building';
}

export function addTaskDecision(input: {
  staff: boolean;
  milestoneStatus: MilestoneStatus;
  title: string;
  detail?: string | null;
}): { ok: true; title: string; detail: string; origin: 'manual'; stage: string } | { ok: false; reason: string } {
  if (!input.staff) return { ok: false, reason: 'Staff role required' };
  if (input.milestoneStatus === 'Shipped') return { ok: false, reason: SHIPPED_TAKES_NO_TASKS };
  const title = cleanTitle(input.title);
  if (!title.ok) return title;
  return {
    ok: true,
    title: title.title,
    detail: cleanDetail(input.detail),
    origin: 'manual',
    stage: stageForNewMilestoneTask(input.milestoneStatus),
  };
}

export const MILESTONE_NOT_ON_PROJECT = 'Milestone is not on this project';

/**
 * Every task-create path asks this. No milestone, a milestone on another
 * project or client, and a Shipped milestone are all refused.
 */
export function taskMilestoneGate(
  milestone: { orgId: string; projectId: string; status: MilestoneStatus } | null | undefined,
  project: { orgId: string; projectId: string },
): { ok: true } | { ok: false; reason: string } {
  if (!milestone) return { ok: false, reason: MILESTONE_REQUIRED };
  if (milestone.orgId !== project.orgId || milestone.projectId !== project.projectId) {
    return { ok: false, reason: MILESTONE_NOT_ON_PROJECT };
  }
  if (milestone.status === 'Shipped') return { ok: false, reason: SHIPPED_TAKES_NO_TASKS };
  return { ok: true };
}

type ChecklistTask = {
  milestoneId?: string | null;
  source?: string | null;
  notionPageId?: string | null;
  status: string;
  isDone: boolean;
};

/**
 * A planner draft still sitting at To do. Regenerate archives these.
 * Hand-added tasks and anything staff have edited stay.
 */
export function plannerDraftToArchive(task: {
  archivedAt?: number | null;
  origin?: string | null;
  source?: string | null;
  notionPageId?: string | null;
  status: string;
  isDone: boolean;
}): boolean {
  return task.archivedAt == null && task.origin === 'planner' && isPortalOwnedTask(task) && isToDoTask(task);
}

/** To do means not done and not started. Notion spells it "To Do" or "Not started". */
export function isToDoTask(task: { status: string; isDone: boolean }): boolean {
  if (task.isDone) return false;
  return /^(to[\s_-]*do|not[\s_-]*started|backlog)$/i.test(task.status.trim());
}

function changeGate(input: { staff: boolean; milestoneId: string; task: ChecklistTask }): string | null {
  if (!input.staff) return 'Staff role required';
  if (input.task.milestoneId !== input.milestoneId) return TASK_NOT_ON_MILESTONE;
  if (!isPortalOwnedTask(input.task)) return TASK_EDIT_IN_SOURCE;
  if (!isToDoTask(input.task)) return TASK_STARTED;
  return null;
}

export function editTaskDecision(input: {
  staff: boolean;
  milestoneId: string;
  task: ChecklistTask & { name: string; description?: string | null };
  title: string;
  detail?: string | null;
}):
  | { ok: true; wrote: false }
  | { ok: true; wrote: true; patch: { name?: string; description?: string } }
  | { ok: false; reason: string } {
  const blocked = changeGate(input);
  if (blocked) return { ok: false, reason: blocked };
  const title = cleanTitle(input.title);
  if (!title.ok) return title;
  const patch: { name?: string; description?: string } = {};
  if (title.title !== input.task.name) patch.name = title.title;
  if (input.detail !== undefined) {
    const detail = cleanDetail(input.detail);
    if (detail !== (input.task.description ?? '')) patch.description = detail;
  }
  if (Object.keys(patch).length === 0) return { ok: true, wrote: false };
  return { ok: true, wrote: true, patch };
}

export function removeTaskDecision(input: {
  staff: boolean;
  milestoneId: string;
  task: ChecklistTask;
}): { ok: true } | { ok: false; reason: string } {
  const blocked = changeGate(input);
  if (blocked) return { ok: false, reason: blocked };
  return { ok: true };
}

/**
 * The new order has to name exactly the tasks on the milestone, once each.
 * Returns only the rows whose order changes, so an unchanged list writes nothing.
 */
export function reorderDecision(input: {
  staff: boolean;
  current: readonly { id: string; milestoneOrder: number | null | undefined }[];
  taskIds: readonly string[];
}): { ok: true; writes: { id: string; milestoneOrder: number }[] } | { ok: false; reason: string } {
  if (!input.staff) return { ok: false, reason: 'Staff role required' };
  const wanted = new Set(input.taskIds);
  if (wanted.size !== input.taskIds.length || wanted.size !== input.current.length) {
    return { ok: false, reason: REORDER_MISMATCH };
  }
  const orders = new Map(input.current.map((row) => [row.id, row.milestoneOrder ?? null] as const));
  for (const id of input.taskIds) {
    if (!orders.has(id)) return { ok: false, reason: REORDER_MISMATCH };
  }
  const writes: { id: string; milestoneOrder: number }[] = [];
  input.taskIds.forEach((id, index) => {
    if (orders.get(id) !== index) writes.push({ id, milestoneOrder: index });
  });
  return { ok: true, writes };
}

/** Task lines typed on a change request. Blank lines are dropped. */
export function reviewTaskLines(
  lines: readonly string[] | null | undefined,
): { ok: true; titles: string[] } | { ok: false; reason: string } {
  const titles: string[] = [];
  for (const line of lines ?? []) {
    const text = line.replace(/\s+/g, ' ').trim();
    if (!text) continue;
    if (text.length > TITLE_LIMIT) return { ok: false, reason: TASK_TITLE_TOO_LONG };
    titles.push(text);
  }
  if (titles.length > REVIEW_TASK_LIMIT) return { ok: false, reason: TOO_MANY_REVIEW_TASKS };
  return { ok: true, titles };
}

export type ChecklistState = 'done' | 'progress' | 'todo' | 'blocked';

export function isBlockedTask(task: { status: string; isDone: boolean }): boolean {
  return !task.isDone && /^blocked$/i.test(task.status.trim());
}

export function checklistState(task: { status: string; isDone: boolean }): ChecklistState {
  if (task.isDone) return 'done';
  if (isBlockedTask(task)) return 'blocked';
  return isToDoTask(task) ? 'todo' : 'progress';
}

/** Status text for a row, with the commit, runner or blocked reason when known. Staff only pass the extras. */
export function checklistDetailText(task: {
  status: string;
  isDone: boolean;
  commit?: string | null;
  runner?: string | null;
  blockedReason?: string | null;
}): string {
  const text = checklistStatusText(task);
  const state = checklistState(task);
  if (state === 'done' && task.commit) return `${text} · ${task.commit}`;
  if (state === 'progress' && task.runner) return `${text} · ${task.runner}`;
  if (state === 'blocked' && task.blockedReason) return `${text} · ${task.blockedReason}`;
  return text;
}

export function checklistStatusText(task: { status: string; isDone: boolean }): string {
  const state = checklistState(task);
  if (state === 'done') return 'Done';
  if (state === 'todo') return 'To do';
  return /in[\s_-]*progress/i.test(task.status) ? 'In progress' : task.status.trim() || 'In progress';
}

export function checklistSummary(tasks: readonly { status: string; isDone: boolean }[]): string {
  const done = tasks.filter((task) => checklistState(task) === 'done').length;
  const progress = tasks.filter((task) => checklistState(task) === 'progress').length;
  const blocked = tasks.filter((task) => checklistState(task) === 'blocked').length;
  return `${done} done · ${progress} in progress${blocked > 0 ? ` · ${blocked} blocked` : ''}`;
}

export type MilestoneGroupId = 'review' | 'progress' | 'shipped';

export const MILESTONE_GROUP_LABEL: Record<MilestoneGroupId, string> = {
  review: 'NEEDS YOUR REVIEW',
  progress: 'IN PROGRESS',
  shipped: 'SHIPPED',
};

/** Review waits on a person: Ready to Ship and not yet approved. Staff only. */
export function milestoneGroup(input: {
  status: MilestoneStatus;
  approval?: string | null;
  staff: boolean;
}): MilestoneGroupId {
  if (input.status === 'Shipped') return 'shipped';
  if (input.staff && input.status === 'Ready to Ship' && input.approval !== 'approved') return 'review';
  return 'progress';
}

/** Groups in display order. Empty groups are left out. Order inside a group is kept. */
export function groupMilestones<T extends { status: MilestoneStatus; approval?: string | null }>(
  milestones: readonly T[],
  staff: boolean,
): { id: MilestoneGroupId; label: string; milestones: T[] }[] {
  const order: MilestoneGroupId[] = ['review', 'progress', 'shipped'];
  return order
    .map((id) => ({
      id,
      label: MILESTONE_GROUP_LABEL[id],
      milestones: milestones.filter(
        (milestone) => milestoneGroup({ status: milestone.status, approval: milestone.approval, staff }) === id,
      ),
    }))
    .filter((group) => group.milestones.length > 0);
}
