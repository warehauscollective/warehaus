'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@convex/_generated/api';
import { signInToAcceptPath } from '@convex/_lib/acceptPaths';
import { AuthPageShell } from '@/components/auth/AuthPageShell';
import { GhostButton, PrimaryButton, Surface } from '@/components/ui/primitives';
import { usePortalAuth } from '@/hooks/usePortalAuth';
import { isConvexConfigured } from '@/lib/convex/client';

function InviteCard({ children }: { children: React.ReactNode }) {
  return (
    <Surface style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <p className="ds-mono" style={{ fontSize: 11, color: 'var(--muted)', margin: 0 }}>
        Invite
      </p>
      {children}
    </Surface>
  );
}

function DifferentEmailCard({
  signedInEmail,
  onSignOut,
  onBack,
}: {
  signedInEmail: string;
  onSignOut: () => void;
  onBack: () => void;
}) {
  return (
    <InviteCard>
      <h1 style={{ fontSize: 20, lineHeight: '26px', fontWeight: 600, margin: 0 }}>
        This invite is for a different email
      </h1>
      <p style={{ fontSize: 14, lineHeight: '21px', color: 'var(--muted)', margin: 0 }}>
        You’re signed in as {signedInEmail}. Sign out, then open the invite link again to continue.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 8, width: '100%' }}>
        <PrimaryButton fullWidth onClick={onSignOut}>
          Sign out and continue
        </PrimaryButton>
        <GhostButton fullWidth tone="foreground" onClick={onBack}>
          Back to portal
        </GhostButton>
      </div>
    </InviteCard>
  );
}

/** Layout-only frame. Used when Convex is not configured so local review never calls invites. */
export function AcceptInviteLayout({
  token,
  portalName,
  signedInEmail,
}: {
  token: string;
  portalName: string;
  signedInEmail: string;
}) {
  const router = useRouter();
  return (
    <AuthPageShell subtitle={portalName} tone="invite">
      <DifferentEmailCard
        signedInEmail={signedInEmail}
        onSignOut={() => router.push(signInToAcceptPath(token))}
        onBack={() => router.push('/')}
      />
    </AuthPageShell>
  );
}

export function AcceptInvite({ token }: { token: string }) {
  if (!isConvexConfigured()) {
    return (
      <AuthPageShell subtitle="Portal invite" tone="invite">
        <InviteCard>
          <h1 style={{ fontSize: 20, lineHeight: '26px', fontWeight: 600, margin: 0 }}>
            This link can’t be used
          </h1>
          <p style={{ fontSize: 14, lineHeight: '21px', color: 'var(--muted)', margin: 0 }}>
            This invite link can’t be used.
          </p>
        </InviteCard>
      </AuthPageShell>
    );
  }
  return <AcceptInviteLive token={token} />;
}

function AcceptInviteLive({ token }: { token: string }) {
  const router = useRouter();
  const preview = useQuery(api.invites.previewAccept, { token });
  const accept = useMutation(api.invites.accept);
  const decline = useMutation(api.invites.decline);
  const { signOut } = usePortalAuth();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const portalName = preview?.portalName ?? 'Portal invite';
  const continuePath = signInToAcceptPath(token);

  async function signOutAndContinue() {
    await signOut();
    router.replace(continuePath);
  }

  async function onAccept() {
    setPending(true);
    setMessage(null);
    try {
      const result = await accept({ token });
      if (!result.ok && result.status === 'different-email') return;
      if (!result.ok) {
        setMessage('This invite link can’t be used.');
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

  return (
    <AuthPageShell subtitle={portalName} tone="invite">
      {preview === undefined ? (
        <InviteCard>
          <p style={{ margin: 0, color: 'var(--muted)' }}>Loading…</p>
        </InviteCard>
      ) : preview.status === 'different-email' ? (
        <DifferentEmailCard
          signedInEmail={preview.signedInEmail}
          onSignOut={() => void signOutAndContinue()}
          onBack={() => router.push('/')}
        />
      ) : (
        <InviteCard>
          {preview.status === 'sign-in' ? (
            <>
              <h1 style={{ fontSize: 20, lineHeight: '26px', fontWeight: 600, margin: 0 }}>
                Sign in to accept
              </h1>
              <p style={{ fontSize: 14, lineHeight: '21px', color: 'var(--muted)', margin: 0 }}>
                Sign in with the email this invite was sent to. The link stays on this page.
              </p>
              <div style={{ paddingTop: 8, width: '100%' }}>
                <PrimaryButton fullWidth onClick={() => router.push(continuePath)}>
                  Sign in
                </PrimaryButton>
              </div>
            </>
          ) : preview.status === 'ready' ? (
            <>
              <h1 style={{ fontSize: 20, lineHeight: '26px', fontWeight: 600, margin: 0 }}>
                Accept your invite
              </h1>
              <p style={{ fontSize: 14, lineHeight: '21px', color: 'var(--muted)', margin: 0 }}>
                Accepting confirms this inbox. You can decline instead.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 8, width: '100%' }}>
                <PrimaryButton fullWidth disabled={pending} onClick={() => void onAccept()}>
                  Accept
                </PrimaryButton>
                <GhostButton fullWidth tone="foreground" onClick={() => void onDecline()}>
                  Decline
                </GhostButton>
              </div>
            </>
          ) : (
            <>
              <h1 style={{ fontSize: 20, lineHeight: '26px', fontWeight: 600, margin: 0 }}>
                This link can’t be used
              </h1>
              <p style={{ fontSize: 14, lineHeight: '21px', color: 'var(--muted)', margin: 0 }}>
                {preview.status === 'expired'
                  ? 'This invite has expired.'
                  : preview.status === 'unverified'
                    ? 'Verify your email, then open this link again.'
                    : 'This invite link can’t be used.'}
              </p>
              <div style={{ paddingTop: 8, width: '100%' }}>
                <GhostButton fullWidth tone="foreground" onClick={() => router.push('/')}>
                  Back to portal
                </GhostButton>
              </div>
            </>
          )}
          {message && (
            <p style={{ fontSize: 14, color: 'var(--muted)', margin: '8px 0 0' }}>{message}</p>
          )}
        </InviteCard>
      )}
    </AuthPageShell>
  );
}
