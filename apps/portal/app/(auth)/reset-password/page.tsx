'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { AuthPageShell } from '@/components/auth/AuthPageShell';
import { ResetPasswordForm } from '@/components/auth/ResetPasswordForm';

function ResetPasswordInner() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const tokenError = searchParams.get('error');

  return (
    <AuthPageShell subtitle="Choose a new password">
      <ResetPasswordForm token={token} tokenError={tokenError} />
    </AuthPageShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <AuthPageShell subtitle="Choose a new password">
          <p
            className="ds-mono text-center"
            style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}
          >
            Loading…
          </p>
        </AuthPageShell>
      }
    >
      <ResetPasswordInner />
    </Suspense>
  );
}
