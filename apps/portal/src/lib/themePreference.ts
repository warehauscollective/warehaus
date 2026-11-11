export type SavedTheme = 'light' | 'dark' | 'auto';

/** The saved theme, or the system theme when the choice is auto or missing. */
export function resolveSavedTheme(saved: string | null, prefersDark: boolean): 'light' | 'dark' {
  const mode: SavedTheme = saved === 'light' || saved === 'dark' || saved === 'auto' ? saved : 'auto';
  if (mode === 'auto') return prefersDark ? 'dark' : 'light';
  return mode;
}
