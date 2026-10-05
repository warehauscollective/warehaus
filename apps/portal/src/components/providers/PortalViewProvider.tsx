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
import { PORTAL_TABS, isPortalTab, type PortalTab } from '@warehaus/logic/portal';
import { PORTAL_SIDEBAR_SECTIONS } from '@/lib/data/sidebarSections';
import { usePortalTab } from '@/components/providers/PortalTabProvider';
import { setSearchParams } from '@/lib/nav/clearSearchParam';

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
  /**
   * Client id requested from another tab (project Client chip).
   * Account applies it with setClientId, then clears it.
   */
  linkedClientId: string | null;
  openLinkedClient: (clientId: string) => void;
  clearLinkedClient: () => void;
}

const PortalViewContext = createContext<PortalViewContextValue | null>(null);

export function PortalViewProvider({ children }: { children: ReactNode }) {
  const { activeTab, setActiveTab } = usePortalTab();
  const [sectionsByTab, setSectionsByTab] = useState<Record<PortalTab, string>>(defaultSections);
  const [detail, setDetail] = useState<PortalDetail>(null);
  const [linkedClientId, setLinkedClientId] = useState<string | null>(null);

  // Clear inspector when switching dock tabs (section state is kept per tab).
  useEffect(() => {
    setDetail(null);
  }, [activeTab]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    const section = params.get('section');
    if (tab && section && isPortalTab(tab)) {
      setSectionsByTab((prev) => ({ ...prev, [tab]: section }));
    }
  }, []);

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

  const openLinkedClient = useCallback(
    (clientId: string) => {
      const id = clientId.trim();
      if (!id) return;
      setLinkedClientId(id);
      setSectionsByTab((prev) => ({ ...prev, account: 'clients' }));
      setDetail(null);
      setSearchParams({ client: id, section: 'clients', tab: 'account' });
      setActiveTab('account');
    },
    [setActiveTab],
  );

  const clearLinkedClient = useCallback(() => setLinkedClientId(null), []);

  const value = useMemo(
    () => ({
      activeSection: sectionFor(activeTab),
      setActiveSection,
      sectionFor,
      setSectionFor,
      detail,
      openDetail,
      closeDetail,
      linkedClientId,
      openLinkedClient,
      clearLinkedClient,
    }),
    [
      activeTab,
      sectionFor,
      setActiveSection,
      setSectionFor,
      detail,
      openDetail,
      closeDetail,
      linkedClientId,
      openLinkedClient,
      clearLinkedClient,
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
