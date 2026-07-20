import type { ActiveTab } from '@/components/providers/LayoutProvider';

/**
 * Route-aware navbar tab configuration — the single source of truth.
 *
 * The BottomNav renders a sliding set of tabs that changes per route while the
 * page's main content stays mounted. Each route can define its own set of
 * **up to 6 tabs**; the navbar lays them out dynamically (flex), so adding,
 * removing, or relabeling tabs is just an edit here — no navbar changes needed.
 *
 * To add a route: give it an entry in ROUTE_TAB_SETS. If it introduces new tab
 * values, extend the `ActiveTab` union in LayoutProvider too.
 */
export interface NavTab {
  value: ActiveTab;
  label: string;
  /** Tailwind text-color utility for the active accent (e.g. the chat button tint). */
  colorClass: string;
}

/** A route's tab configuration, also used to document the system in the style guide. */
export interface RouteTabSet {
  /** Pathname this set applies to (exact match). */
  path: string;
  /** Human label for the route (used in docs). */
  routeLabel: string;
  /** The route's tabs — up to 6. The first is the route's default. */
  tabs: NavTab[];
}

const HOME_TABS: NavTab[] = [
  { value: 'dream', label: 'DREAM', colorClass: 'text-dream' },
  { value: 'design', label: 'DESIGN', colorClass: 'text-design' },
  { value: 'develop', label: 'DEVELOP', colorClass: 'text-develop' },
];

const STYLE_GUIDE_TABS: NavTab[] = [
  { value: 'brand', label: 'BRAND', colorClass: 'text-accent' },
  { value: 'website', label: 'WEBSITE', colorClass: 'text-accent' },
  { value: 'portal', label: 'PORTAL', colorClass: 'text-accent' },
];

// The Worlds surface is the style-guide pillars view (with a sidebar + details),
// so it reuses the Dream / Design / Develop pillar tabs and their accents.
const WORLDS_TABS: NavTab[] = [
  { value: 'dream', label: 'DREAM', colorClass: 'text-dream' },
  { value: 'design', label: 'DESIGN', colorClass: 'text-design' },
  { value: 'develop', label: 'DEVELOP', colorClass: 'text-develop' },
];

/**
 * Portal product tabs — documented for the style guide only.
 * The live portal app (`apps/portal` on :3100) owns these routes; the website
 * must NOT register `/portal` here or a busy-port website on :3001 will show
 * the portal dock chrome around a Next.js 404.
 */
export const PORTAL_PRODUCT_TABS: NavTab[] = [
  { value: 'portal', label: 'PORTAL', colorClass: 'text-accent' },
  { value: 'projects', label: 'PROJECTS', colorClass: 'text-accent' },
  { value: 'chatroom', label: 'CHATROOM', colorClass: 'text-accent' },
  { value: 'activity', label: 'ACTIVITY', colorClass: 'text-accent' },
  { value: 'account', label: 'ACCOUNT', colorClass: 'text-accent' },
];

/**
 * Every route that surfaces its own tab set. Order is the documentation order.
 * The navbar matches the longest applicable path (so /style-guide/worlds wins
 * over /style-guide).
 */
export const ROUTE_TAB_SETS: RouteTabSet[] = [
  { path: '/', routeLabel: 'Home', tabs: HOME_TABS },
  { path: '/style-guide', routeLabel: 'Style Guide', tabs: STYLE_GUIDE_TABS },
  { path: '/style-guide/worlds', routeLabel: 'Style Guide / Worlds', tabs: WORLDS_TABS },
  // Docs-only entry (not a live website route — portal is apps/portal :3100).
  { path: 'apps/portal', routeLabel: 'Portal · localhost:3100', tabs: PORTAL_PRODUCT_TABS },
];

/** Returns the tab set the navbar should render for the given pathname. */
export function getNavTabsForPath(pathname: string): NavTab[] {
  // Prefer the most specific (longest) matching route path.
  const match = ROUTE_TAB_SETS
    .filter((r) => pathname === r.path)
    .sort((a, b) => b.path.length - a.path.length)[0];
  return match ? match.tabs : HOME_TABS;
}
