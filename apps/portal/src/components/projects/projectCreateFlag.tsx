'use client';

import { createContext, useContext, type ReactNode } from 'react';

const ProjectCreateFlagContext = createContext(false);

/** Boolean already checked with `isNotionProjectCreateEnabled` on the server. */
export function ProjectCreateFlagProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactNode;
}) {
  return <ProjectCreateFlagContext.Provider value={enabled}>{children}</ProjectCreateFlagContext.Provider>;
}

export function useProjectCreateEnabled(): boolean {
  return useContext(ProjectCreateFlagContext);
}
