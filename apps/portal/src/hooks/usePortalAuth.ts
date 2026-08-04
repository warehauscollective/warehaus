'use client';

import { useCallback, useEffect, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@convex/_generated/api';
import { authClient } from '@/lib/auth-client';
import { getHostSlugFromLocation } from '@/lib/auth/host-slug';
import { isConvexConfigured } from '@/lib/convex/client';

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
  const configured = isConvexConfigured();
  const hostSlug = typeof window !== 'undefined' ? getHostSlugFromLocation() : null;
  const { data: session, isPending: sessionPending, refetch } = authClient.useSession();
  const linkSession = useMutation(api.contacts.linkSession);
  const linkStatus = useQuery(api.contacts.getLinkStatus, configured ? {} : 'skip');
  const portalSession = useQuery(
    api.me.getPortalSession,
    configured && linkStatus?.state === 'linked'
      ? { hostSlug: hostSlug ?? undefined }
      : 'skip',
  );

  const [joinError, setJoinError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  const ensureLinked = useCallback(async () => {
    if (!configured) return null;
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
      return result;
    } catch (err) {
      const message = errorMessage(err, 'Could not link portal contact');
      setJoinError(message);
      return null;
    } finally {
      setJoining(false);
    }
  }, [configured, linkSession, refetch]);

  useEffect(() => {
    if (!configured) return;
    if (sessionPending) return;
    if (!session?.user) {
      setJoinError(null);
      return;
    }
    if (linkStatus?.state === 'unlinked') {
      void ensureLinked();
    }
  }, [configured, sessionPending, session?.user, linkStatus?.state, ensureLinked]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      setJoinError(null);
      const { error } = await authClient.signIn.email({ email, password });
      if (error) {
        setJoinError(error.message ?? 'Sign in failed');
        return false;
      }
      const linked = await ensureLinked();
      return Boolean(linked);
    },
    [ensureLinked],
  );

  const signUp = useCallback(
    async (email: string, password: string, name?: string) => {
      setJoinError(null);
      const { error } = await authClient.signUp.email({
        email,
        password,
        name: name ?? email.split('@')[0] ?? 'Portal user',
      });
      if (error) {
        const msg = error.message ?? 'Sign up failed';
        // Common when the account already exists from a prior attempt
        if (/already|exists|registered/i.test(msg)) {
          setJoinError(`${msg} Try Sign in instead.`);
        } else {
          setJoinError(msg);
        }
        return false;
      }
      const linked = await ensureLinked();
      if (!linked) {
        await authClient.signOut();
        return false;
      }
      return true;
    },
    [ensureLinked],
  );

  const signOut = useCallback(async () => {
    setJoinError(null);
    await authClient.signOut();
  }, []);

  return {
    configured,
    hostSlug,
    sessionPending: configured && sessionPending,
    joining,
    joinError,
    authUser: session?.user ?? null,
    linkStatus: linkStatus?.state ?? (configured ? 'loading' : 'disabled'),
    portalSession: (portalSession as PortalSessionView | undefined) ?? null,
    signIn,
    signUp,
    signOut,
    ensureLinked,
  };
}
