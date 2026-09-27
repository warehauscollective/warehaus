'use client';

import { useState } from 'react';
import Link from 'next/link';
import { PrimaryButton, Surface } from '@/components/ui/primitives';
import { authClient } from '@/lib/auth-client';
import {
  CANT_REGISTER_MESSAGE,
  REGISTRATION_UI_FLOOR_MS,
  VERIFY_EMAIL_PATH,
  checkEmailModel,
  registrationWaitMs,
} from '@convex/_lib/registration';

async function waitForRegistrationFloor(startedAtMs: number): Promise<void> {
  const wait = registrationWaitMs(performance.now() - startedAtMs, REGISTRATION_UI_FLOOR_MS);
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
}

const linkStyle = {
  fontSize: 'var(--t-sm)',
  color: 'var(--muted)',
  textDecoration: 'underline',
} as const;

export function CheckEmailPanel({ email }: { email: string }) {
  const copy = checkEmailModel();
  const [phase, setPhase] = useState<'idle' | 'sending' | 'sent'>('idle');

  return (
    <Surface style={{ padding: 'var(--s-5)', maxWidth: 480, width: '100%' }}>
      <p className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>
        Email verification
      </p>
      <h3 style={{ fontSize: 'var(--t-md)', fontWeight: 600, marginTop: 8 }}>{copy.title}</h3>
      <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)', marginTop: 4 }}>{copy.body}</p>
      <p style={{ fontSize: 'var(--t-sm)', marginTop: 12 }}>{email}</p>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <Link href="/login" style={linkStyle}>
          Back to sign in
        </Link>
        <PrimaryButton
          type="button"
          disabled={phase === 'sending'}
          onClick={() => {
            void (async () => {
              const started = performance.now();
              setPhase('sending');
              try {
                await authClient.sendVerificationEmail({
                  email,
                  callbackURL: VERIFY_EMAIL_PATH,
                });
              } catch {
                // Same confirmation either way. Do not surface whether an account exists.
              }
              await waitForRegistrationFloor(started);
              setPhase('sent');
            })();
          }}
        >
          {phase === 'sending' ? copy.resendPendingLabel : phase === 'sent' ? copy.resendDoneLabel : copy.resendLabel}
        </PrimaryButton>
      </div>
    </Surface>
  );
}

export function CantRegisterPanel() {
  return (
    <Surface style={{ padding: 'var(--s-5)', maxWidth: 480, width: '100%' }}>
      <p className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>
        Registration
      </p>
      <h3 style={{ fontSize: 'var(--t-md)', fontWeight: 600, marginTop: 8 }}>Can&apos;t register</h3>
      <p style={{ fontSize: 'var(--t-sm)', color: 'var(--foreground)', marginTop: 8 }}>
        {CANT_REGISTER_MESSAGE}
      </p>
      <div className="mt-5">
        <Link href="/login" style={linkStyle}>
          Back to sign in
        </Link>
      </div>
    </Surface>
  );
}

export function ExpiredVerificationPanel() {
  return (
    <Surface style={{ padding: 'var(--s-5)', maxWidth: 480, width: '100%' }}>
      <p className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>
        Email verification
      </p>
      <h3 style={{ fontSize: 'var(--t-md)', fontWeight: 600, marginTop: 8 }}>
        Link expired or already used
      </h3>
      <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)', marginTop: 4 }}>
        This verification link expired or was already used. Sign in to send a new one.
      </p>
      <div className="mt-5">
        <Link href="/login" style={linkStyle}>
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
        Email verification
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
