'use client';

import { SwipeTabView, useSwipeTabs } from '@warehaus/ui';
import type { PortalTab } from '@warehaus/logic/portal';
import { isPortalTab, usePortalTab } from '@/components/providers/PortalTabProvider';
import { PortalHomeContent } from '@/components/pages/PortalHomeContent';
import { ProjectsContent } from '@/components/pages/ProjectsContent';
import { ChatroomContent } from '@/components/pages/ChatroomContent';
import { ActivityContent } from '@/components/pages/ActivityContent';
import { AccountContent } from '@/components/pages/AccountContent';

function renderPortalPanel(tab: PortalTab) {
  switch (tab) {
    case 'dashboard':
      return <PortalHomeContent />;
    case 'projects':
      return <ProjectsContent />;
    case 'chatroom':
      return <ChatroomContent />;
    case 'activity':
      return <ActivityContent />;
    case 'account':
      return <AccountContent />;
  }
}

/**
 * Portal product surface — swipe tabs at the shell level; each tab is a
 * fixed-height panel workspace (no whole-page scroll on desktop).
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
  });

  return (
    <main className="h-[100dvh] w-full overflow-hidden">
      <SwipeTabView
        tabs={tabs}
        scrollRef={scrollRef}
        panelRefs={panelRefs}
        panelStyle={{ overflowY: 'hidden', touchAction: 'pan-x pan-y' }}
        renderPanel={(tab) => (
          <div
            className="box-border h-full min-h-0 overflow-hidden pb-28 pt-16 lg:pt-3"
            style={{
              paddingLeft: 'calc(var(--portal-rail-w, 0px) + var(--gutter))',
              paddingRight: 'var(--gutter)',
              touchAction: 'pan-x pan-y',
            }}
          >
            {renderPortalPanel(tab)}
          </div>
        )}
      />
    </main>
  );
}
