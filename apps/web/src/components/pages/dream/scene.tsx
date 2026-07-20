'use client';

/**
 * Dream scene engine — a layered 2.5D landscape rendered in SVG/CSS that morphs
 * between a golden "day" and a starlit "night" of the *same place*. Chosen over
 * Three.js because this is layered silhouette parallax + a palette recolor, not
 * true 3D: GPU-accelerated `translate3d` layers are lighter, smoother on mobile,
 * and SSR-safe (R3F has known SSR pitfalls in this repo). The starfield is
 * generated once from a fixed-seed PRNG so server and client render identically
 * (no hydration mismatch).
 */

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react';
import { Sun, Moon } from 'lucide-react';

/* ───────── deterministic scatter (SSR-safe) ───────── */
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260613);
const STARS = Array.from({ length: 96 }, () => ({
  x: rand() * 100,
  y: rand() * 60,
  r: rand() * 1.3 + 0.3,
  delay: rand() * 4,
  dur: 2.4 + rand() * 3.2,
}));
const FLOWERS = Array.from({ length: 30 }, () => ({
  x: rand() * 100,
  y: 82 + rand() * 16,
  r: rand() * 2.2 + 1.1,
  c: Math.floor(rand() * 4),
  delay: rand() * 3,
}));

/* ───────── palettes ───────── */
export type DreamMode = 'day' | 'night';

/** UI + scene CSS vars per mode. The pillar's indigo (--dream-primary) stays
    dominant in both; only the neutral ground and the land/sky hues swap. */
export const DAY_VARS = {
  '--paper': '#f4f1e9',
  '--paper-2': '#ece6d9',
  '--panel': 'color-mix(in oklab, #ffffff 60%, var(--paper))',
  '--ink': '#16151d',
  '--ink-2': 'rgba(22, 21, 29, 0.56)',
  '--ink-3': 'rgba(22, 21, 29, 0.32)',
  '--line': 'rgba(22, 21, 29, 0.13)',
  '--m-far': '#b6b1c4',
  '--m-mid': '#928da2',
  '--m-near': '#74804f',
  '--meadow': '#56692f',
  '--meadow-2': '#3d4d24',
  '--indigo': 'var(--dream-primary)',
  '--indigo-2': 'var(--dream-secondary)',
  '--indigo-ink': 'color-mix(in oklab, var(--dream-primary) 52%, #09080f)',
  '--indigo-soft': 'color-mix(in oklab, var(--dream-primary) 12%, var(--paper))',
} as CSSProperties;

export const NIGHT_VARS = {
  '--paper': '#08070f',
  '--paper-2': '#0d0b1a',
  '--panel': 'color-mix(in oklab, #ffffff 6%, var(--paper))',
  '--ink': '#ece9f6',
  '--ink-2': 'rgba(236, 233, 246, 0.62)',
  '--ink-3': 'rgba(236, 233, 246, 0.34)',
  '--line': 'rgba(236, 233, 246, 0.14)',
  '--m-far': '#1b1934',
  '--m-mid': '#141229',
  '--m-near': '#0e0c1e',
  '--meadow': '#0a0817',
  '--meadow-2': '#06050f',
  '--indigo': 'var(--dream-secondary)',
  '--indigo-2': 'var(--dream-primary)',
  '--indigo-ink': 'color-mix(in oklab, var(--dream-secondary) 78%, white)',
  '--indigo-soft': 'color-mix(in oklab, var(--dream-secondary) 16%, var(--paper))',
} as CSSProperties;

const FLOWER_DAY = ['#f6f3ea', '#e7b86a', '#c9b3ff', '#ef9a63'];
const FLOWER_NIGHT = ['#cfd4ff', '#9aa0e6', '#e9e6f6', '#b9c0ff'];

/* ───────── mode context ───────── */
interface ModeCtx {
  mode: DreamMode;
  toggle: () => void;
  setMode: (m: DreamMode) => void;
}
const DreamModeContext = createContext<ModeCtx>({ mode: 'day', toggle: () => {}, setMode: () => {} });
export const useDreamMode = () => useContext(DreamModeContext);

export function DreamModeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<DreamMode>('day');
  const toggle = () => setMode((m) => (m === 'day' ? 'night' : 'day'));
  return <DreamModeContext.Provider value={{ mode, toggle, setMode }}>{children}</DreamModeContext.Provider>;
}

/* ───────── parallax hook ───────── */
/** Writes pointer offset (−1..1) to --px/--py on the element for layers to read.
    No-op under prefers-reduced-motion. */
