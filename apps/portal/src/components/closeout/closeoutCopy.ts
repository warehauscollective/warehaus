/**
 * Exact copy for Mark complete, Archive and Restore. Approved 2026-11-22.
 * Apostrophes are typographic (U+2019).
 */

import type { ArchiveTaskChoice, LeftoverChoice } from '@convex/_lib/closeout';

export const MENU_MARK_COMPLETE = 'Mark complete';
export const MENU_ARCHIVE = 'Archive';
export const MENU_RESTORE = 'Restore';
/** Foot hint on an open milestone's menu. */
export const MILESTONE_MENU_HINT = 'Marks this milestone Shipped, even if nothing has been merged.';

export const MARK_COMPLETE_TITLE = 'Mark this milestone complete?';
export const MARK_COMPLETE_EMPTY_BODY =
  'No tasks in this milestone. It will be marked Shipped. You can do this even if nothing has been merged.';
export const MARK_COMPLETE_BODY =
  'This milestone will be marked Shipped. You can do this even if nothing has been merged.';
export const LEFTOVERS_LABEL = 'What should happen to those leftovers?';

export function markCompleteOpenBody(open: number): string {
  if (open === 1) {
    return '1 open task is still on this milestone. It will be marked Shipped even if it isn’t merged.';
  }
  return `${open} open tasks are still on this milestone. It will be marked Shipped even if they aren’t merged.`;
}

/**
 * The third option names the milestone only when the project has one called
 * "Parked for later". Otherwise the tasks are set Parked where they are.
 */
export function leftoverOptions(parkedMilestone: boolean): readonly { value: LeftoverChoice; label: string }[] {
  return [
    { value: 'done', label: 'Mark them Done' },
    { value: 'archive', label: 'Archive them' },
    { value: 'park', label: parkedMilestone ? 'Move them to Parked for later' : 'Park them' },
  ];
}

export const ARCHIVE_TASK_TITLE = 'Archive this task?';
export const ARCHIVE_MILESTONE_TITLE = 'Archive this milestone?';
export const ARCHIVE_BODY = 'It will be hidden from the board and lists, not deleted. You can restore it from Archived.';
export const ARCHIVE_TASKS_LABEL = 'What should happen to its open tasks?';
export const ARCHIVE_TASK_OPTIONS: readonly { value: ArchiveTaskChoice; label: string }[] = [
  { value: 'archive', label: 'Archive them too' },
  { value: 'detach', label: 'Move them to No milestone' },
];

export const CONFIRM_CANCEL = 'Cancel';

export const TOAST_TASK_DONE = 'Task marked Done';
export const TOAST_MILESTONE_DONE = 'Milestone marked complete';
export const TOAST_MILESTONE_ARCHIVED = 'Milestone archived';
export const TOAST_TASK_ARCHIVED = 'Task archived';
export const TOAST_MILESTONE_RESTORED = 'Milestone restored';
export const TOAST_TASK_RESTORED = 'Task restored';

export const ARCHIVED_CHIP = 'Archived';
/** Opacity of an archived milestone or task in the Archived view. */
export const ARCHIVED_OPACITY = 0.55;

export const CLOSEOUT_SAVE_ERROR = 'Couldn’t save. Nothing changed.';

export type ConfirmKind = 'mark-complete-empty' | 'mark-complete' | 'mark-complete-open' | 'archive-milestone' | 'archive';

/** Which Mark complete confirm a milestone gets: no tasks, tasks but none open, or leftovers to choose for. */
export function markCompleteKind(input: { total: number; open: number }): ConfirmKind {
  if (input.open > 0) return 'mark-complete-open';
  return input.total === 0 ? 'mark-complete-empty' : 'mark-complete';
}
