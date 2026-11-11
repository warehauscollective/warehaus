'use client';

import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { usePortalAuth } from '@/hooks/usePortalAuth';
import { readStaffJoined } from '@/lib/staffJoined';
import { AuthGateScreen } from './AuthGateScreen';

/**
 * Blocks portal chrome until Better Auth session + Contact join succeed.
 * Unauthenticated / unlinked users are sent to /login.
 * A staff invite that is still linking is never signed out.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const linkingRef = useRef(false);
  const [staffJustJoined, setStaffJustJoined] = useState(false);
  useEffect(() => {
    if (readStaffJoined()) setStaffJustJoined(true);
  }, []);
  const {
    configured,
    sessionPending,
    joining,
    authUser,
    linkStatus,
    portalSession,
    joinError,
    linkQueryError,
    ensureLinked,
    signOut,
    staffInviteInProgress,
    staffInviteCheckPending,
    staffInviteConflicted,
  } = usePortalAuth();

  const replace = useCallback(
    (href: string) => {
      router.replace(href);
    },
    [router],
  );

  const onLink = useCallback(() => {
    if (linkingRef.current) return;
    linkingRef.current = true;
    void ensureLinked().finally(() => {
      linkingRef.current = false;
    });
  }, [ensureLinked]);

  return (
    <AuthGateScreen
      snapshot={{
        configured,
        sessionPending,
        hasUser: Boolean(authUser),
        joinError,
        linkStatus,
        joining,
        linking: linkingRef.current,
        staffInviteInProgress,
        staffInviteCheckPending,
        staffInviteConflicted,
        staffJustJoined,
        hasPortalSession: Boolean(portalSession),
        linkQueryError: Boolean(linkQueryError),
        pathname: pathname ?? '/',
      }}
      replace={replace}
      signOut={signOut}
      onLink={onLink}
    >
      {children}
    </AuthGateScreen>
  );
}
