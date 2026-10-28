import { Pill } from '@/components/ui/primitives';
import {
  rowHasSyncFields,
  rowSyncChip,
  rowSyncLabel,
  staffStageNoticeLabel,
  type RowSyncState,
} from '@/lib/data/view-models';

const TONE: Record<RowSyncState, string> = {
  synced: 'var(--success)',
  syncing: 'var(--warn)',
  failed: 'var(--danger)',
};

export function SyncChip({
  notionPageId,
  syncHidden,
  syncState,
  syncNotice,
  onRetry,
  retryNote,
}: {
  notionPageId?: string | null;
  syncHidden?: boolean;
  syncState?: RowSyncState | null;
  syncNotice?: string | null;
  onRetry?: () => void;
  retryNote?: string | null;
}) {
  const row = { notionPageId, syncHidden, syncState };
  const noticeLabel = staffStageNoticeLabel(syncNotice);
  if (!rowHasSyncFields(row) && !noticeLabel) return null;
  const state = rowHasSyncFields(row) ? rowSyncChip(row) : null;
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {state ? <Pill color={TONE[state]}>{rowSyncLabel(row)}</Pill> : null}
      {noticeLabel ? (
        <Pill color="var(--warn)">
          <span title={syncNotice ?? undefined}>{noticeLabel}</span>
        </Pill>
      ) : null}
      {state === 'failed' && onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="ds-mono"
          style={{
            fontSize: 'var(--t-xs)',
            color: 'var(--danger)',
            background: 'none',
            border: 0,
            cursor: 'pointer',
            textDecoration: 'underline',
          }}
        >
          Retry
        </button>
      ) : null}
      {retryNote ? (
        <span style={{ fontSize: 'var(--t-xs)', color: 'var(--danger)' }}>{retryNote}</span>
      ) : null}
    </span>
  );
}

export function PublishChip({ published }: { published: boolean }) {
  return (
    <Pill color={published ? 'var(--success)' : 'var(--warn)'}>
      {published ? 'Published' : 'Not published'}
    </Pill>
  );
}
