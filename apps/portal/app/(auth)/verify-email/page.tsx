'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AuthPageShell } from '@/components/auth/AuthPageShell';
import {
  CantRegisterMessage,
  CheckEmailPanel,
  ExpiredVerificationPanel,
  VerifiedEmailPanel,
} from '@/components/auth/EmailVerificationScreens';
import { Surface } from '@/components/ui/primitives';
import { usePortalAuth } from '@/hooks/usePortalAuth';
import { isCantRegisterError } from '@convex/_lib/registration';
import { safeRedirectPath } from '@convex/_lib/safeRedirect';

function VerifyEmailInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tokenError = searchParams.get('error');
  const next = safeRedirectPath(searchParams.get('next'));
  const { authUser, sessionPending, linkStatus, joinError, signOut } = usePortalAuth();
  const [refused, setRefused] = useState(false);
  const [resentTo, setResentTo] = useState<string | null>(null);

  const expired =
    tokenError === 'TOKEN_EXPIRED' ||
    tokenError === 'INVALID_TOKEN' ||
    tokenError === 'USER_NOT_FOUND';

  useEffect(() => {
    if (refused || !isCantRegisterError(joinError)) return;
    setRefused(true);
    void signOut();
  }, [joinError, refused, signOut]);

  let body = (
    <p className="ds-mono text-center" style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>
      Checking your link…
    </p>
  );

  if (resentTo) {
    body = <CheckEmailPanel email={resentTo} />;
  } else if (expired) {
    body = <ExpiredVerificationPanel onSent={setResentTo} />;
  } else if (refused || isCantRegisterError(joinError)) {
    body = (
      <Surface style={{ padding: 'var(--s-5)', maxWidth: 480, width: '100%' }}>
        <p className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>
          Portal sign up
        </p>
        <h3 style={{ fontSize: 'var(--t-md)', fontWeight: 600, marginTop: 8 }}>Can&apos;t register</h3>
        <div style={{ marginTop: 12 }}>
          <CantRegisterMessage />
        </div>
      </Surface>
    );
  } else if (!sessionPending && authUser && linkStatus === 'linked') {
    body = <VerifiedEmailPanel onContinue={() => router.replace(next)} />;
  }

  return <AuthPageShell subtitle="Verify your email">{body}</AuthPageShell>;
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <AuthPageShell subtitle="Verify your email">
          <p className="ds-mono text-center" style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>
            Loading…
          </p>
        </AuthPageShell>
      }
    >
      <VerifyEmailInner />
    </Suspense>
  );
}
