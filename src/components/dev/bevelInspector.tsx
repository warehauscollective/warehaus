'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import dynamic from 'next/dynamic';
import type { BevelCorner } from '@/components/react/ui/Bevel';

/** Inspector is available on localhost and Vercel preview only — never in prod. */
const DEV =
  process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_VERCEL_ENV === 'preview';

export const BEVEL_CORNERS: BevelCorner[] = ['tl', 'tr', 'bl', 'br'];

/** The authored props of a <Bevel>, captured so the panel can seed its controls. */
export interface BevelBase {
  corners?: string | BevelCorner[];
  cut?: number;
  shoulder?: number;
  radius?: number;
  perCorner?: Partial<Record<BevelCorner, { cut?: number; shoulder?: number; radius?: number }>>;
  strokeWidth?: number;
  fill?: string;
  stroke?: string;
  /** Computed padding (px) captured at registration, to seed the controls. */
  padding?: { top: number; right: number; bottom: number; left: number };
  label?: string;
}

/** A live override applied on top of a specific instance's authored props. */
export interface BevelOverride {
  corners?: BevelCorner[];
  perCorner?: Partial<Record<BevelCorner, { cut: number; shoulder: number }>>;
  radius?: number;
  strokeWidth?: number;
  fill?: string;
  stroke?: string;
  /** Padding (px), independently per side. */
  padding?: { top: number; right: number; bottom: number; left: number };
}

interface InspectorCtx {
  enabled: boolean;
  selectedId: string | null;
  select: (id: string | null) => void;
  register: (id: string, base: BevelBase) => void;
  unregister: (id: string) => void;
  getBase: (id: string) => BevelBase | undefined;
  overrides: Record<string, BevelOverride>;
  setOverride: (id: string, o: BevelOverride) => void;
}

const DISABLED: InspectorCtx = {
  enabled: false,
  selectedId: null,
  select: () => {},
  register: () => {},
  unregister: () => {},
  getBase: () => undefined,
  overrides: {},
  setOverride: () => {},
};

const InspectorContext = createContext<InspectorCtx>(DISABLED);

/** Read the inspector from any <Bevel>. Returns a disabled no-op outside dev. */
export function useBevelInspector(): InspectorCtx {
  return useContext(InspectorContext);
}

/** Set of beveled corners from a `corners` prop (mirrors Bevel's parser). */
export function parseCorners(corners: string | BevelCorner[] | undefined): Set<BevelCorner> {
  if (!corners) return new Set<BevelCorner>();
  const list = Array.isArray(corners)
    ? corners
    : (corners.toLowerCase().split(/\s+/).filter(Boolean) as BevelCorner[]);
  return new Set(list.filter((c): c is BevelCorner => BEVEL_CORNERS.includes(c)));
}

/** Build a copy-pasteable <Bevel> snippet from a base + its live override. */
export function snippetFor(base: BevelBase | undefined, ov: BevelOverride | undefined): string {
  const beveled = ov?.corners ?? Array.from(parseCorners(base?.corners));
  const radius = ov?.radius ?? base?.radius ?? 1.125;
  const strokeWidth = ov?.strokeWidth ?? base?.strokeWidth ?? 1;
  const fill = ov?.fill ?? base?.fill ?? 'var(--surface)';
  const stroke = ov?.stroke ?? base?.stroke ?? 'var(--border)';
  const per = beveled
    .map((c) => {
      const o = ov?.perCorner?.[c];
      const cut = o?.cut ?? base?.perCorner?.[c]?.cut ?? base?.cut ?? 2.5;
      const shoulder = o?.shoulder ?? base?.perCorner?.[c]?.shoulder ?? base?.shoulder ?? 0.875;
      return `    ${c}: { cut: ${cut}, shoulder: ${shoulder} },`;
    })
    .join('\n');
  const pad = ov?.padding ?? base?.padding;
  return [
    '<Bevel',
    `  corners="${beveled.join(' ') || 'none'}"`,
    beveled.length ? `  perCorner={{\n${per}\n  }}` : null,
    `  radius={${radius}}`,
    stroke !== 'none' ? `  stroke="${stroke}" strokeWidth={${strokeWidth}}` : null,
    `  fill="${fill}"`,
    pad ? `  style={{ padding: '${pad.top}px ${pad.right}px ${pad.bottom}px ${pad.left}px' }}` : null,
    '/>',
  ]
    .filter(Boolean)
    .join('\n');
}

