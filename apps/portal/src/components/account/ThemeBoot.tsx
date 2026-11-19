'use client';

import { useEffect } from 'react';
import { previewThemeRequest, resolveSavedTheme } from '@/lib/themePreference';

/** Re-apply the saved theme after hydration. The root className does not include it. */
export function ThemeBoot() {
  useEffect(() => {
    try {
      const requested = previewThemeRequest(window.location.pathname, window.location.search);
      if (requested) {
        document.documentElement.classList.toggle('light', requested === 'light');
        return;
      }
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const resolved = resolveSavedTheme(localStorage.getItem('warehaus-theme'), prefersDark);
      document.documentElement.classList.toggle('light', resolved === 'light');
    } catch {
      /* ignore */
    }
  }, []);
  return null;
}
