'use client';

import { useState } from 'react';
import Link from 'next/link';
import { PrimaryButton, Surface } from '@/components/ui/primitives';
import { authClient } from '@/lib/auth-client';

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  return (
    <Surface style={{ padding: 'var(--s-5)', maxWidth: 480, width: '100%' }}>
      <p className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>
        Password reset
      </p>
      <h3 style={{ fontSize: 'var(--t-md)', fontWeight: 600, marginTop: 8 }}>
        Forgot password
      </h3>
      <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)', marginTop: 4 }}>
        Enter your portal email and we&apos;ll send a reset link if an account exists.
      </p>

      {sent ? (
        <div className="mt-5 flex flex-col gap-3">
          <p style={{ fontSize: 'var(--t-sm)', color: 'var(--foreground)' }}>
            If that email has a portal account, a reset link is on the way. Check your inbox
            (and spam), then follow the link to choose a new password.
          </p>
          <Link
            href="/login"
            style={{
              fontSize: 'var(--t-sm)',
              color: 'var(--muted)',
              textDecoration: 'underline',
            }}
          >
            Back to sign in
          </Link>
        </div>
      ) : (
        <form
          className="mt-5 flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void (async () => {
              setBusy(true);
              setError(null);
              try {
                const redirectTo = `${window.location.origin}/reset-password`;
                const { error: resetError } = await authClient.requestPasswordReset({
                  email: email.trim(),
                  redirectTo,
                });
                if (resetError) {
                  setError(resetError.message ?? 'Could not send reset email.');
                  return;
                }
                setSent(true);
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Could not send reset email.');
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

          {error && (
            <p style={{ fontSize: 'var(--t-sm)', color: 'var(--danger)' }}>{error}</p>
          )}

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <Link
              href="/login"
              style={{
                fontSize: 'var(--t-sm)',
                color: 'var(--muted)',
                textDecoration: 'underline',
              }}
            >
              Back to sign in
            </Link>
            <PrimaryButton type="submit" disabled={busy}>
              {busy ? 'Sending…' : 'Send reset link'}
            </PrimaryButton>
          </div>
        </form>
      )}
    </Surface>
  );
}
