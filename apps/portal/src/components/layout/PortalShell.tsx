'use client';

import type { ReactNode } from 'react';
import { Suspense, useEffect } from 'react';
import { PortalDataRetryProvider } from '@/components/providers/PortalDataRetry';
import { PortalTabProvider } from '@/components/providers/PortalTabProvider';
import { PortalViewProvider } from '@/components/providers/PortalViewProvider';
import { ShellProvider } from '@/lib/shell';
import { PORTAL_PANEL_GAP } from '@/lib/design/portal-chrome';
import { NoticeBell } from '@/components/notices/NoticeBell';
import { RunnerPairLink } from '@/components/projects/RunnerPairLink';
import { PortalSearch } from '@/components/search/PortalSearch';
import { PortalToastLive } from '@/components/ui/PortalToast';
import { PortalDock } from './PortalDock';
import { PortalSwipeWorkspace } from './PortalSwipeWorkspace';
import { SIDEBAR_COLLAPSE_MIN_PX, sidebarRailWidth } from './sidebarCollapse';
import { SidebarUserProvider } from './sidebarUser';

function PortalChrome({ children }: { children: ReactNode }) {
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--portal-panel-gap', PORTAL_PANEL_GAP);
    root.style.setProperty('--portal-col-gap', PORTAL_PANEL_GAP);
    const media = window.matchMedia(`(min-width: ${SIDEBAR_COLLAPSE_MIN_PX}px)`);
    const syncRail = () => {
      const collapsed = root.dataset.sidebar === 'collapsed';
      const rail = sidebarRailWidth(collapsed ? 'collapsed' : 'expanded', media.matches ? SIDEBAR_COLLAPSE_MIN_PX : 0);
      root.style.setProperty('--portal-rail-w', `${rail}px`);
    };
    syncRail();
    const observer = new MutationObserver(syncRail);
    observer.observe(root, { attributes: true, attributeFilter: ['data-sidebar'] });
    media.addEventListener('change', syncRail);
    return () => {
      observer.disconnect();
      media.removeEventListener('change', syncRail);
      root.style.removeProperty('--portal-panel-gap');
      root.style.removeProperty('--portal-col-gap');
      root.style.removeProperty('--portal-rail-w');
    };
  }, []);

  return (
    <div className="ds-scope portal-chrome relative h-[100dvh] overflow-hidden">
      <PortalToastLive />
      <NoticeBell />
      <Suspense fallback={null}>
        <RunnerPairLink />
      </Suspense>
      <PortalSwipeWorkspace />
      <div className="hidden" aria-hidden>
        {children}
      </div>
      <PortalDock />
      <PortalSearch />
    </div>
  );
}

export function PortalShell({ children }: { children: ReactNode }) {
  return (
    <ShellProvider>
      <PortalDataRetryProvider>
        <PortalTabProvider>
          <PortalViewProvider>
            <SidebarUserProvider>
              <PortalChrome>{children}</PortalChrome>
            </SidebarUserProvider>
          </PortalViewProvider>
        </PortalTabProvider>
      </PortalDataRetryProvider>
    </ShellProvider>
  );
}
