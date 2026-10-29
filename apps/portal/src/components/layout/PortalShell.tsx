'use client';

import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { ProjectCreateFlagProvider } from '@/components/projects/projectCreateFlag';
import { PortalTabProvider } from '@/components/providers/PortalTabProvider';
import { PortalViewProvider } from '@/components/providers/PortalViewProvider';
import { PORTAL_PANEL_GAP } from '@/lib/design/portal-chrome';
import { NoticeBell } from '@/components/notices/NoticeBell';
import { PortalSearch } from '@/components/search/PortalSearch';
import { PortalDock } from './PortalDock';
import { PortalSwipeWorkspace } from './PortalSwipeWorkspace';

function PortalChrome({ children }: { children: ReactNode }) {
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--portal-panel-gap', PORTAL_PANEL_GAP);
    root.style.setProperty('--portal-col-gap', PORTAL_PANEL_GAP);
    root.style.setProperty('--portal-rail-w', '0px');
    return () => {
      root.style.removeProperty('--portal-panel-gap');
      root.style.removeProperty('--portal-col-gap');
      root.style.removeProperty('--portal-rail-w');
    };
  }, []);

  return (
    <div className="ds-scope relative h-[100dvh] overflow-hidden">
      <NoticeBell />
      <PortalSwipeWorkspace />
      <div className="hidden" aria-hidden>
        {children}
      </div>
      <PortalDock />
      <PortalSearch />
    </div>
  );
}

export function PortalShell({
  children,
  projectCreateEnabled = false,
}: {
  children: ReactNode;
  projectCreateEnabled?: boolean;
}) {
  return (
    <ProjectCreateFlagProvider enabled={projectCreateEnabled}>
      <PortalTabProvider>
        <PortalViewProvider>
          <PortalChrome>{children}</PortalChrome>
        </PortalViewProvider>
      </PortalTabProvider>
    </ProjectCreateFlagProvider>
  );
}
