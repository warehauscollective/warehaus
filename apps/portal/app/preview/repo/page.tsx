import { redirect } from 'next/navigation';
import { RepoSettingPreview, type RepoPreview } from '@/components/projects/ProjectRepoSetting';
import { fixturePreviewAllowed } from '@/lib/data/fixturePreviewGate';

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

const phases = ['edit', 'confirm', 'clearing', 'clear-error', 'saving', 'helper'] as const satisfies readonly RepoPreview[];
const sizes = ['1440', '390'] as const;

/** Fixture-only repository panel. No Convex writes. */
export default async function RepoFixturePreview({
  searchParams,
}: {
  searchParams: Promise<{ theme?: string | string[]; state?: string | string[]; size?: string | string[] }>;
}) {
  if (!fixturePreviewAllowed()) redirect('/login');
  const params = await searchParams;
  const themeValue = first(params.theme);
  const stateValue = first(params.state);
  const sizeValue = first(params.size);
  const phase = phases.find((item) => item === stateValue) ?? 'edit';
  const size = sizes.find((item) => item === sizeValue) ?? '1440';
  return <RepoSettingPreview theme={themeValue === 'light' ? 'light' : 'dark'} phase={phase} size={size} />;
}