export function useParallax(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width - 0.5) * 2;
      const y = ((e.clientY - r.top) / r.height - 0.5) * 2;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        el.style.setProperty('--px', x.toFixed(3));
        el.style.setProperty('--py', y.toFixed(3));
      });
    };
    const onLeave = () => {
      el.style.setProperty('--px', '0');
      el.style.setProperty('--py', '0');
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerleave', onLeave);
    return () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
      cancelAnimationFrame(raf);
    };
  }, [ref]);
}

/** Depth → layer transform. Higher k = nearer = moves more with the pointer. */
function layer(k: number): CSSProperties {
  return {
    transform: `translate3d(calc(var(--px,0) * ${k}px), calc(var(--py,0) * ${(k * 0.55).toFixed(1)}px), 0)`,
    transition: 'transform 500ms cubic-bezier(.22,.61,.36,1)',
    willChange: 'transform',
  };
}

/* ───────── the scene ───────── */
export interface DreamSceneProps {
  /** 0..1 — how much fog drowns the scene (the "lost in fog" beat). */
  fog?: number;
  /** Hide the nearest meadow band (for thin horizon strips). */
  meadow?: boolean;
  /** Dim the whole scene so foreground content reads (default subtle). */
  veil?: number;
  className?: string;
  style?: CSSProperties;
  /** Overlaid content (headlines, map lines, etc.) — sits above all layers. */
  children?: ReactNode;
}

