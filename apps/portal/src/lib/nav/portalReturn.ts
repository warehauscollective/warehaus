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

/** Read and clear the stored return. Only same-app paths are accepted. */
export function takePortalReturn(): string | null {
  if (typeof window === 'undefined') return null;
  const value = sessionStorage.getItem(KEY);
  sessionStorage.removeItem(KEY);
  if (!value || !value.startsWith('/') || value.startsWith('//')) return null;
  return value;
}
