import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { AuthGate } from '@/components/auth/AuthGate';
import { PortalShell } from '@/components/layout/PortalShell';
import { FixturePreviewProvider } from '@/components/providers/FixturePreviewProvider';
import { fixturePreviewAllowed } from '@/lib/data/fixturePreviewGate';
import { isAuthenticated } from '@/lib/auth-server';
import { isNotionProjectCreateEnabled } from '@warehaus/portal-sync';

export default async function PortalLayout({ children }: { children: ReactNode }) {
  const projectCreateEnabled = isNotionProjectCreateEnabled(process.env.NOTION_PROJECT_CREATE_ENABLED);
  // Same gate as /preview. Deep links such as /docs/:id render in the fixture shell
  // only when the flag is on and this is not production. Production still requires auth.
  if (fixturePreviewAllowed()) {
    return (
      <FixturePreviewProvider>
        <PortalShell projectCreateEnabled={projectCreateEnabled}>{children}</PortalShell>
      </FixturePreviewProvider>
    );
  }

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
      <PortalShell projectCreateEnabled={projectCreateEnabled}>{children}</PortalShell>
    </AuthGate>
  );
}
