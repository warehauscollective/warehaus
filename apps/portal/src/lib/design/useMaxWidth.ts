'use client';

import { useEffect, useState } from 'react';

/** True after mount when the viewport is at most `px` wide. */
export function useMaxWidth(px: number): boolean {
  const [match, setMatch] = useState(false);
  useEffect(() => {
    const media = window.matchMedia(`(max-width: ${px}px)`);
    const apply = () => setMatch(media.matches);
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [px]);
  return match;
}
