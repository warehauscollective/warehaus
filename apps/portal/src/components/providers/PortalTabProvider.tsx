'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  PORTAL_TABS,
  getPortalTabForPath,
  isPortalTab,
  type PortalTab,
} from '@warehaus/logic/portal';
import { createSwipePanelRefs } from '@warehaus/ui';

const PORTAL_TAB_VALUES = PORTAL_TABS.map((t) => t.value) as PortalTab[];

interface PortalTabContextValue {
  tabs: readonly PortalTab[];
  activeTab: PortalTab;
  setActiveTab: (tab: PortalTab) => void;
  panelRefs: Record<PortalTab, RefObject<HTMLDivElement | null>>;
  activePanelRef: RefObject<HTMLDivElement | null>;
}

const PortalTabContext = createContext<PortalTabContextValue | null>(null);

export function PortalTabProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [activeTab, setActiveTabState] = useState<PortalTab>(() =>
    getPortalTabForPath(pathname),
  );

  const panelRefs = useMemo(
    () => createSwipePanelRefs(PORTAL_TAB_VALUES),
    [],
  );

  // Deep links / back-forward: keep tab state aligned with the path.
  useEffect(() => {
    setActiveTabState(getPortalTabForPath(pathname));
  }, [pathname]);

  const setActiveTab = useCallback(
    (tab: PortalTab) => {
      setActiveTabState(tab);
      const href = PORTAL_TABS.find((t) => t.value === tab)?.href ?? '/';
      if (getPortalTabForPath(pathname) !== tab) {
        router.replace(href);
      }
    },
    [pathname, router],
  );

  const value = useMemo<PortalTabContextValue>(
    () => ({
      tabs: PORTAL_TAB_VALUES,
      activeTab,
      setActiveTab,
      panelRefs,
      activePanelRef: panelRefs[activeTab],
    }),
    [activeTab, setActiveTab, panelRefs],
  );

  return (
    <PortalTabContext.Provider value={value}>{children}</PortalTabContext.Provider>
  );
}

export function usePortalTab() {
  const ctx = useContext(PortalTabContext);
  if (!ctx) {
    throw new Error('usePortalTab must be used within PortalTabProvider');
  }
  return ctx;
}

export { isPortalTab };
