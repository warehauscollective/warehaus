'use client';

import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';

export function useGsapTimeline(config?: gsap.TimelineVars) {
  const timeline = useRef<gsap.core.Timeline | null>(null);

  useEffect(() => {
    timeline.current = gsap.timeline(config);

    return () => {
      timeline.current?.kill();
      timeline.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- config is expected to be stable on mount
  }, []);

  return timeline;
}
