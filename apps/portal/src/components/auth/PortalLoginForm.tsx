'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAction } from 'convex/react';
import { api } from '@convex/_generated/api';
import { passwordRuleState } from '@convex/_lib/passwordRules';
import { CANT_REGISTER_MESSAGE } from '@convex/_lib/registration';
import { safeRedirectPath } from '@convex/_lib/safeRedirect';
import { GhostButton, PrimaryButton, Surface } from '@/components/ui/primitives';
import {
  CantRegisterMessage,
  CheckEmailPanel,
  waitForRegistrationFloor,
} from '@/components/auth/EmailVerificationScreens';
import { usePortalAuth } from '@/hooks/usePortalAuth';

export function PortalLoginForm({
  redirectTo = '/',
  showSignedInCard = true,
  initialScreen = 'form',
  onSubtitle,
}: {
  redirectTo?: string;
  /** When false (login page), hide the “already signed in” card — parent redirects. */
  showSignedInCard?: boolean;
  initialScreen?: 'form' | 'cant-register';
  onSubtitle?: (subtitle: string) => void;
}) {
  const router = useRouter();
  const prepareRegistration = useAction(api.registrationGate.prepareRegistration);
  const { signIn, signUp, signOut, joinError, joining, portalSession, authUser, linkStatus } =
    usePortalAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'signin' | 'register'>(
    initialScreen === 'cant-register' ? 'register' : 'signin',
  );
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(
    initialScreen === 'cant-register' ? CANT_REGISTER_MESSAGE : null,
  );
  const [screen, setScreen] = useState<'form' | 'check-email'>('form');

  useEffect(() => {
    if (!onSubtitle) return;
    if (screen === 'check-email') onSubtitle('Verify your email');
    else if (mode === 'register') onSubtitle('Create your portal account');
    else onSubtitle('Sign in to continue to the portal');
  }, [mode, onSubtitle, screen]);

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
    return (
      <CheckEmailPanel
        email={email.trim()}
        onDifferentEmail={() => {
          setScreen('form');
          setMode('register');
          setEmailError(null);
          setLocalError(null);
        }}
      />
    );
  }

  const error = localError ?? (emailError ? null : joinError);
  const pending = busy || joining || linkStatus === 'loading';
  const destination = safeRedirectPath(redirectTo);
  const rules = passwordRuleState(password);
  const registerBlocked = mode === 'register' && !rules.ready;

  return (
    <Surface style={{ padding: 'var(--s-5)', maxWidth: 480, width: '100%' }}>
      <p className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>
        {mode === 'signin' ? 'Portal login' : 'Portal sign up'}
      </p>
      <h3 style={{ fontSize: 'var(--t-md)', fontWeight: 600, marginTop: 8 }}>
        {mode === 'signin' ? 'Sign in' : 'Create your account'}
      </h3>
      <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)', marginTop: 4, lineHeight: 1.5 }}>
        {mode === 'signin'
          ? 'Invite-only. Your email must match a Contact with Portal Access enabled.'
          : 'Invite-only. Use the email address your Warehaus team invited.'}
      </p>

      <form
        className="mt-5 flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (registerBlocked) return;
          void (async () => {
            setBusy(true);
            setLocalError(null);
            setEmailError(null);
            const started = performance.now();
            const trimmed = email.trim();
            try {
              if (mode === 'register') {
                const gate = await prepareRegistration({ email: trimmed });
                if (gate.screen === 'check-email') {
                  const outcome = await signUp(trimmed, password, name.trim() || undefined);
                  await waitForRegistrationFloor(started);
                  if (outcome === 'error') return;
                  setScreen('check-email');
                  return;
                }
                await waitForRegistrationFloor(started);
                setEmailError(CANT_REGISTER_MESSAGE);
                return;
              }

              const outcome = await signIn(trimmed, password);
              if (outcome === 'verify') {
                setScreen('check-email');
                return;
              }
              if (outcome === 'rejected') {
                setEmailError(CANT_REGISTER_MESSAGE);
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
        {mode === 'register' && (
          <label className="flex flex-col" style={{ gap: 'var(--s-2)' }}>
            <span style={{ fontSize: 'var(--t-sm)', fontWeight: 500 }}>Full name</span>
            <input
              className="ds-input"
              type="text"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>
        )}
        <label className="flex flex-col" style={{ gap: 'var(--s-2)' }}>
          <span style={{ fontSize: 'var(--t-sm)', fontWeight: 500 }}>Email</span>
          <input
            className="ds-input"
            type="email"
            autoComplete="username"
            value={email}
            aria-invalid={emailError ? true : undefined}
            onChange={(e) => {
              setEmail(e.target.value);
              if (emailError) setEmailError(null);
            }}
            required
            style={emailError ? { borderColor: 'var(--danger)' } : undefined}
          />
          {emailError && <CantRegisterMessage />}
        </label>
        <label className="flex flex-col" style={{ gap: 'var(--s-2)' }}>
          <span style={{ fontSize: 'var(--t-sm)', fontWeight: 500 }}>Password</span>
          <input
            className="ds-input"
            type="password"
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={mode === 'register' ? 12 : 8}
            required
          />
          {mode === 'register' && <PasswordHints password={password} />}
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

        {authUser && linkStatus === 'unlinked' && !error && !emailError && (
          <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>
            Linking contact…
          </p>
        )}

        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={() => {
              setMode((m) => (m === 'signin' ? 'register' : 'signin'));
              setLocalError(null);
              setEmailError(null);
            }}
            style={{
              background: 'none',
              border: 0,
              color: 'var(--muted)',
              fontSize: 'var(--t-sm)',
              cursor: 'pointer',
              padding: 0,
              textAlign: 'left',
            }}
          >
            {mode === 'signin' ? (
              <>
                First time?{' '}
                <span style={{ color: 'var(--foreground)', textDecoration: 'underline' }}>
                  Create a password
                </span>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <span style={{ color: 'var(--foreground)', textDecoration: 'underline' }}>
                  Sign in
                </span>
              </>
            )}
          </button>
          <PrimaryButton type="submit" disabled={pending || registerBlocked}>
            {pending
              ? mode === 'register'
                ? 'Creating account…'
                : 'Working…'
              : mode === 'signin'
                ? 'Sign in'
                : 'Create account'}
          </PrimaryButton>
        </div>
      </form>
    </Surface>
  );
}

function PasswordHints({ password }: { password: string }) {
  const rules = passwordRuleState(password);
  const items = [
    { met: rules.length, label: 'At least 12 characters' },
    { met: rules.mixedCase, label: 'Upper and lower case letters' },
    { met: rules.numberOrSymbol, label: 'A number or symbol' },
  ];
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1">
        {[0, 1, 2, 3].map((index) => (
          <span
            key={index}
            style={{
              flex: 1,
              height: 4,
              borderRadius: 999,
              background: index < rules.filledBars ? 'var(--foreground)' : 'var(--border)',
            }}
          />
        ))}
        <span style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap', marginLeft: 8 }}>
          Strength: {rules.label}
        </span>
      </div>
      <ul className="flex flex-col gap-1" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {items.map((item) => (
          <li
            key={item.label}
            className="flex items-center gap-2"
            style={{ fontSize: 12, color: item.met ? 'var(--foreground)' : 'var(--muted)' }}
          >
            <span
              aria-hidden
              style={{
                width: 6,
                height: 6,
                borderRadius: 999,
                background: item.met ? 'var(--foreground)' : 'var(--border)',
                display: 'inline-block',
              }}
            />
            {item.label}
          </li>
        ))}
      </ul>
    </div>
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
