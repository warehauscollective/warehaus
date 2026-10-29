export type PortalNavDetail = {
  tab: 'projects' | 'resources' | null;
  project: string | null;
  task: string | null;
  doc: string | null;
  resource: string | null;
};

export function portalNavDetail(event: Event): PortalNavDetail | null {
  if (!(event instanceof CustomEvent) || !event.detail || typeof event.detail !== 'object') return null;
  return event.detail as PortalNavDetail;
}

function idFrom(href: string, prefix: string): string | null {
  if (!href.startsWith(prefix)) return null;
  const rest = href.slice(prefix.length).split(/[?#]/)[0];
  if (!rest) return null;
  try {
    return decodeURIComponent(rest);
  } catch {
    return rest;
  }
}

/**
 * Open a search hit. Preview stays on /preview.
 * `navigate` must be the Next router so the App Router does not snap the URL back.
 */
export function openPortalHref(href: string, navigate?: (href: string) => void): void {
  if (typeof window === 'undefined') return;
  const preview = window.location.pathname === '/preview' || window.location.pathname.startsWith('/preview/');
  if (!preview) {
    if (navigate) navigate(href);
    else window.location.assign(href);
    return;
  }
  const url = new URL(window.location.href);
  for (const key of ['project', 'task', 'doc', 'resource', 'q']) url.searchParams.delete(key);
  const project = idFrom(href, '/projects/');
  const task = idFrom(href, '/tasks/');
  const doc = idFrom(href, '/docs/');
  const resource = idFrom(href, '/resources/');
  const detail: PortalNavDetail = { tab: null, project: null, task: null, doc: null, resource: null };
  if (project) {
    detail.tab = 'projects';
    detail.project = project;
    url.searchParams.set('tab', 'projects');
    url.searchParams.set('project', project);
  } else if (task) {
    detail.tab = 'projects';
    detail.task = task;
    url.searchParams.set('tab', 'projects');
    url.searchParams.set('task', task);
  } else if (doc) {
    detail.tab = 'resources';
    detail.doc = doc;
    url.searchParams.set('tab', 'resources');
    url.searchParams.set('doc', doc);
  } else if (resource) {
    detail.tab = 'resources';
    detail.resource = resource;
    url.searchParams.set('tab', 'resources');
    url.searchParams.set('resource', resource);
  }
  const next = `${url.pathname}?${url.searchParams.toString()}`;
  if (navigate) navigate(next);
  else window.history.replaceState(window.history.state, '', next);
  window.dispatchEvent(new CustomEvent('wh-portal-nav', { detail }));
}
