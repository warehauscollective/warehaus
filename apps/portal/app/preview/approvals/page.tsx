import { redirect } from 'next/navigation';
import {
  ApprovalsPreview,
  type ApprovalsFocus,
  type ApprovalsOverlay,
} from '@/components/projects/ApprovalsPreview';
import { fixturePreviewAllowed } from '@/lib/data/fixturePreviewGate';

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

const overlays = [
  'confirm-card',
  'confirm-tile',
  'request-changes',
  'request-changes-error',
  'confirm-failed',
] as const satisfies readonly ApprovalsOverlay[];

const views = [
  'task-from-review',
  'tile-peter',
  'tile-staff',
  'tile-client',
  'preview-failed',
  'preview-failed-retrying',
  'preview-failed-after',
  'couldnt-remove',
  'couldnt-remove-retrying',
  'couldnt-remove-after',
  'milestone-page',
] as const satisfies readonly ApprovalsFocus[];

/** Fixture-only review states for design QA. No Convex writes. */
export default async function ApprovalsFixturePreview({
  searchParams,
}: {
  searchParams: Promise<{ theme?: string | string[]; overlay?: string | string[]; view?: string | string[] }>;
}) {
  if (!fixturePreviewAllowed()) redirect('/login');
  const params = await searchParams;
  const themeValue = first(params.theme);
  const overlayValue = first(params.overlay);
  const viewValue = first(params.view);
  const overlay = overlays.find((item) => item === overlayValue) ?? null;
  const view = views.find((item) => item === viewValue) ?? null;
  return (
    <ApprovalsPreview
      theme={themeValue === 'light' ? 'light' : 'dark'}
      overlay={overlay}
      view={view}
    />
  );
}
