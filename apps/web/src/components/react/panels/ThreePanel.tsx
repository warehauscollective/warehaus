'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { SceneLoader } from '../three/SceneLoader';

interface ThreePanelProps {
  children: ReactNode;
  className?: string;
  fallbackHeight?: string;
}

export function ThreePanel({
  children,
  className = '',
  fallbackHeight = '400px',
}: ThreePanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
      },
      { rootMargin: '200px' }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden rounded-xl ${className}`}
      style={{ minHeight: fallbackHeight }}
    >
      {isVisible ? children : <SceneLoader className="absolute inset-0" />}
    </div>
  );
}
