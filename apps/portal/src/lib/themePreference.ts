export type SavedTheme = 'light' | 'dark' | 'auto';

/**
 * `?theme=light|dark` is a capture override for `/preview` only.
 * Project and account routes keep the saved theme.
 */
export function previewThemeRequest(pathname: string, search: string): 'light' | 'dark' | null {
  const onPreview = pathname === '/preview' || pathname.startsWith('/preview/');
  if (!onPreview) return null;
  const requested = new URLSearchParams(search).get('theme');
  return requested === 'light' || requested === 'dark' ? requested : null;
}

/** The saved theme, or the system theme when the choice is auto or missing. */
export function resolveSavedTheme(saved: string | null, prefersDark: boolean): 'light' | 'dark' {
  const mode: SavedTheme = saved === 'light' || saved === 'dark' || saved === 'auto' ? saved : 'auto';
  if (mode === 'auto') return prefersDark ? 'dark' : 'light';
  return mode;
}
