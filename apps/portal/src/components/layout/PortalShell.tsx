'use client';

import type { ReactNode } from 'react';
import { PortalTabProvider } from '@/components/providers/PortalTabProvider';
import { PortalViewProvider } from '@/components/providers/PortalViewProvider';
import { PortalDock } from './PortalDock';
import { PortalSidebar } from './PortalSidebar';
import { PortalSwipeWorkspace } from './PortalSwipeWorkspace';

function PortalChrome({ children }: { children: ReactNode }) {
  return (
    <div className="ds-scope relative h-[100dvh] overflow-hidden">
      <PortalSidebar />
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
