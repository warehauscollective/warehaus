'use client';

import type { PortalTab } from '@warehaus/logic/portal';
import { BevelFrame, WarehausLogo } from '@warehaus/ui';
import { PORTAL_SURFACE_RADIUS } from '@/lib/design/portal-chrome';
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

  /** Client Tasks tab owns Board/List in-page — no left rail. */
  if (data.tenant.mode === 'client' && tab === 'projects') return null;
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
        <WarehausLogo height={18} color="var(--fg)" className="shrink-0" />
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

      {/* Desktop: column rail inside the tab panel */}
      <BevelFrame
        as="nav"
        corners="br"
        innerCorners="bl"
        radius={PORTAL_SURFACE_RADIUS}
        cut={3.75}
        shoulder={1}
        frame={{ top: 1, right: 1, bottom: 48, left: 1 }}
        innerFill="var(--nav-bg)"
        inspectorLabel={`Portal sidebar · ${tab}`}
        aria-label={`${tab} sections`}
        className="hidden h-full min-h-0 w-[220px] shrink-0 lg:flex xl:w-[244px]"
        innerClassName="flex flex-col gap-1 overflow-y-auto overscroll-contain"
        innerStyle={{ padding: 'var(--s-3)' }}
      >
        <div
          className="flex items-center"
          style={{
            padding: 'var(--s-4) var(--s-3)',
            borderBottom: '1px solid var(--border)',
            marginBottom: 'var(--s-4)',
          }}
        >
          <WarehausLogo height={22} color="var(--fg)" />
        </div>
        <p
          className="ds-mono"
          style={{
            fontSize: 'var(--t-xs)',
            textTransform: 'uppercase',
            letterSpacing: '0.16em',
            color: 'var(--muted)',
            marginBottom: 'var(--s-2)',
          }}
        >
          {tab}
        </p>
        {sections.map((s) => {
          const active = activeSection === s.key;
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => setSectionFor(tab, s.key)}
              aria-current={active ? 'true' : undefined}
              className="text-left transition-colors"
              style={{
                fontSize: 'var(--t-sm)',
                padding: '0.6rem 0.8rem',
                borderRadius: 12,
                color: active ? 'var(--fg)' : 'var(--muted)',
                background: active
                  ? 'color-mix(in oklab, var(--fg) 8%, transparent)'
                  : 'transparent',
                borderColor: active
                  ? 'color-mix(in oklab, var(--fg) 14%, transparent)'
                  : 'transparent',
                borderWidth: 1,
              }}
            >
              {s.label}
            </button>
          );
        })}
      </BevelFrame>
    </>
  );
}

/** @deprecated Use PortalTabSidebar — kept as alias during migrate. */
export const PortalSidebar = PortalTabSidebar;
