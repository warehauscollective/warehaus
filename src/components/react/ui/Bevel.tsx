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

// useLayoutEffect on the client (no paint flash), useEffect on the server (no SSR warning).
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/* ──────────────────────────────────────────────────────────────────────────
   Bevel — Warehaus chamfered surface / background component

   A drop-in beveled surface that wears the signature avax-style 45° cut with
   rounded shoulders. The shape is PAINTED as an inline <svg> <path> sized to
   the element's true pixel box, so the hairline stroke traces the cut — the
   move that clip-path / corner-shape can't do. The SVG sits behind the
   content (z-index -1 inside an isolated stacking context), so children ride
   above it with no per-child z-index.

   Highly tweakable — every knob from the original engine is a prop. Geometry
   values (radius / cut / shoulder + perCorner) are authored in REM and painted
   in px relative to the root font size; strokeWidth stays in px.
     <Bevel>                                    // default: bottom-right cut
     <Bevel corners="tl tr br bl" cut={1.375} />// full bevel (≈22px)
     <Bevel fill="var(--accent)" stroke="none" />
     <Bevel perCorner={{ br: { cut: 4, shoulder: 1.375 } }} />
     <Bevel clip>…</Bevel>                       // also clip content to the shape

   It is theme-aware by default: fill / stroke resolve live `var(--…)` tokens,
   so a light/dark swap re-resolves with no repaint.
   ────────────────────────────────────────────────────────────────────────── */

export type BevelCorner = 'tl' | 'tr' | 'br' | 'bl';
const ALL_CORNERS: BevelCorner[] = ['tl', 'tr', 'br', 'bl'];

interface CornerGeo {
  type: 'round' | 'bevel';
  r: number;
  c: number;
  s: number;
}

