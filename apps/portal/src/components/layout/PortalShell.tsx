'use client';

import type { ReactNode } from 'react';
import { PortalTabProvider } from '@/components/providers/PortalTabProvider';
import { PortalDock } from './PortalDock';
import { PortalSidebar } from './PortalSidebar';
import { PortalSwipeWorkspace } from './PortalSwipeWorkspace';
import { useActiveSection } from '@/hooks/useActiveSection';

function PortalChrome({ children }: { children: ReactNode }) {
  const activeSection = useActiveSection('overview');

  return (
    <div className="ds-scope relative h-[100dvh] overflow-hidden">
      <PortalSidebar activeSection={activeSection} />
      <PortalSwipeWorkspace />
      {/* Route pages stay for deep-link path matching; content lives in the swipe shell. */}
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
      <PortalChrome>{children}</PortalChrome>
    </PortalTabProvider>
  );
}
