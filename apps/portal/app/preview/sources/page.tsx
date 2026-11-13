import { redirect } from 'next/navigation';
import { SourcesReviewPage } from '@/components/tasks/SourcesReview';
import { fixturePreviewAllowed } from '@/lib/data/fixturePreviewGate';
import { readSourceScreen, type SourcePanelScreen } from '@/components/tasks/sourcePanelFixtures';

/**
 * Fixture-only gallery for the staff Sources panel. Production redirects to login.
 * `?panel=empty|loading|error|links` and `?as=client` render real data states.
 */
export default async function SourcesPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ panel?: string | string[]; as?: string | string[]; theme?: string | string[] }>;
}) {
  if (!fixturePreviewAllowed()) redirect('/login');
  const params = await searchParams;
  const panel = Array.isArray(params.panel) ? params.panel[0] : params.panel;
  const as = Array.isArray(params.as) ? params.as[0] : params.as;
  const themeParam = Array.isArray(params.theme) ? params.theme[0] : params.theme;
  const screen: SourcePanelScreen = readSourceScreen(panel ?? 'empty', true) ?? 'empty';
  const theme = themeParam === 'light' ? 'light' : 'dark';
  return <SourcesReviewPage audience={as === 'client' ? 'client' : 'staff'} screen={screen} theme={theme} />;
}
