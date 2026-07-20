'use client';

import { useEffect, useState } from 'react';

export function useFadeIn() {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [el]);

  return [setEl, visible] as const;
}
