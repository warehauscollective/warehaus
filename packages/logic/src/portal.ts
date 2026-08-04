/**
 * Portal information architecture — single source of truth for the client portal.
 * Consumed by `apps/portal` (and later `apps/native`). Keep marketing tab sets
 * out of this module so the website does not ship into the portal bundle.
 *
 * Client dock: Dashboard · Tasks · Resources · Activity · Account
 * Resources = Notion Shared Resources (files + docs as resource rows).
 * Chatroom is out of scope (D-H).
 *
 * Team surface: `portal.{root}`. Client surfaces: `{slug}.{root}`
 * (see docs/portal-multi-tenant.md). Home tab is `/` (not `/dashboard`).
 */

export type PortalTab =
  | 'dashboard'
  | 'projects'
  | 'resources'
  | 'activity'
  | 'account';

export interface PortalNavTab {
  value: PortalTab;
  label: string;
  /** Path under the portal origin (e.g. `/` for home, `/projects` for projects). */
  href: string;
  /** Accent class used by the dock chat control (Tailwind text-* utility). */
  colorClass: string;
}

/** Ordered tab set for the portal floating dock. First entry is the default. */
export const PORTAL_TABS: PortalNavTab[] = [
  { value: 'dashboard', label: 'DASHBOARD', href: '/', colorClass: 'text-accent' },
  { value: 'projects', label: 'PROJECTS', href: '/projects', colorClass: 'text-accent' },
  { value: 'resources', label: 'RESOURCES', href: '/resources', colorClass: 'text-accent' },
  { value: 'activity', label: 'ACTIVITY', href: '/activity', colorClass: 'text-accent' },
  { value: 'account', label: 'ACCOUNT', href: '/account', colorClass: 'text-accent' },
];

/**
 * Dock labels by tenant. Client portals surface tasks (not the project roster)
 * on the shared `projects` tab value / `/projects` route.
 */
export function getPortalTabsForMode(
  mode: 'team' | 'client' = 'team',
): PortalNavTab[] {
  if (mode !== 'client') return PORTAL_TABS;
  return PORTAL_TABS.map((tab) =>
    tab.value === 'projects' ? { ...tab, label: 'TASKS' } : tab,
  );
}

export function getPortalTabForPath(pathname: string): PortalTab {
  // Exact `/` (and legacy `/portal`) is the dashboard home — must not use
  // startsWith('/') or every path matches.
  if (pathname === '/' || pathname === '/portal') return 'dashboard';

  // Legacy Docs/Files deep links → Resources
  if (
    pathname === '/docs' ||
    pathname.startsWith('/docs/') ||
    pathname === '/files' ||
    pathname.startsWith('/files/')
  ) {
    return 'resources';
  }

  const match = PORTAL_TABS.find(
    (tab) =>
      tab.href !== '/' &&
      (pathname === tab.href || pathname.startsWith(`${tab.href}/`)),
  );
  return match?.value ?? PORTAL_TABS[0].value;
}

export function isPortalTab(value: string | null): value is PortalTab {
  return PORTAL_TABS.some((tab) => tab.value === value);
}
