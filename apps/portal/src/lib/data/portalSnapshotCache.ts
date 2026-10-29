import type { PortalSnapshot } from '@/lib/data/view-models';

/** Identity for the last good snapshot. `userId` is the portal contact id. */
export type PortalSnapshotKey = {
  userId: string;
  orgId: string;
  hostSlug: string;
};

export type HeldPortalSnapshot = {
  key: PortalSnapshotKey;
  data: PortalSnapshot;
};

export type PortalCacheState = {
  held: HeldPortalSnapshot | null;
  /** Sign-out seals the cache so a late remember cannot write the previous user back. */
  sealed: boolean;
};

export type PortalCacheAction =
  | { type: 'remember'; key: PortalSnapshotKey; data: PortalSnapshot }
  | { type: 'clear' }
  | { type: 'signOut' }
  | { type: 'unseal' };

export const EMPTY_PORTAL_CACHE: PortalCacheState = { held: null, sealed: false };

export function portalSnapshotKey(
  session: { contactId?: string | null; orgId?: string | null } | null | undefined,
  hostSlug: string | null | undefined,
): PortalSnapshotKey | null {
  const userId = session?.contactId?.trim() ?? '';
  const orgId = session?.orgId?.trim() ?? '';
  if (!userId || !orgId) return null;
  return { userId, orgId, hostSlug: hostSlug?.trim() ?? '' };
}

export function samePortalSnapshotKey(
  left: PortalSnapshotKey | null | undefined,
  right: PortalSnapshotKey | null | undefined,
): boolean {
  return Boolean(
    left &&
      right &&
      left.userId === right.userId &&
      left.orgId === right.orgId &&
      left.hostSlug === right.hostSlug,
  );
}

export function reducePortalCache(state: PortalCacheState, action: PortalCacheAction): PortalCacheState {
  switch (action.type) {
    case 'signOut':
      return { held: null, sealed: true };
    case 'clear':
      if (!state.held) return state;
      return { ...state, held: null };
    case 'unseal':
      if (!state.sealed) return state;
      return { ...state, sealed: false };
    case 'remember': {
      if (state.sealed) return state;
      if (
        state.held &&
        samePortalSnapshotKey(state.held.key, action.key) &&
        state.held.data === action.data
      ) {
        return state;
      }
      return { sealed: false, held: { key: action.key, data: action.data } };
    }
    default:
      return state;
  }
}

/**
 * The held snapshot is served only for the exact current user, org, and host.
 * While auth is settling and the identity is unknown, callers pass `settling`
 * and get nothing back so the page can show loading.
 */
export function heldSnapshotFor(
  held: HeldPortalSnapshot | null,
  key: PortalSnapshotKey | null,
  settling: boolean,
): PortalSnapshot | null {
  if (settling || !key || !held) return null;
  if (!samePortalSnapshotKey(held.key, key)) return null;
  return held.data;
}

/** A viewer is staff only after the link has resolved. Loading is not staff. */
export function viewerIsStaff(
  session: { isStaff?: boolean } | null | undefined,
  settling: boolean,
): boolean {
  if (settling || !session) return false;
  return session.isStaff === true;
}

/**
 * Staff rows are the live staff query. Clients, and anyone still loading,
 * never receive that list.
 */
export function projectsForViewer<T>(input: {
  isStaff: boolean;
  staffProjects: unknown;
  clientProjects: readonly T[];
}): readonly T[] {
  if (!input.isStaff) return input.clientProjects;
  return Array.isArray(input.staffProjects) ? (input.staffProjects as readonly T[]) : [];
}
