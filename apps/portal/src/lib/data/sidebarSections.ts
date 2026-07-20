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
  dashboard: [
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

/** Left-rail sections when a single project workspace is open. */
export const PROJECT_WORKSPACE_SECTIONS: PortalSidebarSection[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'client', label: 'Client' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'context', label: 'Context' },
  { key: 'design', label: 'Design' },
  { key: 'build', label: 'Build' },
  { key: 'resources', label: 'Resources' },
];

/** `/projects` list vs `/projects/[slug]` workspace. */
export function getProjectSlugFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/projects\/([^/]+)\/?$/);
  if (!match?.[1] || match[1] === 'new') return null;
  return decodeURIComponent(match[1]);
}
