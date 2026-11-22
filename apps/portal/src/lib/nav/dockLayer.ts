/** The dock's resting layer. Centered dialogs start at z-index 80, so this stays under the scrim. */
export const DOCK_Z = 50;
/** Just above the task dialog scrim (80). Search is 90, sheets are 140. */
export const TASK_DIALOG_DOCK_Z = 81;

/**
 * Centered task dialog only. The dock is 82px with a 12px gap, mirrored
 * above and below so the panel stays centered and clear of the dock.
 * On a 900px viewport that is a 712px panel with 94px above and below.
 */
export const TASK_DIALOG_MAX_HEIGHT =
  'calc(100dvh - 2 * (82px + 12px + env(safe-area-inset-bottom, 0px)))';

export function centeredTaskPanelHeight(viewportPx: number, safeAreaPx = 0): number {
  return viewportPx - 2 * (82 + 12 + safeAreaPx);
}

/** Search asked the task dialog to close before the search overlay opens. */
export const CLOSE_TASK_FOR_SEARCH = 'wh-close-task-dialog';

export function taskDialogIsOpen(
  doc: { querySelector: (selector: string) => unknown } | null = typeof document === 'undefined' ? null : document,
): boolean {
  return doc?.querySelector('[data-testid="task-detail"]') != null;
}

/** Search replaces the task dialog. Close first, then open search. */
export function openSearchFromDock(input: {
  taskOpen: boolean;
  closeTask: () => void;
  openSearch: () => void;
}): void {
  if (input.taskOpen) input.closeTask();
  input.openSearch();
}

/**
 * Where a task URL should go when search replaces the dialog.
 * A task opened on the project page (no /tasks path) stays put and only clears its id.
 */
export function leaveTaskForSearch(input: {
  pathname: string;
  search: string;
  projectId: string | null;
}): string | null {
  const params = new URLSearchParams(input.search.replace(/^\?/, ''));
  if (!input.pathname.startsWith('/tasks/') && !params.has('task')) return null;
  return input.projectId ? `/projects/${input.projectId}` : '/projects';
}

/**
 * The dock rises only while the task dialog is the only open scrim.
 * A confirm, search, or approval scrim keeps it underneath.
 */
export function dockZForOpenScrims(scrims: readonly { dockLayer?: string | null }[]): number {
  if (scrims.length > 0 && scrims.every((scrim) => scrim.dockLayer === 'task')) return TASK_DIALOG_DOCK_Z;
  return DOCK_Z;
}
