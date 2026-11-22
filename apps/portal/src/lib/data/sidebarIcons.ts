import type { PortalTab } from '@warehaus/logic/portal';

/**
 * Collapsed-rail glyphs. This is the only file that maps a section to an icon.
 * Swap a glyph by editing `SIDEBAR_ICON_SRC`.
 *
 * Names are the portal icon set: board, clock, refresh, layers, target, check,
 * doc, mic, link, list, building, user, bell, users.
 */
export type SidebarIconName =
  | 'board'
  | 'clock'
  | 'refresh'
  | 'layers'
  | 'target'
  | 'check'
  | 'doc'
  | 'mic'
  | 'link'
  | 'list'
  | 'building'
  | 'user'
  | 'bell'
  | 'users';

export const SIDEBAR_ICON_SRC: Record<SidebarIconName, string> = {
  board: '/icons/sidebar-board.svg',
  clock: '/icons/activity-row.svg',
  refresh: '/icons/sidebar-refresh.svg',
  layers: '/icons/task-layers.svg',
  target: '/icons/sidebar-target.svg',
  check: '/icons/docs-check.svg',
  doc: '/icons/resource-doc.svg',
  mic: '/icons/resource-mic.svg',
  link: '/icons/resource-link.svg',
  list: '/icons/task-list.svg',
  building: '/icons/task-building.svg',
  user: '/icons/activity-person.svg',
  bell: '/icons/sidebar-bell.svg',
  users: '/icons/dock-account.svg',
};

/** API tokens is staff-only and was not in the section map. It keeps the lock glyph. */
const TOKEN_ICON = '/icons/links-lock.svg';

/**
 * Per tab, because `all` is a different section on Projects, Resources, and Activity.
 * Client-only rows reuse a named glyph: needs attention and updates sit next to
 * the dashboard clocks, and the client activity resources row uses doc.
 */
export const SIDEBAR_SECTION_ICON: Record<PortalTab, Record<string, SidebarIconName>> = {
  dashboard: {
    overview: 'board',
    'awaiting-go': 'clock',
    'sync-health': 'refresh',
    'needs-attention': 'clock',
    updates: 'refresh',
  },
  projects: {
    all: 'layers',
    active: 'target',
    shipped: 'check',
  },
  resources: {
    all: 'doc',
    'meeting-notes': 'mic',
    'files-links': 'link',
  },
  activity: {
    all: 'clock',
    tasks: 'list',
    sync: 'refresh',
    resources: 'doc',
  },
  account: {
    clients: 'building',
    profile: 'user',
    notifications: 'bell',
    team: 'users',
  },
};

export function sidebarIconSrc(tab: PortalTab, sectionKey: string): string | null {
  if (tab === 'account' && sectionKey === 'tokens') return TOKEN_ICON;
  const name = SIDEBAR_SECTION_ICON[tab][sectionKey];
  return name ? SIDEBAR_ICON_SRC[name] : null;
}
