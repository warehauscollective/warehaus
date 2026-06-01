'use client';

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ElementType,
  type ReactNode,
} from 'react';

const useIso = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/* ──────────────────────────────────────────────────────────────────────────
   BevelFrame — a framed chamfered "glass" surface.

   Two translucent, backdrop-blurred layers that share the signature 45° cut:
     • an OUTER frame painted as a RING (the outer chamfer minus the inner
       shape, via clip-path even-odd) — so it shows only as the border + the
       thicker bottom reveal, and
     • an INNER panel that sits in the hole, blurring the page DIRECTLY (the
       frame is knocked out behind it, so there's no frame tint stacked under
       the content).

   Geometry (radius / cut / shoulder) is authored in rem, like <Bevel>; the
   frame insets are in px.
   ────────────────────────────────────────────────────────────────────────── */

type Corner = 'tl' | 'tr' | 'br' | 'bl';
const ALL: Corner[] = ['tl', 'tr', 'br', 'bl'];
type Pt = [number, number];
interface Geo { type: 'round' | 'bevel'; r: number; c: number; s: number }
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Chamfer path over an explicit box (x0,y0)–(x1,y1). */
function pathFor(x0: number, y0: number, x1: number, y1: number, corners: Record<Corner, Geo>): string {
  const def: Record<Corner, { V: Pt; din: Pt; dout: Pt }> = {
    tl: { V: [x0, y0], din: [0, -1], dout: [1, 0] },
    tr: { V: [x1, y0], din: [1, 0], dout: [0, 1] },
    br: { V: [x1, y1], din: [0, 1], dout: [-1, 0] },
    bl: { V: [x0, y1], din: [-1, 0], dout: [0, -1] },
  };
  function geo(key: Corner): { Pin: Pt; Pout: Pt; cmd: (number | string)[] } {
    const cfg = corners[key];
    const { V, din, dout } = def[key];
    if (cfg.type === 'bevel') {
      const c = cfg.c;
      const s = cfg.s || 0;
      const A: Pt = [V[0] - din[0] * c, V[1] - din[1] * c];
      const B: Pt = [V[0] + dout[0] * c, V[1] + dout[1] * c];
      if (s <= 0) return { Pin: A, Pout: B, cmd: ['L', B[0], B[1]] };
      const dx = B[0] - A[0];
      const dy = B[1] - A[1];
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      const A2: Pt = [A[0] + ux * s, A[1] + uy * s];
      const B2: Pt = [B[0] - ux * s, B[1] - uy * s];
      const Pin: Pt = [V[0] - din[0] * (c + s), V[1] - din[1] * (c + s)];
      const Pout: Pt = [V[0] + dout[0] * (c + s), V[1] + dout[1] * (c + s)];
      return { Pin, Pout, cmd: ['Q', A[0], A[1], A2[0], A2[1], 'L', B2[0], B2[1], 'Q', B[0], B[1], Pout[0], Pout[1]] };
    }
    const r = cfg.r || 0;
    if (r <= 0) return { Pin: V, Pout: V, cmd: [] };
    const Pi: Pt = [V[0] - din[0] * r, V[1] - din[1] * r];
    const Po: Pt = [V[0] + dout[0] * r, V[1] + dout[1] * r];
    return { Pin: Pi, Pout: Po, cmd: ['Q', V[0], V[1], Po[0], Po[1]] };
  }
  const g = { tl: geo('tl'), tr: geo('tr'), br: geo('br'), bl: geo('bl') };
  const fmt = (a: (number | string)[]) => a.map((x) => (typeof x === 'number' ? r2(x) : x)).join(' ');
  let d = 'M ' + r2(g.tl.Pout[0]) + ' ' + r2(g.tl.Pout[1]);
  (['tr', 'br', 'bl', 'tl'] as Corner[]).forEach((k) => {
    d += ' L ' + r2(g[k].Pin[0]) + ' ' + r2(g[k].Pin[1]);
    if (g[k].cmd.length) d += ' ' + fmt(g[k].cmd);
  });
  return d + ' Z';
}

