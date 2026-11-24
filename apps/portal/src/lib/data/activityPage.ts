'use client';

/**
 * Activity page data. One interface, two adapters:
 *
 * - live: the activity feed query for the viewer's tier
 * - fixture: the fixture activity page, plus the `?activity=` design-review screens
 *
 * The page picks neither. `useActivityPage` reads the fixture flag once.
 */

import { useFixturePreview } from '@/components/providers/FixturePreviewProvider';
import { useActivityFeed } from '@/hooks/useActivityFeed';
import { FIXTURE_CLIENT_ACTIVITY_PAGE, FIXTURE_STAFF_ACTIVITY_PAGE } from '@/lib/data/fixtures';
import { useFixtureParam } from '@/lib/data/fixtureParam';
import type { PortalActivity } from '@/lib/data/view-models';

export const ACTIVITY_PREVIEWS = ['empty', 'loading', 'error', 'long'] as const;
export type ActivityPreview = (typeof ACTIVITY_PREVIEWS)[number] | null;

// Fixture drift guard: the fixture pages must keep the feed shape.
FIXTURE_STAFF_ACTIVITY_PAGE satisfies readonly PortalActivity[];
FIXTURE_CLIENT_ACTIVITY_PAGE satisfies readonly PortalActivity[];

export type ActivityPage = {
  items: readonly PortalActivity[];
  /** The feed has not arrived yet. */
  loading: boolean;
  /** The feed query failed. */
  failed: boolean;
  /** Design-review screen. Always null on a live page. */
  preview: ActivityPreview;
};

/** Fixture adapter. Pure, so tests can read it without React. */
export function fixtureActivityPage(staff: boolean, preview: ActivityPreview): ActivityPage {
  const failed = preview === 'error';
  return {
    items: staff ? FIXTURE_STAFF_ACTIVITY_PAGE : FIXTURE_CLIENT_ACTIVITY_PAGE,
    loading: preview === 'loading',
    failed,
    preview,
  };
}

function useLiveActivityPage(): ActivityPage {
  const feed = useActivityFeed();
  const failed = Boolean(feed.error);
  return { items: feed.items, loading: feed.loading && !failed, failed, preview: null };
}

/** The page's one data seam. Fixture mode is read here and nowhere else on the page. */
export function useActivityPage(staff: boolean): ActivityPage {
  const fixtures = useFixturePreview();
  const preview = useFixtureParam(fixtures, 'activity', ACTIVITY_PREVIEWS);
  const live = useLiveActivityPage();
  return fixtures ? fixtureActivityPage(staff, preview) : live;
}
