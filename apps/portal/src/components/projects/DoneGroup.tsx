'use client';

import { ChevronDown, ChevronRight } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { doneGroupLabel } from './needMilestone';

/**
 * Shipped milestones, collapsed until the chevron opens them in place.
 * List is a full-width row. Board is a 56px column. An expanded board stacks at phone width.
 */
export function DoneGroup({
  count,
  layout,
  expanded,
  stacked = false,
  onToggle,
  children,
}: {
  count: number;
  layout: 'list' | 'board';
  expanded: boolean;
  stacked?: boolean;
  onToggle: () => void;
  children?: ReactNode;
}) {
  const panelId = useId();
  const label = doneGroupLabel(count);
  const collapsedBoard = layout === 'board' && !expanded;
  const width = collapsedBoard ? 56 : undefined;
  return (
    <div
      data-testid="milestone-done-group"
      data-layout={layout}
      data-expanded={expanded ? 'true' : 'false'}
      data-stacked={stacked ? 'true' : 'false'}
      className={collapsedBoard ? 'flex shrink-0 self-stretch' : 'flex w-full flex-col gap-4'}
      style={width ? { width } : layout === 'board' && expanded && !stacked ? { width: 358, flexShrink: 0 } : undefined}
    >
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={panelId}
        data-testid="milestone-done-toggle"
        onClick={onToggle}
        className={
          collapsedBoard
            ? 'flex h-full min-h-[280px] w-full flex-col items-center justify-center gap-2 px-2 py-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--fg)]'
            : 'flex w-full items-center gap-2 px-4 py-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--fg)]'
        }
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          color: 'var(--muted)',
          cursor: 'pointer',
        }}
      >
        {expanded ? <ChevronDown size={16} aria-hidden /> : <ChevronRight size={16} aria-hidden />}
        <span
          className="ds-mono"
          data-testid="milestone-done-label"
          style={{
            fontSize: 11,
            lineHeight: '17px',
            fontWeight: 400,
            color: 'var(--muted)',
            textAlign: collapsedBoard ? 'center' : undefined,
            width: collapsedBoard ? 40 : undefined,
          }}
        >
          {label}
        </span>
      </button>
      {expanded ? (
        <div id={panelId} data-testid="milestone-done-panel" className="flex w-full flex-col gap-4">
          {children}
        </div>
      ) : null}
    </div>
  );
}
