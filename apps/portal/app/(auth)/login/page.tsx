'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AuthPageShell } from '@/components/auth/AuthPageShell';
import {
  PortalAuthUnavailable,
  PortalLoginForm,
} from '@/components/auth/PortalLoginForm';
import { usePortalAuth } from '@/hooks/usePortalAuth';
import { isConvexConfigured } from '@/lib/convex/client';
import { safeRedirectPath } from '@convex/_lib/safeRedirect';
import { isCantRegisterError } from '@convex/_lib/registration';

function LoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeRedirectPath(searchParams.get('next'));
  const urlError = searchParams.get('error');
  const configured = isConvexConfigured();
  const { portalSession, sessionPending, linkStatus } = usePortalAuth();
  const [subtitle, setSubtitle] = useState(
    isCantRegisterError(urlError)
      ? 'Create your portal account'
      : 'Sign in to continue to the portal',
  );

  useEffect(() => {
    if (!configured || sessionPending) return;
    if (portalSession && linkStatus === 'linked') {
      router.replace(next);
    }
  }, [configured, sessionPending, portalSession, linkStatus, next, router]);

  return (
    <AuthPageShell subtitle={subtitle}>
      {urlError && !isCantRegisterError(urlError) && (
        <p className="text-center" style={{ fontSize: 'var(--t-sm)', color: 'var(--danger)', marginTop: -12 }}>
          {urlError}
        </p>
      )}

      {!configured ? (
        <PortalAuthUnavailable />
      ) : sessionPending || (portalSession && linkStatus === 'linked') ? (
        <p
          className="ds-mono text-center"
          style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}
        >
          {portalSession ? 'Opening portal…' : 'Loading…'}
        </p>
      ) : (
        <PortalLoginForm
          redirectTo={next}
          showSignedInCard={false}
          initialScreen={isCantRegisterError(urlError) ? 'cant-register' : 'form'}
          onSubtitle={setSubtitle}
        />
      )}
    </AuthPageShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <AuthPageShell subtitle="Sign in to continue to the portal">
          <p className="ds-mono text-center" style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>
            Loading…
          </p>
        </AuthPageShell>
      }
    >
      <LoginInner />
    </Suspense>
  );
}
