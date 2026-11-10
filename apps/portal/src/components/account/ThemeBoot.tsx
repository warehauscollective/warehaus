'use client';

import { useEffect } from 'react';

/** Re-apply the saved theme after hydration. The root className does not include it. */
export function ThemeBoot() {
  useEffect(() => {
    try {
      const saved = localStorage.getItem('warehaus-theme');
      const mode = saved === 'light' || saved === 'dark' || saved === 'auto' ? saved : 'auto';
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const resolved = mode === 'auto' ? (prefersDark ? 'dark' : 'light') : mode;
      document.documentElement.classList.toggle('light', resolved === 'light');
    } catch {
      /* ignore */
    }
  }, []);
  return null;
}
