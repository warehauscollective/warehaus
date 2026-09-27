'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AuthPageShell } from '@/components/auth/AuthPageShell';
import {
  CantRegisterPanel,
  ExpiredVerificationPanel,
  VerifiedEmailPanel,
} from '@/components/auth/EmailVerificationScreens';
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

  if (expired) {
    body = <ExpiredVerificationPanel />;
  } else if (refused || isCantRegisterError(joinError)) {
    body = <CantRegisterPanel />;
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
