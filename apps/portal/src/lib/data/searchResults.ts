'use client';

/**
 * Search results data. One interface, two adapters:
 *
 * - live: `api.search.forStaff` or `forClient`, debounced 200 ms
 * - fixture: `searchFixtures`, with an optional delay for design review
 *   (`sessionStorage['wh-search-preview-delay']`)
 *
 * The search dialog picks neither. `useSearchResults` reads the fixture flag once.
 * Both adapters keep the last settled groups while a new query is pending.
 */

import { useEffect, useState } from 'react';
import { api } from '@convex/_generated/api';
import type { SearchGroups } from '@convex/_lib/portalSearch';
import { useFixturePreview } from '@/components/providers/FixturePreviewProvider';
import { useSafeQuery } from '@/hooks/useSafeQuery';
import { isConvexConfigured } from '@/lib/convex/client';
import { staffRosterQueriesDeployed } from '@/lib/data/staffRoster';
import { searchFixtures } from '@/lib/search/fixtureSearch';

const FIXTURE_DELAY_KEY = 'wh-search-preview-delay';

export type SearchResults = {
  /** The last settled groups. Blank while the needle is empty. */
  groups: SearchGroups;
  /** When the current query started waiting, or null once it settled. */
  pendingSince: number | null;
  /** Search cannot run here: the staff roster queries are not deployed. */
  unavailable: boolean;
};

type Input = {
  open: boolean;
  /** Trimmed query, at most 100 characters. */
  needle: string;
  isStaff: boolean;
  /** A client session exists. Client search needs one. */
  hasSession: boolean;
  hostSlug: string | undefined;
};

function blankGroups(): SearchGroups {
  return { projects: [], tasks: [], docs: [], resources: [] };
}

function fixtureDelay(): number {
  if (typeof window === 'undefined') return 0;
  try {
    const raw = window.sessionStorage.getItem(FIXTURE_DELAY_KEY);
    const value = raw ? Number(raw) : 0;
    if (!Number.isFinite(value) || value <= 0 || value > 5000) return 0;
    return value;
  } catch {
    return 0;
  }
}

function useFixtureSearch(enabled: boolean, needle: string, isStaff: boolean): SearchResults {
  const [groups, setGroups] = useState<SearchGroups>(blankGroups);
  const [pendingSince, setPendingSince] = useState<number | null>(null);
  useEffect(() => {
    if (!enabled) return;
    if (!needle) {
      setGroups(blankGroups());
      setPendingSince(null);
      return;
    }
    const settle = () => {
      setGroups(searchFixtures(isStaff ? 'staff' : 'client', needle));
      setPendingSince(null);
    };
    const delay = fixtureDelay();
    if (delay <= 0) {
      settle();
      return;
    }
    setPendingSince((current) => current ?? Date.now());
    const id = window.setTimeout(settle, delay);
    return () => window.clearTimeout(id);
  }, [enabled, needle, isStaff]);
  return { groups, pendingSince, unavailable: false };
}

function useLiveSearch(enabled: boolean, input: Input): SearchResults {
  const { open, needle, isStaff, hasSession, hostSlug } = input;
  const configured = isConvexConfigured();
  const roster = staffRosterQueriesDeployed();
  const [liveNeedle, setLiveNeedle] = useState('');
  const [groups, setGroups] = useState<SearchGroups>(blankGroups);
  const [pendingSince, setPendingSince] = useState<number | null>(null);

  useEffect(() => {
    const id = window.setTimeout(() => setLiveNeedle(needle), 200);
    return () => window.clearTimeout(id);
  }, [needle]);

  const live = enabled && open && configured && roster && liveNeedle.length > 0 && needle.length > 0;
  const staffState = useSafeQuery<SearchGroups>(api.search.forStaff, live && isStaff ? { q: liveNeedle, hostSlug } : 'skip');
  const clientState = useSafeQuery<SearchGroups>(
    api.search.forClient,
    live && hasSession && !isStaff ? { q: liveNeedle, hostSlug } : 'skip',
  );
  const serverGroups = isStaff ? staffState.data : clientState.data;
  const serverLoading = isStaff ? staffState.loading : clientState.loading;

  useEffect(() => {
    if (!enabled) return;
    if (!needle || !roster || !configured) {
      setGroups(blankGroups());
      setPendingSince(null);
      return;
    }
    if (liveNeedle !== needle || serverLoading || serverGroups == null) {
      setPendingSince((current) => current ?? Date.now());
      return;
    }
    setGroups(serverGroups);
    setPendingSince(null);
  }, [enabled, needle, roster, configured, liveNeedle, serverLoading, serverGroups]);

  return { groups, pendingSince, unavailable: Boolean(needle) && !roster };
}

/** The search dialog's one data seam. Fixture mode is read here and nowhere else in the dialog. */
export function useSearchResults(input: Input): SearchResults {
  const fixtures = useFixturePreview();
  const fixture = useFixtureSearch(fixtures, input.needle, input.isStaff);
  const live = useLiveSearch(!fixtures, input);
  return fixtures ? fixture : live;
}
