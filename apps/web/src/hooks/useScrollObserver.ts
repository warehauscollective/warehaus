'use client';

import { useEffect, type RefObject } from 'react';
import { useLayout } from '@/components/providers/LayoutProvider';

/**
 * Observes a scrollable container for section progress and active section.
 * Only writes to layout context when `enabled` is true (i.e. this is the active tab).
 */
export function useScrollObserver(
  containerRef: RefObject<HTMLElement | null>,
  enabled: boolean,
) {
  const {
    setScrollProgress,
    setSectionProgress,
    setActiveSection,
    setIsOnLight,
  } = useLayout();

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !enabled) return;

    // Light theme detection
    const lightSections = container.querySelectorAll('[data-theme="light"]');
    const lightObserver = new IntersectionObserver(
      (entries) => {
        const anyLight = entries.some(
          (entry) => entry.isIntersecting && entry.intersectionRatio > 0.3,
        );
        setIsOnLight(anyLight);
      },
      { root: container, threshold: [0.3] },
    );
    lightSections.forEach((el) => lightObserver.observe(el));

    // Active section detection
    const allSections = container.querySelectorAll('[data-section]');
    const sectionObserver = new IntersectionObserver(
      (entries) => {
        let maxRatio = 0;
        let maxSection = 'hero';
        entries.forEach((entry) => {
          if (entry.intersectionRatio > maxRatio) {
            maxRatio = entry.intersectionRatio;
            maxSection = (entry.target as HTMLElement).dataset.section || 'hero';
          }
        });
        if (maxRatio > 0.2) {
          setActiveSection(maxSection);
        }
      },
      { root: container, threshold: [0.2, 0.5, 0.8] },
    );
    allSections.forEach((el) => sectionObserver.observe(el));

    // Scroll progress tracking (RAF-throttled)
    let rafId = 0;
    const handleScroll = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        const scrollTop = container.scrollTop;
        const scrollHeight = container.scrollHeight - container.clientHeight;
        const progress = scrollHeight > 0 ? scrollTop / scrollHeight : 0;
        setScrollProgress(Math.min(Math.max(progress, 0), 1));

        // Fractional section index
        const sections = Array.from(container.querySelectorAll('[data-section]'));
        if (sections.length > 0) {
          let fracIndex = 0;
          for (let i = 0; i < sections.length - 1; i++) {
            const currTop = (sections[i] as HTMLElement).offsetTop;
            const nextTop = (sections[i + 1] as HTMLElement).offsetTop;
            if (scrollTop >= currTop && scrollTop < nextTop) {
              const t = (scrollTop - currTop) / (nextTop - currTop);
              fracIndex = i + t;
              break;
            } else if (scrollTop >= nextTop && i === sections.length - 2) {
              fracIndex = i + 1;
            }
          }
          setSectionProgress(fracIndex);
        }
      });
    };
    container.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => {
      lightObserver.disconnect();
      sectionObserver.disconnect();
      cancelAnimationFrame(rafId);
      container.removeEventListener('scroll', handleScroll);
    };
  }, [enabled, containerRef, setScrollProgress, setSectionProgress, setActiveSection, setIsOnLight]);
}
