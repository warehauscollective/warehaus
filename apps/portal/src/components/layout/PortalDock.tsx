'use client';

import type { PortalTab } from '@warehaus/logic/portal';
import { getPortalTabsForMode } from '@warehaus/logic/portal';
import { usePortalTab } from '@/components/providers/PortalTabProvider';
import { usePortalData } from '@/hooks/usePortalData';

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

function TabGlyph({ tab, active }: { tab: PortalTab; active: boolean }) {
  if (tab === 'dashboard') return <DashboardGlyph />;
  return (
    <span className="relative shrink-0" style={{ width: 16, height: 16 }} aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        alt=""
        src={TAB_ICON[tab]}
        width={16}
        height={16}
        className={active ? 'dock-tab-icon dock-tab-icon-active' : 'dock-tab-icon'}
      />
    </span>
  );
}

/**
 * Portal dock — Figma Dock/Portal 284:8236.
 * Desktop: hamburger circle, then a surface track. Active tab is a paper pill
 * with ink type. No dash indicators. Mobile keeps icon tabs and labels the
 * active one.
 */
export function PortalDock() {
  const { activeTab, setActiveTab } = usePortalTab();
  const { data } = usePortalData();
  const dockTabs = getPortalTabsForMode(data.tenant.mode);

  return (
    <nav
      className="fixed left-1/2 z-50 flex w-[calc(100vw-1.25rem)] max-w-[calc(100vw-0.75rem)] -translate-x-1/2 items-center justify-center gap-1 md:w-auto md:gap-2"
      style={{ bottom: '1.25rem' }}
      aria-label="Portal navigation"
      data-testid="portal-dock"
    >
      <div
        className="hidden size-14 shrink-0 items-center justify-center rounded-3xl backdrop-blur-2xl lg:flex"
        style={{
          background: 'var(--nav-bg)',
          border: '1px solid var(--nav-border)',
        }}
        aria-hidden
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt="" src="/icons/dock-menu.svg" width={20} height={20} className="dock-menu-glyph" />
      </div>

      <div
        role="tablist"
        aria-label="Portal sections"
        className="flex min-w-0 items-center gap-1 overflow-x-auto rounded-2xl p-1 lg:gap-0 lg:overflow-visible lg:rounded-3xl"
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
              className={`relative flex shrink-0 items-center justify-center gap-1 rounded-[13px] lg:gap-2 lg:rounded-[21px] ${
                isActive ? 'px-3 py-2 lg:px-4 lg:py-3' : 'p-2 lg:px-4 lg:py-3'
              }`}
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 900,
                fontStyle: 'italic',
                textTransform: 'uppercase',
                lineHeight: 'normal',
                color: isActive ? 'var(--nav-text-inverse)' : 'var(--muted)',
                background: isActive ? 'var(--nav-pill-bg)' : 'transparent',
                border: isActive ? '1px solid var(--nav-pill-bg)' : '1px solid transparent',
              }}
            >
              <TabGlyph tab={value} active={isActive} />
              <span
                className={isActive ? 'text-[11px] tracking-[1.1px] lg:text-[13px] lg:tracking-[1.3px]' : 'hidden text-[13px] tracking-[1.3px] lg:inline'}
              >
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
