'use client';

import { createContext, useCallback, useContext, useMemo, useReducer, useState, type ReactNode } from 'react';
import {
  EMPTY_PORTAL_CACHE,
  reducePortalCache,
  type HeldPortalSnapshot,
  type PortalSnapshotKey,
} from '@/lib/data/portalSnapshotCache';
import type { PortalSnapshot } from '@/lib/data/view-models';

const PortalDataRetryContext = createContext<() => void>(() => {});

type PortalSnapshotCacheValue = {
  held: HeldPortalSnapshot | null;
  sealed: boolean;
  remember: (key: PortalSnapshotKey, data: PortalSnapshot) => void;
  clear: () => void;
  signOut: () => void;
  unseal: () => void;
};

const NO_SNAPSHOT_CACHE: PortalSnapshotCacheValue = {
  held: null,
  sealed: false,
  remember: () => {},
  clear: () => {},
  signOut: () => {},
  unseal: () => {},
};

const PortalSnapshotCacheContext = createContext<PortalSnapshotCacheValue>(NO_SNAPSHOT_CACHE);

/**
 * Try again remounts every `usePortalData` caller together.
 * NoticeBell and PortalDock share the getSnapshot subscription, so skipping
 * it in the page alone never drops the subscriber count to zero and Convex
 * does not send a new query. The query args stay `{ hostSlug }` — that is
 * all `getSnapshot` accepts.
 *
 * The last good snapshot lives here, above that remount, and is keyed by
 * user, org, and host. Sign-out clears it.
 */
export function PortalDataRetryProvider({ children }: { children: ReactNode }) {
  const [nonce, setNonce] = useState(0);
  const [cache, dispatch] = useReducer(reducePortalCache, EMPTY_PORTAL_CACHE);
  const retry = useCallback(() => setNonce((current) => current + 1), []);
  const remember = useCallback((key: PortalSnapshotKey, data: PortalSnapshot) => {
    dispatch({ type: 'remember', key, data });
  }, []);
  const clear = useCallback(() => dispatch({ type: 'clear' }), []);
  const signOut = useCallback(() => dispatch({ type: 'signOut' }), []);
  const unseal = useCallback(() => dispatch({ type: 'unseal' }), []);
  const cacheValue = useMemo<PortalSnapshotCacheValue>(
    () => ({ held: cache.held, sealed: cache.sealed, remember, clear, signOut, unseal }),
    [cache.held, cache.sealed, remember, clear, signOut, unseal],
  );
  return (
    <PortalSnapshotCacheContext.Provider value={cacheValue}>
      <PortalDataRetryContext.Provider value={retry}>
        <PortalDataRetryBoundary key={nonce}>{children}</PortalDataRetryBoundary>
      </PortalDataRetryContext.Provider>
    </PortalSnapshotCacheContext.Provider>
  );
}

function PortalDataRetryBoundary({ children }: { children: ReactNode }) {
  return children;
}

export function useRetryPortalData(): () => void {
  return useContext(PortalDataRetryContext);
}

export function usePortalSnapshotCache(): PortalSnapshotCacheValue {
  return useContext(PortalSnapshotCacheContext);
}
