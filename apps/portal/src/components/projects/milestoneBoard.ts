import type { Id } from '@convex/_generated/dataModel';
import type { MilestoneRoadmapView, RoadmapChild } from '@convex/_lib/milestones';
import { milestoneTaskState, originLabel, RUN_ORDER_LOCKED, runOrderLocked } from '@convex/_lib/milestoneTasks';
import type { PortalTask } from '@/lib/data/view-models';

/** The milestone board's columns, left to right. No Inbox lane and no Stage mode. */
export const MILESTONE_BOARD_STATUSES = ['To Do', 'In Progress', 'Blocked', 'Done'] as const;
export type MilestoneBoardStatus = (typeof MILESTONE_BOARD_STATUSES)[number];

export const BOARD_INTRO =
  'Tasks come from the brief, review feedback, or a manual add. Review happens on the milestone, never on a task.';
export const BOARD_FOOTER =
  'To Do runs top first. Drag a card to another column to change its status, or within To Do to change the run order.';
export const BOARD_BUILDING = `${RUN_ORDER_LOCKED} Cards can still move between columns.`;
export const ORDER_LOCKED = 'Order locked';
/** The column whose order is the run order. */
export const RUN_ORDER_STATUS: MilestoneBoardStatus = 'To Do';
/** 390 copy. The context card stands in for the intro panel, and the footer names press and hold. */
export const BOARD_INTRO_PHONE = 'From the brief, review feedback, or a manual add.';
export const BOARD_CLIENT_PHONE = 'Open a task to see its details.';
export const BOARD_FOOTER_PHONE = 'To Do runs top first. Press and hold a card to move it.';
export const BOARD_SWIPE = 'Swipe to see statuses';
/** The column that asks what the task is waiting on before a card lands in it. */
export const WAITING_STATUS: MilestoneBoardStatus = 'Blocked';
/** The Blocked prompt. The answer is saved as the task's next action, with the move. */
export const BLOCKED_ASK = {
  title: 'Move to Blocked',
  body: (taskName: string) => `What is “${taskName}” waiting on? It is saved as the task’s next action.`,
  label: 'Waiting on',
  placeholder: 'Who or what it is waiting on',
  required: 'Say what it is waiting on.',
  submit: 'Move to Blocked',
} as const;
export const BOARD_SHIPPED = 'This milestone has shipped. Its task list is closed.';
export const BOARD_SAVE_ERROR = 'Couldn’t save the task list. Nothing changed.';

/** The four task writes on a milestone. The live page passes Convex mutations. Fixture previews pass none. */
export type MilestoneTaskActions = {
  addTask: (args: { hostSlug?: string; milestoneId: Id<'milestones'>; title: string; detail?: string }) => Promise<unknown>;
  editTask: (args: {
    hostSlug?: string;
    milestoneId: Id<'milestones'>;
    taskId: Id<'tasks'>;
    title: string;
    detail?: string;
  }) => Promise<unknown>;
  removeTask: (args: { hostSlug?: string; milestoneId: Id<'milestones'>; taskId: Id<'tasks'> }) => Promise<unknown>;
  reorderTasks: (args: { hostSlug?: string; milestoneId: Id<'milestones'>; taskIds: Id<'tasks'>[] }) => Promise<unknown>;
};

/**
 * The column a task sits in. Every task lands in one of the four: a status the
 * board has no lane for (Inbox, Not started, Backlog) reads as To Do, and any
 * other started status reads as In Progress.
 */
export function milestoneBoardStatus(task: { status: string; isDone: boolean }): MilestoneBoardStatus {
  const state = milestoneTaskState(task);
  if (state === 'done') return 'Done';
  if (state === 'blocked') return 'Blocked';
  if (state === 'todo' || /^inbox$/i.test(task.status.trim())) return 'To Do';
  return 'In Progress';
}

/** Clients never change the board. Nobody changes a Shipped milestone's board. */
export function milestoneBoardReadOnly(input: { staff: boolean; status: string }): boolean {
  return !input.staff || input.status === 'Shipped';
}

/** The 390 context card's title: top-level tasks and how many are done. */
export function boardSummary(rows: readonly { isDone: boolean }[]): string {
  const done = rows.filter((row) => row.isDone).length;
  return `${rows.length} ${rows.length === 1 ? 'task' : 'tasks'} · ${done} complete`;
}

/** The line under the board, staff only. A phone names press and hold in place of drag. */
export function boardFooter(input: { status: Parameters<typeof runOrderLocked>[0]; phone: boolean }): string {
  if (input.status === 'Shipped') return BOARD_SHIPPED;
  if (runOrderLocked(input.status)) return BOARD_BUILDING;
  return input.phone ? BOARD_FOOTER_PHONE : BOARD_FOOTER;
}

type BoardProject = { id: string; name: string; status?: string | null; endDate?: string | null };

/**
 * One card per milestone row, in the milestone's order. A subtask follows its
 * row with `parentTaskId` set, so it counts on the parent card and is not a
 * card of its own. A task that exists only on the milestone has no project
 * task behind it and is built from the row alone.
 */
