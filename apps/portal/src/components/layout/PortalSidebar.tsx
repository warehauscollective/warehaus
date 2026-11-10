'use client';

import { useEffect } from 'react';
import type { PortalTab } from '@warehaus/logic/portal';
import { getPortalSidebarSections } from '@/lib/data/sidebarSections';
import { usePortalView } from '@/components/providers/PortalViewProvider';
import { usePortalData } from '@/hooks/usePortalData';
import { MobileMenu } from './MobileMenu';
import { sidebarItemStyle } from './sidebarItemChrome';

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
      <MobileMenu
        tab={tab}
        sections={sections}
        activeSection={activeSection}
        onSelect={(key) => setSectionFor(tab, key)}
      />

      {/* Desktop: floating wordmark card (Figma 284:8408). No bar mark, no swoop. */}
      <nav
        aria-label={`${tab} sections`}
        data-testid="portal-sidebar"
        className="hidden w-[244px] shrink-0 flex-col self-start overflow-y-auto lg:flex"
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
        <div className="flex w-full flex-col" style={{ paddingTop: 9, gap: 4 }}>
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
            {data.tenant.mode === 'client'
              ? `${data.tenant.clientName ?? 'Portal'} / ${tab}`
              : `Portal / ${tab}`}
          </p>
          {sections.map((s) => {
            const active = activeSection === s.key;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => setSectionFor(tab, s.key)}
                aria-current={active ? 'true' : undefined}
                className="w-full text-left"
                style={sidebarItemStyle(active)}
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
