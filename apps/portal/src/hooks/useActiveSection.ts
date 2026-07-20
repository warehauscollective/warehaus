'use client';

import { useEffect, useState } from 'react';
import { usePortalTab } from '@/components/providers/PortalTabProvider';

/** Observe `[data-section]` nodes inside the active swipe panel. */
export function useActiveSection(defaultKey = 'overview') {
  const { activeTab, activePanelRef } = usePortalTab();
  const [activeSection, setActiveSection] = useState(defaultKey);

  useEffect(() => {
    setActiveSection(defaultKey);

    const root = activePanelRef.current;
    if (!root) return;

    const nodes = root.querySelectorAll<HTMLElement>('[data-section]');
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
      { root, threshold: [0.2, 0.5, 0.8] },
    );

    nodes.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [activeTab, activePanelRef, defaultKey]);

  return activeSection;
}
