/** At most 3 reverts per page per field per hour. Past that, stop and alert staff. */

export const REVERT_LIMIT_PER_HOUR = 3;
export const REVERT_WINDOW_MS = 60 * 60 * 1000;

export function revertAllowed(attemptsInWindow: number): boolean {
  return attemptsInWindow < REVERT_LIMIT_PER_HOUR;
}

export function revertIdempotencyKey(pageId: string, field: string, observedEditedTime: string): string {
  return `revert:${pageId}:${field}:${observedEditedTime}`;
}
