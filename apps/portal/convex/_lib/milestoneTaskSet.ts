/**
 * The milestone task set (see GLOSSARY.md): the tasks a milestone is judged
 * by. Every question about a milestone's tasks is asked here: whether it is
 * done, whether it can ship, what is open, what waits on a person, and what a
 * runner may take next.
 *
 * The set is the same rows the roadmap shows: each task linked to the
 * milestone whose parent is not also linked, plus that row's subtasks that
 * have no milestone or are linked here. A subtask linked to another milestone
 * stays out. Archived tasks are not in the set.
 *
 * Each task in the set is exactly one of parked (Stage is Parked, whatever
 * its status says), done (`isDone`, or status Done), or open.
 *
 * Two reads. `loadMilestoneTaskSet` reads the whole set, subtasks included,
 * and answers every question. `loadClaimableTasks` reads only the tasks
 * linked to the milestone, for the runner's claim, and answers only what a
 * runner may take. A partial read cannot answer "done".
 */

import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import { isPortalOwnedTask, isToDoTask } from './milestoneTasks';

/** Most tasks one read looks at. Over it, the read refuses instead of reading part of the set. */
export const MILESTONE_TASK_SET_CAP = 200;
export const TOO_MANY_TASKS = 'This milestone has too many tasks to close at once.';
export const SHIP_NEEDS_A_TASK = 'Shipped needs at least one task that is not Parked.';
export const SHIP_NEEDS_DONE = 'Shipped needs every task that is not Parked to be Done.';

/** What the classifier needs to know about a task. */
export type TaskSetRow = {
  id: string;
  parentTaskId?: string | null;
  milestoneId?: string | null;
  stage?: string | null;
  status?: string | null;
  isDone?: boolean;
  archived?: boolean;
  source?: string | null;
  notionPageId?: string | null;
};

export type TaskState = 'parked' | 'done' | 'open';

export type ShipDecision = { ok: true } | { ok: false; reason: string; open: number };

export type MilestoneTaskSet<T extends TaskSetRow> = {
  /** Every task in the set, in roadmap order: each row, then its subtasks. */
  tasks: T[];
  open: T[];
  done: T[];
  parked: T[];
  /** Open tasks a runner never takes (subtasks, or tasks that sync from Notion). The milestone waits on a person. */
  waitingOnPerson: T[];
  /** At least one task is not Parked, and every such task is done. */
  allDone: boolean;
  /** Whether staff, a merge or the staff API may set Shipped. */
  canShip: ShipDecision;
};

export function taskState(task: Pick<TaskSetRow, 'stage' | 'status' | 'isDone'>): TaskState {
  if (task.stage === 'Parked') return 'parked';
  if (task.isDone === true || task.status === 'Done') return 'done';
  return 'open';
}

/** Open work: not archived, not Parked, not done. */
export function isOpenTask(task: Pick<TaskSetRow, 'stage' | 'status' | 'isDone' | 'archived'>): boolean {
  return task.archived !== true && taskState(task) === 'open';
}

/** Which tasks belong to the milestone's set, in roadmap order. Archived tasks are left out. */
function membersOf<T extends TaskSetRow>(milestoneId: string, rows: readonly T[]): T[] {
  const linked = new Set(rows.filter((task) => task.milestoneId === milestoneId).map((task) => task.id));
  const parents = rows.filter((task) => linked.has(task.id) && (!task.parentTaskId || !linked.has(task.parentTaskId)));
  const members: T[] = [];
  const seen = new Set<string>();
  const push = (task: T) => {
    if (task.archived === true || seen.has(task.id)) return;
    seen.add(task.id);
    members.push(task);
  };
  for (const parent of parents) {
    push(parent);
    for (const child of rows) {
      if (child.parentTaskId !== parent.id) continue;
      if (child.milestoneId && child.milestoneId !== milestoneId) continue;
      push(child);
    }
  }
  return members;
}

function shipDecision(counted: number, open: number): ShipDecision {
  if (counted === 0) return { ok: false, reason: SHIP_NEEDS_A_TASK, open };
  if (open > 0) return { ok: false, reason: SHIP_NEEDS_DONE, open };
  return { ok: true };
}

/** Classify every task in the milestone's set once. Pure. */
export function classifyMilestoneTasks<T extends TaskSetRow>(milestoneId: string, rows: readonly T[]): MilestoneTaskSet<T> {
  const tasks = membersOf(milestoneId, rows);
  const open: T[] = [];
  const done: T[] = [];
  const parked: T[] = [];
  for (const task of tasks) {
    const state = taskState(task);
    if (state === 'open') open.push(task);
    else if (state === 'done') done.push(task);
    else parked.push(task);
  }
  const waitingOnPerson = open.filter((task) => Boolean(task.parentTaskId) || !isPortalOwnedTask(task));
  const counted = open.length + done.length;
  return {
    tasks,
    open,
    done,
    parked,
    waitingOnPerson,
    allDone: counted > 0 && open.length === 0,
    canShip: shipDecision(counted, open.length),
  };
}

/**
 * Whether Shipped unlocks for roadmap rows already cut to the set (each row
 * and its subtasks). The same rule as `canShip`.
 */
export function canShipRows(rows: readonly (TaskSetRow & { children?: readonly TaskSetRow[] })[]): ShipDecision {
  let counted = 0;
  let open = 0;
  for (const task of rows.flatMap((row) => [row, ...(row.children ?? [])])) {
    if (task.archived === true) continue;
    const state = taskState(task);
    if (state === 'parked') continue;
    counted += 1;
    if (state === 'open') open += 1;
  }
  return shipDecision(counted, open);
}

