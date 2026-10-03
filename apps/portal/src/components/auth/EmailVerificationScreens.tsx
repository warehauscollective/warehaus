'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ButtonSpinner, PrimaryButton, Surface } from '@/components/ui/primitives';
import { authClient } from '@/lib/auth-client';
import {
  CANT_REGISTER_MESSAGE,
  REGISTRATION_UI_FLOOR_MS,
  VERIFY_EMAIL_PATH,
  checkEmailModel,
  needsTypedVerifyEmail,
  registrationWaitMs,
} from '@convex/_lib/registration';
import {
  RESEND_COOLDOWN_MS,
  formatResendCountdown,
} from '@convex/_lib/resendCooldown';

export const PENDING_VERIFY_EMAIL_KEY = 'warehaus.pendingVerifyEmail';

export function rememberPendingVerifyEmail(email: string): void {
  try {
    sessionStorage.setItem(PENDING_VERIFY_EMAIL_KEY, email.trim());
  } catch {
    // Private mode can block storage. The screen still shows the typed address.
  }
}

export function readPendingVerifyEmail(): string {
  try {
    return sessionStorage.getItem(PENDING_VERIFY_EMAIL_KEY)?.trim() ?? '';
  } catch {
    return '';
  }
}

async function waitForRegistrationFloor(startedAtMs: number): Promise<void> {
  const wait = registrationWaitMs(performance.now() - startedAtMs, REGISTRATION_UI_FLOOR_MS);
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
}

const textLink = {
  fontSize: 'var(--t-sm)',
  textDecoration: 'underline',
  background: 'none',
  border: 0,
  padding: 0,
  cursor: 'pointer',
} as const;

function useResendCooldown(run: number) {
  const [remainingMs, setRemainingMs] = useState(RESEND_COOLDOWN_MS);

  useEffect(() => {
    setRemainingMs(RESEND_COOLDOWN_MS);
    const started = Date.now();
    const timer = window.setInterval(() => {
      const left = RESEND_COOLDOWN_MS - (Date.now() - started);
      setRemainingMs(left > 0 ? left : 0);
      if (left <= 0) window.clearInterval(timer);
    }, 250);
    return () => window.clearInterval(timer);
  }, [run]);

  return remainingMs;
}

async function requestVerificationEmail(email: string): Promise<void> {
  try {
    await authClient.sendVerificationEmail({
      email,
      callbackURL: VERIFY_EMAIL_PATH,
    });
  } catch {
    // Same confirmation either way. Do not surface whether an account exists.
  }
}

export function CheckEmailPanel({
  email,
  onDifferentEmail,
}: {
  email: string;
  onDifferentEmail?: () => void;
}) {
  const copy = checkEmailModel();
  const [cooldownRun, setCooldownRun] = useState(0);
  const remainingMs = useResendCooldown(cooldownRun);
  const cooling = remainingMs > 0;

  useEffect(() => {
    rememberPendingVerifyEmail(email);
  }, [email]);

  return (
    <Surface style={{ padding: 'var(--s-5)', maxWidth: 480, width: '100%' }}>
      <p className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>
        Verify email
      </p>
      <h3 style={{ fontSize: 'var(--t-md)', fontWeight: 600, marginTop: 8 }}>{copy.title}</h3>
      <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)', marginTop: 8, lineHeight: 1.5 }}>
        {copy.body}
      </p>
      <div
        style={{
          marginTop: 16,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px 16px',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border)',
          background: 'var(--bg)',
        }}
      >
        <span
          className="ds-mono"
          style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)', letterSpacing: '0.08em' }}
        >
          EMAIL
        </span>
        <span style={{ fontSize: 'var(--t-sm)', color: 'var(--foreground)' }}>{email}</span>
      </div>
      <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 12, lineHeight: 1.45 }}>
        {copy.hint}
      </p>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        {cooling ? (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 'var(--t-sm)',
              color: 'var(--faint)',
            }}
          >
            <span
              aria-hidden
              style={{
                width: 12,
                height: 12,
                borderRadius: 999,
                border: '1.5px solid currentColor',
                display: 'inline-block',
              }}
            />
            {formatResendCountdown(remainingMs)}
          </span>
        ) : (
          <button
            type="button"
            style={{ ...textLink, color: 'var(--foreground)' }}
            onClick={() => {
              void requestVerificationEmail(email);
              setCooldownRun((n) => n + 1);
            }}
          >
            {copy.resendLabel}
          </button>
        )}
        {onDifferentEmail ? (
          <button
            type="button"
            style={{ ...textLink, color: 'var(--muted)' }}
            onClick={onDifferentEmail}
          >
            {copy.differentEmailLabel}
          </button>
        ) : (
          <Link href="/login" style={{ ...textLink, color: 'var(--muted)' }}>
            {copy.differentEmailLabel}
          </Link>
        )}
      </div>
    </Surface>
  );
}

