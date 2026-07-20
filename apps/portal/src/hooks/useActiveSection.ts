'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

/** Observe `[data-section]` nodes and report the most-visible key. */
export function useActiveSection(defaultKey = 'overview') {
  const pathname = usePathname();
  const [activeSection, setActiveSection] = useState(defaultKey);

  useEffect(() => {
    setActiveSection(defaultKey);

    const nodes = document.querySelectorAll<HTMLElement>('[data-section]');
    if (!nodes.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        let maxRatio = 0;
        let maxKey = defaultKey;
        entries.forEach((entry) => {
          if (entry.intersectionRatio > maxRatio) {
            maxRatio = entry.intersectionRatio;
            maxKey = entry.target.getAttribute('data-section') || defaultKey;
          }
        });
        if (maxRatio > 0.2) setActiveSection(maxKey);
      },
      { threshold: [0.2, 0.5, 0.8] },
    );

    nodes.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [pathname, defaultKey]);

  return activeSection;
}
