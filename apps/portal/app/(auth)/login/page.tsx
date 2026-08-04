'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  PortalAuthUnavailable,
  PortalLoginForm,
} from '@/components/auth/PortalLoginForm';
import { usePortalAuth } from '@/hooks/usePortalAuth';
import { isConvexConfigured } from '@/lib/convex/client';

function LoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next') || '/';
  const urlError = searchParams.get('error');
  const configured = isConvexConfigured();
  const { portalSession, sessionPending, linkStatus } = usePortalAuth();

  useEffect(() => {
    if (!configured || sessionPending) return;
    if (portalSession && linkStatus === 'linked') {
      router.replace(next.startsWith('/') ? next : '/');
    }
  }, [configured, sessionPending, portalSession, linkStatus, next, router]);

  return (
    <main
      className="ds-scope flex min-h-[100dvh] items-center justify-center px-6 py-12"
      style={{
        background:
          'radial-gradient(900px 480px at 50% 0%, color-mix(in oklab, var(--accent) 14%, transparent), transparent 70%), var(--background)',
      }}
    >
      <div className="flex w-full max-w-md flex-col gap-8">
        <header className="text-center">
          <p
            className="font-display"
            style={{
              fontSize: 'clamp(2rem, 1.5rem + 2vw, 2.75rem)',
              fontWeight: 700,
              letterSpacing: '-0.02em',
              lineHeight: 1,
            }}
          >
            Warehaus
          </p>
          <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)', marginTop: 10 }}>
            Sign in to continue to the portal
          </p>
          {urlError && (
            <p style={{ fontSize: 'var(--t-sm)', color: 'var(--danger)', marginTop: 12 }}>
              {urlError}
            </p>
          )}
        </header>

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
            redirectTo={next.startsWith('/') ? next : '/'}
            showSignedInCard={false}
          />
        )}
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="ds-scope flex min-h-[100dvh] items-center justify-center">
          <p className="ds-mono" style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>
            Loading…
          </p>
        </main>
      }
    >
      <LoginInner />
    </Suspense>
  );
}
