'use client';

import { type ReactNode, useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { usePortalAuth } from '@/hooks/usePortalAuth';
import { isConvexConfigured } from '@/lib/convex/client';

/**
 * Blocks portal chrome until Better Auth session + Contact join succeed.
 * Unauthenticated / unlinked users are sent to /login.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const configured = isConvexConfigured();
  const linkingRef = useRef(false);
  const {
    sessionPending,
    joining,
    authUser,
    linkStatus,
    portalSession,
    joinError,
    ensureLinked,
    signOut,
  } = usePortalAuth();

  useEffect(() => {
    if (!configured) {
      router.replace('/login');
      return;
    }
    if (sessionPending) return;

    const next = pathname && pathname !== '/' ? `?next=${encodeURIComponent(pathname)}` : '';

    if (!authUser) {
      router.replace(`/login${next}`);
      return;
    }

    if (joinError) {
      void (async () => {
        await signOut();
        router.replace(`/login?error=${encodeURIComponent(joinError)}`);
      })();
      return;
    }

    if (linkStatus === 'unlinked' && !joining && !linkingRef.current) {
      linkingRef.current = true;
      void ensureLinked().finally(() => {
        linkingRef.current = false;
      });
    }
  }, [
    configured,
    sessionPending,
    authUser,
    linkStatus,
    joining,
    joinError,
    ensureLinked,
    signOut,
    router,
    pathname,
  ]);

  const ready =
    configured &&
    !sessionPending &&
    !joining &&
    Boolean(authUser) &&
    linkStatus === 'linked' &&
    Boolean(portalSession) &&
    !joinError;

  if (!ready) {
    return (
      <div
        className="ds-scope flex h-[100dvh] items-center justify-center"
        style={{
          background:
            'radial-gradient(1200px 600px at 50% -10%, color-mix(in oklab, var(--accent) 12%, transparent), transparent), var(--background)',
        }}
      >
        <p className="ds-mono" style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>
          {joinError ? 'Access denied — redirecting…' : 'Checking access…'}
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
