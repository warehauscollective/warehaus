import { PORTAL_LINK_SCHEME } from '@warehaus/native-bridge';

/**
 * Resolves a `warehaus://` link to a Portal path (ADR-0006, decision 7: the
 * shell hands the raw link over with `navigate`; only the Portal reads the
 * route). Pure, so it is tested without a router.
 *
 * Links:
 * - `warehaus://project/<projectId>` opens the project.
 * - `warehaus://milestone/<milestoneId>?project=<projectId>` opens the milestone
 *   on its project page. Without `project` it opens Projects, because a
 *   milestone has no page of its own.
 * - `warehaus://task/<taskId>` opens the task. With `?section=troubleshoot` it
 *   opens at the Troubleshoot section (a blocked Ask in the attention feed).
 * - `warehaus://resource/<resourceId>` and `warehaus://doc/<docId>`.
 *
 * Anything else resolves to null and the page stays where it is.
 */
export function portalLinkHref(link: string): string | null {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return null;
  }
  if (url.protocol !== PORTAL_LINK_SCHEME) return null;
  // `warehaus://milestone/abc`: WHATWG URL puts "milestone" in host and "/abc" in pathname.
  const kind = url.host.toLowerCase();
  const id = singleSegment(url.pathname);
  if (!id) return null;
  const path = encodeURIComponent(id);
  switch (kind) {
    case 'project':
      return `/projects/${path}`;
    case 'milestone': {
      const project = url.searchParams.get('project')?.trim();
      if (!project || !isId(project)) return '/projects';
      return `/projects/${encodeURIComponent(project)}?${MILESTONE_PARAM}=${path}`;
    }
    case 'task':
      return url.searchParams.get(SECTION_PARAM) === TROUBLESHOOT_SECTION
        ? `/tasks/${path}?${SECTION_PARAM}=${TROUBLESHOOT_SECTION}`
        : `/tasks/${path}`;
    case 'resource':
      return `/resources/${path}`;
    case 'doc':
      return `/docs/${path}`;
    default:
      return null;
  }
}

/** The project page query key that opens one milestone. */
export const MILESTONE_PARAM = 'milestone';

/** The task page query key that opens the task modal at one section. */
export const SECTION_PARAM = 'section';
export const TROUBLESHOOT_SECTION = 'troubleshoot';

/** True when a task page URL asks for the Troubleshoot section (`?section=troubleshoot`). */
export function troubleshootFromSearch(search: string): boolean {
  return new URLSearchParams(search.startsWith('?') ? search.slice(1) : search).get(SECTION_PARAM) === TROUBLESHOOT_SECTION;
}

/** "/abc" → "abc". Empty, nested ("/a/b") or undecodable paths are refused. */
function singleSegment(pathname: string): string | null {
  const raw = pathname.replace(/^\/+/, '').replace(/\/+$/, '');
  if (!raw || raw.includes('/')) return null;
  let id: string;
  try {
    id = decodeURIComponent(raw);
  } catch {
    return null;
  }
  return isId(id) ? id : null;
}

/** Convex and fixture ids: letters, digits, `_` and `-`. */
function isId(value: string): boolean {
  return /^[A-Za-z0-9_-]{1,64}$/.test(value);
}

/** The milestone a project page URL asks to open (`?milestone=<id>`), or null. */
export function milestoneFromSearch(search: string): string | null {
  const value = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search).get(MILESTONE_PARAM)?.trim();
  return value && isId(value) ? value : null;
}
