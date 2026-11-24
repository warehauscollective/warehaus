export function projectMoveCopy(taskName: string, fromName: string, toName: string): string {
  return `“${taskName}” moves from ${fromName} to ${toName}. Visibility doesn’t change.`;
}

/** What a task change returns (convex/_lib/taskChange.ts), as the UI reads it. */
export type TaskChangeOutcome =
  | { ok: true; wrote: boolean; notion: 'queued' | 'portal' | 'off' }
  | { ok: false; error: string };

/**
 * The one note for every task field save (ADR-0003). The value is already
 * saved when this runs, so the note only says where it went.
 */
export function taskChangeNote(result: TaskChangeOutcome | { ok: boolean; error?: string; wrote?: boolean; notion?: string }): string | null {
  if (!result.ok) return result.error ?? 'Could not save';
  if (!result.wrote) return null;
  if (result.notion === 'queued') return 'Saved · Queued for Notion.';
  if (result.notion === 'off') return 'Saved in the Portal only · Notion write-back is off.';
  return null;
}
