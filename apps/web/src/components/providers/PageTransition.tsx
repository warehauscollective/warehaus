'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';

interface PageTransitionProps {
  children: ReactNode;
}

/**
 * Page transition wrapper. During navigation:
 * 1. Fades out old content (250ms)
 * 2. Swaps to new content and fades in (400ms)
 *
 * When not transitioning, renders children directly (no derived state).
 */
export function PageTransition({ children }: PageTransitionProps) {
  const pathname = usePathname();
  const [phase, setPhase] = useState<'idle' | 'exiting' | 'entering'>('idle');
  const prevPathname = useRef(pathname);
  const frozenChildren = useRef(children);
  const isTransitioning = phase !== 'idle';

  // Sync frozen children via effect (safe — not during render)
  useEffect(() => {
    if (!isTransitioning) {
      frozenChildren.current = children;
    }
  }, [children, isTransitioning]);

  // Detect pathname changes and trigger transition
  useEffect(() => {
    if (pathname === prevPathname.current) return;
    prevPathname.current = pathname;

    // Freeze current children, start exit
    const rafId = requestAnimationFrame(() => {
      setPhase('exiting');
    });

    // After exit animation, swap content + enter
    const exitTimer = setTimeout(() => {
      frozenChildren.current = children;
      window.scrollTo(0, 0);
      setPhase('entering');
    }, 250);

    // After enter animation, go idle
    const enterTimer = setTimeout(() => {
      setPhase('idle');
    }, 650);

    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(exitTimer);
      clearTimeout(enterTimer);
    };
  // children is intentionally excluded — we only want pathname changes to trigger this
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const className =
    phase === 'exiting'
      ? 'page-transition page-exit'
      : phase === 'entering'
        ? 'page-transition page-enter'
        : 'page-transition page-visible';

  return (
    <div className={className}>
      {isTransitioning ? frozenChildren.current : children}
    </div>
  );
}
