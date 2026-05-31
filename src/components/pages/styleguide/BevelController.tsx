'use client';

import { useState } from 'react';
import { Bevel, type BevelCorner } from '@/components/react/ui/Bevel';

// Spatial order so the 2×2 control grid maps to the corners: TL TR / BL BR.
const CORNER_ORDER: BevelCorner[] = ['tl', 'tr', 'bl', 'br'];

interface CornerState {
  beveled: boolean;
  cut: number;
  shoulder: number;
}

/**
 * Interactive playground for the reusable <Bevel> surface. Mirrors the original
 * chamfer engine's per-corner API: each of the four corners can be a rounded
 * corner or a 45° bevel with its OWN cut depth and shoulder fillet — all on the
 * same shape — plus a global radius, stroke, and fill. Live preview + a
 * copyable prop readout.
 */
export function BevelController() {
  const [corners, setCorners] = useState<Record<BevelCorner, CornerState>>({
    tl: { beveled: false, cut: 22, shoulder: 8 },
    tr: { beveled: false, cut: 22, shoulder: 8 },
    bl: { beveled: false, cut: 22, shoulder: 8 },
    br: { beveled: true, cut: 48, shoulder: 16 },
  });
  const [radius, setRadius] = useState(18);
  const [strokeWidth, setStrokeWidth] = useState(1);
  const [fillAccent, setFillAccent] = useState(true);
  const [strokeOn, setStrokeOn] = useState(false);

  const setCorner = (c: BevelCorner, patch: Partial<CornerState>) =>
    setCorners((prev) => ({ ...prev, [c]: { ...prev[c], ...patch } }));

  const beveled = CORNER_ORDER.filter((c) => corners[c].beveled);
  const cornersStr = beveled.join(' ') || 'none';
  const perCorner: Partial<Record<BevelCorner, { cut: number; shoulder: number }>> = {};
  for (const c of beveled) perCorner[c] = { cut: corners[c].cut, shoulder: corners[c].shoulder };

  const miniSlider = (
    label: string,
    value: number,
    set: (n: number) => void,
    min: number,
    max: number,
  ) => (
    <label style={{ display: 'block', marginTop: 8 }}>
      <span className="flex justify-between" style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>
        <span>{label}</span>
        <span className="ds-mono" style={{ color: 'var(--fg)' }}>{value}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => set(Number(e.target.value))}
        style={{ width: '100%', accentColor: 'var(--accent)', marginTop: 3 }}
      />
    </label>
  );

  const slider = (
    label: string,
    value: number,
    set: (n: number) => void,
    min: number,
    max: number,
  ) => (
    <label style={{ display: 'block' }}>
      <span className="flex justify-between" style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>
        <span>{label}</span>
        <span className="ds-mono" style={{ color: 'var(--fg)' }}>{value}px</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => set(Number(e.target.value))}
        style={{ width: '100%', accentColor: 'var(--accent)', marginTop: 6 }}
      />
    </label>
  );

  const toggleBtn = (active: boolean, label: string, onClick: () => void) => (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        padding: '0.5rem 0.6rem',
        borderRadius: 9,
        fontSize: 'var(--t-sm)',
        cursor: 'pointer',
        color: active ? 'var(--accent)' : 'var(--muted)',
        background: active ? 'var(--accent-tint)' : 'transparent',
        border: `1px solid ${active ? 'var(--accent)' : 'var(--border-2)'}`,
      }}
    >
      {label}
    </button>
  );

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Live preview */}
      <Bevel
        corners="br"
        cut={40}
        shoulder={14}
        fill="var(--surface)"
        stroke="var(--border)"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--s-6)', minHeight: 320 }}
      >
        <Bevel
          corners={beveled}
          perCorner={perCorner}
          radius={radius}
          strokeWidth={strokeWidth}
          fill={fillAccent ? 'var(--accent)' : 'var(--surface-2)'}
          stroke={strokeOn ? 'var(--accent)' : 'none'}
          style={{ width: '100%', height: '100%', minHeight: 220, display: 'flex', alignItems: 'flex-end', padding: 'var(--s-4)' }}
        >
          <span className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: fillAccent ? 'var(--accent-fg)' : 'var(--fg)' }}>
            chamfer mix
          </span>
        </Bevel>
      </Bevel>

      {/* Per-corner controls */}
      <div className="flex flex-col" style={{ gap: 'var(--s-4)' }}>
        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {CORNER_ORDER.map((c) => {
            const st = corners[c];
            return (
              <div
                key={c}
                style={{
                  padding: 'var(--s-4)',
                  borderRadius: 'var(--radius-sm)',
                  border: `1px solid ${st.beveled ? 'color-mix(in oklab, var(--accent) 50%, var(--border))' : 'var(--border)'}`,
                  background: 'var(--bg-2)',
                }}
              >
                <div className="flex items-center justify-between">
                  <span className="ds-mono" style={{ fontSize: 'var(--t-xs)', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--fg)' }}>{c}</span>
                  <button
                    type="button"
                    onClick={() => setCorner(c, { beveled: !st.beveled })}
                    style={{
                      fontSize: 'var(--t-xs)',
                      padding: '0.25rem 0.55rem',
                      borderRadius: 999,
                      cursor: 'pointer',
                      color: st.beveled ? 'var(--accent)' : 'var(--muted)',
                      background: st.beveled ? 'var(--accent-tint)' : 'transparent',
                      border: `1px solid ${st.beveled ? 'var(--accent)' : 'var(--border-2)'}`,
                    }}
                  >
                    {st.beveled ? 'Bevel' : 'Round'}
                  </button>
                </div>
                {st.beveled ? (
                  <>
                    {miniSlider('Cut', st.cut, (n) => setCorner(c, { cut: n }), 0, 96)}
                    {miniSlider('Shoulder', st.shoulder, (n) => setCorner(c, { shoulder: n }), 0, 48)}
                  </>
                ) : (
                  <p className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--faint)', marginTop: 8 }}>
                    rounded · {radius}px
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {slider('Radius (rounded corners)', radius, setRadius, 0, 48)}
        {slider('Stroke width', strokeWidth, setStrokeWidth, 0, 4)}

        <div className="flex" style={{ gap: 8 }}>
          {toggleBtn(fillAccent, fillAccent ? 'Fill: Accent' : 'Fill: Surface', () => setFillAccent((v) => !v))}
          {toggleBtn(strokeOn, strokeOn ? 'Stroke: On' : 'Stroke: Off', () => setStrokeOn((v) => !v))}
        </div>
      </div>

      {/* Copyable prop readout — spans both columns */}
      <pre
        className="ds-mono"
        style={{
          gridColumn: '1 / -1',
          background: 'var(--bg-2)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: 'var(--s-5)',
          fontSize: 'var(--t-sm)',
          lineHeight: 1.7,
          color: 'var(--muted)',
          overflowX: 'auto',
        }}
      >{`<Bevel
  corners="${cornersStr}"${
    beveled.length
      ? `\n  perCorner={{\n${beveled
          .map((c) => `    ${c}: { cut: ${corners[c].cut}, shoulder: ${corners[c].shoulder} },`)
          .join('\n')}\n  }}`
      : ''
  }
  radius={${radius}}${strokeOn ? `\n  stroke="var(--accent)" strokeWidth={${strokeWidth}}` : ''}
  fill="${fillAccent ? 'var(--accent)' : 'var(--surface-2)'}"
/>`}</pre>
    </div>
  );
}
