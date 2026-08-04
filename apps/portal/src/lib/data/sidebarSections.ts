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
  dashboard: [{ key: 'overview', label: 'Overview' }],
  projects: [
    { key: 'overview', label: 'Overview' },
    { key: 'active', label: 'Active' },
    { key: 'pipeline', label: 'Pipeline' },
  ],
  resources: [
    { key: 'overview', label: 'Library' },
    { key: 'uploads', label: 'Uploads' },
    { key: 'review', label: 'Review' },
  ],
  activity: [
    { key: 'overview', label: 'Overview' },
    { key: 'feed', label: 'Feed' },
    { key: 'exceptions', label: 'Exceptions' },
  ],
  account: [
    { key: 'overview', label: 'Overview' },
    { key: 'profile', label: 'Profile' },
    { key: 'billing', label: 'Billing' },
    { key: 'team', label: 'Clients' },
    { key: 'preferences', label: 'Preferences' },
  ],
};

/** Client portal: no cross-client admin surfaces; no upload review queue. */
const CLIENT_SECTIONS: Record<PortalTab, PortalSidebarSection[]> = {
  ...TEAM_SECTIONS,
  dashboard: [{ key: 'overview', label: 'Overview' }],
  projects: [
    { key: 'overview', label: 'Board' },
    { key: 'list', label: 'List' },
  ],
  resources: [
    { key: 'overview', label: 'Library' },
    { key: 'uploads', label: 'Your uploads' },
  ],
  account: [
    { key: 'overview', label: 'Organization' },
    { key: 'profile', label: 'Profile' },
    { key: 'billing', label: 'Billing' },
    { key: 'preferences', label: 'Preferences' },
  ],
};

export const PORTAL_SIDEBAR_SECTIONS = TEAM_SECTIONS;

export function getPortalSidebarSections(
  tab: PortalTab,
  mode: TenantMode = 'team',
): PortalSidebarSection[] {
  return (mode === 'client' ? CLIENT_SECTIONS : TEAM_SECTIONS)[tab];
}
