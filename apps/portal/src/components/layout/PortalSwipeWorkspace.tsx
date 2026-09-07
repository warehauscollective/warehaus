'use client';

import type { ReactNode } from 'react';
import { SwipeTabView, useSwipeTabs } from '@warehaus/ui';
import type { PortalTab } from '@warehaus/logic/portal';
import { isPortalTab, usePortalTab } from '@/components/providers/PortalTabProvider';
import { PortalHomeContent } from '@/components/pages/PortalHomeContent';
import { ProjectsContent } from '@/components/pages/ProjectsContent';
import { TasksContent } from '@/components/pages/TasksContent';
import { ResourcesContent } from '@/components/pages/ResourcesContent';
import { ActivityContent } from '@/components/pages/ActivityContent';
import { AccountContent } from '@/components/pages/AccountContent';
import { usePortalData } from '@/hooks/usePortalData';
import type { TenantMode } from '@/lib/auth/tenancy';
import {
  PORTAL_DOCK_CLEARANCE_VAR,
  PORTAL_PANEL_GAP_VAR,
} from '@/lib/design/portal-chrome';
import { PortalTabSidebar } from './PortalSidebar';

function renderPortalPanel(tab: PortalTab, mode: TenantMode) {
  switch (tab) {
    case 'dashboard':
      return <PortalHomeContent />;
    case 'projects':
      return mode === 'client' ? <TasksContent /> : <ProjectsContent />;
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
  return (
    <div
      className="box-border flex min-h-full flex-col pt-[4.75rem] lg:h-full lg:min-h-0 lg:flex-row lg:overflow-hidden lg:pt-[var(--portal-panel-gap,1.25rem)]"
      style={{
        paddingLeft: PORTAL_PANEL_GAP_VAR,
        paddingRight: PORTAL_PANEL_GAP_VAR,
        paddingBottom: PORTAL_DOCK_CLEARANCE_VAR,
        gap: PORTAL_PANEL_GAP_VAR,
        touchAction: 'pan-x pan-y',
      }}
    >
      <PortalTabSidebar tab={tab} />
      {/*
        Mobile: block-level document flow so content height drives the tab panel
        scroll (no flex-1 viewport lock). Desktop: clipped tile workspace.
      */}
      <div className="min-w-0 w-full max-lg:block lg:flex lg:min-h-0 lg:flex-1 lg:flex-col lg:overflow-hidden">
        {children}
      </div>
    </div>
  );
}

/**
 * Portal product surface — swipe tabs at the shell level.
 * Mobile: each tab panel is the vertical scroll container (content behind dock).
 * Desktop: fixed-height panels with in-flow sidebar + nested tile scroll.
 */
export function PortalSwipeWorkspace() {
  const { tabs, activeTab, setActiveTab, panelRefs } = usePortalTab();
  const { data } = usePortalData();

  const scrollRef = useSwipeTabs({
    tabs,
    active: activeTab,
    setActiveTab,
    panelRefs,
    isValidTab: isPortalTab,
    urlSync: 'none',
  });

  return (
    <main className="h-[100dvh] w-full overflow-hidden">
      <SwipeTabView
        tabs={tabs}
        scrollRef={scrollRef}
        panelRefs={panelRefs}
        panelClassName="portal-tab-panel max-lg:overflow-y-auto"
        panelStyle={{ touchAction: 'pan-x pan-y' }}
        renderPanel={(tab) => (
          <TabPanelShell tab={tab}>
            {renderPortalPanel(tab, data.tenant.mode)}
          </TabPanelShell>
        )}
      />
    </main>
  );
}
