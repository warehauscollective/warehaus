'use client';

import { useEffect, useLayoutEffect } from 'react';
import type { PortalTab } from '@warehaus/logic/portal';
import { WarehausLogo } from '@warehaus/ui';
import { getPortalSidebarSections } from '@/lib/data/sidebarSections';
import { sidebarIconSrc } from '@/lib/data/sidebarIcons';
import { usePortalView } from '@/components/providers/PortalViewProvider';
import { usePortalData } from '@/hooks/usePortalData';
import { usePortalAuth } from '@/hooks/usePortalAuth';
import { TaskGlyph } from '@/components/tasks/TaskGlyph';
import { MobileMenu } from './MobileMenu';
import { sidebarItemStyle } from './sidebarItemChrome';
import {
  applySidebarDataset,
  readBootUserId,
  readSidebarMode,
  writeSidebarMode,
  type SidebarMode,
} from './sidebarCollapse';

const COLLAPSE_LABEL = 'Collapse sidebar';
const EXPAND_LABEL = 'Expand sidebar';

/**
 * In-flow section rail for one swipe tab.
 * Lives inside the tab panel so it scrolls/swipes away with that page.
 * Collapsed chrome (tooltip, hover, focus) waits for the revised spec.
 */
export function PortalTabSidebar({ tab }: { tab: PortalTab }) {
  const { sectionFor, setSectionFor } = usePortalView();
  const { data } = usePortalData();
  const { authUser } = usePortalAuth();
  const userId = authUser?.id ?? null;
  const sections = getPortalSidebarSections(tab, data.tenant.mode);
  const activeSection = sectionFor(tab);

  useLayoutEffect(() => {
    const storedFor = userId ?? readBootUserId(window.localStorage);
    applySidebarDataset(readSidebarMode(window.localStorage, storedFor));
  }, [userId]);

  function toggle() {
    const collapsed = document.documentElement.dataset.sidebar === 'collapsed';
    const next: SidebarMode = collapsed ? 'expanded' : 'collapsed';
    if (userId) writeSidebarMode(window.localStorage, userId, next);
    applySidebarDataset(next);
  }

  useEffect(() => {
    if (sections.length > 0 && !sections.some((section) => section.key === activeSection)) {
      const first = sections[0]?.key;
      if (first) setSectionFor(tab, first);
    }
  }, [sections, activeSection, setSectionFor, tab]);

  if (sections.length === 0) return null;

  const level =
    data.tenant.mode === 'client'
      ? `${data.tenant.clientName ?? 'Portal'} / ${tab}`
      : `Portal / ${tab}`;

  return (
    <>
      <MobileMenu
        tab={tab}
        sections={sections}
        activeSection={activeSection}
        onSelect={(key) => setSectionFor(tab, key)}
      />

      {/* Desktop rail. Expanded 244. Collapsed width is the dataset, from 1024 up. */}
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
        <div className="sidebar-header flex w-full items-center justify-between" style={{ padding: '8px 12px' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt="warehaus"
            src="/icons/wordmark.svg"
            width={91.6264}
            height={12.4073}
            className="portal-wordmark sidebar-wordmark"
          />
          <span className="sidebar-mark" aria-hidden>
            <WarehausLogo height={16.7} title="warehaus" />
          </span>
          <button type="button" className="sidebar-collapse" aria-label={COLLAPSE_LABEL} onClick={toggle}>
            <TaskGlyph src="/icons/sidebar-menu.svg" size={16} />
          </button>
          <button type="button" className="sidebar-expand" aria-label={EXPAND_LABEL} onClick={toggle}>
            <TaskGlyph src="/icons/docs-chev.svg" size={16} />
          </button>
        </div>
        <div className="flex w-full flex-col" style={{ paddingTop: 9, gap: 4 }}>
          <p
            className="sidebar-level ds-mono"
            style={{
              fontSize: 11,
              letterSpacing: '0.88px',
              color: 'var(--faint)',
              padding: '8px 12px',
              textTransform: 'uppercase',
            }}
          >
            {level}
          </p>
          {sections.map((s) => {
            const active = activeSection === s.key;
            const icon = sidebarIconSrc(tab, s.key);
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => setSectionFor(tab, s.key)}
                aria-current={active ? 'true' : undefined}
                className="sidebar-item flex w-full items-center text-left"
                style={sidebarItemStyle(active)}
              >
                {icon ? (
                  <span className="sidebar-item-icon" aria-hidden>
                    <TaskGlyph src={icon} size={16} />
                  </span>
                ) : null}
                <span className="sidebar-item-label">{s.label}</span>
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