function cornerMap(beveled: Set<Corner>, radiusPx: number, cutPx: number, shoulderPx: number): Record<Corner, Geo> {
  return ALL.reduce((acc, k) => {
    acc[k] = beveled.has(k)
      ? { type: 'bevel', r: 0, c: cutPx, s: shoulderPx }
      : { type: 'round', r: radiusPx, c: 0, s: 0 };
    return acc;
  }, {} as Record<Corner, Geo>);
}

export interface BevelFrameProps {
  as?: ElementType;
  /** Beveled corners. Default 'br'. */
  corners?: string;
  /** Rounded radius (rem). Default 1.25. */
  radius?: number;
  /** Bevel cut (rem). Default 3. */
  cut?: number;
  /** Shoulder fillet (rem). Default 0.875. */
  shoulder?: number;
  /** Frame thickness in px per side. */
  frame?: { top?: number; right?: number; bottom?: number; left?: number };
  /** Frame color — more opaque than the inner so the frame reads. */
  outerFill?: string;
  /** Translucent inner panel color. */
  innerFill?: string;
  /** Backdrop blur radius (px). Default 24. */
  blur?: number;
  className?: string;
  style?: CSSProperties;
  /** Class/style for the scrollable inner content layer. */
  innerClassName?: string;
  innerStyle?: CSSProperties;
  children?: ReactNode;
  [key: string]: unknown;
}

export function BevelFrame({
  as,
  corners = 'br',
  radius = 1.25,
  cut = 3,
  shoulder = 0.875,
  frame,
  outerFill = 'color-mix(in oklab, var(--fg) 92%, transparent)',
  innerFill = 'color-mix(in oklab, var(--surface) 72%, transparent)',
  blur = 24,
  className,
  style,
  innerClassName,
  innerStyle,
  children,
  ...rest
}: BevelFrameProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Tag = (as || 'div') as any;
  const ref = useRef<HTMLElement | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [remPx, setRemPx] = useState(16);

  useIso(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      setBox((p) => (Math.abs(p.w - rect.width) < 0.5 && Math.abs(p.h - rect.height) < 0.5 ? p : { w: rect.width, h: rect.height }));
      const fs = parseFloat(getComputedStyle(document.documentElement).fontSize);
      if (fs) setRemPx(fs);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const top = frame?.top ?? 2;
  const right = frame?.right ?? 2;
  const bottom = frame?.bottom ?? 48;
  const left = frame?.left ?? 2;

  const beveled = new Set(corners.toLowerCase().split(/\s+/).filter(Boolean) as Corner[]);
  const radiusPx = radius * remPx;
  const cutPx = cut * remPx;
  const shoulderPx = shoulder * remPx;

  const { w, h } = box;
  const painted = w > 0 && h > 0;
  const innerW = Math.max(0, w - left - right);
  const innerH = Math.max(0, h - top - bottom);

  const outerCorners = cornerMap(beveled, radiusPx, cutPx, shoulderPx);
  const innerCorners = cornerMap(beveled, Math.max(0, radiusPx - left), cutPx, shoulderPx);

  const outerD = painted ? pathFor(0, 0, w, h, outerCorners) : '';
  const holeD = painted ? pathFor(left, top, w - right, h - bottom, innerCorners) : '';
  const innerLocalD = painted ? pathFor(0, 0, innerW, innerH, innerCorners) : '';
  const blurCss = `blur(${blur}px) saturate(1.4)`;

  return (
    <Tag ref={ref} className={className} style={{ position: 'relative', isolation: 'isolate', ...style }} {...rest}>
      {painted && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 0,
            pointerEvents: 'none',
            background: outerFill,
            backdropFilter: blurCss,
            WebkitBackdropFilter: blurCss,
            clipPath: `path(evenodd, "${outerD} ${holeD}")`,
          }}
        />
      )}
      <div
        className={innerClassName}
        style={{
          position: 'absolute',
          top,
          left,
          right,
          bottom,
          zIndex: 1,
          ...(painted
            ? {
                background: innerFill,
                backdropFilter: blurCss,
                WebkitBackdropFilter: blurCss,
                clipPath: `path("${innerLocalD}")`,
              }
            : null),
          ...innerStyle,
        }}
      >
        {children}
      </div>
    </Tag>
  );
}

export default BevelFrame;
