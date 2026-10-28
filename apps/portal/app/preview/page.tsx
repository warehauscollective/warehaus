import { redirect } from 'next/navigation';
import { PortalShell } from '@/components/layout/PortalShell';
import { FixturePreviewProvider } from '@/components/providers/FixturePreviewProvider';
import { fixturePreviewAllowed } from '@/lib/data/fixturePreviewGate';

/**
 * Unsigned fixture preview. Middleware and this page both fail closed
 * unless the fixtures flag is on and the runtime is not production.
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
  return (
    <FixturePreviewProvider audience={as === 'client' ? 'client' : 'staff'}>
      <PortalShell>
        <span className="sr-only">Fixture preview</span>
      </PortalShell>
    </FixturePreviewProvider>
  );
}