type Pt = [number, number];
interface CornerDef {
  V: Pt;
  din: Pt;
  dout: Pt;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Build the SVG path `d` for a box, mixing rounded + soft-bevel corners. */
function chamferPath(
  w: number,
  h: number,
  inset: number,
  corners: Record<BevelCorner, CornerGeo>,
): string {
  const x0 = inset;
  const y0 = inset;
  const x1 = w - inset;
  const y1 = h - inset;
  const def: Record<BevelCorner, CornerDef> = {
    tl: { V: [x0, y0], din: [0, -1], dout: [1, 0] },
    tr: { V: [x1, y0], din: [1, 0], dout: [0, 1] },
    br: { V: [x1, y1], din: [0, 1], dout: [-1, 0] },
    bl: { V: [x0, y1], din: [-1, 0], dout: [0, -1] },
  };

  function geo(key: BevelCorner): { Pin: Pt; Pout: Pt; cmd: (number | string)[] } {
    const cfg = corners[key];
    const { V, din, dout } = def[key];

    if (cfg.type === 'bevel') {
      const c = cfg.c;
      const s = cfg.s || 0;
      const A: Pt = [V[0] - din[0] * c, V[1] - din[1] * c]; // shoulder on incoming edge
      const B: Pt = [V[0] + dout[0] * c, V[1] + dout[1] * c]; // shoulder on outgoing edge
      if (s <= 0) {
        return { Pin: A, Pout: B, cmd: ['L', B[0], B[1]] }; // sharp bevel
      }
      const dx = B[0] - A[0];
      const dy = B[1] - A[1];
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      const A2: Pt = [A[0] + ux * s, A[1] + uy * s]; // start of flat 45° face
      const B2: Pt = [B[0] - ux * s, B[1] - uy * s]; // end of flat 45° face
      const Pin: Pt = [V[0] - din[0] * (c + s), V[1] - din[1] * (c + s)];
      const Pout: Pt = [V[0] + dout[0] * (c + s), V[1] + dout[1] * (c + s)];
      // Q (round shoulder) → L (flat face) → Q (round shoulder)
      return {
        Pin,
        Pout,
        cmd: ['Q', A[0], A[1], A2[0], A2[1], 'L', B2[0], B2[1], 'Q', B[0], B[1], Pout[0], Pout[1]],
      };
    }

    // rounded corner
    const r = cfg.r || 0;
    if (r <= 0) return { Pin: V, Pout: V, cmd: [] }; // square corner
    const Pi: Pt = [V[0] - din[0] * r, V[1] - din[1] * r];
    const Po: Pt = [V[0] + dout[0] * r, V[1] + dout[1] * r];
    return { Pin: Pi, Pout: Po, cmd: ['Q', V[0], V[1], Po[0], Po[1]] };
  }

  const g = { tl: geo('tl'), tr: geo('tr'), br: geo('br'), bl: geo('bl') };
  const fmt = (a: (number | string)[]) =>
    a.map((x) => (typeof x === 'number' ? r2(x) : x)).join(' ');
  let d = 'M ' + r2(g.tl.Pout[0]) + ' ' + r2(g.tl.Pout[1]);
  (['tr', 'br', 'bl', 'tl'] as BevelCorner[]).forEach((k) => {
    d += ' L ' + r2(g[k].Pin[0]) + ' ' + r2(g[k].Pin[1]);
    if (g[k].cmd.length) d += ' ' + fmt(g[k].cmd);
  });
  return d + ' Z';
}

/** Normalize the `corners` prop into a set. */
function parseCorners(corners: string | BevelCorner[] | undefined): Set<BevelCorner> {
  if (!corners) return new Set<BevelCorner>(['br']);
  const list = Array.isArray(corners)
    ? corners
    : (corners.toLowerCase().split(/\s+/).filter(Boolean) as BevelCorner[]);
  return new Set(list.filter((c): c is BevelCorner => ALL_CORNERS.includes(c)));
}

export interface BevelProps {
  /** Element to render as the surface. Default `div`. */
  as?: ElementType;
  /** Which corners carry the 45° cut. Default `'br'`. e.g. `'tl tr br bl'` or `['br','tl']`. */
  corners?: string | BevelCorner[];
  /** Rounded-corner radius for non-beveled corners, in **rem**. Default 1.125 (≈18px). */
  radius?: number;
  /** Bevel face depth along each edge, in **rem**. Default 2.5 (≈40px). */
  cut?: number;
  /** Shoulder fillet radius, in **rem**. 0 = sharp bevel. Default 0.875 (≈14px). */
  shoulder?: number;
  /** Per-corner overrides (rem) — win over the globals. */
  perCorner?: Partial<Record<BevelCorner, { cut?: number; shoulder?: number; radius?: number }>>;
  /** Surface fill — any CSS color or token. Default `var(--surface)`. */
  fill?: string;
  /** Hairline stroke — any CSS color or token, or `'none'`. Default `var(--border)`. */
  stroke?: string;
  /** Stroke width, in **px** (hairlines stay pixel-based). Default 1. */
  strokeWidth?: number;
  /** Also clip the inner content to the beveled shape. Default false. */
  clip?: boolean;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
  /** Stable id for the dev inspector (defaults to an auto-generated id). */
  inspectorId?: string;
  /** Optional label shown in the dev inspector panel title. */
  inspectorLabel?: string;
  [key: string]: unknown;
}

export function Bevel({
  as,
  corners = 'br',
  radius = 1.125,
  cut = 2.5,
  shoulder = 0.875,
  perCorner,
  fill = 'var(--surface)',
  stroke = 'var(--border)',
  strokeWidth = 1,
  clip = false,
  className,
  style,
  children,
  inspectorId,
  inspectorLabel,
  ...rest
}: BevelProps) {
  // Polymorphic tag — typed loosely so any element/props (incl. ref) are valid.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Tag = (as || 'div') as any;
  const ref = useRef<HTMLElement | null>(null);
  const [box, setBox] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  // Root font size (px per rem) — geometry props are authored in rem and
  // converted to px for the painted path. Read live so it respects the user's
  // base font size and updates on resize.
  const [remPx, setRemPx] = useState(16);

  // ── Dev inspector (no-op in production / when disabled) ──
  const inspector = useBevelInspector();
  const autoId = useId();
  const inspId = inspectorId ?? autoId;
  const [hovered, setHovered] = useState(false);
  const baseRef = useRef({ corners, cut, shoulder, radius, perCorner, strokeWidth, fill, stroke, label: inspectorLabel });
  baseRef.current = { corners, cut, shoulder, radius, perCorner, strokeWidth, fill, stroke, label: inspectorLabel };
  useEffect(() => {
    if (!inspector.enabled) return;
    // Capture the element's current padding (px) so the inspector can seed its
    // padding controls from whatever the surface authored (style or token).
    let padding;
    const el = ref.current;
    if (el) {
      const cs = getComputedStyle(el);
      padding = {
        top: parseFloat(cs.paddingTop) || 0,
        right: parseFloat(cs.paddingRight) || 0,
        bottom: parseFloat(cs.paddingBottom) || 0,
        left: parseFloat(cs.paddingLeft) || 0,
      };
    }
    inspector.register(inspId, { ...baseRef.current, padding });
    return () => inspector.unregister(inspId);
  }, [inspector.enabled, inspId, inspector.register, inspector.unregister]);

  // Live overrides from the inspector take precedence over authored props.
  const ov = inspector.enabled ? inspector.overrides[inspId] : undefined;
  const ovPadding = ov?.padding
    ? {
        paddingTop: ov.padding.top,
        paddingRight: ov.padding.right,
        paddingBottom: ov.padding.bottom,
        paddingLeft: ov.padding.left,
      }
    : null;
  const effCorners = ov?.corners ?? corners;
  const effPerCorner: Partial<Record<BevelCorner, { cut?: number; shoulder?: number; radius?: number }>> | undefined =
    ov?.perCorner ?? perCorner;
  const effRadius = ov?.radius ?? radius;
  const effStrokeWidth = ov?.strokeWidth ?? strokeWidth;
  const effFill = ov?.fill ?? fill;
  const effStroke = ov?.stroke ?? stroke;

  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      setBox((prev) =>
        Math.abs(prev.w - rect.width) < 0.5 && Math.abs(prev.h - rect.height) < 0.5
          ? prev
          : { w: rect.width, h: rect.height },
      );
      const fs = parseFloat(getComputedStyle(document.documentElement).fontSize);
      if (fs) setRemPx(fs);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const beveled = parseCorners(effCorners);
  const hasStroke = effStroke !== 'none' && effStroke != null;
  const inset = hasStroke ? effStrokeWidth / 2 : 0;

  // Geometry props are authored in rem → convert to px for the painted path.
  const cornerMap = ALL_CORNERS.reduce(
    (acc, k) => {
      const o = effPerCorner?.[k];
      acc[k] = beveled.has(k)
        ? { type: 'bevel', r: 0, c: (o?.cut ?? cut) * remPx, s: (o?.shoulder ?? shoulder) * remPx }
        : { type: 'round', r: (o?.radius ?? effRadius) * remPx, c: 0, s: 0 };
      return acc;
    },
    {} as Record<BevelCorner, CornerGeo>,
  );

  const painted = box.w > 0 && box.h > 0;
  const d = painted ? chamferPath(box.w, box.h, inset, cornerMap) : '';
  const clipD = painted && clip ? chamferPath(box.w, box.h, 0, cornerMap) : '';

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
      style={{
        position: 'relative',
        isolation: 'isolate',
        ...(clip && clipD ? { clipPath: `path("${clipD}")` } : null),
        ...style,
        ...ovPadding,
        ...inspectorStyle,
      }}
      {...rest}
      {...inspectorHandlers}
    >
      {painted && (
        <svg
          aria-hidden="true"
          preserveAspectRatio="none"
          viewBox={`0 0 ${r2(box.w)} ${r2(box.h)}`}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            zIndex: -1,
            pointerEvents: 'none',
            display: 'block',
          }}
        >
          <path
            d={d}
            style={{
              fill: effFill,
              stroke: hasStroke ? effStroke : 'none',
              strokeWidth: effStrokeWidth,
              transition: 'fill 180ms cubic-bezier(0.2,0.7,0.2,1), stroke 180ms cubic-bezier(0.2,0.7,0.2,1)',
            }}
          />
        </svg>
      )}
      {children}
    </Tag>
  );
}

export default Bevel;
