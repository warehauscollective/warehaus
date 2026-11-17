import { redirect } from 'next/navigation';
import { ApprovalsPreview } from '@/components/projects/ApprovalsPreview';
import { fixturePreviewAllowed } from '@/lib/data/fixturePreviewGate';

/** Fixture-only review states for design QA. No Convex writes. */
export default async function ApprovalsFixturePreview({
  searchParams,
}: {
  searchParams: Promise<{ theme?: string | string[] }>;
}) {
  if (!fixturePreviewAllowed()) redirect('/login');
  const params = await searchParams;
  const themeValue = Array.isArray(params.theme) ? params.theme[0] : params.theme;
  return <ApprovalsPreview theme={themeValue === 'light' ? 'light' : 'dark'} />;
}
