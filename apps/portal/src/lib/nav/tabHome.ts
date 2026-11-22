import { PORTAL_TABS, type PortalTab } from '@warehaus/logic/portal';
import { clearSearchParam } from './clearSearchParam';

/** Path of a dock tab. Dashboard is `/`. */
export function tabRootHref(tab: PortalTab): string {
  return PORTAL_TABS.find((item) => item.value === tab)?.href ?? '/';
}

/**
 * Where a dock click should `router.replace`.
 * Null when `pathname` is already that root, and on `/preview` (the caller
 * stays on the fixture page). Account keeps `client` and `section` when
 * leaving some other path.
 */
export function tabReplaceHref(input: {
  pathname: string;
  tab: PortalTab;
  search?: string;
}): string | null {
  if (input.pathname === '/preview' || input.pathname.startsWith('/preview/')) return null;
  const href = tabRootHref(input.tab);
  if (input.pathname === href) return null;
  const next = new URL(href, 'http://portal.local');
  if (input.tab === 'account') {
    const current = new URLSearchParams(input.search ?? '');
    const client = current.get('client');
    const section = current.get('section');
    if (client) next.searchParams.set('client', client);
    if (section) next.searchParams.set('section', section);
  }
  const qs = next.searchParams.toString();
  return `${next.pathname}${qs ? `?${qs}` : ''}`;
}

/** `/projects/:id` and `/tasks/:id` are project detail, still under the Projects tab. */
export function isProjectDetailPath(pathname: string): boolean {
  return /^\/projects\/[^/]+/.test(pathname) || pathname.startsWith('/tasks/');
}

/**
 * Same exit as `closeProject`: drop the detail query, then push `/projects`
 * when this is a real detail path. Fixture preview does not leave its page.
 */
export function leaveProjectDetail(input: {
  pathname: string;
  fixtures: boolean;
  push: (href: string) => void;
}): void {
  clearSearchParam('project');
  clearSearchParam('taskView');
  if (!input.fixtures && isProjectDetailPath(input.pathname)) {
    input.push('/projects');
  }
}
