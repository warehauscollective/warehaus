/**
 * Mark complete, Archive and Restore for milestones and tasks. Pure rules.
 *
 * Mark complete is the one path that sets a milestone Shipped while tasks are
 * still open, and only through the leftovers choice. An empty milestone can
 * be completed. The Status menu keeps its gate and points here.
 */

import { closeSourcesForMilestone, type CloseSource, type CloseTask } from './milestoneDetails';

/** Leftovers park here when the project has a milestone with exactly this name. */
export const PARKED_MILESTONE_NAME = 'Parked for later';

export const LEFTOVER_CHOICES = ['done', 'archive', 'park'] as const;
export type LeftoverChoice = (typeof LEFTOVER_CHOICES)[number];

export const ARCHIVE_TASK_CHOICES = ['archive', 'detach'] as const;
export type ArchiveTaskChoice = (typeof ARCHIVE_TASK_CHOICES)[number];

export const LEFTOVERS_NEEDED = 'Choose what happens to the open tasks.';
export const MILESTONE_ARCHIVED = 'This milestone is archived. Restore it first.';
/** A milestone with nothing to check. The Status menu cannot close it. Mark complete can. */
export const SHIPPED_NOTHING_OPEN = 'No open tasks. Use Mark complete to close this milestone.';

/** Open work: not archived, not Parked, not Done. The same test the close gate uses. */
export function isOpenCloseTask(task: CloseTask): boolean {
  if (task.archived === true || task.stage === 'Parked') return false;
  return task.isDone !== true && task.status !== 'Done';
}

/** Open tasks across roadmap rows and their subtasks. */
export function openTaskCount(
  rows: readonly (CloseTask & { children?: readonly CloseTask[] })[],
): number {
  let open = 0;
  for (const row of rows) {
    if (isOpenCloseTask(row)) open += 1;
    for (const child of row.children ?? []) {
      if (isOpenCloseTask(child)) open += 1;
    }
  }
  return open;
}

/** Tasks of any state across roadmap rows and their subtasks, archived ones left out. */
export function listedTaskCount(
  rows: readonly (CloseTask & { children?: readonly CloseTask[] })[],
): number {
  let total = 0;
  for (const row of rows) {
    if (row.archived !== true) total += 1;
    for (const child of row.children ?? []) {
      if (child.archived !== true) total += 1;
    }
  }
  return total;
}

/** The tag on a locked Shipped option. */
export function shippedOpenTag(open: number): string {
  return `${open} OPEN`;
}

/** Why Shipped is locked in the Status menu, and what the server says when it is picked anyway. */
export function shippedLockedReason(open: number): string {
  if (open <= 0) return SHIPPED_NOTHING_OPEN;
  return `${open === 1 ? '1 open task' : `${open} open tasks`}. Use Mark complete to close them out.`;
}

/**
 * The milestone leftovers move to: on this project, named exactly
 * "Parked for later", not archived, not Shipped, and not the one closing.
 * Null means there is none, and leftovers are set Parked where they are.
 */
export function parkedMilestoneTarget<T extends { id: string; name: string; status: string; archived?: boolean }>(
  milestones: readonly T[],
  closingId: string,
): T | null {
  return (
    milestones.find(
      (milestone) =>
        milestone.id !== closingId &&
        milestone.name === PARKED_MILESTONE_NAME &&
        milestone.archived !== true &&
        milestone.status !== 'Shipped',
    ) ?? null
  );
}

export type CloseoutWrite =
  | { id: string; kind: 'done' }
  | { id: string; kind: 'archive' }
  /** Leftover moves to the Parked for later milestone. Its status stays. */
  | { id: string; kind: 'move'; milestoneId: string }
  /** No Parked for later milestone. The task is set Parked where it is. */
  | { id: string; kind: 'park' }
  | { id: string; kind: 'detach' };

/** What a leftovers choice did, for the caller's reply. */
export type LeftoverOutcome = 'done' | 'archived' | 'moved' | 'parked';

/**
 * Mark complete. No open task needs no choice. Open tasks need one, and that
 * choice is the only way past the close gate.
 */
