import { redirect } from 'next/navigation';
import {
  ApprovalsPreview,
  type ApprovalsFocus,
  type ApprovalsOverlay,
  type ApprovalsSize,
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
  'retry-unavailable',
  'retry-pending',
  'retry-error',
  'peter-delete-removing',
  'peter-delete-failed',
  'preview-removed',
  'approved',
  'deploy-finished',
  'staff-delete-removing',
  'staff-couldnt-remove',
  'milestone-page',
  'attach',
  'attached',
  'remove-confirm',
  'preview-link-invalid',
  'waiting',
  'changes',
  'building',
  'tile-unpublished',
  'tile-unpublished-client',
] as const satisfies readonly ApprovalsFocus[];

const sizes = ['1440', '390'] as const satisfies readonly ApprovalsSize[];

/** Fixture-only review states for design QA. No Convex writes. */
export default async function ApprovalsFixturePreview({
  searchParams,
}: {
  searchParams: Promise<{ theme?: string | string[]; overlay?: string | string[]; view?: string | string[]; size?: string | string[] }>;
}) {
  if (!fixturePreviewAllowed()) redirect('/login');
  const params = await searchParams;
  const themeValue = first(params.theme);
  const overlayValue = first(params.overlay);
  const viewValue = first(params.view);
  const sizeValue = first(params.size);
  const overlay = overlays.find((item) => item === overlayValue) ?? null;
  const view = views.find((item) => item === viewValue) ?? null;
  const size = sizes.find((item) => item === sizeValue) ?? null;
  return (
    <ApprovalsPreview
      theme={themeValue === 'light' ? 'light' : 'dark'}
      overlay={overlay}
      view={view}
      size={size}
    />
  );
}
