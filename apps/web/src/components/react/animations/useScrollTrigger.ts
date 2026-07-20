'use client';

import { useEffect, useRef, type RefObject } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
}

interface UseScrollTriggerOptions {
  trigger: RefObject<HTMLElement | null>;
  start?: string;
  end?: string;
  scrub?: boolean | number;
  pin?: boolean;
  scroller?: RefObject<HTMLElement | null>;
  onEnter?: () => void;
  onLeave?: () => void;
}

export function useScrollTrigger(options: UseScrollTriggerOptions) {
  const timeline = useRef<gsap.core.Timeline | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const triggerEl = options.trigger.current;
    if (!triggerEl) return;

    timeline.current = gsap.timeline({
      scrollTrigger: {
        trigger: triggerEl,
        scroller: options.scroller?.current || undefined,
        start: options.start || 'top center',
        end: options.end || 'bottom center',
        scrub: options.scrub ?? true,
        pin: options.pin || false,
        onEnter: options.onEnter,
        onLeave: options.onLeave,
      },
    });

    return () => {
      timeline.current?.scrollTrigger?.kill();
      timeline.current?.kill();
      timeline.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- options are expected to be stable on mount
  }, []);

  return timeline;
}
