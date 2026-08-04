import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { AuthGate } from '@/components/auth/AuthGate';
import { PortalShell } from '@/components/layout/PortalShell';
import { isAuthenticated } from '@/lib/auth-server';

export default async function PortalLayout({ children }: { children: ReactNode }) {
  // Fail closed: no Convex config or no Better Auth session → login page.
  if (
    !process.env.NEXT_PUBLIC_CONVEX_URL?.trim() ||
    !(
      process.env.NEXT_PUBLIC_CONVEX_SITE_URL?.trim() ||
      process.env.CONVEX_SITE_URL?.trim()
    )
  ) {
    redirect('/login');
  }

  const authed = await isAuthenticated();
  if (!authed) {
    redirect('/login');
  }

  return (
    <AuthGate>
      <PortalShell>{children}</PortalShell>
    </AuthGate>
  );
}
