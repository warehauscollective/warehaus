'use client';

import { X } from 'lucide-react';
import { needMilestoneBannerState, needMilestoneCopy } from './needMilestone';

function WarningMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className="shrink-0">
      <path fill="var(--warning)" d="M7.15 1.7a1 1 0 0 1 1.7 0l5.9 10.2A1 1 0 0 1 13.9 13.4H2.1a1 1 0 0 1-.85-1.5l5.9-10.2Z" />
      <path fill="var(--surface-2)" d="M7.25 6.1h1.5V10h-1.5zm0 4.7h1.5v1.45h-1.5z" />
    </svg>
  );
}

/**
 * Staff banner for open tasks with no milestone of this project.
 * Count 0 renders nothing. Dismiss hides the banner for this visit and leaves the chip.
 */
export function NeedMilestoneBanner({
  count,
  dismissed,
  onDismiss,
}: {
  count: number;
  dismissed: boolean;
  onDismiss: () => void;
}) {
  const state = needMilestoneBannerState(count, dismissed);
  if (state === 'hidden') return null;
  if (state === 'dismissed') {
    return (
      <div data-testid="milestone-unassigned" data-state="dismissed">
        <span
          data-testid="milestone-need-chip"
          className="inline-flex items-center gap-2 whitespace-nowrap"
          style={{
            padding: '8px 16px',
            borderRadius: 999,
            border: '1px solid var(--border)',
            color: 'var(--muted)',
            fontSize: 13,
            fontWeight: 500,
            lineHeight: 'normal',
          }}
        >
          Need a milestone
          <span className="ds-mono" style={{ fontSize: 11, fontWeight: 400, color: 'var(--faint)' }}>
            {count}
          </span>
        </span>
      </div>
    );
  }
  return (
    <div
      data-testid="milestone-unassigned"
      data-state="visible"
      role="status"
      className="flex items-center gap-2"
      style={{
        background: 'var(--surface-2)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '10px 12px',
      }}
    >
      <WarningMark />
      <p style={{ margin: 0, fontSize: 13, fontWeight: 500, lineHeight: '20px', color: 'var(--fg)', whiteSpace: 'nowrap' }}>
        {needMilestoneCopy(count)}
      </p>
      <span className="min-w-2 flex-1" />
      <button
        type="button"
        aria-label="Dismiss"
        data-testid="milestone-need-dismiss"
        onClick={onDismiss}
        className="inline-flex size-7 shrink-0 items-center justify-center rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--fg)]"
        style={{ background: 'transparent', color: 'var(--muted)', border: 0, padding: 0, cursor: 'pointer' }}
      >
        <X size={16} aria-hidden />
      </button>
    </div>
  );
}
