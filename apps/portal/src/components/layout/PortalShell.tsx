import type { ReactNode } from 'react';
import { PortalDock } from './PortalDock';

export function PortalShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-[100dvh]">
      <main className="pb-28">{children}</main>
      <PortalDock />
    </div>
  );
}
