'use client';

import { useCallback, useEffect, useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from '@convex/_generated/api';
import { authClient } from '@/lib/auth-client';
import { getHostSlugFromLocation } from '@/lib/auth/host-slug';
import { isConvexConfigured } from '@/lib/convex/client';
import { VERIFY_EMAIL_PATH, isCantRegisterError } from '@convex/_lib/registration';
import { FIXTURE_SESSION } from '@/lib/data/portalFixtures';
import { useFixturePreview } from '@/components/providers/FixturePreviewProvider';
import { useSafeQuery } from '@/hooks/useSafeQuery';

export type PortalSessionView = {
  contactId: string;
  orgId: string;
  orgSlug: string;
  role: string;
  name: string;
  email: string;
  isStaff: boolean;
};

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'string' && err) return err;
  return fallback;
}

export function usePortalAuth() {
  const fixtures = useFixturePreview();
  const configured = isConvexConfigured() && !fixtures;
  const hostSlug = typeof window !== 'undefined' ? getHostSlugFromLocation() : null;
  const { data: session, isPending: sessionPending, refetch } = authClient.useSession();
  const linkSession = useMutation(api.contacts.linkSession);
  const linkState = useSafeQuery<{ state: string }>(
    api.contacts.getLinkStatus,
    configured ? {} : 'skip',
  );
  const linkStatus = linkState.data;
  const portalState = useSafeQuery<PortalSessionView>(
    api.me.getPortalSession,
    configured && linkStatus?.state === 'linked'
      ? { hostSlug: hostSlug ?? undefined }
      : 'skip',
  );
  const portalSession = portalState.data;

  const [joinError, setJoinError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  const ensureLinked = useCallback(async () => {
    if (!configured) return { linked: false as const, message: 'Auth is not configured' };
    setJoining(true);
    setJoinError(null);
    try {
      // After sign-up/sign-in, React session state can lag — wait briefly for cookies/JWT.
      for (let i = 0; i < 8; i++) {
        const { data } = await authClient.getSession();
        if (data?.user) break;
        await new Promise((r) => setTimeout(r, 150));
      }

      const result = await linkSession({});
      await refetch?.();
      return { linked: true as const, result };
    } catch (err) {
      const message = errorMessage(err, 'Could not link portal contact');
      setJoinError(message);
      return { linked: false as const, message };
    } finally {
      setJoining(false);
    }
  }, [configured, linkSession, refetch]);

  useEffect(() => {
    if (!configured) return;
    if (sessionPending) return;
    if (linkState.error) return;
    if (!session?.user) {
      setJoinError(null);
      return;
    }
    if (linkStatus?.state === 'unlinked') {
      void ensureLinked().catch((err) => {
        setJoinError(errorMessage(err, 'Could not link portal contact'));
      });
    }
  }, [configured, sessionPending, session?.user, linkStatus?.state, linkState.error, ensureLinked]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      setJoinError(null);
      const { error } = await authClient.signIn.email({ email, password });
      if (error) {
        const code = 'code' in error ? String(error.code ?? '') : '';
        if (code === 'EMAIL_NOT_VERIFIED' || /not verified/i.test(error.message ?? '')) {
          return 'verify' as const;
        }
        setJoinError(error.message ?? 'Sign in failed');
        return 'error' as const;
      }
      const linked = await ensureLinked();
      if (linked.linked) return 'ok' as const;
      if (isCantRegisterError(linked.message)) return 'rejected' as const;
      return 'error' as const;
    },
    [ensureLinked],
  );

  const signUp = useCallback(async (email: string, password: string, name?: string) => {
    setJoinError(null);
    const { error } = await authClient.signUp.email({
      email,
      password,
      name: name ?? email.split('@')[0] ?? 'Portal user',
      callbackURL: VERIFY_EMAIL_PATH,
    });
    if (!error) return 'check-email' as const;
    const code = 'code' in error ? String(error.code ?? '') : '';
    if (code === 'CANT_REGISTER' || isCantRegisterError(error.message)) {
      return 'rejected' as const;
    }
    setJoinError(error.message ?? 'Sign up failed');
    return 'error' as const;
  }, []);

  const signOut = useCallback(async () => {
    setJoinError(null);
    await authClient.signOut();
  }, []);

  if (fixtures) {
    return {
      configured: false,
      hostSlug,
      sessionPending: false,
      joining: false,
      joinError: null,
      authUser: {
        id: FIXTURE_SESSION.contactId,
        email: FIXTURE_SESSION.email,
        name: FIXTURE_SESSION.name,
      },
      linkStatus: 'linked' as const,
      linkQueryError: null,
      portalSession: FIXTURE_SESSION,
      signIn,
      signUp,
      signOut,
      ensureLinked,
    };
  }

  return {
    configured,
    hostSlug,
    sessionPending: configured && sessionPending,
    joining,
    joinError,
    authUser: session?.user ?? null,
    linkStatus: linkState.error
      ? ('error' as const)
      : (linkStatus?.state ?? (configured ? 'loading' : 'disabled')),
    linkQueryError: linkState.error ?? portalState.error,
    portalSession: portalSession ?? null,
    signIn,
    signUp,
    signOut,
    ensureLinked,
  };
}
