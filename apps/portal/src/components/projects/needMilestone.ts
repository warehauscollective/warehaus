/** Middle dot in "Done · N". U+00B7, with a space on each side. */
export const DONE_GROUP_DOT = '\u00B7';

export function doneGroupLabel(count: number): string {
  return `Done ${DONE_GROUP_DOT} ${count}`;
}

export function needMilestoneCopy(count: number): string {
  return count === 1 ? '1 task needs a milestone' : `${count} tasks need a milestone`;
}

export type NeedMilestoneTask = {
  id: string;
  status: string;
  isDone: boolean;
  parentTaskId?: string | null;
  milestoneId?: string | null;
  archivedAt?: number | null;
};

const CLOSED_STATUS = new Set(['done', 'parked']);

/** Done, Parked, or an explicit isDone flag. Open work is everything else. */
export function isClosedMilestoneTask(task: { status: string; isDone: boolean }): boolean {
  if (task.isDone) return true;
  return CLOSED_STATUS.has(task.status.trim().toLowerCase());
}

/**
 * Open, top-level, non-archived tasks in this project that have no milestone
 * of this project. A milestone that belongs to another project does not count.
 */
export function taskNeedsProjectMilestone(
  task: NeedMilestoneTask,
  projectMilestoneIds: ReadonlySet<string>,
  attachedTaskIds?: ReadonlySet<string>,
): boolean {
  if (task.parentTaskId) return false;
  if (task.archivedAt != null) return false;
  if (isClosedMilestoneTask(task)) return false;
  if (attachedTaskIds?.has(task.id)) return false;
  if (task.milestoneId && projectMilestoneIds.has(String(task.milestoneId))) return false;
  return true;
}

export function tasksNeedingMilestone<T extends NeedMilestoneTask>(
  tasks: readonly T[],
  projectMilestoneIds: ReadonlySet<string>,
  attachedTaskIds?: ReadonlySet<string>,
): T[] {
  return tasks.filter((task) => taskNeedsProjectMilestone(task, projectMilestoneIds, attachedTaskIds));
}

/** Top-level milestone rows and the subtasks nested under them. */
export function attachedMilestoneTaskIds(
  milestones: readonly { rows: readonly { id: string; children?: readonly { id: string }[] }[] }[],
): Set<string> {
  const ids = new Set<string>();
  for (const milestone of milestones) {
    for (const row of milestone.rows) {
      ids.add(row.id);
      for (const child of row.children ?? []) ids.add(child.id);
    }
  }
  return ids;
}

/** Hidden takes no slot. Dismissed is the quiet chip. Visible is the banner. */
export function needMilestoneBannerState(count: number, dismissed: boolean): 'hidden' | 'visible' | 'dismissed' {
  if (count <= 0) return 'hidden';
  return dismissed ? 'dismissed' : 'visible';
}

/** sessionStorage key for a dismissed banner. One per project, so each project keeps its own. */
export function needBannerStorageKey(projectId: string): string {
  return `wh:need-milestone-dismissed:${projectId}`;
}

type BannerStorage = Pick<Storage, 'getItem' | 'setItem'>;

function sessionStore(): BannerStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    // Storage is blocked. Dismiss still works for this visit.
    return null;
  }
}

/** True when the banner was dismissed on this project earlier in the session. */
export function readNeedBannerDismissed(projectId: string, storage: BannerStorage | null = sessionStore()): boolean {
  try {
    return storage?.getItem(needBannerStorageKey(projectId)) === '1';
  } catch {
    return false;
  }
}

/** Dismiss lasts for the session: it survives leaving the project and a reload, and ends with the tab. */
export function writeNeedBannerDismissed(projectId: string, storage: BannerStorage | null = sessionStore()): void {
  try {
    storage?.setItem(needBannerStorageKey(projectId), '1');
  } catch {
    // Storage is full or blocked. The banner stays dismissed until the page reloads.
  }
}
