'use client';

import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { Bevel } from '@warehaus/ui';
import { usePortalView } from '@/components/providers/PortalViewProvider';
import { PORTAL_PANEL_GAP_VAR, PORTAL_SURFACE_RADIUS } from '@/lib/design/portal-chrome';

/**
 * Desktop portal chrome for a single tab: fixed above-the-fold workspace.
 * - No page scroll — the main tile region fills the viewport
 * - Optional persistent right rail (`aside`)
 * - Optional detail inspector (replaces rail while open)
 * - Mobile keeps a simpler stacked scroll (lg: and below)
 */
export function PortalWorkspace({
  eyebrow,
  title,
  actions,
  aside,
  hideHeader = false,
  children,
}: {
  eyebrow: string;
  title: string;
  actions?: ReactNode;
  /** Persistent right rail (e.g. dashboard tasks / activity). */
  aside?: ReactNode;
  /** When true, skip the eyebrow/title/actions header bar. */
  hideHeader?: boolean;
  children: ReactNode;
}) {
  const { detail, closeDetail } = usePortalView();
  const detailOpen = Boolean(detail);
  const showRight = detailOpen || Boolean(aside);

  return (
    <div className="flex h-full min-h-0 flex-col lg:overflow-hidden">
      {!hideHeader ? (
        <header
          className="flex shrink-0 flex-wrap items-end justify-between gap-3"
          style={{
            paddingTop: 'var(--s-5)',
            paddingBottom: 'var(--s-4)',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <div className="min-w-0">
            <p
              className="ds-mono"
              style={{
                fontSize: 'var(--t-xs)',
                textTransform: 'uppercase',
                letterSpacing: '0.16em',
                color: 'var(--muted)',
              }}
            >
              {eyebrow}
            </p>
            <h1
              className="type-display truncate"
              style={{
                fontSize: 'clamp(1.5rem, 1.2rem + 1vw, 2rem)',
                marginTop: '0.35rem',
                lineHeight: 1.1,
              }}
            >
              {title}
            </h1>
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}

      <div
        className={`flex min-h-0 flex-1 flex-col lg:flex-row lg:overflow-hidden${hideHeader ? '' : ' pt-4'}`}
        style={{ gap: PORTAL_PANEL_GAP_VAR }}
      >
        <div className="min-h-0 min-w-0 flex-1 lg:overflow-hidden">{children}</div>

        {showRight ? (
          <aside
            className="flex w-full shrink-0 flex-col lg:w-[min(300px,32%)] lg:overflow-hidden"
            aria-label={detailOpen ? 'Details' : 'Sidebar'}
          >
            {detailOpen && detail ? (
              <Bevel
                corners="bl"
                radius={PORTAL_SURFACE_RADIUS}
                cut={2}
                shoulder={0.75}
                fill="var(--surface)"
                stroke="var(--border)"
                className="flex h-full min-h-0 flex-col"
                style={{ padding: 0, overflow: 'hidden' }}
              >
                <div
                  className="flex items-start justify-between gap-3"
                  style={{
                    padding: 'var(--s-5)',
                    borderBottom: '1px solid var(--border)',
                  }}
                >
                  <div className="min-w-0">
                    <p
                      className="ds-mono"
                      style={{ fontSize: 'var(--t-xs)', color: 'var(--faint)' }}
                    >
                      {detail.id}
                    </p>
                    <h2
                      style={{
                        fontSize: 'var(--t-lg)',
                        fontWeight: 600,
                        marginTop: 4,
                        lineHeight: 1.2,
                      }}
                    >
                      {detail.title}
                    </h2>
                    {detail.subtitle ? (
                      <p
                        style={{
                          fontSize: 'var(--t-sm)',
                          color: 'var(--muted)',
                          marginTop: 6,
                        }}
                      >
                        {detail.subtitle}
                      </p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={closeDetail}
                    aria-label="Close details"
                    className="flex shrink-0 items-center justify-center"
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      color: 'var(--muted)',
                      border: '1px solid var(--border)',
                      background: 'transparent',
                    }}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div
                  className="min-h-0 flex-1 overflow-y-auto"
                  style={{ padding: 'var(--s-5)' }}
                >
                  {detail.body}
                </div>
              </Bevel>
            ) : (
              aside
            )}
          </aside>
        ) : null}
      </div>
    </div>
  );
}

/** Scrollable tile/list region that stays inside the workspace (not the page).
 *  Vertical-only overflow so horizontal tab swipes chain to the snap track. */
export function PortalTilePane({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={className}
      style={{
        height: '100%',
        minHeight: 0,
        overflowX: 'hidden',
        overflowY: 'auto',
        overscrollBehaviorX: 'none',
        overscrollBehaviorY: 'contain',
        touchAction: 'pan-x pan-y',
        paddingBottom: '0.25rem',
      }}
    >
      {children}
    </div>
  );
}

/** Dense above-the-fold metric / summary grid. */
export function PortalStatGrid({
  items,
}: {
  items: { label: string; value: string; hint?: string }[];
}) {
  return (
    <div
      className="grid gap-3"
      style={{
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(140px, 100%), 1fr))',
      }}
    >
      {items.map((stat) => (
        <Bevel
          key={stat.label}
          corners="br"
          radius={PORTAL_SURFACE_RADIUS}
          cut={1.5}
          shoulder={0.5}
          fill="var(--surface)"
          stroke="var(--border)"
          style={{ padding: 'var(--s-4)' }}
        >
          <p className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>
            {stat.label}
          </p>
          <p
            className="ds-mono"
            style={{ fontSize: 'var(--t-2xl)', marginTop: 'var(--s-2)', color: 'var(--fg)' }}
          >
            {stat.value}
          </p>
          {stat.hint ? (
            <p style={{ fontSize: 'var(--t-xs)', color: 'var(--faint)', marginTop: 4 }}>
              {stat.hint}
            </p>
          ) : null}
        </Bevel>
      ))}
    </div>
  );
}
