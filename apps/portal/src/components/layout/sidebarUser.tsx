'use client';

import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import { authClient } from '@/lib/auth-client';
import { useFixtureAudience, useFixturePreview } from '@/components/providers/FixturePreviewProvider';
import { FIXTURE_CLIENT_SESSION, FIXTURE_SESSION } from '@/lib/data/portalFixtures';
import {
  applySidebarDataset,
  settleSidebarUser,
  writeSidebarMode,
  type SidebarMode,
} from './sidebarCollapse';

type SidebarUserValue = {
  userId: string | null;
  commitMode: (mode: SidebarMode) => void;
};

const SidebarUserContext = createContext<SidebarUserValue>({
  userId: null,
  commitMode: (mode) => applySidebarDataset(mode),
});

/**
 * One session read for every tab rail. Tests pass a known id and skip the auth client.
 */
export function SidebarUserHarness({
  userId,
  pending = false,
  children,
}: {
  userId: string | null;
  pending?: boolean;
  children: ReactNode;
}) {
  const pendingMode = useRef<SidebarMode | null>(null);

  useLayoutEffect(() => {
    const store = window.localStorage;
    const next = settleSidebarUser(store, userId, pending, pendingMode.current);
    pendingMode.current = next.held;
    if (next.persist && userId && next.mode) writeSidebarMode(store, userId, next.mode);
    if (next.mode) applySidebarDataset(next.mode);
  }, [userId, pending]);

  const commitMode = useCallback(
    (mode: SidebarMode) => {
      applySidebarDataset(mode);
      if (userId) writeSidebarMode(window.localStorage, userId, mode);
      else pendingMode.current = mode;
    },
    [userId],
  );
  const value = useMemo(() => ({ userId, commitMode }), [userId, commitMode]);

  return <SidebarUserContext.Provider value={value}>{children}</SidebarUserContext.Provider>;
}

/** Shared by the five tab rails. Does not run the portal auto-link queries. */
export function SidebarUserProvider({ children }: { children: ReactNode }) {
  const fixtures = useFixturePreview();
  const audience = useFixtureAudience();
  const session = authClient.useSession();
  const userId = fixtures
    ? audience === 'client'
      ? FIXTURE_CLIENT_SESSION.contactId
      : FIXTURE_SESSION.contactId
    : (session.data?.user?.id ?? null);
  const pending = fixtures ? false : session.isPending;
  return (
    <SidebarUserHarness userId={userId} pending={pending}>
      {children}
    </SidebarUserHarness>
  );
}

export function useSidebarUser(): SidebarUserValue {
  return useContext(SidebarUserContext);
}