const LevaPanel = dynamic(() => import('./BevelLevaPanel').then((m) => m.BevelLevaPanel), {
  ssr: false,
});

export function BevelInspectorProvider({ children }: { children: ReactNode }) {
  if (!DEV) return <>{children}</>;
  return <InspectorInner>{children}</InspectorInner>;
}

function InspectorInner({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<string, BevelOverride>>({});
  const bases = useRef<Map<string, BevelBase>>(new Map());
  const [copied, setCopied] = useState(false);

  const register = useCallback((id: string, base: BevelBase) => {
    bases.current.set(id, base);
  }, []);
  const unregister = useCallback((id: string) => {
    bases.current.delete(id);
  }, []);
  const getBase = useCallback((id: string) => bases.current.get(id), []);
  const select = useCallback((id: string | null) => setSelectedId(id), []);
  const setOverride = useCallback(
    (id: string, o: BevelOverride) => setOverrides((prev) => ({ ...prev, [id]: o })),
    [],
  );

  // ⌥B toggles the inspector.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && (e.key === 'b' || e.key === 'B' || e.code === 'KeyB')) {
        e.preventDefault();
        setEnabled((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Selection only applies while the inspector is enabled. Deriving it (rather
  // than clearing via an effect) keeps the stored selection but presents it as
  // null to consumers whenever the inspector is off.
  const effectiveSelectedId = enabled ? selectedId : null;

  const copyProps = async () => {
    if (!selectedId) return;
    try {
      await navigator.clipboard.writeText(snippetFor(getBase(selectedId), overrides[selectedId]));
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard blocked — ignore */
    }
  };

  return (
    <InspectorContext.Provider
      value={{ enabled, selectedId: effectiveSelectedId, select, register, unregister, getBase, overrides, setOverride }}
    >
      {children}

      {/* Dev toolbar (bottom-left) */}
      <div
        style={{
          position: 'fixed',
          left: 12,
          bottom: 12,
          zIndex: 2000,
          display: 'flex',
          gap: 6,
          alignItems: 'center',
          fontFamily: 'var(--font-mono, monospace)',
          fontSize: 11,
        }}
      >
        <button
          type="button"
          onClick={() => setEnabled((v) => !v)}
          title="Toggle Bevel inspector (⌥B)"
          style={{
            padding: '0.4rem 0.7rem',
            borderRadius: 8,
            cursor: 'pointer',
            color: enabled ? '#000' : 'rgba(255,255,255,0.85)',
            background: enabled ? '#00e5ff' : 'rgba(0,0,0,0.7)',
            border: '1px solid rgba(255,255,255,0.18)',
            backdropFilter: 'blur(8px)',
          }}
        >
          {enabled ? '◈ Bevel inspector ON' : '◈ Bevel inspector'}
        </button>
        {enabled && selectedId && (
          <button
            type="button"
            onClick={copyProps}
            style={{
              padding: '0.4rem 0.7rem',
              borderRadius: 8,
              cursor: 'pointer',
              color: 'rgba(255,255,255,0.85)',
              background: 'rgba(0,0,0,0.7)',
              border: '1px solid rgba(255,255,255,0.18)',
              backdropFilter: 'blur(8px)',
            }}
          >
            {copied ? '✓ copied' : 'Copy <Bevel> props'}
          </button>
        )}
        {enabled && !selectedId && (
          <span style={{ color: 'rgba(255,255,255,0.6)' }}>hover a surface, then click to edit</span>
        )}
      </div>

      {enabled && <LevaPanel />}
    </InspectorContext.Provider>
  );
}
