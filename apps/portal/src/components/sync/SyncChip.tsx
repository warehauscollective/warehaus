import { Pill } from '@/components/ui/primitives';
import {
  rowSyncLabel,
  staffStageNoticeLabel,
  syncChipForAudience,
  type RowSyncState,
} from '@/lib/data/view-models';

function pillLabel(row: {
  notionPageId?: string | null;
  syncHidden?: boolean;
  syncState?: RowSyncState | null;
}): string {
  const label = rowSyncLabel(row);
  return label === 'Failed' ? 'Sync problem' : label;
}

export function SyncChip({
  audience,
  notionPageId,
  syncHidden,
  syncState,
  syncNotice,
  onRetry,
  retryNote,
}: {
  audience: 'staff' | 'client';
  notionPageId?: string | null;
  syncHidden?: boolean;
  syncState?: RowSyncState | null;
  syncNotice?: string | null;
  onRetry?: () => void;
  retryNote?: string | null;
}) {
  const row = { notionPageId, syncHidden, syncState };
  const noticeLabel = audience === 'staff' ? staffStageNoticeLabel(syncNotice) : null;
  const state = syncChipForAudience(audience, row);
  if (!state && !noticeLabel) return null;
  const problem = state === 'failed';
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {state ? (
        <span
          className="ds-mono inline-flex items-center gap-1.5 whitespace-nowrap"
          style={{
            border: `1px solid ${problem ? 'var(--danger)' : 'var(--border)'}`,
            borderRadius: 999,
            padding: '4px 10px',
            fontSize: 11,
            color: problem ? 'var(--danger)' : 'var(--muted)',
          }}
        >
          {state === 'synced' ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src="/icons/docs-check.svg" alt="" width={12} height={12} />
          ) : null}
          {problem ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src="/icons/docs-alert.svg" alt="" width={12} height={12} />
          ) : null}
          {pillLabel(row)}
        </span>
      ) : null}
      {noticeLabel ? (
        <Pill color="var(--warn)">
          <span title={syncNotice ?? undefined}>{noticeLabel}</span>
        </Pill>
      ) : null}
      {problem && onRetry ? (
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onRetry();
          }}
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 14,
            fontWeight: 500,
            color: 'var(--muted)',
            background: 'transparent',
            border: 0,
            borderRadius: 9,
            padding: '0.65rem 0.4rem',
            cursor: 'pointer',
          }}
        >
          Retry sync
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
