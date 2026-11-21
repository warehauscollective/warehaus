'use client';

import { useEffect } from 'react';
import { OutlineButton } from '@/components/ui/primitives';

/** Catches a render failure in any route below the root layout. */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[portal] route error', error);
  }, [error]);

  return (
    <main className="ds-scope flex min-h-[100dvh] items-center justify-center px-6" role="alert">
      <div className="flex flex-col items-start" style={{ gap: 'var(--s-4)', maxWidth: 420 }}>
        <h1 style={{ fontSize: 'var(--t-md)', fontWeight: 600 }}>This page could not load.</h1>
        <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>
          Nothing was lost. Try again, or refresh the page if it keeps happening.
        </p>
        {error.digest ? (
          <p className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>
            Reference {error.digest}
          </p>
        ) : null}
        <OutlineButton onClick={reset}>Try again</OutlineButton>
      </div>
    </main>
  );
}
