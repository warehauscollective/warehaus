'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from 'convex/react';
import { api } from '@convex/_generated/api';
import { GhostButton, PrimaryButton, Surface } from '@/components/ui/primitives';
import { usePortalAuth } from '@/hooks/usePortalAuth';

export function PortalLoginForm({
  redirectTo = '/',
  showSignedInCard = true,
}: {
  redirectTo?: string;
  /** When false (login page), hide the “already signed in” card — parent redirects. */
  showSignedInCard?: boolean;
}) {
  const router = useRouter();
  const { signIn, signUp, signOut, joinError, joining, portalSession, authUser, linkStatus } =
    usePortalAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'signin' | 'register'>('signin');
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const canRegister = useQuery(
    api.contacts.canRegister,
    mode === 'register' && email.includes('@') ? { email } : 'skip',
  );

  if (showSignedInCard && portalSession) {
    return (
      <Surface style={{ padding: 'var(--s-5)', maxWidth: 480 }}>
        <p className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>
          Signed in
        </p>
        <h3 style={{ fontSize: 'var(--t-md)', fontWeight: 600, marginTop: 8 }}>
          {portalSession.name}
        </h3>
        <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)', marginTop: 4 }}>
          {portalSession.email}
        </p>
        <p className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--faint)', marginTop: 8 }}>
          {portalSession.role} · {portalSession.orgSlug}
          {portalSession.isStaff ? ' · staff' : ''}
        </p>
        <div className="mt-5 flex justify-end">
          <GhostButton
            onClick={() => {
              void (async () => {
                await signOut();
                router.replace('/login');
              })();
            }}
          >
            Sign out
          </GhostButton>
        </div>
      </Surface>
    );
  }

  const error = localError ?? joinError;
  const pending = busy || joining || linkStatus === 'loading';

  return (
    <Surface style={{ padding: 'var(--s-5)', maxWidth: 480, width: '100%' }}>
      <p className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>
        Portal login
      </p>
      <h3 style={{ fontSize: 'var(--t-md)', fontWeight: 600, marginTop: 8 }}>
        {mode === 'signin' ? 'Sign in' : 'Create password'}
      </h3>
      <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)', marginTop: 4 }}>
        Invite-only. Your email must match a Contact with Portal Access enabled.
      </p>

      <form
        className="mt-5 flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void (async () => {
            setBusy(true);
            setLocalError(null);
            try {
              if (mode === 'register') {
                if (canRegister && !canRegister.ok) {
                  setLocalError('No enabled portal contact for this email.');
                  return;
                }
                const ok = await signUp(email.trim(), password);
                if (!ok) return; // joinError / sign-up error already set on the hook
              } else {
                const ok = await signIn(email.trim(), password);
                if (!ok) return;
              }
              router.replace(redirectTo);
            } finally {
              setBusy(false);
            }
          })();
        }}
      >
        <label className="flex flex-col" style={{ gap: 'var(--s-2)' }}>
          <span style={{ fontSize: 'var(--t-sm)', fontWeight: 500, color: 'var(--muted)' }}>
            Email
          </span>
          <input
            className="ds-input"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label className="flex flex-col" style={{ gap: 'var(--s-2)' }}>
          <span style={{ fontSize: 'var(--t-sm)', fontWeight: 500, color: 'var(--muted)' }}>
            Password
          </span>
          <input
            className="ds-input"
            type="password"
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
          />
        </label>

        {mode === 'signin' && (
          <div className="flex justify-end">
            <Link
              href="/forgot-password"
              style={{
                fontSize: 'var(--t-sm)',
                color: 'var(--muted)',
                textDecoration: 'underline',
              }}
            >
              Forgot password?
            </Link>
          </div>
        )}

        {mode === 'register' && canRegister && !canRegister.ok && (
          <p style={{ fontSize: 'var(--t-sm)', color: 'var(--danger)' }}>
            This email is not on an enabled Contact.
          </p>
        )}

        {error && (
          <p style={{ fontSize: 'var(--t-sm)', color: 'var(--danger)' }}>{error}</p>
        )}

        {authUser && linkStatus === 'unlinked' && !error && (
          <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>
            Linking contact…
          </p>
        )}

        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => {
              setMode((m) => (m === 'signin' ? 'register' : 'signin'));
              setLocalError(null);
            }}
            style={{
              background: 'none',
              border: 0,
              color: 'var(--muted)',
              fontSize: 'var(--t-sm)',
              cursor: 'pointer',
              padding: 0,
              textDecoration: 'underline',
            }}
          >
            {mode === 'signin' ? 'First time? Create a password' : 'Have a password? Sign in'}
          </button>
          <PrimaryButton type="submit">
            {pending ? 'Working…' : mode === 'signin' ? 'Sign in' : 'Create'}
          </PrimaryButton>
        </div>
      </form>
    </Surface>
  );
}

export function PortalAuthUnavailable() {
  return (
    <Surface style={{ padding: 'var(--s-5)', maxWidth: 480, width: '100%' }}>
      <p className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>
        Auth
      </p>
      <h3 style={{ fontSize: 'var(--t-md)', fontWeight: 600, marginTop: 8 }}>
        Convex not configured
      </h3>
      <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)', marginTop: 4 }}>
        Set <span className="ds-mono">NEXT_PUBLIC_CONVEX_URL</span> and run{' '}
        <span className="ds-mono">npm run dev:convex</span> in the portal app to enable login.
      </p>
    </Surface>
  );
}
