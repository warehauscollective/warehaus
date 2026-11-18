'use client';

import type { ReactNode } from 'react';
import { Bevel } from '@warehaus/ui';
import { PORTAL_PANEL_GAP_VAR, PORTAL_SURFACE_RADIUS } from '@/lib/design/portal-chrome';
import { PHONE_SCROLL_INSET } from '@/components/layout/tabPanelShellLayout';

/**
 * Desktop portal chrome for a single tab: fixed above-the-fold workspace.
 * Rows navigate or open an existing modal. There is no right-side inspector.
 * Mobile keeps a simpler stacked scroll (lg: and below).
 */
export function PortalWorkspace({
  eyebrow,
  title,
  actions,
  hideHeader = false,
  breadcrumb,
  titleLines = 1,
  children,
}: {
  eyebrow: string;
  title: string;
  actions?: ReactNode;
  /** 2 clamps a long title to two lines. The default stays one line. */
  titleLines?: 1 | 2;
  /** When true, skip the eyebrow/title/actions header bar. */
  hideHeader?: boolean;
  /** Nested-route trail. Replaces the eyebrow when set. */
  breadcrumb?: ReactNode;
  children: ReactNode;
}) {
  return (
    <PortalWorkspaceFrame hideHeader={hideHeader} header={
      <>
          <div className="min-w-0">
            {breadcrumb ? (
              breadcrumb
            ) : (
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
            )}
            <h1
              className={titleLines === 2 ? 'portal-page-title type-display normal-case' : 'portal-page-title type-display truncate normal-case'}
              style={{
                fontSize: 'clamp(1.5rem, 1.2rem + 1vw, 2rem)',
                marginTop: breadcrumb ? 10 : '0.35rem',
                lineHeight: 1.15,
                minWidth: 0,
                maxWidth: '100%',
                ...(titleLines === 2
                  ? {
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical' as const,
                      overflow: 'hidden',
                    }
                  : {}),
              }}
            >
              {title}
            </h1>
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </>
    }>
        <div className="min-h-0 min-w-0 flex-1 lg:overflow-hidden">{children}</div>
    </PortalWorkspaceFrame>
  );
}

/**
 * Phone inset sits on this header, directly under the phone header.
 * A hidden header has no titled block, so the page scroller carries the 24px instead.
 */
export function PortalWorkspaceFrame({
  hideHeader = false,
  header,
  children,
}: {
  hideHeader?: boolean;
  header?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col lg:overflow-hidden">
      {!hideHeader ? (
        <header
          className="flex max-lg:pt-6 shrink-0 flex-wrap items-end justify-between gap-3 lg:pt-[var(--s-5)]"
          data-testid="workspace-title"
          style={{
            position: 'relative',
            zIndex: 2,
            background: 'var(--bg)',
            boxShadow: 'none',
            paddingBottom: 'var(--s-4)',
            borderBottom: '1px solid var(--border)',
          }}
        >
          {header}
        </header>
      ) : null}
      <div
        className={`flex min-h-0 flex-1 flex-col lg:flex-row lg:overflow-hidden${hideHeader ? '' : ' pt-4'}`}
        data-testid="workspace-body"
        style={{ gap: PORTAL_PANEL_GAP_VAR }}
      >
        {children}
      </div>
    </div>
  );
}

/** 24px inside a hideHeader page scroller. Titled pages do not use this. */
export function PhoneScrollInset({ children }: { children: ReactNode }) {
  return <div className={PHONE_SCROLL_INSET}>{children}</div>;
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
      className={className ? `min-w-0 ${className}` : 'min-w-0'}
      data-page-scroll=""
      style={{
        height: '100%',
        width: '100%',
        minHeight: 0,
        overflowX: 'hidden',
        overflowY: 'auto',
        overscrollBehaviorX: 'none',
        overscrollBehaviorY: 'contain',
        touchAction: 'pan-x pan-y',
        paddingBottom: 'var(--portal-tile-pad, 0.25rem)',
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
            style={{
              fontSize: stat.value.length > 4 ? 'var(--t-md)' : 'var(--t-2xl)',
              marginTop: 'var(--s-2)',
              color: 'var(--fg)',
              whiteSpace: 'nowrap',
            }}
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
