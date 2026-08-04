'use client';

import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { PortalTabProvider } from '@/components/providers/PortalTabProvider';
import { PortalViewProvider } from '@/components/providers/PortalViewProvider';
import { PORTAL_PANEL_GAP } from '@/lib/design/portal-chrome';
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
      <PortalSwipeWorkspace />
      <div className="hidden" aria-hidden>
        {children}
      </div>
      <PortalDock />
    </div>
  );
}

export function PortalShell({ children }: { children: ReactNode }) {
  return (
    <PortalTabProvider>
      <PortalViewProvider>
        <PortalChrome>{children}</PortalChrome>
      </PortalViewProvider>
    </PortalTabProvider>
  );
}
