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
import { PORTAL_PANEL_GAP_VAR } from '@/lib/design/portal-chrome';
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
      className="box-border flex h-full min-h-0 flex-col overflow-hidden pb-28 pt-3 lg:flex-row lg:pt-[var(--portal-panel-gap,1.25rem)]"
      style={{
        paddingLeft: PORTAL_PANEL_GAP_VAR,
        paddingRight: PORTAL_PANEL_GAP_VAR,
        gap: PORTAL_PANEL_GAP_VAR,
        touchAction: 'pan-x pan-y',
      }}
    >
      <PortalTabSidebar tab={tab} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {children}
      </div>
    </div>
  );
}

/**
 * Portal product surface — swipe tabs at the shell level; each tab is a
 * fixed-height panel workspace with its own in-flow sidebar.
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
        panelStyle={{ overflowY: 'hidden', touchAction: 'pan-x pan-y' }}
        renderPanel={(tab) => (
          <TabPanelShell tab={tab}>
            {renderPortalPanel(tab, data.tenant.mode)}
          </TabPanelShell>
        )}
      />
    </main>
  );
}
