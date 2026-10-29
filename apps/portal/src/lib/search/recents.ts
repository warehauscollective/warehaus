import type { SearchHit } from '@convex/_lib/portalSearch';

export type SearchTier = 'staff' | 'client';

export type SearchRecentScope = {
  authUserId: string;
  tier: SearchTier;
  orgId: string;
};

type RecentStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

const LEGACY_KEY = 'wh-portal-search-recents';
const LIMIT = 5;

type StoredRecent = SearchHit & {
  tier: SearchTier;
  orgId: string;
};

/** Per signed-in user and tier. The legacy unscoped key is never read. */
export function searchRecentsKey(authUserId: string, tier: SearchTier): string {
  return `${LEGACY_KEY}:${authUserId}:${tier}`;
}

function visibleHit(hit: SearchHit, staff: boolean): SearchHit {
  return {
    id: hit.id,
    kind: hit.kind,
    title: hit.title,
    subtitle: hit.subtitle,
    href: hit.href,
    metaType: hit.metaType,
    ...(hit.metaWhen ? { metaWhen: hit.metaWhen } : {}),
    ...(hit.metaProject ? { metaProject: hit.metaProject } : {}),
    ...(hit.stage ? { stage: hit.stage } : {}),
    ...(staff && typeof hit.published === 'boolean' ? { published: hit.published } : {}),
  };
}

function parseStored(raw: string | null): StoredRecent[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is StoredRecent => {
      if (!entry || typeof entry !== 'object') return false;
      const row = entry as StoredRecent;
      return typeof row.id === 'string' && typeof row.title === 'string' && typeof row.href === 'string';
    });
  } catch {
    return [];
  }
}

/** Drops rows whose stored tier or org does not match the current user. */
export function readSearchRecents(store: RecentStore, scope: SearchRecentScope): SearchHit[] {
  if (!scope.authUserId || !scope.orgId) return [];
  const staff = scope.tier === 'staff';
  return parseStored(store.getItem(searchRecentsKey(scope.authUserId, scope.tier)))
    .filter((entry) => entry.tier === scope.tier && entry.orgId === scope.orgId)
    .slice(0, LIMIT)
    .map((entry) => visibleHit(entry, staff));
}

export function writeSearchRecent(store: RecentStore, scope: SearchRecentScope, hit: SearchHit): SearchHit[] {
  if (!scope.authUserId || !scope.orgId) return readSearchRecents(store, scope);
  const staff = scope.tier === 'staff';
  const stored: StoredRecent = {
    ...visibleHit(hit, staff),
    tier: scope.tier,
    orgId: scope.orgId,
  };
  const next = [
    stored,
    ...parseStored(store.getItem(searchRecentsKey(scope.authUserId, scope.tier))).filter(
      (entry) => entry.id !== stored.id || entry.kind !== stored.kind,
    ),
  ].slice(0, LIMIT);
  try {
    store.setItem(searchRecentsKey(scope.authUserId, scope.tier), JSON.stringify(next));
  } catch {
    // Recents are a convenience. A full or blocked store still opens the hit.
  }
  return readSearchRecents(store, scope);
}

/** Removes this user's recent lists, including the old shared key. */
export function clearSearchRecents(store: RecentStore, authUserId: string): void {
  store.removeItem(LEGACY_KEY);
  if (!authUserId) return;
  store.removeItem(`${LEGACY_KEY}:${authUserId}`);
  store.removeItem(searchRecentsKey(authUserId, 'staff'));
  store.removeItem(searchRecentsKey(authUserId, 'client'));
}
