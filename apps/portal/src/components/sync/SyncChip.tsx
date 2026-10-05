import { Pill } from '@/components/ui/primitives';
import { rowSyncChip, rowSyncLabel, type RowSyncState } from '@/lib/data/view-models';

const TONE: Record<RowSyncState, string> = {
  synced: 'var(--success)',
  syncing: 'var(--warn)',
  failed: 'var(--danger)',
};

export function SyncChip({
  notionPageId,
  syncHidden,
  syncState,
  onRetry,
  retryNote,
}: {
  notionPageId?: string | null;
  syncHidden?: boolean;
  syncState?: RowSyncState | null;
  onRetry?: () => void;
  retryNote?: string | null;
}) {
  const row = { notionPageId, syncHidden, syncState };
  const state = rowSyncChip(row);
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Pill color={TONE[state]}>{rowSyncLabel(row)}</Pill>
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
