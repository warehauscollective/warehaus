import { notFound } from 'next/navigation';
import { PortalShell } from '@/components/layout/PortalShell';

/** Local fixture preview. Refuses to render unless the fixture flag is on. */
export default function PortalFixturePreview() {
  if (process.env.NEXT_PUBLIC_PORTAL_FIXTURES !== '1') notFound();
  return (
    <PortalShell>
      <span className="sr-only">Fixture preview</span>
    </PortalShell>
  );
}
