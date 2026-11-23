import { readFileSync } from 'node:fs';

/** The files `ProjectRoadmap.tsx` was split into, in the order their code sat in the one file. */
const ROADMAP_FILES = [
  'milestoneTile.tsx',
  'ProjectRoadmap.tsx',
  'MilestoneListCard.tsx',
  'MilestoneDetailView.tsx',
  'MilestoneForms.tsx',
  'roadmapParts.tsx',
  'needMilestone.ts',
  'NeedMilestoneBanner.tsx',
  'DoneGroup.tsx',
] as const;

/** Source text of the whole roadmap, for tests that assert on the markup as written. */
export function readRoadmapSource(): string {
  return ROADMAP_FILES.map((file) => readFileSync(new URL(`./${file}`, import.meta.url), 'utf8')).join('\n');
}
