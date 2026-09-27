'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAction } from 'convex/react';
import { api } from '@convex/_generated/api';
import { safeRedirectPath } from '@convex/_lib/safeRedirect';
import { GhostButton, PrimaryButton, Surface } from '@/components/ui/primitives';
import {
  CantRegisterPanel,
  CheckEmailPanel,
  waitForRegistrationFloor,
} from '@/components/auth/EmailVerificationScreens';
import { usePortalAuth } from '@/hooks/usePortalAuth';

export function PortalLoginForm({
  redirectTo = '/',
  showSignedInCard = true,
  initialScreen = 'form',
}: {
  redirectTo?: string;
  /** When false (login page), hide the “already signed in” card — parent redirects. */
  showSignedInCard?: boolean;
  initialScreen?: 'form' | 'cant-register';
}) {
  const router = useRouter();
  const prepareRegistration = useAction(api.registrationGate.prepareRegistration);
  const { signIn, signUp, signOut, joinError, joining, portalSession, authUser, linkStatus } =
    usePortalAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'signin' | 'register'>('signin');
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [screen, setScreen] = useState<'form' | 'check-email' | 'cant-register'>(initialScreen);

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

  if (screen === 'check-email') {
    return <CheckEmailPanel email={email.trim()} />;
  }

  if (screen === 'cant-register') {
    return <CantRegisterPanel />;
  }

  const error = localError ?? joinError;
  const pending = busy || joining || linkStatus === 'loading';
  const destination = safeRedirectPath(redirectTo);

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
            const started = performance.now();
            const trimmed = email.trim();
            try {
              if (mode === 'register') {
                const gate = await prepareRegistration({ email: trimmed });
                if (gate.screen === 'check-email') {
                  const outcome = await signUp(trimmed, password);
                  await waitForRegistrationFloor(started);
                  if (outcome === 'error') return;
                  setScreen('check-email');
                  return;
                }
                await waitForRegistrationFloor(started);
                setScreen('cant-register');
                return;
              }

              const outcome = await signIn(trimmed, password);
              if (outcome === 'verify') {
                setScreen('check-email');
                return;
              }
              if (outcome === 'rejected') {
                setScreen('cant-register');
                return;
              }
              if (outcome !== 'ok') return;
              router.replace(destination);
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
