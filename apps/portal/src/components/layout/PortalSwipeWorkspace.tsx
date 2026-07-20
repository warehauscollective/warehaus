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
 * Portal product surface — the same swipe-tab shell as the website pillars /
 * style guide. All tab panels stay mounted; the dock and gestures switch tabs.
 * Paths (`/projects`, …) stay deep-linkable via PortalTabProvider.
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
        renderPanel={(tab) => (
          <div
            className="min-h-full pb-28 pt-20 lg:pt-0"
            style={{
              paddingLeft: 'calc(var(--portal-rail-w, 0px) + var(--gutter))',
              paddingRight: 'var(--gutter)',
            }}
          >
            {renderPortalPanel(tab)}
          </div>
        )}
      />
    </main>
  );
}
