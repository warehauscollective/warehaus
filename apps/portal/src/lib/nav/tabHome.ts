import { PORTAL_TABS, type PortalTab } from '@warehaus/logic/portal';
import type { PortalNavDetail } from './openPortalHref';
import { clearSearchParam } from './clearSearchParam';

/** Query keys that keep a project or resource open while the path stays at the tab root. */
export const TAB_HOME_DROP_KEYS = ['project', 'task', 'taskView', 'resource'] as const;

/** Path of a dock tab. Dashboard is `/`. */
export function tabRootHref(tab: PortalTab): string {
  return PORTAL_TABS.find((item) => item.value === tab)?.href ?? '/';
}

function searchParams(search: string | undefined): URLSearchParams {
  const raw = search ?? '';
  return new URLSearchParams(raw.startsWith('?') ? raw.slice(1) : raw);
}

function hasDetailQuery(params: URLSearchParams): boolean {
  return TAB_HOME_DROP_KEYS.some((key) => params.has(key));
}

/**
 * Where a dock click should land.
 * Null when the address is already that tab's home, and on `/preview`
 * (the caller stays on the fixture page).
 *
 * A list click opens a project or resource with `history.replaceState`, so
 * the pathname can already be `/projects` or `/resources` while `?project=`,
 * `?task=`, `?taskView=`, or `?resource=` is still set. That is not home:
 * those keys are stripped. `?as=` stays. Account also keeps `client` and
 * `section`.
 */
export function tabReplaceHref(input: {
  pathname: string;
  tab: PortalTab;
  search?: string;
}): string | null {
  if (input.pathname === '/preview' || input.pathname.startsWith('/preview/')) return null;
  const root = tabRootHref(input.tab);
  const current = searchParams(input.search);
  const onRoot = input.pathname === root;
  if (onRoot && !hasDetailQuery(current)) return null;

  const next = new URL(onRoot ? input.pathname : root, 'http://portal.local');
  if (onRoot) {
    current.forEach((value, key) => {
      if ((TAB_HOME_DROP_KEYS as readonly string[]).includes(key)) return;
      next.searchParams.append(key, value);
    });
  } else {
    const audience = current.get('as');
    if (audience === 'client' || audience === 'staff') next.searchParams.set('as', audience);
    if (input.tab === 'account') {
      const client = current.get('client');
      const section = current.get('section');
      if (client) next.searchParams.set('client', client);
      if (section) next.searchParams.set('section', section);
    }
  }
  const qs = next.searchParams.toString();
  return `${next.pathname}${qs ? `?${qs}` : ''}`;
}

export type TabHomeLocation = {
  pathname: string;
  search: string;
};

/**
 * Dock click and sidebar "All projects" share this.
 * `replace` writes the home URL. `dispatch` is the tab-home event so the
 * list can close its open project or resource when the pathname does not change.
 * Returns null when the address is already home (nothing is called).
 */
export function runTabHomeClick(input: {
  tab: PortalTab;
  location: TabHomeLocation;
  replace: (href: string) => void;
  dispatch: (detail: PortalNavDetail) => void;
}): string | null {
  const href = tabReplaceHref({
    pathname: input.location.pathname,
    tab: input.tab,
    search: input.location.search,
  });
  if (!href) return null;
  input.replace(href);
  input.dispatch({
    tab: input.tab === 'projects' || input.tab === 'resources' ? input.tab : null,
    project: null,
    task: null,
    doc: null,
    resource: null,
    home: true,
  });
  return href;
}

/** Write `href` now. Next skips a replace when the list already used `replaceState`. */
export function commitTabHref(href: string, navigate: (href: string) => void): void {
  navigate(href);
  if (typeof window === 'undefined') return;
  const current = `${window.location.pathname}${window.location.search}`;
  if (current !== href) window.history.replaceState(window.history.state, '', href);
}

/** `/projects/:id` and `/tasks/:id` are project detail, still under the Projects tab. */
export function isProjectDetailPath(pathname: string): boolean {
  return /^\/projects\/[^/]+/.test(pathname) || pathname.startsWith('/tasks/');
}

/** Sidebar "All projects" leaves a detail path and a list opened with `?project=`. */
export function allProjectsLeavesDetail(pathname: string, search: string): boolean {
  if (isProjectDetailPath(pathname)) return true;
  return searchParams(search).has('project');
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

/** What Projects should do with one `wh-portal-nav` event. `home` closes the open project. */
export function readProjectNav(input: {
  detail: Pick<PortalNavDetail, 'home' | 'project' | 'task'> | null;
  search: string;
}): { home: boolean; project: string | null; task: string | null } {
  if (input.detail?.home) return { home: true, project: null, task: null };
  const params = searchParams(input.search);
  return {
    home: false,
    project: input.detail ? input.detail.project : params.get('project'),
    task: input.detail ? input.detail.task : params.get('task'),
  };
}

/** What Resources should do with one `wh-portal-nav` event. `home` closes the open resource. */
export function readResourceNav(input: {
  detail: Pick<PortalNavDetail, 'home' | 'resource' | 'doc'> | null;
  search: string;
  preview: boolean;
}): { home: boolean; resource: string | null; doc: string | null } {
  if (input.detail?.home) return { home: true, resource: null, doc: null };
  const params = searchParams(input.search);
  return {
    home: false,
    resource: input.detail ? input.detail.resource : input.preview ? params.get('resource') : null,
    doc: input.detail ? input.detail.doc : input.preview ? params.get('doc') : null,
  };
}
