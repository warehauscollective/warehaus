/**
 * Answer and rerun on a Blocked card opens the task modal at the Troubleshoot
 * section. The card names the task here; the section takes it once when it
 * shows, scrolls into view and puts the caret in the answer field.
 */
let wanted: string | null = null;

export function requestTroubleshootFocus(taskId: string) {
  wanted = taskId;
}

/** True once for the task that was asked for. */
export function takeTroubleshootFocus(taskId: string): boolean {
  if (wanted !== taskId) return false;
  wanted = null;
  return true;
}
