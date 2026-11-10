'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';

export type FixtureAudience = 'staff' | 'client';

const FixturePreviewContext = createContext<{ enabled: boolean; audience: FixtureAudience }>({
  enabled: false,
  audience: 'staff',
});

function audienceFromQuery(value: string | null): FixtureAudience | null {
  if (value === 'client' || value === 'staff') return value;
  return null;
}

/**
 * Server pages set this only after `fixturePreviewAllowed()` passes.
 * An explicit audience wins. Otherwise `?as=client` or `?as=staff` selects the fixture viewer.
 */
export function FixturePreviewProvider({
  children,
  audience,
}: {
  children: ReactNode;
  audience?: FixtureAudience;
}) {
  const params = useSearchParams();
  const resolved = audience ?? audienceFromQuery(params.get('as')) ?? 'staff';
  if (typeof window !== 'undefined') {
    window.__WH_FIXTURE_PREVIEW = true;
  }
  return (
    <FixturePreviewContext.Provider value={{ enabled: true, audience: resolved }}>
      {children}
    </FixturePreviewContext.Provider>
  );
}

export function useFixturePreview(): boolean {
  return useContext(FixturePreviewContext).enabled;
}

export function useFixtureAudience(): FixtureAudience {
  const ctx = useContext(FixturePreviewContext);
  return ctx.enabled ? ctx.audience : 'staff';
}