export function planMarkComplete(input: {
  milestoneId: string;
  tasks: readonly CloseSource[];
  leftovers?: LeftoverChoice | null;
  parkedMilestoneId: string | null;
}):
  | { ok: false; reason: string; open: number }
  | { ok: true; open: number; outcome: LeftoverOutcome | null; writes: CloseoutWrite[] } {
  const counted = closeSourcesForMilestone(input.milestoneId, input.tasks);
  const open = counted.filter(isOpenCloseTask);
  if (open.length === 0) return { ok: true, open: 0, outcome: null, writes: [] };
  if (!input.leftovers) return { ok: false, reason: LEFTOVERS_NEEDED, open: open.length };
  if (input.leftovers === 'done') {
    return { ok: true, open: open.length, outcome: 'done', writes: open.map((task) => ({ id: task.id, kind: 'done' })) };
  }
  if (input.leftovers === 'archive') {
    return {
      ok: true,
      open: open.length,
      outcome: 'archived',
      writes: open.map((task) => ({ id: task.id, kind: 'archive' })),
    };
  }
  const target = input.parkedMilestoneId;
  if (!target || target === input.milestoneId) {
    return { ok: true, open: open.length, outcome: 'parked', writes: open.map((task) => ({ id: task.id, kind: 'park' })) };
  }
  // A subtask moves with its parent. An open subtask under a closed parent moves on its own.
  const openIds = new Set(open.map((task) => task.id));
  const roots = open.filter((task) => !task.parentTaskId || !openIds.has(task.parentTaskId));
  const writes: CloseoutWrite[] = [];
  const moved = new Set<string>();
  const move = (id: string) => {
    if (moved.has(id)) return;
    moved.add(id);
    writes.push({ id, kind: 'move', milestoneId: target });
  };
  for (const root of roots) {
    move(root.id);
    for (const child of input.tasks) {
      // A subtask with no link of its own follows its parent without a write.
      if (child.parentTaskId === root.id && child.milestoneId === input.milestoneId) move(child.id);
    }
  }
  return { ok: true, open: open.length, outcome: 'moved', writes };
}

/** Archive a milestone. Open tasks are archived with it, or moved to No milestone. */
export function planArchiveMilestone(input: {
  milestoneId: string;
  tasks: readonly CloseSource[];
  openTasks: ArchiveTaskChoice;
}): { open: number; writes: CloseoutWrite[] } {
  const open = closeSourcesForMilestone(input.milestoneId, input.tasks).filter(isOpenCloseTask);
  if (input.openTasks === 'archive') {
    return { open: open.length, writes: open.map((task) => ({ id: task.id, kind: 'archive' })) };
  }
  // Only a task linked here has a link to clear. An unlinked subtask stays with its parent.
  return {
    open: open.length,
    writes: open.filter((task) => task.milestoneId === input.milestoneId).map((task) => ({ id: task.id, kind: 'detach' })),
  };
}

/** A completed milestone reopens one step back. It is not handed to the runner. */
export const RESTORED_MILESTONE_STATUS = 'Ready to Ship' as const;
/** A Done task reopens as To Do. */
export const RESTORED_TASK_STATUS = 'To Do' as const;

/** Restore shows alone on a completed or archived item. Otherwise Mark complete and Archive. */
export function closeoutMenuItems(state: 'open' | 'complete' | 'archived'): readonly ('complete' | 'archive' | 'restore')[] {
  return state === 'open' ? ['complete', 'archive'] : ['restore'];
}

export function milestoneCloseoutState(milestone: { status: string; archived?: boolean }): 'open' | 'complete' | 'archived' {
  if (milestone.archived) return 'archived';
  return milestone.status === 'Shipped' ? 'complete' : 'open';
}

export function taskCloseoutState(task: { status: string; isDone: boolean; archived?: boolean }): 'open' | 'complete' | 'archived' {
  if (task.archived) return 'archived';
  return task.isDone || task.status === 'Done' ? 'complete' : 'open';
}
