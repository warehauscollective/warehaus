'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { PortalTab } from '@warehaus/logic/portal';
import { getPortalSidebarSections } from '@/lib/data/sidebarSections';
import { usePortalView } from '@/components/providers/PortalViewProvider';
import { usePortalTab } from '@/components/providers/PortalTabProvider';
import { usePortalData } from '@/hooks/usePortalData';
import { TaskGlyph } from '@/components/tasks/TaskGlyph';
import { allProjectsLeavesDetail, commitTabHref, isProjectDetailPath, runTabHomeClick } from '@/lib/nav/tabHome';
import { MobileMenu } from './MobileMenu';
import { sidebarItemStyle } from './sidebarItemChrome';
import { applySidebarDataset, readSidebarMode, sidebarCollapseKey, type SidebarMode } from './sidebarCollapse';
import { useSidebarUser } from './sidebarUser';

const COLLAPSE_LABEL = 'Collapse sidebar';
const EXPAND_LABEL = 'Expand sidebar';

export function SidebarCollapseToggle({ tipId }: { tipId: string }) {
  const { commitMode } = useSidebarUser();

  function toggle() {
    const collapsed = document.documentElement.dataset.sidebar === 'collapsed';
    const next: SidebarMode = collapsed ? 'expanded' : 'collapsed';
    commitMode(next);
  }

  return (
    <>
      <button
        type="button"
        className="sidebar-toggle sidebar-collapse"
        aria-label={COLLAPSE_LABEL}
        aria-expanded={true}
        onClick={toggle}
      >
        <TaskGlyph src="/icons/sidebar-menu.svg" size={16} />
      </button>
      <button
        type="button"
        className="sidebar-toggle sidebar-expand"
        aria-label={EXPAND_LABEL}
        aria-expanded={false}
        aria-describedby={tipId}
        onClick={toggle}
      >
        <span className="sidebar-chev">
          <TaskGlyph src="/icons/docs-chev.svg" size={16} />
        </span>
      </button>
      <span id={tipId} className="sidebar-expand-tip" role="tooltip">
        Expand sidebar
      </span>
    </>
  );
}

/**
 * Section rail for one swipe tab.
 * From 1024px a saved collapse turns the active tab's rail into a floating
 * wordmark chip. The selected section stays in state while the chip is up.
 */
export function PortalTabSidebar({ tab }: { tab: PortalTab }) {
  const { sectionFor, setSectionFor } = usePortalView();
  const { activeTab } = usePortalTab();
  const { data } = usePortalData();
  const { userId } = useSidebarUser();
  const sections = getPortalSidebarSections(tab, data.tenant.mode);
  const activeSection = sectionFor(tab);
  const tipId = `sidebar-expand-tip-${tab}`;
  const pathname = usePathname() || '';
  const router = useRouter();

  const selectSection = (key: string) => {
    setSectionFor(tab, key);
    if (tab !== 'projects' || key !== 'all') return;
    const search = typeof window === 'undefined' ? '' : window.location.search;
    if (!allProjectsLeavesDetail(pathname, search)) return;
    const detailPath = isProjectDetailPath(pathname);
    runTabHomeClick({
      tab: 'projects',
      location: { pathname, search },
      replace: (href) => {
        if (detailPath) {
          router.push(href);
          return;
        }
        commitTabHref(href, (next) => router.replace(next));
      },
      dispatch: (detail) => {
        window.dispatchEvent(new CustomEvent('wh-portal-nav', { detail }));
      },
    });
  };

  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (!userId) return;
      if (event.key !== null && event.key !== sidebarCollapseKey(userId)) return;
      applySidebarDataset(readSidebarMode(window.localStorage, userId));
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [userId]);

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
        onSelect={selectSection}
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
          <SidebarCollapseToggle tipId={tipId} />
        </div>
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
                onClick={() => selectSection(s.key)}
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