export function CantRegisterMessage() {
  return (
    <span style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
      <span
        aria-hidden
        style={{
          width: 16,
          height: 16,
          flex: '0 0 16px',
          marginTop: 1,
          borderRadius: 999,
          border: '1.25px solid var(--danger)',
          color: 'var(--danger)',
          fontSize: 10,
          fontWeight: 600,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          lineHeight: 1,
        }}
      >
        !
      </span>
      <span style={{ fontSize: 13, lineHeight: '18px', color: 'var(--danger)' }}>
        {CANT_REGISTER_MESSAGE}
      </span>
    </span>
  );
}

export function ExpiredVerificationPanel({
  onSent,
}: {
  onSent?: (email: string) => void;
}) {
  const storedEmail = readPendingVerifyEmail();
  const askForEmail = needsTypedVerifyEmail(storedEmail);
  const [typedEmail, setTypedEmail] = useState('');
  const [sending, setSending] = useState(false);
  const email = askForEmail ? typedEmail.trim() : storedEmail;
  const canSend = email.includes('@') && !sending;

  return (
    <Surface style={{ padding: 'var(--s-5)', maxWidth: 480, width: '100%' }}>
      <p className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>
        Verify email
      </p>
      <h3 style={{ fontSize: 'var(--t-md)', fontWeight: 600, marginTop: 8 }}>
        Link expired or already used
      </h3>
      <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)', marginTop: 8, lineHeight: 1.5 }}>
        This verification link is invalid, has expired or has already been used. Send a new link to
        continue.
      </p>
      <form
        className="mt-5 flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!canSend) return;
          void (async () => {
            setSending(true);
            try {
              await requestVerificationEmail(email);
              onSent?.(email);
            } finally {
              setSending(false);
            }
          })();
        }}
      >
        {askForEmail && (
          <label className="flex flex-col" style={{ gap: 'var(--s-2)' }}>
            <span style={{ fontSize: 'var(--t-sm)', fontWeight: 500 }}>Email</span>
            <input
              className="ds-input"
              type="email"
              autoComplete="username"
              value={typedEmail}
              onChange={(event) => setTypedEmail(event.target.value)}
              required
            />
          </label>
        )}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Link href="/login" style={{ ...textLink, color: 'var(--muted)' }}>
            Back to sign in
          </Link>
          <PrimaryButton type="submit" disabled={!canSend} className="w-full sm:w-auto">
            {sending ? (
              <>
                <ButtonSpinner />
                Sending…
              </>
            ) : (
              'Send a new link'
            )}
          </PrimaryButton>
        </div>
      </form>
    </Surface>
  );
}

export function VerifyLinkErrorPanel() {
  return (
    <Surface style={{ padding: 'var(--s-5)', maxWidth: 480, width: '100%' }}>
      <p className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>
        Verify email
      </p>
      <h3 style={{ fontSize: 'var(--t-md)', fontWeight: 600, marginTop: 8 }}>Something went wrong</h3>
      <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)', marginTop: 8, lineHeight: 1.5 }}>
        We couldn&apos;t check this link. Back to sign in and try again.
      </p>
      <div className="mt-5">
        <Link href="/login" style={{ ...textLink, color: 'var(--muted)' }}>
          Back to sign in
        </Link>
      </div>
    </Surface>
  );
}

export function VerifiedEmailPanel({ onContinue }: { onContinue: () => void }) {
  return (
    <Surface style={{ padding: 'var(--s-5)', maxWidth: 480, width: '100%' }}>
      <p className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>
        Verify email
      </p>
      <h3 style={{ fontSize: 'var(--t-md)', fontWeight: 600, marginTop: 8 }}>Email verified</h3>
      <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)', marginTop: 4 }}>
        Your email is verified. Continue into the portal.
      </p>
      <div className="mt-5 flex justify-end">
        <PrimaryButton type="button" onClick={onContinue}>
          Continue
        </PrimaryButton>
      </div>
    </Surface>
  );
}

export { waitForRegistrationFloor };
