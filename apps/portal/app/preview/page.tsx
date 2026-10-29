import { redirect } from 'next/navigation';
import { PortalShell } from '@/components/layout/PortalShell';
import { FixturePreviewProvider } from '@/components/providers/FixturePreviewProvider';
import { fixturePreviewAllowed } from '@/lib/data/fixturePreviewGate';
import { isNotionProjectCreateEnabled } from '@warehaus/portal-sync';

/**
 * Unsigned fixture preview. Middleware and this page both fail closed
 * unless this is local next dev with the fixtures flag. Any Vercel
 * process (VERCEL=1 or a set VERCEL_ENV) redirects to login.
 * There is no password. The mock session lives only under this provider.
 */
export default async function PortalFixturePreview({
  searchParams,
}: {
  searchParams: Promise<{ as?: string | string[] }>;
}) {
  if (!fixturePreviewAllowed()) redirect('/login');
  const params = await searchParams;
  const as = Array.isArray(params.as) ? params.as[0] : params.as;
  const projectCreateEnabled = isNotionProjectCreateEnabled(process.env.NOTION_PROJECT_CREATE_ENABLED);
  return (
    <FixturePreviewProvider audience={as === 'client' ? 'client' : 'staff'}>
      <PortalShell projectCreateEnabled={projectCreateEnabled}>
        <span className="sr-only">Fixture preview</span>
      </PortalShell>
    </FixturePreviewProvider>
  );
}
