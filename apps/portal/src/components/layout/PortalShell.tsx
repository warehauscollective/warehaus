'use client';

import type { ReactNode } from 'react';
import { PortalDock } from './PortalDock';
import { PortalSidebar } from './PortalSidebar';
import { useActiveSection } from '@/hooks/useActiveSection';

export function PortalShell({ children }: { children: ReactNode }) {
  const activeSection = useActiveSection('overview');

  return (
    <div className="ds-scope relative min-h-[100dvh]">
      <PortalSidebar activeSection={activeSection} />
      <main
        className="pb-28"
        style={{
          paddingLeft: 'calc(var(--left-sidebar-w, 0px) + var(--gutter))',
          paddingRight: 'var(--gutter)',
        }}
      >
        {children}
      </main>
      <PortalDock />
    </div>
  );
}
