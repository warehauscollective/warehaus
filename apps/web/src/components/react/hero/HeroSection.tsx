'use client';

import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ParallaxLayer } from './ParallaxLayer';
import { ParticleOverlay } from './ParticleOverlay';
import { GlassCard } from '../ui/GlassCard';

if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
}

interface HeroImage {
  src: string;
  alt: string;
}

interface HeroSectionProps {
  images?: HeroImage[];
}

const defaultImages: HeroImage[] = [
  { src: '/images/hero/bg-3.png', alt: 'Glass-dome observatory under starry sky' },
  { src: '/images/hero/bg-2.png', alt: 'Starlit citadel with glowing beacon' },
  { src: '/images/hero/bg-1.png', alt: 'Creative forge workshop' },
];

const words = ['DREAM.', 'DESIGN.', 'DEVELOP.'];

export function HeroSection({ images = defaultImages }: HeroSectionProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wordsRef = useRef<(HTMLDivElement | null)[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const container = containerRef.current;
    const scroller = scrollRef.current;
    if (!container || !scroller) return;

    const ctx = gsap.context(() => {
      // Pin the hero while scrolling through words
      ScrollTrigger.create({
        trigger: container,
        scroller,
        start: 'top top',
        end: `+=${window.innerHeight * 2}`,
        pin: true,
        pinSpacing: true,
      });

      // Animate each word sequentially
      wordsRef.current.forEach((wordEl, i) => {
        if (!wordEl) return;

        gsap.fromTo(
          wordEl,
          { opacity: 0, y: 60, scale: 0.95 },
          {
            opacity: 1,
            y: 0,
            scale: 1,
            duration: 0.6,
            ease: 'power3.out',
            scrollTrigger: {
              trigger: container,
              scroller,
              start: `${10 + i * 30}% top`,
              end: `${25 + i * 30}% top`,
              scrub: 1,
            },
          }
        );
      });
    }, container);

    return () => ctx.revert();
  }, []);

  return (
    <div ref={scrollRef} className="h-screen overflow-y-auto">
      {/* Hero container — 300vh to give scroll room */}
      <div style={{ height: '300vh' }}>
        <div
          ref={containerRef}
          className="relative h-screen w-full overflow-hidden"
        >
          {/* Background layers with parallax */}
          {images.map((img, i) => (
            <ParallaxLayer
              key={i}
              src={img.src}
              alt={img.alt}
              speed={0.2 + i * 0.15}
              eager={i === 0}
              scrollContainer={scrollRef}
              className={i > 0 ? 'opacity-60' : ''}
            />
          ))}

          {/* Dark overlay for text readability */}
          <div className="absolute inset-0 bg-gradient-to-b from-background/60 via-background/40 to-background" />

          {/* Particle overlay */}
          <ParticleOverlay count={200} />

          {/* Typography */}
          <div className="absolute inset-0 flex flex-col items-start justify-center px-12 md:px-20 lg:px-28">
            {words.map((word, i) => (
              <div
                key={word}
                ref={(el) => { wordsRef.current[i] = el; }}
                className="opacity-0"
              >
                <span className="font-display text-6xl font-bold leading-none tracking-tight text-foreground md:text-8xl lg:text-9xl">
                  {word}
                </span>
              </div>
            ))}
          </div>

          {/* Floating glass card */}
          <div className="absolute bottom-16 right-8 w-72 md:right-16 lg:right-24">
            <GlassCard className="space-y-3">
              <p className="font-display text-sm font-semibold uppercase tracking-wider text-accent">
                Start Here
              </p>
              <p className="text-sm leading-relaxed text-foreground/80">
                Dream your next digital product with us. We blend design,
                technology, and storytelling.
              </p>
            </GlassCard>
          </div>
        </div>
      </div>
    </div>
  );
}
