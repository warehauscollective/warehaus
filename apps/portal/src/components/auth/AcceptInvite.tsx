'use client';

import { useState } from 'react';
import { useMutation } from 'convex/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@convex/_generated/api';
import { AuthPageShell } from '@/components/auth/AuthPageShell';
import { GhostButton, PrimaryButton, Surface } from '@/components/ui/primitives';
import { usePortalAuth } from '@/hooks/usePortalAuth';
import { useSafeQuery } from '@/hooks/useSafeQuery';
import { isConvexConfigured } from '@/lib/convex/client';
import { signInToAcceptPath } from '@convex/_lib/acceptPaths';

type Preview = {
  status: 'sign-in' | 'ready' | 'different-email' | 'mismatch' | 'unverified' | 'unusable' | 'expired';
  portalName: string;
  signedInEmail?: string;
};

export function AcceptInvite() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const configured = isConvexConfigured();
  const { signOut } = usePortalAuth();
  const preview = useSafeQuery<Preview>(api.invites.previewAccept, configured && token ? { token } : 'skip');
  const accept = useMutation(api.invites.accept);
  const decline = useMutation(api.invites.decline);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const portalName = preview.data?.portalName ?? 'Portal invite';

  async function signOutAndContinue() {
    await signOut();
    router.push(signInToAcceptPath(token));
  }

  async function onAccept() {
    setPending(true);
    setMessage(null);
    try {
      const result = await accept({ token });
      if (!result.ok && result.status === 'different-email') return;
      if (!result.ok) {
        setMessage(result.message ?? 'This invite link can’t be used.');
        return;
      }
      setMessage('You’re in. Sign in to continue.');
    } catch {
      setMessage('This invite link can’t be used.');
    } finally {
      setPending(false);
    }
  }

  async function onDecline() {
    setPending(true);
    try {
      const result = await decline({ token });
      setMessage(result.ok ? 'Decline sent.' : 'This invite link can’t be used.');
    } catch {
      setMessage('This invite link can’t be used.');
    } finally {
      setPending(false);
    }
  }

  if (!token) {
    return (
      <AuthPageShell subtitle="Portal invite">
        <Surface style={{ padding: 24 }}>
          <p style={{ fontSize: 'var(--t-sm)' }}>This invite link can’t be used.</p>
        </Surface>
      </AuthPageShell>
    );
  }

  const status = preview.data?.status;

  return (
    <AuthPageShell subtitle={portalName}>
      <Surface style={{ padding: 24 }}>
        {preview.loading && <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>Loading invite…</p>}
        {status === 'different-email' && (
          <div className="flex flex-col gap-3">
            <h1 className="font-display" style={{ fontSize: 22, lineHeight: 1.2, margin: 0 }}>
              This invite is for a different email
            </h1>
            <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>
              You’re signed in as {preview.data?.signedInEmail}. Sign out, then open the invite link again to
              continue.
            </p>
            <PrimaryButton disabled={pending} onClick={() => void signOutAndContinue()}>
              Sign out and continue
            </PrimaryButton>
            <GhostButton onClick={() => router.push('/')}>Back to portal</GhostButton>
          </div>
        )}
        {status === 'sign-in' && (
          <div className="flex flex-col gap-3">
            <h1 className="font-display" style={{ fontSize: 22, lineHeight: 1.2, margin: 0 }}>
              Sign in to accept
            </h1>
            <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>
              Sign in with the email this invite was sent to. The link stays on this page.
            </p>
            <PrimaryButton onClick={() => router.push(signInToAcceptPath(token))}>Sign in</PrimaryButton>
          </div>
        )}
        {status === 'ready' && (
          <div className="flex flex-col gap-3">
            <h1 className="font-display" style={{ fontSize: 22, lineHeight: 1.2, margin: 0 }}>
              Ready to accept
            </h1>
            <PrimaryButton disabled={pending} onClick={() => void onAccept()}>
              Accept
            </PrimaryButton>
            <GhostButton onClick={() => void onDecline()}>Decline</GhostButton>
          </div>
        )}
        {status && status !== 'sign-in' && status !== 'ready' && status !== 'different-email' && (
          <div className="flex flex-col gap-3">
            <p style={{ fontSize: 'var(--t-sm)' }}>
              {status === 'expired'
                ? 'This invite has expired.'
                : status === 'unverified'
                  ? 'Verify your email, then open this link again.'
                  : 'This invite link can’t be used.'}
            </p>
            <GhostButton onClick={() => router.push('/')}>Back to portal</GhostButton>
          </div>
        )}
        {message && <p style={{ fontSize: 'var(--t-sm)', marginTop: 12 }}>{message}</p>}
      </Surface>
    </AuthPageShell>
  );
}
