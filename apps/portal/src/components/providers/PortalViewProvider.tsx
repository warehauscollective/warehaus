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
import { PORTAL_SIDEBAR_SECTIONS } from '@/lib/data/sidebarSections';
import { usePortalTab } from '@/components/providers/PortalTabProvider';

export type PortalDetail = {
  id: string;
  title: string;
  subtitle?: string;
  body?: ReactNode;
} | null;

interface PortalViewContextValue {
  /** Active sidebar section for the current tab — a view mode, not a scroll target. */
  activeSection: string;
  setActiveSection: (key: string) => void;
  detail: PortalDetail;
  openDetail: (detail: NonNullable<PortalDetail>) => void;
  closeDetail: () => void;
}

const PortalViewContext = createContext<PortalViewContextValue | null>(null);

export function PortalViewProvider({ children }: { children: ReactNode }) {
  const { activeTab } = usePortalTab();
  const defaultSection = PORTAL_SIDEBAR_SECTIONS[activeTab][0]?.key ?? 'overview';
  const [activeSection, setActiveSectionState] = useState(defaultSection);
  const [detail, setDetail] = useState<PortalDetail>(null);

  // Tab change → reset to that tab's first section and clear the inspector.
  useEffect(() => {
    setActiveSectionState(PORTAL_SIDEBAR_SECTIONS[activeTab][0]?.key ?? 'overview');
    setDetail(null);
  }, [activeTab]);

  const setActiveSection = useCallback((key: string) => {
    setActiveSectionState(key);
    setDetail(null);
  }, []);

  const openDetail = useCallback((next: NonNullable<PortalDetail>) => {
    setDetail(next);
  }, []);

  const closeDetail = useCallback(() => setDetail(null), []);

  const value = useMemo(
    () => ({
      activeSection,
      setActiveSection,
      detail,
      openDetail,
      closeDetail,
    }),
    [activeSection, setActiveSection, detail, openDetail, closeDetail],
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
