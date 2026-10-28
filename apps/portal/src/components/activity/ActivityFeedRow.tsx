'use client';

import type { PortalActivity } from '@/lib/data/view-models';

function formatAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const minutes = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

/**
 * Activity row from Figma 296:16492. Icon tile, title, meta, publish mark, time.
 */
export function ActivityFeedRow({
  item,
  onOpen,
}: {
  item: PortalActivity;
  onOpen?: () => void;
}) {
  const published = item.type === 'project' || item.type === 'task';
  const body = (
    <>
      <span
        className="flex shrink-0 items-center justify-center overflow-hidden"
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          background: 'var(--surface-2, var(--bg))',
          border: '1px solid var(--border)',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt="" src="/icons/activity-row.svg" width={16} height={16} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate" style={{ fontSize: 16, fontWeight: 500, color: 'var(--fg)' }}>
          {item.name}
        </span>
        <span
          className="ds-mono block truncate"
          style={{ fontSize: 12, lineHeight: '18px', color: 'var(--muted)', marginTop: 4 }}
        >
          {item.summary || item.type}
        </span>
      </span>
      <span className="hidden shrink-0 items-center gap-2 sm:flex" style={{ width: 130 }}>
        {published ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt="" src="/icons/activity-published-dot.svg" width={8} height={8} />
            <span className="ds-mono" style={{ fontSize: 11, letterSpacing: '0.04em' }}>
              Published
            </span>
          </>
        ) : (
          <span className="ds-mono" style={{ fontSize: 11, color: 'var(--muted)' }}>
            {item.type}
          </span>
        )}
      </span>
      <span
        className="ds-mono shrink-0 text-right"
        style={{ width: 80, fontSize: 12, color: 'var(--faint)' }}
      >
        {formatAgo(item.timestamp)}
      </span>
    </>
  );
  const style = {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    width: '100%',
    textAlign: 'left' as const,
    padding: '24px 0',
    borderBottom: '1px solid var(--border)',
    background: 'transparent',
  };
  if (!onOpen) return <div style={style}>{body}</div>;
  return (
    <button type="button" onClick={onOpen} style={style}>
      {body}
    </button>
  );
}
