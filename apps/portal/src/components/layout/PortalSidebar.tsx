'use client';

import { useEffect, useLayoutEffect } from 'react';
import type { PortalTab } from '@warehaus/logic/portal';
import { getPortalSidebarSections } from '@/lib/data/sidebarSections';
import { usePortalView } from '@/components/providers/PortalViewProvider';
import { usePortalTab } from '@/components/providers/PortalTabProvider';
import { usePortalData } from '@/hooks/usePortalData';
import { usePortalAuth } from '@/hooks/usePortalAuth';
import { TaskGlyph } from '@/components/tasks/TaskGlyph';
import { MobileMenu } from './MobileMenu';
import { sidebarItemStyle } from './sidebarItemChrome';
import {
  applySidebarDataset,
  readBootUserId,
  readSidebarMode,
  sidebarCollapseKey,
  writeSidebarMode,
  type SidebarMode,
} from './sidebarCollapse';

const COLLAPSE_LABEL = 'Collapse sidebar';
const EXPAND_LABEL = 'Expand sidebar';

/**
 * Section rail for one swipe tab.
 * From 1024px a saved collapse turns the active tab's rail into a floating
 * wordmark chip. The selected section stays in state while the chip is up.
 */
export function PortalTabSidebar({ tab }: { tab: PortalTab }) {
  const { sectionFor, setSectionFor } = usePortalView();
  const { activeTab } = usePortalTab();
  const { data } = usePortalData();
  const { authUser } = usePortalAuth();
  const userId = authUser?.id ?? null;
  const sections = getPortalSidebarSections(tab, data.tenant.mode);
  const activeSection = sectionFor(tab);

  useLayoutEffect(() => {
    const storedFor = userId ?? readBootUserId(window.localStorage);
    applySidebarDataset(readSidebarMode(window.localStorage, storedFor));
  }, [userId]);

  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (!userId) return;
      if (event.key !== null && event.key !== sidebarCollapseKey(userId)) return;
      applySidebarDataset(readSidebarMode(window.localStorage, userId));
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
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

      <nav
        aria-label={`${tab} sections`}
        data-testid="portal-sidebar"
        data-sidebar-active={activeTab === tab ? 'true' : 'false'}
        className="hidden w-[244px] shrink-0 flex-col self-start overflow-y-auto lg:flex"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 36,
          padding: 12,
          gap: 4,
        }}
      >
        <div className="sidebar-header flex w-full items-center justify-between">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt="warehaus"
            src="/icons/wordmark.svg"
            width={91.6264}
            height={12.4073}
            className="portal-wordmark sidebar-wordmark"
          />
          <button type="button" className="sidebar-toggle sidebar-collapse" aria-label={COLLAPSE_LABEL} onClick={toggle}>
            <TaskGlyph src="/icons/sidebar-menu.svg" size={16} />
          </button>
          <button type="button" className="sidebar-toggle sidebar-expand" aria-label={EXPAND_LABEL} onClick={toggle}>
            <span className="sidebar-chev">
              <TaskGlyph src="/icons/docs-chev.svg" size={16} />
            </span>
          </button>
        </div>
        <span className="sidebar-expand-tip" role="tooltip">
          Expand sidebar
        </span>
        <div className="sidebar-body flex w-full flex-col" style={{ paddingTop: 9, gap: 4 }}>
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
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => setSectionFor(tab, s.key)}
                aria-current={active ? 'true' : undefined}
                className="sidebar-item flex w-full items-center text-left"
                style={sidebarItemStyle(active)}
              >
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
