'use client';

import { useEffect, type RefObject } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
}

export function useParallax(
  ref: RefObject<HTMLElement | null>,
  speed: number = 0.5,
  scrollContainer?: RefObject<HTMLElement | null>
) {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const el = ref.current;
    if (!el) return;

    const yDistance = speed * 100;

    const tween = gsap.fromTo(
      el,
      { y: -yDistance },
      {
        y: yDistance,
        ease: 'none',
        scrollTrigger: {
          trigger: el,
          scroller: scrollContainer?.current || undefined,
          start: 'top bottom',
          end: 'bottom top',
          scrub: true,
        },
      }
    );

    return () => {
      tween.scrollTrigger?.kill();
      tween.kill();
    };
  }, [ref, speed, scrollContainer]);
}