export function milestoneBoardCards(
  rows: MilestoneRoadmapView['rows'],
  tasks: readonly PortalTask[],
  project: BoardProject,
): PortalTask[] {
  const live = new Map(tasks.map((task) => [task.id, task] as const));
  const card = (row: RoadmapChild, parentTaskId: string | null): PortalTask => {
    const known = live.get(row.id);
    return {
      ...known,
      id: row.id,
      name: row.name,
      status: milestoneBoardStatus(row),
      isDone: row.isDone,
      date: known?.date ?? null,
      // Status columns only. The card carries no stage chip.
      stage: null,
      stagePending: false,
      parentTaskId,
      resourceCount: row.resourceCount,
      nextAction: row.nextAction ?? null,
      // The row's link is staff only and already checked. A client row has none.
      pullRequestUrl: row.pullRequestUrl ?? null,
      projectId: known?.projectId ?? project.id,
      projectName: known?.projectName ?? project.name,
      projectStatus: known?.projectStatus ?? project.status ?? null,
      projectEndDate: known?.projectEndDate ?? project.endDate ?? null,
    };
  };
  return rows.flatMap((row) => [card(row, null), ...row.children.map((child) => card(child, row.id))]);
}

/**
 * The origin badge for each top-level row: Brief, Planner, Manual or Review N.
 * Staff only. A client row carries no origin, so a client gets no badges.
 */
export function milestoneCardOrigins(rows: MilestoneRoadmapView['rows']): Map<string, string> {
  const origins = new Map<string, string>();
  for (const row of rows) {
    const label = originLabel(row.origin, row.round);
    if (label) origins.set(row.id, label);
  }
  return origins;
}

/** The PR chip's text: `PR #184` when the link names a pull request number, else `PR`. */
export function pullRequestChip(url: string | null | undefined): string | null {
  if (!url) return null;
  const number = /\/pulls?\/(\d+)(?:[/?#]|$)/.exec(url)?.[1];
  return number ? `PR #${number}` : 'PR';
}

/**
 * The task a card opens in the task modal. A task the page already holds opens
 * as that task. A task that exists only on the milestone is built from its
 * row: name, the row's own status, detail, source, pull request and resource
 * count, on this project and this milestone. Null when no row has the id.
 */
export function milestoneTaskToOpen(input: {
  taskId: string;
  milestone: Pick<MilestoneRoadmapView, 'id' | 'rows'>;
  tasks: readonly PortalTask[];
  project: BoardProject;
}): PortalTask | null {
  const { taskId, milestone, tasks, project } = input;
  const known = tasks.find((task) => task.id === taskId);
  const parent = milestone.rows.find((row) => row.id === taskId || row.children.some((child) => child.id === taskId));
  if (!parent) return known ?? null;
  const row: RoadmapChild = parent.id === taskId ? parent : parent.children.find((child) => child.id === taskId)!;
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    isDone: row.isDone,
    date: null,
    stage: row.stage,
    parentTaskId: row === parent ? null : parent.id,
    resourceCount: row.resourceCount,
    projectId: project.id,
    projectName: project.name,
    projectStatus: project.status ?? null,
    projectEndDate: project.endDate ?? null,
    ...(row.onMilestone === false ? {} : { milestoneId: milestone.id }),
    ...(row.detail ? { description: row.detail } : {}),
    ...(row.source ? { source: row.source } : {}),
    ...(row.pullRequestUrl ? { pullRequestUrl: row.pullRequestUrl } : {}),
    // What the page holds for the task is newer than the row and wins.
    ...known,
  };
}

/**
 * The nested child tasks of the row a card opens, built the same way as the
 * task itself. The task modal lists them under the parent, including children
 * the page's own task list does not hold. Empty for a child or an unknown id.
 */
export function milestoneNestedToOpen(input: Parameters<typeof milestoneTaskToOpen>[0]): PortalTask[] {
  const row = input.milestone.rows.find((item) => item.id === input.taskId);
  return (row?.children ?? []).flatMap((child) => {
    const task = milestoneTaskToOpen({ ...input, taskId: child.id });
    // A child the page files under another parent stays there.
    return task && task.parentTaskId === input.taskId ? [task] : [];
  });
}

/**
 * The milestone's full task order after To Do is reordered. Each To Do row's
 * place takes the next id from the new To Do order. Every other row keeps its
 * place, so the saved order still names every row once. Null when the new
 * order does not name exactly the To Do rows.
 */
export function runOrderAfterReorder(
  rows: readonly { id: string; status: string; isDone: boolean }[],
  toDoIds: readonly string[],
): string[] | null {
  const toDo = rows.filter((row) => milestoneBoardStatus(row) === RUN_ORDER_STATUS);
  const wanted = new Set(toDoIds);
  if (wanted.size !== toDoIds.length || wanted.size !== toDo.length || toDo.some((row) => !wanted.has(row.id))) return null;
  let next = 0;
  return rows.map((row) => (milestoneBoardStatus(row) === RUN_ORDER_STATUS ? toDoIds[next++]! : row.id));
}
