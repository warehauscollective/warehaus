'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { AcceptInvite, AcceptInviteLayout } from '@/components/auth/AcceptInvite';
import { isConvexConfigured } from '@/lib/convex/client';

function AcceptInner() {
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  if (!token) {
    return (
      <main className="ds-scope flex min-h-[100dvh] items-center justify-center px-6">
        <p>This invite link can’t be used.</p>
      </main>
    );
  }
  // Local layout review only. A configured deployment always uses the live preview query.
  if (!isConvexConfigured() && params.get('view') === 'different-email') {
    return (
      <AcceptInviteLayout
        token={token}
        portalName="Northwind portal invite"
        signedInEmail="jordan.r@gmail.com"
      />
    );
  }
  return <AcceptInvite token={token} />;
}

export default function AcceptPage() {
  return (
    <Suspense fallback={<main className="ds-scope flex min-h-[100dvh] items-center justify-center">Loading…</main>}>
      <AcceptInner />
    </Suspense>
  );
}
