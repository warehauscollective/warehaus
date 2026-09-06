'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PrimaryButton, Surface } from '@/components/ui/primitives';
import { authClient } from '@/lib/auth-client';

export function ResetPasswordForm({
  token,
  tokenError,
}: {
  token: string | null;
  tokenError: string | null;
}) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (tokenError || !token) {
    return (
      <Surface style={{ padding: 'var(--s-5)', maxWidth: 480, width: '100%' }}>
        <p className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>
          Password reset
        </p>
        <h3 style={{ fontSize: 'var(--t-md)', fontWeight: 600, marginTop: 8 }}>
          Link invalid or expired
        </h3>
        <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)', marginTop: 4 }}>
          {tokenError === 'INVALID_TOKEN'
            ? 'This reset link is invalid or has expired.'
            : 'Open the link from your email, or request a new reset.'}
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href="/forgot-password"
            style={{
              fontSize: 'var(--t-sm)',
              color: 'var(--muted)',
              textDecoration: 'underline',
            }}
          >
            Request a new link
          </Link>
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
      </Surface>
    );
  }

  if (done) {
    return (
      <Surface style={{ padding: 'var(--s-5)', maxWidth: 480, width: '100%' }}>
        <p className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>
          Password reset
        </p>
        <h3 style={{ fontSize: 'var(--t-md)', fontWeight: 600, marginTop: 8 }}>
          Password updated
        </h3>
        <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)', marginTop: 4 }}>
          You can sign in with your new password.
        </p>
        <div className="mt-5">
          <PrimaryButton
            type="button"
            onClick={() => {
              router.replace('/login');
            }}
          >
            Go to sign in
          </PrimaryButton>
        </div>
      </Surface>
    );
  }

  return (
    <Surface style={{ padding: 'var(--s-5)', maxWidth: 480, width: '100%' }}>
      <p className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>
        Password reset
      </p>
      <h3 style={{ fontSize: 'var(--t-md)', fontWeight: 600, marginTop: 8 }}>
        Choose a new password
      </h3>
      <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)', marginTop: 4 }}>
        Use at least 8 characters.
      </p>

      <form
        className="mt-5 flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void (async () => {
            setBusy(true);
            setError(null);
            try {
              if (password !== confirm) {
                setError('Passwords do not match.');
                return;
              }
              if (password.length < 8) {
                setError('Password must be at least 8 characters.');
                return;
              }
              const { error: resetError } = await authClient.resetPassword({
                newPassword: password,
                token,
              });
              if (resetError) {
                setError(resetError.message ?? 'Could not reset password.');
                return;
              }
              setDone(true);
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Could not reset password.');
            } finally {
              setBusy(false);
            }
          })();
        }}
      >
        <label className="flex flex-col" style={{ gap: 'var(--s-2)' }}>
          <span style={{ fontSize: 'var(--t-sm)', fontWeight: 500, color: 'var(--muted)' }}>
            New password
          </span>
          <input
            className="ds-input"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
          />
        </label>
        <label className="flex flex-col" style={{ gap: 'var(--s-2)' }}>
          <span style={{ fontSize: 'var(--t-sm)', fontWeight: 500, color: 'var(--muted)' }}>
            Confirm password
          </span>
          <input
            className="ds-input"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            minLength={8}
            required
          />
        </label>

        {error && (
          <p style={{ fontSize: 'var(--t-sm)', color: 'var(--danger)' }}>{error}</p>
        )}

        <div className="mt-2 flex justify-end">
          <PrimaryButton type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Update password'}
          </PrimaryButton>
        </div>
      </form>
    </Surface>
  );
}
