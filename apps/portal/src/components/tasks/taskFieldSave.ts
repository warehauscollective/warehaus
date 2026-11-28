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
  /** The live value's key when the attempt began. Absent in fixture previews, where nothing else writes. */
  from?: string | null;
};

export function idleField<T>(): FieldAttempt<T> {
  return { draft: undefined, error: null, pending: undefined };
}

/** Optimistic value. The previous error goes away until this attempt settles. */
export function beginFieldSave<T>(pending: T, from?: string | null): FieldAttempt<T> {
  return { draft: pending, error: null, pending, ...(from !== undefined ? { from } : {}) };
}

/** A failure drops the optimistic value and keeps the attempt for Retry. */
export function finishFieldSave<T>(current: FieldAttempt<T>, ok: boolean): FieldAttempt<T> {
  if (ok) {
    return { draft: current.draft, error: null, pending: undefined, ...(current.from !== undefined ? { from: current.from } : {}) };
  }
  return { draft: undefined, error: FIELD_SAVE_ERROR, pending: current.pending };
}

/** Retry sends the same attempt through the same save. */
export function retryFieldSave<T>(slot: FieldAttempt<T>, save: (pending: T) => void): boolean {
  if (slot.pending === undefined) return false;
  save(slot.pending);
  return true;
}

/**
 * The optimistic value holds only while the live value is still the one the
 * attempt began with. Once the live value changes, by this save or by anyone
 * else, the draft is dropped and the field shows the live value.
 */
export function releaseFieldDraft<T>(slot: FieldAttempt<T>, live: string | null): FieldAttempt<T> {
  if (slot.draft === undefined || slot.from === undefined || slot.from === live) return slot;
  return { ...slot, draft: undefined };
}
