/** The dock's resting layer. Centered dialogs start at z-index 80, so this stays under the scrim. */
export const DOCK_Z = 50;
/** Just above the task dialog scrim (80). Search is 90, sheets are 140. */
export const TASK_DIALOG_DOCK_Z = 81;

/**
 * The dock rises only while the task dialog is the only open scrim.
 * A confirm, search, or approval scrim keeps it underneath.
 */
export function dockZForOpenScrims(scrims: readonly { dockLayer?: string | null }[]): number {
  if (scrims.length > 0 && scrims.every((scrim) => scrim.dockLayer === 'task')) return TASK_DIALOG_DOCK_Z;
  return DOCK_Z;
}
