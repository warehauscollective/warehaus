'use client';

import { useEffect, useState } from 'react';
import type { PortalTab } from '@warehaus/logic/portal';
import { getPortalTabsForMode } from '@warehaus/logic/portal';
import { usePortalTab } from '@/components/providers/PortalTabProvider';
import { TaskGlyph } from '@/components/tasks/TaskGlyph';
import { usePortalData } from '@/hooks/usePortalData';
import { dockLabelClassName, dockTabClassName, dockTabStyle } from './dockTabChrome';

const TAB_ICON: Record<Exclude<PortalTab, 'dashboard'>, string> = {
  projects: '/icons/dock-projects.svg',
  resources: '/icons/dock-resources.svg',
  activity: '/icons/dock-activity.svg',
  account: '/icons/dock-account.svg',
};

/**
 * Four 4.5px tiles from Dock icon 284:7686. Stroke follows the tab color
 * (ink on the active pill, muted when idle).
 */
function DashboardGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.33" />
      <rect x="9" y="2.5" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.33" />
      <rect x="2.5" y="9" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.33" />
      <rect x="9" y="9" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.33" />
    </svg>
  );
}

function TabGlyph({ tab }: { tab: PortalTab }) {
  if (tab === 'dashboard') return <DashboardGlyph />;
  const src = TAB_ICON[tab];
  return (
    <span
      aria-hidden
      className="dock-tab-icon"
      style={{
        backgroundColor: 'currentColor',
        WebkitMaskImage: `url(${src})`,
        maskImage: `url(${src})`,
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
        WebkitMaskPosition: 'center',
        maskPosition: 'center',
        WebkitMaskSize: 'contain',
        maskSize: 'contain',
      }}
    />
  );
}

/**
 * Portal dock — Figma Dock/Portal 284:8236.
 * Desktop: hamburger circle, then a surface track. Active tab is a paper pill
 * with ink type in both themes. No dash indicators. Below 1024 only the
 * active tab shows its label. Every idle icon and label uses --muted.
 */
export function PortalDock() {
  const { activeTab, setActiveTab } = usePortalTab();
  const { data } = usePortalData();
  const dockTabs = getPortalTabsForMode(data.tenant.mode);
  const [shortcut, setShortcut] = useState('⌘K');
  useEffect(() => {
    const platform = navigator.platform || '';
    const agent = navigator.userAgent || '';
    const mac = /Mac|iPhone|iPad|iPod/.test(platform) || /Mac OS/.test(agent);
    setShortcut(mac ? '⌘K' : 'Ctrl K');
  }, []);

  return (
    <nav
      className="fixed left-1/2 z-50 flex w-[calc(100vw-1.25rem)] max-w-[calc(100vw-0.75rem)] -translate-x-1/2 items-center justify-center gap-1 md:w-auto md:gap-2"
      style={{ bottom: 24 }}
      aria-label="Portal navigation"
      data-testid="portal-dock"
    >
      <button
        type="button"
        aria-label="Search"
        aria-keyshortcuts="Meta+K Control+K"
        aria-describedby="dock-search-tip"
        className="group relative hidden size-14 shrink-0 items-center justify-center rounded-3xl backdrop-blur-2xl lg:flex"
        style={{
          background: 'var(--nav-bg)',
          border: '1px solid var(--nav-border)',
          color: 'var(--nav-text)',
          cursor: 'pointer',
        }}
        onClick={(event) => {
          window.dispatchEvent(new CustomEvent('wh-open-search', { detail: { trigger: event.currentTarget } }));
        }}
      >
        <TaskGlyph src="/icons/resource-search.svg" size={20} />
        <span
          id="dock-search-tip"
          role="tooltip"
          className="pointer-events-none absolute bottom-[calc(100%+8px)] left-1/2 hidden -translate-x-1/2 items-center gap-2 rounded-xl px-2.5 py-1.5 group-hover:flex group-focus-visible:flex"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            boxShadow: '0 12px 32px rgb(0 0 0 / 35%)',
            color: 'var(--fg)',
            whiteSpace: 'nowrap',
          }}
        >
          <span style={{ fontSize: 13 }}>Search</span>
          <span
            className="ds-mono"
            style={{
              border: '1px solid var(--border-2)',
              borderRadius: 6,
              padding: '2px 7px',
              fontSize: 11,
              fontWeight: 500,
            }}
          >
            {shortcut}
          </span>
        </span>
      </button>

      <div
        role="tablist"
        aria-label="Portal sections"
        className="box-border flex h-[45px] min-w-0 items-center gap-1 rounded-2xl p-1 lg:h-14 lg:gap-0 lg:rounded-3xl"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
        }}
      >
        {dockTabs.map(({ label, value }) => {
          const isActive = value === activeTab;
          return (
            <button
              key={value}
              type="button"
              id={`tab-${value}`}
              role="tab"
              aria-selected={isActive}
              aria-controls={`tabpanel-${value}`}
              aria-label={label}
              title={label}
              onClick={() => setActiveTab(value)}
              className={dockTabClassName(isActive)}
              style={dockTabStyle(isActive)}
            >
              <TabGlyph tab={value} />
              <span className={dockLabelClassName(isActive, value)}>{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
