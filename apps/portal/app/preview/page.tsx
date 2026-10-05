import { redirect } from 'next/navigation';
import { PortalShell } from '@/components/layout/PortalShell';
import { FixturePreviewProvider } from '@/components/providers/FixturePreviewProvider';
import { fixturePreviewAllowed } from '@/lib/data/fixturePreviewGate';

/**
 * Unsigned fixture preview. Middleware and this page both fail closed
 * unless the fixtures flag is on and the runtime is not production.
 * There is no password. The mock session lives only under this provider.
 */
export default function PortalFixturePreview() {
  if (!fixturePreviewAllowed()) redirect('/login');
  return (
    <FixturePreviewProvider>
      <PortalShell>
        <span className="sr-only">Fixture preview</span>
      </PortalShell>
    </FixturePreviewProvider>
  );
}
