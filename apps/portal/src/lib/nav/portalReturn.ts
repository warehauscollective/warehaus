const KEY = 'wh-portal-return';

/** Remember the page a task row was opened from, so Esc can return there. */
export function rememberPortalReturn(): void {
  if (typeof window === 'undefined') return;
  const next = `${window.location.pathname}${window.location.search}`;
  if (!next.startsWith('/') || next.startsWith('//')) return;
  sessionStorage.setItem(KEY, next);
}

/** Drop a stored return. Board opens use the project page instead. */
export function clearPortalReturn(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(KEY);
}

function storedReturn(): string | null {
  if (typeof window === 'undefined') return null;
  const value = sessionStorage.getItem(KEY);
  if (!value || !value.startsWith('/') || value.startsWith('//')) return null;
  return value;
}

/** Read the stored return without clearing it. */
export function peekPortalReturn(): string | null {
  return storedReturn();
}

/** Read and clear the stored return. Only same-app paths are accepted. */
export function takePortalReturn(): string | null {
  const value = storedReturn();
  if (typeof window !== 'undefined') sessionStorage.removeItem(KEY);
  return value;
}

function labelForTab(tab: string | null): string {
  if (tab === 'activity') return 'Back to activity';
  if (tab === 'projects') return 'Back to board';
  if (!tab || tab === 'dashboard') return 'Back to dashboard';
  return 'Back';
}

/**
 * Close label for a task opened from `path`. Real routes are path tabs
 * (`/activity`). Fixture preview keeps the tab in `?tab=`. No stored return
 * means the board.
 */
export function taskCloseLabel(path: string | null): string {
  if (!path) return 'Back to board';
  const [pathname = '', search = ''] = path.split('?');
  const segment = pathname.replace(/\/+$/, '').split('/').filter(Boolean)[0] ?? '';
  if (segment === '') return labelForTab('dashboard');
  if (segment === 'preview') return labelForTab(new URLSearchParams(search).get('tab'));
  return labelForTab(segment);
}
