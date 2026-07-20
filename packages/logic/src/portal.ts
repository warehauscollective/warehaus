/**
 * Portal information architecture — single source of truth for the client portal.
 * Consumed by `apps/portal` (and later `apps/native`). Keep marketing tab sets
 * out of this module so the website does not ship into the portal bundle.
 */

export type PortalTab =
  | 'dashboard'
  | 'projects'
  | 'chatroom'
  | 'activity'
  | 'account';

export interface PortalNavTab {
  value: PortalTab;
  label: string;
  /** Path segment under the portal app origin (e.g. `/dashboard`). */
  href: string;
  /** Accent class used by the dock chat control (Tailwind text-* utility). */
  colorClass: string;
}

/** Ordered tab set for the portal floating dock. First entry is the default. */
export const PORTAL_TABS: PortalNavTab[] = [
  { value: 'dashboard', label: 'DASHBOARD', href: '/dashboard', colorClass: 'text-accent' },
  { value: 'projects', label: 'PROJECTS', href: '/projects', colorClass: 'text-accent' },
  { value: 'chatroom', label: 'CHATROOM', href: '/chatroom', colorClass: 'text-accent' },
  { value: 'activity', label: 'ACTIVITY', href: '/activity', colorClass: 'text-accent' },
  { value: 'account', label: 'ACCOUNT', href: '/account', colorClass: 'text-accent' },
];

export function getPortalTabForPath(pathname: string): PortalTab {
  const match = PORTAL_TABS.find(
    (tab) => pathname === tab.href || pathname.startsWith(`${tab.href}/`),
  );
  return match?.value ?? PORTAL_TABS[0].value;
}