export function DreamScene({ fog = 0, meadow = true, veil = 0, className, style, children }: DreamSceneProps) {
  const { mode } = useDreamMode();
  const ref = useRef<HTMLDivElement>(null);
  useParallax(ref);
  const night = mode === 'night';

  return (
    <div ref={ref} className={`absolute inset-0 overflow-hidden ${className ?? ''}`} style={style} aria-hidden>
      {/* Sky — two stacked gradients crossfade between day and night */}
      <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg,#b9c4d8 0%,#d9dcd6 40%,#f4e3c6 76%,#f7ead1 100%)' }} />
      <div
        className="absolute inset-0"
        style={{ background: 'linear-gradient(180deg,#040315 0%,#0b0a24 44%,#181333 78%,#241a3c 100%)', opacity: night ? 1 : 0, transition: 'opacity 1000ms ease' }}
      />

      {/* Starfield — fades in at night */}
      <div className="absolute inset-0" style={{ opacity: night ? 1 : 0, transition: 'opacity 1100ms ease', ...layer(3) }}>
        <svg className="h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          {STARS.map((s, i) => (
            <circle
              key={i}
              cx={s.x}
              cy={s.y}
              r={s.r * 0.12}
              fill="#eef0ff"
              className="motion-safe:animate-pulse"
              style={{ animationDelay: `${s.delay}s`, animationDuration: `${s.dur}s` }}
            />
          ))}
        </svg>
      </div>

      {/* Horizon glow — warm sunset / cool moonglow */}
      <div
        className="absolute inset-x-0 bottom-[20%] top-[42%]"
        style={{
          background: night
            ? 'radial-gradient(60% 90% at 50% 100%, rgba(120,130,255,0.30), transparent 70%)'
            : 'radial-gradient(58% 95% at 50% 100%, rgba(247,214,150,0.85), transparent 68%)',
          transition: 'background 1000ms ease',
          ...layer(2),
        }}
      />

      {/* Celestial body — sun ↔ moon, same spot on the horizon */}
      <div className="absolute left-1/2 bottom-[30%] -translate-x-1/2" style={layer(4)}>
        <div className="relative" style={{ width: 'clamp(80px,12vw,150px)', height: 'clamp(80px,12vw,150px)' }}>
          {/* sun */}
          <div
            className="absolute inset-0 rounded-full"
            style={{ background: 'radial-gradient(circle,#fff7e6 0%,#fbe2ab 45%,rgba(250,210,140,0) 72%)', opacity: night ? 0 : 1, transition: 'opacity 900ms ease' }}
          />
          {/* moon */}
          <div
            className="absolute inset-[18%] rounded-full"
            style={{ background: 'radial-gradient(circle at 38% 38%,#f3f1fb 0%,#cfd0e8 60%,#a7a8c8 100%)', boxShadow: '0 0 60px 12px rgba(150,160,255,0.35)', opacity: night ? 1 : 0, transition: 'opacity 900ms ease' }}
          />
        </div>
      </div>

      {/* Mountain ridgelines — fill recolors per mode (fill transitions smoothly) */}
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1440 600" preserveAspectRatio="none">
        <path style={{ fill: 'var(--m-far)', transition: 'fill 1000ms ease', ...layer(6) }}
          d="M0,600 L0,300 L120,232 L210,300 L300,212 L420,300 L520,250 L640,330 L760,248 L880,322 L1010,240 L1140,330 L1260,262 L1380,330 L1440,300 L1440,600 Z" />
        <path style={{ fill: 'var(--m-mid)', transition: 'fill 1000ms ease', ...layer(12) }}
          d="M0,600 L0,402 L160,360 L320,410 L480,350 L640,412 L800,360 L960,420 L1120,360 L1280,420 L1440,382 L1440,600 Z" />
        <path style={{ fill: 'var(--m-near)', transition: 'fill 1000ms ease', ...layer(20) }}
          d="M0,600 L0,470 Q180,430 360,470 T720,470 T1080,470 T1440,470 L1440,600 Z" />
      </svg>

      {/* Foreground meadow + wildflower specks */}
      {meadow && (
        <div className="absolute inset-0" style={layer(34)}>
          <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1440 600" preserveAspectRatio="none">
            <path style={{ fill: 'var(--meadow)', transition: 'fill 1000ms ease' }}
              d="M0,600 L0,520 Q240,498 480,524 T960,520 T1440,524 L1440,600 Z" />
            <path style={{ fill: 'var(--meadow-2)', transition: 'fill 1000ms ease' }}
              d="M0,600 L0,556 Q360,540 720,556 T1440,556 L1440,600 Z" />
          </svg>
          <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            {FLOWERS.map((f, i) => (
              <circle key={i} cx={f.x} cy={f.y} r={f.r * 0.16}
                fill={(night ? FLOWER_NIGHT : FLOWER_DAY)[f.c]}
                className="motion-safe:animate-pulse"
                style={{ opacity: night ? 0.7 : 0.92, animationDelay: `${f.delay}s`, animationDuration: '3.5s', transition: 'fill 1000ms ease' }} />
            ))}
          </svg>
        </div>
      )}

      {/* Fog — drifting bands that drown the scene for the "lost" beat */}
      {fog > 0 && (
        <>
          <div className="absolute inset-0" style={{ background: night ? 'rgba(12,11,26,0.55)' : 'rgba(244,241,233,0.55)', opacity: fog, transition: 'opacity 700ms ease, background 1000ms ease' }} />
          <div className="absolute inset-x-0 top-[24%] h-[44%]" style={{ background: night ? 'linear-gradient(180deg,transparent,rgba(20,18,40,0.85),transparent)' : 'linear-gradient(180deg,transparent,rgba(248,246,240,0.92),transparent)', filter: 'blur(20px)', opacity: fog, transition: 'opacity 700ms ease' }} />
        </>
      )}

      {/* Optional veil so overlaid text always reads */}
      {veil > 0 && (
        <div className="absolute inset-0" style={{ background: night ? `rgba(8,7,15,${veil})` : `rgba(244,241,233,${veil})`, transition: 'background 1000ms ease' }} />
      )}

      {children}
    </div>
  );
}

/* ───────── day / night toggle ───────── */
export function ModeToggle({ className, style }: { className?: string; style?: CSSProperties }) {
  const { mode, toggle } = useDreamMode();
  const night = mode === 'night';
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={night ? 'Switch to day' : 'Switch to night'}
      title={night ? 'Switch to day' : 'Switch to night'}
      className={`group relative inline-flex items-center gap-2 rounded-full p-1 transition-colors ${className ?? ''}`}
      style={{ border: '1px solid var(--line)', background: 'color-mix(in oklab, var(--panel) 70%, transparent)', backdropFilter: 'blur(6px)', ...style }}
    >
      <span className="flex h-7 w-7 items-center justify-center rounded-full transition-colors" style={{ background: night ? 'transparent' : 'var(--indigo-soft)', color: night ? 'var(--ink-3)' : 'var(--indigo-ink)' }}>
        <Sun className="h-3.5 w-3.5" />
      </span>
      <span className="flex h-7 w-7 items-center justify-center rounded-full transition-colors" style={{ background: night ? 'var(--indigo-soft)' : 'transparent', color: night ? 'var(--indigo-ink)' : 'var(--ink-3)' }}>
        <Moon className="h-3.5 w-3.5" />
      </span>
    </button>
  );
}
