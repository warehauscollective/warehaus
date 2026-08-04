import type { ReactNode } from 'react';

/** Auth routes render outside PortalShell (no dock / swipe workspace). */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return children;
}
