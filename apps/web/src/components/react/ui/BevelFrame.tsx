'use client';

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ElementType,
  type ReactNode,
} from 'react';
import { useBevelInspector } from '@/components/dev/bevelInspector';

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

function cornerMap(
  beveled: Set<Corner>,
  radiusPx: number,
  cutPxFor: (k: Corner) => number,
  shoulderPxFor: (k: Corner) => number,
): Record<Corner, Geo> {
  return ALL.reduce((acc, k) => {
    acc[k] = beveled.has(k)
      ? { type: 'bevel', r: 0, c: cutPxFor(k), s: shoulderPxFor(k) }
      : { type: 'round', r: radiusPx, c: 0, s: 0 };
    return acc;
  }, {} as Record<Corner, Geo>);
}

export interface BevelFrameProps {
  as?: ElementType;
  /** Beveled corners for the OUTER frame silhouette. Default 'br'. */
  corners?: string;
  /** Beveled corners for the INNER panel (+ the hole it sits in). Defaults to
      `corners`. Lets the inner glass cut a different corner than the outer
      frame (which is left untouched). */
  innerCorners?: string;
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
  /** Stable id for the dev bevel inspector (defaults to an auto-generated id). */
  inspectorId?: string;
  /** Label shown in the dev inspector panel title. */
  inspectorLabel?: string;
  [key: string]: unknown;
}

export function BevelFrame({
  as,
  corners = 'br',
  innerCorners,
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
  inspectorId,
  inspectorLabel,
  ...rest
}: BevelFrameProps) {
  const Tag = (as || 'div') as any;
  const ref = useRef<HTMLElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);
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

  // ── Dev bevel inspector (no-op in production / when disabled) ──
  const inspector = useBevelInspector();
  const autoId = useId();
  const inspId = inspectorId ?? autoId;
  const [hovered, setHovered] = useState(false);
  useEffect(() => {
    if (!inspector.enabled) return;
    // Capture the inner panel's current padding (px) so the inspector seeds its
    // padding controls from whatever the frame authored (innerStyle/token).
    let padding;
    const innerEl = innerRef.current;
    if (innerEl) {
      const cs = getComputedStyle(innerEl);
      padding = {
        top: parseFloat(cs.paddingTop) || 0,
        right: parseFloat(cs.paddingRight) || 0,
        bottom: parseFloat(cs.paddingBottom) || 0,
        left: parseFloat(cs.paddingLeft) || 0,
      };
    }
    // Seed fill from innerFill + stroke=none so selecting doesn't recolor the frame.
    inspector.register(inspId, {
      corners,
      cut,
      shoulder,
      radius,
      fill: innerFill,
      stroke: 'none',
      strokeWidth: 0,
      padding,
      label: inspectorLabel,
    });
    return () => inspector.unregister(inspId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inspector.enabled, inspId, corners, cut, shoulder, radius, innerFill, inspectorLabel]);

  // Live overrides take precedence over authored geometry.
  const ov = inspector.enabled ? inspector.overrides[inspId] : undefined;
  const effCorners = ov?.corners ?? corners;
  const effRadius = ov?.radius ?? radius;
  const effInnerFill = ov?.fill ?? innerFill;
  // Inspector padding (px) is applied to the INNER panel as per-side longhands.
  const ovPadding = ov?.padding
    ? {
        paddingTop: ov.padding.top,
        paddingRight: ov.padding.right,
        paddingBottom: ov.padding.bottom,
        paddingLeft: ov.padding.left,
      }
    : null;

  const top = frame?.top ?? 2;
  const right = frame?.right ?? 2;
  const bottom = frame?.bottom ?? 48;
  const left = frame?.left ?? 2;

  const parseBeveled = (c: string | Corner[]): Set<Corner> =>
    new Set(Array.isArray(c) ? c : (c.toLowerCase().split(/\s+/).filter(Boolean) as Corner[]));
  // Outer frame keeps its own beveled corners; the inner panel (+ the hole it
  // sits in) can bevel a DIFFERENT corner via `innerCorners` — so the inner
  // glass cut can move without touching the outer silhouette.
  const beveled = parseBeveled(effCorners);
  const innerBeveled = parseBeveled(innerCorners ?? effCorners);
  const radiusPx = effRadius * remPx;
  const cutPxFor = (k: Corner) => (ov?.perCorner?.[k]?.cut ?? cut) * remPx;
  const shoulderPxFor = (k: Corner) => (ov?.perCorner?.[k]?.shoulder ?? shoulder) * remPx;

  const { w, h } = box;
  const painted = w > 0 && h > 0;
  const innerW = Math.max(0, w - left - right);
  const innerH = Math.max(0, h - top - bottom);

  const outerCornerMap = cornerMap(beveled, radiusPx, cutPxFor, shoulderPxFor);
  const innerCornerMap = cornerMap(innerBeveled, Math.max(0, radiusPx - left), cutPxFor, shoulderPxFor);

  // Outer silhouette uses the outer corners; the hole + inner panel share the
  // inner corners so the panel fits the knockout exactly.
  const outerD = painted ? pathFor(0, 0, w, h, outerCornerMap) : '';
  const holeD = painted ? pathFor(left, top, w - right, h - bottom, innerCornerMap) : '';
  const innerLocalD = painted ? pathFor(0, 0, innerW, innerH, innerCornerMap) : '';
  const blurCss = `blur(${blur}px) saturate(1.4)`;

  // Inspector affordances (only when the inspector is enabled).
  const selected = inspector.enabled && inspector.selectedId === inspId;
  const inspectorStyle: CSSProperties | null = inspector.enabled
    ? {
        outline: selected
          ? '2px solid #00e5ff'
          : hovered
            ? '2px dashed rgba(0,229,255,0.7)'
            : '1px dashed rgba(0,229,255,0.25)',
        outlineOffset: 2,
        cursor: 'pointer',
      }
    : null;
  const inspectorHandlers = inspector.enabled
    ? {
        onMouseEnter: () => setHovered(true),
        onMouseLeave: () => setHovered(false),
        onClick: (e: { preventDefault: () => void; stopPropagation: () => void }) => {
          e.preventDefault();
          e.stopPropagation();
          inspector.select(inspId);
        },
      }
    : null;

  return (
    <Tag
      ref={ref}
      className={className}
      style={{ position: 'relative', isolation: 'isolate', ...style, ...inspectorStyle }}
      {...rest}
      {...inspectorHandlers}
    >
      {painted && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 0,
            // Hit-testable: the clip-path is a RING (center hole is clipped out
            // of hit-testing too), and the inner panel sits above at zIndex 1 —
            // so only the visible glass border/bottom-reveal catches the cursor.
            // This lets element inspectors select the frame and removes a
            // phantom click-through on the decorative glass. Stays aria-hidden.
            pointerEvents: 'auto',
            background: outerFill,
            backdropFilter: blurCss,
            WebkitBackdropFilter: blurCss,
            clipPath: `path(evenodd, "${outerD} ${holeD}")`,
          }}
        />
      )}
      <div
        ref={innerRef}
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
                background: effInnerFill,
                backdropFilter: blurCss,
                WebkitBackdropFilter: blurCss,
                clipPath: `path("${innerLocalD}")`,
              }
            : null),
          ...innerStyle,
          // Inspector per-side padding wins; drop any `padding` shorthand from
          // innerStyle first so the shorthand can't clobber the longhands.
          ...(ovPadding ? { padding: undefined, ...ovPadding } : null),
        }}
      >
        {children}
      </div>
    </Tag>
  );
}

export default BevelFrame;
