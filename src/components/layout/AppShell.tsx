'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { LayoutProvider, useLayout } from '@/components/providers/LayoutProvider';
import { BottomNav } from '@/components/layout/BottomNav';
import { MenuOverlay } from '@/components/layout/MenuOverlay';
import { ChatOverlay } from '@/components/layout/ChatOverlay';
import { PageTransition } from '@/components/providers/PageTransition';

function AppShellInner({ children }: { children: ReactNode }) {
  const {
    setScrollProgress,
    setSectionProgress,
    setActiveSection,
    setIsOnLight,
  } = useLayout();

  const pathname = usePathname();
  const mainRef = useRef<HTMLDivElement>(null);

  // Full-viewport routes render their own `h-[100dvh] overflow-hidden` shell and
  // scroll internally (per panel). They must NOT get the flowing-page bottom
  // padding — that would tack a strip of the root background below the 100dvh
  // page and make the window scrollable past the content. Flowing pages keep
  // `pb-28` so their last content clears the floating BottomNav.
  const isFullViewport =
    pathname === '/' ||
    pathname === '/style-guide' ||
    pathname === '/style-guide/worlds';

  // Reset scroll state on route change
  useEffect(() => {
    setSectionProgress(0);
    setScrollProgress(0);
    const first = document.querySelector('[data-section]');
    if (first) {
      setActiveSection((first as HTMLElement).dataset.section || 'hero');
    } else {
      setActiveSection('hero');
    }
  }, [pathname, setSectionProgress, setScrollProgress, setActiveSection]);

  // Scroll/section observers for non-home pages (home uses per-panel observers)
  useEffect(() => {
    // On home page, the tabbed panels handle their own scroll tracking
    if (pathname === '/') return;

    const lightSections = document.querySelectorAll('[data-theme="light"]');
    const lightObserver = new IntersectionObserver(
      (entries) => {
        const anyLight = entries.some(
          (entry) => entry.isIntersecting && entry.intersectionRatio > 0.3,
        );
        setIsOnLight(anyLight);
      },
      { threshold: [0.3] },
    );
    lightSections.forEach((el) => lightObserver.observe(el));

    const allSections = document.querySelectorAll('[data-section]');
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
      { threshold: [0.2, 0.5, 0.8] },
    );
    allSections.forEach((el) => sectionObserver.observe(el));

    let rafId = 0;
    const handleScroll = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        const scrollTop = window.scrollY;
        const docHeight = document.documentElement.scrollHeight - window.innerHeight;
        const progress = docHeight > 0 ? scrollTop / docHeight : 0;
        setScrollProgress(Math.min(Math.max(progress, 0), 1));

        const sections = Array.from(document.querySelectorAll('[data-section]'));
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
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => {
      lightObserver.disconnect();
      sectionObserver.disconnect();
      cancelAnimationFrame(rafId);
      window.removeEventListener('scroll', handleScroll);
    };
  }, [pathname, setScrollProgress, setSectionProgress, setActiveSection, setIsOnLight]);

  return (
    <div
      className={`${
        isFullViewport ? 'h-[100dvh] overflow-hidden' : 'min-h-screen'
      } w-full bg-background text-foreground font-sans selection:bg-foreground/20 transition-colors duration-500`}
      style={
        {
          '--left-sidebar-w': '0px',
          '--right-sidebar-w': '0px',
        } as React.CSSProperties
      }
    >
      {/* Main content — flowing pages pad the bottom so their last content
          clears the floating BottomNav; full-viewport tabbed pages don't. */}
      <main ref={mainRef} className={`w-full ${isFullViewport ? 'h-full overflow-hidden' : 'pb-28'}`}>
        <PageTransition>{children}</PageTransition>
      </main>

      <BottomNav />
      <MenuOverlay />
      <ChatOverlay />
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <LayoutProvider>
      <AppShellInner>{children}</AppShellInner>
    </LayoutProvider>
  );
}
