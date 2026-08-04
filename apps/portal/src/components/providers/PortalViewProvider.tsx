'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { PORTAL_TABS, type PortalTab } from '@warehaus/logic/portal';
import { PORTAL_SIDEBAR_SECTIONS } from '@/lib/data/sidebarSections';
import { usePortalTab } from '@/components/providers/PortalTabProvider';

export type PortalDetail = {
  id: string;
  title: string;
  subtitle?: string;
  body?: ReactNode;
} | null;

function defaultSections(): Record<PortalTab, string> {
  return Object.fromEntries(
    PORTAL_TABS.map((t) => [t.value, PORTAL_SIDEBAR_SECTIONS[t.value][0]?.key ?? 'overview']),
  ) as Record<PortalTab, string>;
}

interface PortalViewContextValue {
  /** Active sidebar section for the dock’s current tab. */
  activeSection: string;
  setActiveSection: (key: string) => void;
  /** Per-tab section (each swipe panel keeps its own). */
  sectionFor: (tab: PortalTab) => string;
  setSectionFor: (tab: PortalTab, key: string) => void;
  detail: PortalDetail;
  openDetail: (detail: NonNullable<PortalDetail>) => void;
  closeDetail: () => void;
}

const PortalViewContext = createContext<PortalViewContextValue | null>(null);

export function PortalViewProvider({ children }: { children: ReactNode }) {
  const { activeTab } = usePortalTab();
  const [sectionsByTab, setSectionsByTab] = useState<Record<PortalTab, string>>(defaultSections);
  const [detail, setDetail] = useState<PortalDetail>(null);

  // Clear inspector when switching dock tabs (section state is kept per tab).
  useEffect(() => {
    setDetail(null);
  }, [activeTab]);

  const sectionFor = useCallback(
    (tab: PortalTab) =>
      sectionsByTab[tab] ?? PORTAL_SIDEBAR_SECTIONS[tab][0]?.key ?? 'overview',
    [sectionsByTab],
  );

  const setSectionFor = useCallback((tab: PortalTab, key: string) => {
    setSectionsByTab((prev) => ({ ...prev, [tab]: key }));
    setDetail(null);
  }, []);

  const setActiveSection = useCallback(
    (key: string) => {
      setSectionFor(activeTab, key);
    },
    [activeTab, setSectionFor],
  );

  const openDetail = useCallback((next: NonNullable<PortalDetail>) => {
    setDetail(next);
  }, []);

  const closeDetail = useCallback(() => setDetail(null), []);

  const value = useMemo(
    () => ({
      activeSection: sectionFor(activeTab),
      setActiveSection,
      sectionFor,
      setSectionFor,
      detail,
      openDetail,
      closeDetail,
    }),
    [
      activeTab,
      sectionFor,
      setActiveSection,
      setSectionFor,
      detail,
      openDetail,
      closeDetail,
    ],
  );

  return (
    <PortalViewContext.Provider value={value}>{children}</PortalViewContext.Provider>
  );
}

export function usePortalView() {
  const ctx = useContext(PortalViewContext);
  if (!ctx) {
    throw new Error('usePortalView must be used within PortalViewProvider');
  }
  return ctx;
}
