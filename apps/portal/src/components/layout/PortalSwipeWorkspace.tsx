'use client';

import { useEffect, type ReactNode } from 'react';
import { SwipeTabView, useSwipeTabs } from '@warehaus/ui';
import type { PortalTab } from '@warehaus/logic/portal';
import { isPortalTab, usePortalTab } from '@/components/providers/PortalTabProvider';
import { PortalHomeContent } from '@/components/pages/PortalHomeContent';
import { ProjectsContent } from '@/components/pages/ProjectsContent';
import { ResourcesContent } from '@/components/pages/ResourcesContent';
import { ActivityContent } from '@/components/pages/ActivityContent';
import { AccountContent } from '@/components/pages/AccountContent';
import { PORTAL_PANEL_GAP_VAR } from '@/lib/design/portal-chrome';
import { useMaxWidth } from '@/lib/design/useMaxWidth';
import { PortalPanelBoundary } from './PortalPanelBoundary';
import { PortalTabSidebar } from './PortalSidebar';

function renderPortalPanel(tab: PortalTab) {
  switch (tab) {
    case 'dashboard':
      return <PortalHomeContent />;
    case 'projects':
      return <ProjectsContent />;
    case 'resources':
      return <ResourcesContent />;
    case 'activity':
      return <ActivityContent />;
    case 'account':
      return <AccountContent />;
  }
}

function TabPanelShell({
  tab,
  children,
}: {
  tab: PortalTab;
  children: ReactNode;
}) {
  const phone = useMaxWidth(767);
  const project = tab === 'projects';
  return (
    <div
      className={`portal-tab-shell box-border flex h-full min-h-0 flex-col overflow-hidden lg:flex-row lg:items-stretch ${
        project ? 'gap-0 pb-0 pt-4 lg:gap-6 lg:pb-28 lg:pt-6' : 'pb-28 pt-3 lg:pt-[var(--portal-panel-gap,1.25rem)]'
      }`}
      style={{
        paddingLeft: project ? (phone ? 16 : 24) : '1.25rem',
        paddingRight: project ? (phone ? 16 : 24) : phone ? '1.25rem' : '4.5rem',
        ...(project ? {} : { gap: PORTAL_PANEL_GAP_VAR }),
        touchAction: 'pan-x pan-y',
      }}
    >
      <PortalTabSidebar tab={tab} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden pt-6 lg:pt-0">
        {children}
      </div>
    </div>
  );
}

/**
 * Portal product surface — dock clicks move between tabs. Horizontal swipe
 * between those tabs is off. Each tab is a fixed-height panel workspace
 * with its own in-flow sidebar.
 */
export function PortalSwipeWorkspace() {
  const { tabs, activeTab, setActiveTab, panelRefs } = usePortalTab();

  const scrollRef = useSwipeTabs({
    tabs,
    active: activeTab,
    setActiveTab,
    panelRefs,
    isValidTab: isPortalTab,
    urlSync: 'none',
    gestures: false,
  });

  useEffect(() => {
    const el = scrollRef.current;
    const panel = panelRefs[activeTab]?.current;
    if (!el || !panel) return;
    let pinning = false;
    const pin = () => {
      if (pinning) return;
      const left = panel.offsetLeft;
      if (Math.abs(el.scrollLeft - left) <= 0.5) return;
      pinning = true;
      el.scrollLeft = left;
      pinning = false;
    };
    pin();
    const observer = new ResizeObserver(pin);
    observer.observe(el);
    el.addEventListener('scroll', pin, { passive: true });
    return () => {
      observer.disconnect();
      el.removeEventListener('scroll', pin);
    };
  }, [activeTab, panelRefs, scrollRef]);

  return (
    <main className="h-[100dvh] w-full overflow-hidden">
      <SwipeTabView
        gestures={false}
        tabs={tabs}
        scrollRef={scrollRef}
        panelRefs={panelRefs}
        panelStyle={{ overflowY: 'hidden', touchAction: 'pan-x pan-y' }}
        renderPanel={(tab) => (
          <TabPanelShell tab={tab}>
            <PortalPanelBoundary label={tab}>{renderPortalPanel(tab)}</PortalPanelBoundary>
          </TabPanelShell>
        )}
      />
    </main>
  );
}
