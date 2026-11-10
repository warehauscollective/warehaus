'use client';

import { useEffect } from 'react';
import { resolveSavedTheme } from '@/lib/themePreference';

/** Re-apply the saved theme after hydration. The root className does not include it. */
export function ThemeBoot() {
  useEffect(() => {
    try {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const resolved = resolveSavedTheme(localStorage.getItem('warehaus-theme'), prefersDark);
      document.documentElement.classList.toggle('light', resolved === 'light');
    } catch {
      /* ignore */
    }
  }, []);
  return null;
}
