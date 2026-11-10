'use client';

import { useLayoutEffect, useState } from 'react';
import type { MilestoneRoadmapView } from '@convex/_lib/milestones';
import { applyFixtureMilestonePreview } from '@/lib/data/milestoneRoadmap';

/** Applies fixture query previews after mount so the server list stays unchanged. */
export function useFixtureMilestonePreview(
  milestones: MilestoneRoadmapView[],
  enabled: boolean,
): MilestoneRoadmapView[] {
  const [search, setSearch] = useState('');
  useLayoutEffect(() => {
    if (!enabled) return;
    setSearch(window.location.search);
  }, [enabled]);
  if (!enabled || search === '') return milestones;
  return applyFixtureMilestonePreview(milestones, search);
}
