import type { PortalTab } from '@warehaus/logic/portal';
import type { TenantMode } from '@/lib/auth/tenancy';

/**
 * Per-tab sub-nav for the portal left rail — mirrors the style-guide sidebar
 * pattern (section keys ↔ `data-section` on the page).
 */
export interface PortalSidebarSection {
  key: string;
  label: string;
}

const TEAM_SECTIONS: Record<PortalTab, PortalSidebarSection[]> = {
  dashboard: [
    { key: 'overview', label: 'Overview' },
    { key: 'awaiting-go', label: 'Awaiting go' },
    { key: 'sync-health', label: 'Sync health' },
  ],
  projects: [
    { key: 'all', label: 'All projects' },
    { key: 'active', label: 'Active' },
    { key: 'shipped', label: 'Shipped' },
  ],
  resources: [
    { key: 'all', label: 'All resources' },
    { key: 'meeting-notes', label: 'Meeting notes' },
    { key: 'files-links', label: 'Files & links' },
  ],
  activity: [
    { key: 'all', label: 'All activity' },
    { key: 'tasks', label: 'Tasks' },
    { key: 'sync', label: 'Sync' },
  ],
  account: [
    { key: 'clients', label: 'Clients' },
    { key: 'profile', label: 'Profile' },
    { key: 'notifications', label: 'Notifications' },
    { key: 'team', label: 'Team & invites' },
  ],
};

/** Client portal: no cross-client directory, no sync-admin rails. */
const CLIENT_SECTIONS: Record<PortalTab, PortalSidebarSection[]> = {
  ...TEAM_SECTIONS,
  dashboard: [
    { key: 'overview', label: 'Overview' },
    { key: 'awaiting-go', label: 'Awaiting go' },
  ],
  activity: [
    { key: 'all', label: 'All activity' },
    { key: 'tasks', label: 'Tasks' },
  ],
  account: [
    { key: 'profile', label: 'Profile' },
    { key: 'notifications', label: 'Notifications' },
  ],
};

export const PORTAL_SIDEBAR_SECTIONS = TEAM_SECTIONS;

export function getPortalSidebarSections(
  tab: PortalTab,
  mode: TenantMode = 'team',
): PortalSidebarSection[] {
  return (mode === 'client' ? CLIENT_SECTIONS : TEAM_SECTIONS)[tab];
}
