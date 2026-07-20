import type { PortalTab } from '@warehaus/logic/portal';

/**
 * Per-tab sub-nav for the portal left rail — mirrors the style-guide sidebar
 * pattern (section keys ↔ `data-section` on the page).
 */
export interface PortalSidebarSection {
  key: string;
  label: string;
}

export const PORTAL_SIDEBAR_SECTIONS: Record<PortalTab, PortalSidebarSection[]> = {
  portal: [
    { key: 'overview', label: 'Overview' },
    { key: 'shipments', label: 'Shipments' },
    { key: 'new-shipment', label: 'New shipment' },
  ],
  projects: [
    { key: 'overview', label: 'Overview' },
    { key: 'active', label: 'Active' },
    { key: 'pipeline', label: 'Pipeline' },
  ],
  chatroom: [
    { key: 'overview', label: 'Overview' },
    { key: 'threads', label: 'Threads' },
    { key: 'compose', label: 'Compose' },
  ],
  activity: [
    { key: 'overview', label: 'Overview' },
    { key: 'feed', label: 'Feed' },
    { key: 'exceptions', label: 'Exceptions' },
  ],
  account: [
    { key: 'overview', label: 'Overview' },
    { key: 'profile', label: 'Profile' },
    { key: 'team', label: 'Team' },
    { key: 'preferences', label: 'Preferences' },
  ],
};
