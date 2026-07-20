'use client';

import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';

interface AnimatedCounterProps {
  target: number;
  duration?: number;
  suffix?: string;
}

export function AnimatedCounter({
  target,
  duration = 2,
  suffix = '',
}: AnimatedCounterProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const hasAnimated = useRef(false);
  const [display, setDisplay] = useState('0');

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting && !hasAnimated.current) {
          hasAnimated.current = true;

          const proxy = { value: 0 };
          gsap.to(proxy, {
            value: target,
            duration,
            ease: 'power2.out',
            onUpdate() {
              setDisplay(
                Number.isInteger(target)
                  ? Math.round(proxy.value).toLocaleString()
                  : proxy.value.toFixed(1),
              );
            },
          });

          observer.disconnect();
        }
      },
      { threshold: 0.2 },
    );

    observer.observe(el);

    return () => {
      observer.disconnect();
    };
  }, [target, duration]);

  return (
    <span ref={ref} className="tabular-nums">
      {display}
      {suffix && <span className="text-muted">{suffix}</span>}
    </span>
  );
}
