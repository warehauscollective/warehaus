'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from 'convex/react';
import { Eye, EyeOff } from 'lucide-react';
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
  const [showPassword, setShowPassword] = useState(false);
  const [mode, setMode] = useState<'signin' | 'register'>('signin');
  const [busy, setBusy] = useState(false);
  const [awaitingPortal, setAwaitingPortal] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const canRegister = useQuery(
    api.contacts.canRegister,
    mode === 'register' && email.includes('@') ? { email } : 'skip',
  );

  const portalReady = Boolean(portalSession) && linkStatus === 'linked';

  // After auth, stay on this form (button loading) until Contact join + session are ready.
  useEffect(() => {
    if (!awaitingPortal) return;
    if (joinError) {
      setAwaitingPortal(false);
      setBusy(false);
      return;
    }
    if (portalReady) {
      router.replace(redirectTo);
    }
  }, [awaitingPortal, joinError, portalReady, redirectTo, router]);

  // Already signed-in users hitting /login — keep the form, button shows Opening…, then go.
  useEffect(() => {
    if (showSignedInCard || busy || awaitingPortal) return;
    if (portalReady) {
      setAwaitingPortal(true);
      setBusy(true);
    }
  }, [showSignedInCard, busy, awaitingPortal, portalReady]);

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
  const pending = busy || joining || awaitingPortal;

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
          if (pending) return;
          void (async () => {
            setBusy(true);
            setLocalError(null);
            try {
              if (mode === 'register') {
                if (canRegister && !canRegister.ok) {
                  setLocalError('No enabled portal contact for this email.');
                  setBusy(false);
                  return;
                }
                const ok = await signUp(email.trim(), password);
                if (!ok) {
                  setBusy(false);
                  return;
                }
              } else {
                const ok = await signIn(email.trim(), password);
                if (!ok) {
                  setBusy(false);
                  return;
                }
              }
              // Keep button loading until portal session is ready, then navigate.
              setAwaitingPortal(true);
            } catch {
              setBusy(false);
              setAwaitingPortal(false);
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
            disabled={pending}
            required
          />
        </label>
        <label className="flex flex-col" style={{ gap: 'var(--s-2)' }}>
          <span style={{ fontSize: 'var(--t-sm)', fontWeight: 500, color: 'var(--muted)' }}>
            Password
          </span>
          <div style={{ position: 'relative' }}>
            <input
              className="ds-input"
              type={showPassword ? 'text' : 'password'}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              disabled={pending}
              required
              style={{ paddingRight: '2.75rem', width: '100%' }}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              disabled={pending}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-pressed={showPassword}
              style={{
                position: 'absolute',
                right: '0.55rem',
                top: '50%',
                transform: 'translateY(-50%)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '2rem',
                height: '2rem',
                border: 0,
                borderRadius: 6,
                background: 'transparent',
                color: 'var(--muted)',
                cursor: pending ? 'not-allowed' : 'pointer',
                opacity: pending ? 0.5 : 1,
                padding: 0,
              }}
            >
              {showPassword ? <EyeOff size={18} strokeWidth={1.75} /> : <Eye size={18} strokeWidth={1.75} />}
            </button>
          </div>
        </label>

        {mode === 'register' && canRegister && !canRegister.ok && (
          <p style={{ fontSize: 'var(--t-sm)', color: 'var(--danger)' }}>
            This email is not on an enabled Contact.
          </p>
        )}

        {error && (
          <p style={{ fontSize: 'var(--t-sm)', color: 'var(--danger)' }}>{error}</p>
        )}

        {authUser && linkStatus === 'unlinked' && !error && pending && (
          <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>
            Linking contact…
          </p>
        )}

        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setMode((m) => (m === 'signin' ? 'register' : 'signin'));
              setLocalError(null);
            }}
            style={{
              background: 'none',
              border: 0,
              color: 'var(--muted)',
              fontSize: 'var(--t-sm)',
              cursor: pending ? 'not-allowed' : 'pointer',
              opacity: pending ? 0.55 : 1,
              padding: 0,
              textDecoration: 'underline',
            }}
          >
            {mode === 'signin' ? 'First time? Create a password' : 'Have a password? Sign in'}
          </button>
          <PrimaryButton type="submit" disabled={pending}>
            {pending
              ? awaitingPortal || joining
                ? 'Opening…'
                : 'Signing in…'
              : mode === 'signin'
                ? 'Sign in'
                : 'Create'}
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