/** A task the runner's claim looks at. */
export type ClaimRow = TaskSetRow & {
  status: string;
  isDone: boolean;
  claimedBy?: string | null;
  milestoneOrder?: number | null;
};

export type ClaimableTasks<T extends ClaimRow> = {
  /** The task a Claude Code run takes next: lowest order, To do, unclaimed, top level, not Parked, portal owned. */
  nextClaimable: T | null;
  /** What a Cursor build works on: top level, portal owned, not Parked, To do or In Progress. In order. */
  openBuild: T[];
};

function byOrder(a: ClaimRow, b: ClaimRow): number {
  return (a.milestoneOrder ?? Number.MAX_SAFE_INTEGER) - (b.milestoneOrder ?? Number.MAX_SAFE_INTEGER);
}

/**
 * What a runner may take from the tasks linked to a milestone. A subtask is
 * never taken, and a task that syncs from Notion is left for a person,
 * because a status written here would be overwritten by the next pull. Pure.
 */
export function classifyClaimable<T extends ClaimRow>(rows: readonly T[]): ClaimableTasks<T> {
  const buildable = rows.filter(
    (task) =>
      task.archived !== true &&
      !task.parentTaskId &&
      taskState(task) === 'open' &&
      isPortalOwnedTask(task),
  );
  const nextClaimable = buildable.filter((task) => !task.claimedBy && isToDoTask(task)).sort(byOrder)[0] ?? null;
  const openBuild = buildable.filter((task) => isToDoTask(task) || task.status === 'In Progress').sort(byOrder);
  return { nextClaimable, openBuild };
}

/** A loaded task: the classifier's fields plus the stored row. */
export type LoadedTask = ClaimRow & { doc: Doc<'tasks'> };

export function loadedTask(doc: Doc<'tasks'>): LoadedTask {
  return {
    id: doc._id,
    parentTaskId: doc.parentTaskId ?? null,
    milestoneId: doc.milestoneId ?? null,
    stage: doc.stage ?? null,
    status: doc.status,
    isDone: doc.isDone,
    archived: doc.archivedAt != null,
    source: doc.source ?? null,
    notionPageId: doc.notionPageId ?? null,
    claimedBy: doc.claimedBy ?? null,
    milestoneOrder: doc.milestoneOrder ?? null,
    doc,
  };
}

type MilestoneRef = { _id: Id<'milestones'>; orgId: Id<'clients'> };
type TooMany = { ok: false; reason: string; open?: undefined };

async function linkedDocs(ctx: QueryCtx | MutationCtx, milestone: MilestoneRef) {
  return ctx.db
    .query('tasks')
    .withIndex('by_orgId_milestoneId', (q) => q.eq('orgId', milestone.orgId).eq('milestoneId', milestone._id))
    .take(MILESTONE_TASK_SET_CAP + 1);
}

/**
 * The whole set: an indexed read of the linked tasks, then the subtasks of
 * each row. Bounded. Over the cap it refuses, and no caller decides from part
 * of the set. `docs` is every row read, archived ones included, for a write
 * that needs them (Restore).
 */
export async function loadMilestoneTaskSet(
  ctx: QueryCtx | MutationCtx,
  milestone: MilestoneRef,
): Promise<{ ok: true; set: MilestoneTaskSet<LoadedTask>; docs: Doc<'tasks'>[] } | TooMany> {
  const linked = await linkedDocs(ctx, milestone);
  if (linked.length > MILESTONE_TASK_SET_CAP) return { ok: false, reason: TOO_MANY_TASKS };
  const byId = new Map<string, Doc<'tasks'>>();
  for (const row of linked) byId.set(row._id, row);
  const linkedIds = new Set(linked.map((row) => row._id as string));
  const parents = linked.filter((row) => !row.parentTaskId || !linkedIds.has(row.parentTaskId));
  for (const parent of parents) {
    const children = await ctx.db
      .query('tasks')
      .withIndex('by_parentTaskId', (q) => q.eq('parentTaskId', parent._id))
      .take(MILESTONE_TASK_SET_CAP + 1);
    if (children.length > MILESTONE_TASK_SET_CAP) return { ok: false, reason: TOO_MANY_TASKS };
    for (const child of children) {
      if (child.orgId !== milestone.orgId) continue;
      if (!byId.has(child._id)) byId.set(child._id, child);
    }
    if (byId.size > MILESTONE_TASK_SET_CAP) return { ok: false, reason: TOO_MANY_TASKS };
  }
  const docs = [...byId.values()];
  return { ok: true, set: classifyMilestoneTasks(milestone._id, docs.map(loadedTask)), docs };
}

/**
 * The runner's claim: the tasks linked to the milestone only, no subtask
 * reads. It answers what a runner may take, never whether the milestone is
 * done. Over the cap it refuses.
 */
export async function loadClaimableTasks(
  ctx: QueryCtx | MutationCtx,
  milestone: MilestoneRef,
): Promise<({ ok: true } & ClaimableTasks<LoadedTask>) | TooMany> {
  const linked = await linkedDocs(ctx, milestone);
  if (linked.length > MILESTONE_TASK_SET_CAP) return { ok: false, reason: TOO_MANY_TASKS };
  return { ok: true, ...classifyClaimable(linked.map(loadedTask)) };
}
