'use client';

import { useRef } from 'react';
import Image from 'next/image';
import { useParallax } from '../animations/useParallax';
import type { RefObject } from 'react';

interface ParallaxLayerProps {
  src: string;
  alt: string;
  speed?: number;
  className?: string;
  eager?: boolean;
  scrollContainer?: RefObject<HTMLElement | null>;
}

export function ParallaxLayer({
  src,
  alt,
  speed = 0.5,
  className = '',
  eager = false,
  scrollContainer,
}: ParallaxLayerProps) {
  const layerRef = useRef<HTMLDivElement>(null);
  useParallax(layerRef, speed, scrollContainer);

  return (
    <div
      ref={layerRef}
      className={`absolute inset-0 will-change-transform ${className}`}
      style={{ overflow: 'hidden' }}
    >
      <Image
        src={src}
        alt={alt}
        fill
        priority={eager}
        className="object-cover"
        sizes="100vw"
        unoptimized
      />
    </div>
  );
}
