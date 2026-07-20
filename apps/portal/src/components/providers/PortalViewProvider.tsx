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
import { usePathname } from 'next/navigation';
import {
  getProjectSlugFromPath,
  PORTAL_SIDEBAR_SECTIONS,
  PROJECT_WORKSPACE_SECTIONS,
  type PortalSidebarSection,
} from '@/lib/data/sidebarSections';
import { getProjectBySlug } from '@/lib/data/projects';
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
  /** Sidebar sections for the current surface (list tab or project workspace). */
  sections: PortalSidebarSection[];
  /** When set, the projects tab is showing a single engagement workspace. */
  projectSlug: string | null;
  projectName: string | null;
  detail: PortalDetail;
  openDetail: (detail: NonNullable<PortalDetail>) => void;
  closeDetail: () => void;
}

const PortalViewContext = createContext<PortalViewContextValue | null>(null);

export function PortalViewProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { activeTab } = usePortalTab();
  const projectSlug = activeTab === 'projects' ? getProjectSlugFromPath(pathname) : null;
  const project = projectSlug ? getProjectBySlug(projectSlug) : undefined;
  const sections =
    projectSlug && project ? PROJECT_WORKSPACE_SECTIONS : PORTAL_SIDEBAR_SECTIONS[activeTab];
  const defaultSection = sections[0]?.key ?? 'overview';

  const [activeSection, setActiveSectionState] = useState(defaultSection);
  const [detail, setDetail] = useState<PortalDetail>(null);

  // Tab change or enter/leave project workspace → reset section + inspector.
  useEffect(() => {
    setActiveSectionState(sections[0]?.key ?? 'overview');
    setDetail(null);
    // sections identity changes with projectSlug / activeTab
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, projectSlug]);

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
      sections,
      projectSlug: project ? project.slug : null,
      projectName: project?.name ?? null,
      detail,
      openDetail,
      closeDetail,
    }),
    [
      activeSection,
      setActiveSection,
      sections,
      project,
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
