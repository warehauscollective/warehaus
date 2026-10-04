/**
 * Bookkeeping retention for Notion webhook `syncEvents` rows.
 * Only processed rows are eligible. Business tables are never in this set.
 */

export const SYNC_EVENT_TABLE = 'syncEvents' as const;

/** Processed webhook rows older than this may be deleted. */
export const SYNC_EVENT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export type SyncEventStatus = 'queued' | 'done' | 'error';

export type SyncEventRetentionRow = {
  status: SyncEventStatus;
  receivedAt: number;
  processedAt?: number;
};

export function processedSyncEventPatch(
  status: 'done' | 'error',
  nowMs: number,
  error?: string,
): { status: 'done' | 'error'; processedAt: number; error?: string } {
  if (error === undefined) return { status, processedAt: nowMs };
  return { status, processedAt: nowMs, error };
}

/**
 * True only for terminal webhook bookkeeping (done or error) whose
 * processedAt is at least 30 days ago. Queued rows are never eligible,
 * even if they were received long ago.
 */
export function isExpiredProcessedSyncEvent(
  row: SyncEventRetentionRow,
  nowMs: number,
): boolean {
  if (row.status !== 'done' && row.status !== 'error') return false;
  if (row.processedAt == null) return false;
  return row.processedAt <= nowMs - SYNC_EVENT_RETENTION_MS;
}
