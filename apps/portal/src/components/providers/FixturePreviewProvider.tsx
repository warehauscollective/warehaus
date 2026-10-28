'use client';

import { createContext, useContext, type ReactNode } from 'react';

export type FixtureAudience = 'staff' | 'client';

const FixturePreviewContext = createContext<{ enabled: boolean; audience: FixtureAudience }>({
  enabled: false,
  audience: 'staff',
});

/** Server pages set this only after `fixturePreviewAllowed()` passes. */
export function FixturePreviewProvider({
  children,
  audience = 'staff',
}: {
  children: ReactNode;
  audience?: FixtureAudience;
}) {
  if (typeof window !== 'undefined') {
    window.__WH_FIXTURE_PREVIEW = true;
  }
  return (
    <FixturePreviewContext.Provider value={{ enabled: true, audience }}>
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
