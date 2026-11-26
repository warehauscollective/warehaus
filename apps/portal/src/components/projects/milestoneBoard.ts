import type { MilestoneRoadmapView, RoadmapChild } from '@convex/_lib/milestones';
import { checklistState } from '@convex/_lib/milestoneTasks';
import type { PortalTask } from '@/lib/data/view-models';

/** The milestone board's columns, left to right. No Inbox lane and no Stage mode. */
export const MILESTONE_BOARD_STATUSES = ['To Do', 'In Progress', 'Blocked', 'Done'] as const;
export type MilestoneBoardStatus = (typeof MILESTONE_BOARD_STATUSES)[number];

export const BOARD_INTRO =
  'Tasks come from the brief, review feedback, or a manual add. Review happens on the milestone, never on a task.';
export const BOARD_FOOTER =
  'To Do runs top first. Drag a card to another column to change its status, or within To Do to change the run order.';
export const BOARD_SHIPPED = 'This milestone has shipped. Its task list is closed.';
export const BOARD_SAVE_ERROR = 'Couldn’t save the task list. Nothing changed.';

/**
 * The column a task sits in. Every task lands in one of the four: a status the
 * board has no lane for (Inbox, Not started, Backlog) reads as To Do, and any
 * other started status reads as In Progress.
 */
export function milestoneBoardStatus(task: { status: string; isDone: boolean }): MilestoneBoardStatus {
  const state = checklistState(task);
  if (state === 'done') return 'Done';
  if (state === 'blocked') return 'Blocked';
  if (state === 'todo' || /^inbox$/i.test(task.status.trim())) return 'To Do';
  return 'In Progress';
}

/** Clients never change the board. Nobody changes a Shipped milestone's board. */
export function milestoneBoardReadOnly(input: { staff: boolean; status: string }): boolean {
  return !input.staff || input.status === 'Shipped';
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
      projectId: known?.projectId ?? project.id,
      projectName: known?.projectName ?? project.name,
      projectStatus: known?.projectStatus ?? project.status ?? null,
      projectEndDate: known?.projectEndDate ?? project.endDate ?? null,
    };
  };
  return rows.flatMap((row) => [card(row, null), ...row.children.map((child) => card(child, row.id))]);
}
