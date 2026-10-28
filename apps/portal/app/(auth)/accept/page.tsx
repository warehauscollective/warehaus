'use client';

import { Suspense } from 'react';
import { AcceptInvite } from '@/components/auth/AcceptInvite';

export default function AcceptPage() {
  return (
    <Suspense fallback={null}>
      <AcceptInvite />
    </Suspense>
  );
}
