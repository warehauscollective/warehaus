/** Shown under Assignee, Due date, and Project when the save does not stick. */
export const FIELD_SAVE_ERROR = "Couldn't save.";

/**
 * `draft` and `pending` use undefined for "nothing in flight".
 * Null is a real value: an unassigned person or a cleared date.
 */
export type FieldAttempt<T> = {
  draft: T | undefined;
  error: string | null;
  pending: T | undefined;
};

export function idleField<T>(): FieldAttempt<T> {
  return { draft: undefined, error: null, pending: undefined };
}

/** Optimistic value. The previous error goes away until this attempt settles. */
export function beginFieldSave<T>(pending: T): FieldAttempt<T> {
  return { draft: pending, error: null, pending };
}

/** A failure drops the optimistic value and keeps the attempt for Retry. */
export function finishFieldSave<T>(current: FieldAttempt<T>, ok: boolean): FieldAttempt<T> {
  if (ok) return { draft: current.draft, error: null, pending: undefined };
  return { draft: undefined, error: FIELD_SAVE_ERROR, pending: current.pending };
}

/** Retry sends the same attempt through the same save. */
export function retryFieldSave<T>(slot: FieldAttempt<T>, save: (pending: T) => void): boolean {
  if (slot.pending === undefined) return false;
  save(slot.pending);
  return true;
}
