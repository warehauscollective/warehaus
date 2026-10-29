'use client';

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

const PortalDataRetryContext = createContext<() => void>(() => {});

/**
 * Try again remounts every `usePortalData` caller together.
 * NoticeBell and PortalDock share the getSnapshot subscription, so skipping
 * it in the page alone never drops the subscriber count to zero and Convex
 * does not send a new query. The query args stay `{ hostSlug }` — that is
 * all `getSnapshot` accepts.
 */
export function PortalDataRetryProvider({ children }: { children: ReactNode }) {
  const [nonce, setNonce] = useState(0);
  const retry = useCallback(() => setNonce((current) => current + 1), []);
  return (
    <PortalDataRetryContext.Provider value={retry}>
      <PortalDataRetryBoundary key={nonce}>{children}</PortalDataRetryBoundary>
    </PortalDataRetryContext.Provider>
  );
}

function PortalDataRetryBoundary({ children }: { children: ReactNode }) {
  return children;
}

export function useRetryPortalData(): () => void {
  return useContext(PortalDataRetryContext);
}

/** Drop every shared subscriber, then subscribe once. That sends a new Add. */
export function retrySharedQuery<T>(
  subscribers: Array<{ unsubscribe: () => unknown }>,
  subscribe: () => T,
): T {
  for (const subscriber of subscribers) subscriber.unsubscribe();
  return subscribe();
}
