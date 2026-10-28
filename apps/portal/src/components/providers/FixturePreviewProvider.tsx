'use client';

import { createContext, useContext, type ReactNode } from 'react';

const FixturePreviewContext = createContext(false);

/** Server pages set this only after `fixturePreviewAllowed()` passes. */
export function FixturePreviewProvider({ children }: { children: ReactNode }) {
  if (typeof window !== 'undefined') {
    window.__WH_FIXTURE_PREVIEW = true;
  }
  return <FixturePreviewContext.Provider value={true}>{children}</FixturePreviewContext.Provider>;
}

export function useFixturePreview(): boolean {
  return useContext(FixturePreviewContext);
}
