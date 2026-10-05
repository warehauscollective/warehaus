'use client';

import { useEffect } from 'react';
import type { PortalTab } from '@warehaus/logic/portal';
import { getPortalSidebarSections } from '@/lib/data/sidebarSections';
import { usePortalView } from '@/components/providers/PortalViewProvider';
import { usePortalData } from '@/hooks/usePortalData';

/**
 * In-flow section rail for one swipe tab.
 * Lives inside the tab panel so it scrolls/swipes away with that page —
 * not a fixed shell chrome.
 */
export function PortalTabSidebar({ tab }: { tab: PortalTab }) {
  const { sectionFor, setSectionFor } = usePortalView();
  const { data } = usePortalData();
  const sections = getPortalSidebarSections(tab, data.tenant.mode);
  const activeSection = sectionFor(tab);

  useEffect(() => {
    if (sections.length > 0 && !sections.some((section) => section.key === activeSection)) {
      const first = sections[0]?.key;
      if (first) setSectionFor(tab, first);
    }
  }, [sections, activeSection, setSectionFor, tab]);

  if (sections.length === 0) return null;

  return (
    <>
      {/* Mobile / tablet: in-flow chip row (scrolls with the tab) */}
      <nav
        aria-label={`${tab} sections`}
        className="mb-3 flex shrink-0 items-center gap-2 rounded-2xl px-3 py-2 backdrop-blur-2xl lg:hidden"
        style={{
          background: 'var(--nav-bg)',
          border: '1px solid var(--nav-border)',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt="warehaus"
          src="/icons/wordmark.svg"
          width={91.6264}
          height={12.4073}
          className="portal-wordmark shrink-0"
        />
        <span
          className="ds-mono hidden shrink-0 sm:inline"
          style={{
            fontSize: '0.65rem',
            textTransform: 'uppercase',
            letterSpacing: '0.14em',
            color: 'var(--muted)',
          }}
        >
          {tab}
        </span>
        <div
          className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto overscroll-x-contain"
          style={{ scrollbarWidth: 'none' }}
        >
          {sections.map((s) => {
            const active = activeSection === s.key;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => setSectionFor(tab, s.key)}
                aria-current={active ? 'true' : undefined}
                className="shrink-0 whitespace-nowrap transition-colors"
                style={{
                  fontSize: 'var(--t-xs)',
                  fontWeight: active ? 600 : 500,
                  padding: '0.45rem 0.7rem',
                  borderRadius: 999,
                  color: active ? 'var(--nav-text-inverse)' : 'var(--nav-text)',
                  background: active ? 'var(--nav-pill-bg)' : 'transparent',
                  border: active
                    ? '1px solid var(--nav-pill-border)'
                    : '1px solid transparent',
                }}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Desktop: floating wordmark card (Figma 284:8408). No bar mark, no swoop. */}
      <nav
        aria-label={`${tab} sections`}
        data-testid="portal-sidebar"
        className="hidden w-[244px] shrink-0 flex-col self-start lg:flex"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 36,
          padding: 12,
          gap: 4,
        }}
      >
        <div
          className="flex w-full items-center justify-between"
          style={{ padding: '8px 12px' }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt="warehaus"
            src="/icons/wordmark.svg"
            width={91.6264}
            height={12.4073}
            className="portal-wordmark"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt="" src="/icons/sidebar-menu.svg" width={16} height={16} />
        </div>
        <div className="flex w-full flex-col" style={{ paddingTop: 16, gap: 4 }}>
          <p
            className="ds-mono"
            style={{
              fontSize: 11,
              letterSpacing: '0.88px',
              color: 'var(--faint)',
              padding: '8px 12px',
              textTransform: 'uppercase',
            }}
          >
            Portal / {tab}
          </p>
          {sections.map((s) => {
            const active = activeSection === s.key;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => setSectionFor(tab, s.key)}
                aria-current={active ? 'true' : undefined}
                className="w-full text-left transition-colors"
                style={{
                  fontSize: 14,
                  lineHeight: '20px',
                  fontWeight: active ? 600 : 500,
                  padding: 12,
                  borderRadius: 12,
                  color: active ? 'var(--fg)' : 'var(--muted)',
                  background: active ? 'var(--surface-2)' : 'transparent',
                  border: active ? '1px solid var(--border-2)' : '1px solid transparent',
                }}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}

/** @deprecated Use PortalTabSidebar — kept as alias during migrate. */
export const PortalSidebar = PortalTabSidebar;
