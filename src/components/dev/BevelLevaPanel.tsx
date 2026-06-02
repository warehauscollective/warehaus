'use client';

import { useEffect } from 'react';
import { Leva, useControls, folder } from 'leva';
import type { BevelCorner } from '@/components/react/ui/Bevel';
import { BEVEL_CORNERS, parseCorners, useBevelInspector } from './bevelInspector';

/** Build an options object that always includes the current value. */
function withCurrent(opts: Record<string, string>, current?: string) {
  if (current && !Object.values(opts).includes(current)) return { ...opts, [current]: current };
  return opts;
}

function Controls({ id }: { id: string }) {
  const { getBase, overrides, setOverride } = useBevelInspector();
  const base = getBase(id) ?? {};
  const ov = overrides[id];

  const beveledSet = parseCorners(ov?.corners ?? base.corners);
  const pad = ov?.padding ?? base.padding ?? { top: 0, right: 0, bottom: 0, left: 0 };
  const cornerInit = (c: BevelCorner) => {
    const o = ov?.perCorner?.[c];
    return {
      beveled: beveledSet.has(c),
      cut: o?.cut ?? base.perCorner?.[c]?.cut ?? base.cut ?? 2.5,
      shoulder: o?.shoulder ?? base.perCorner?.[c]?.shoulder ?? base.shoulder ?? 0.875,
    };
  };

  const cornerSchema = Object.fromEntries(
    BEVEL_CORNERS.map((c) => {
      const e = cornerInit(c);
      return [
        c.toUpperCase(),
        folder(
          {
            [`${c}_beveled`]: { label: 'beveled', value: e.beveled },
            [`${c}_cut`]: { label: 'cut (rem)', value: e.cut, min: 0, max: 6, step: 0.125 },
            [`${c}_shoulder`]: { label: 'shoulder (rem)', value: e.shoulder, min: 0, max: 3, step: 0.125 },
          },
          { collapsed: !e.beveled },
        ),
      ];
    }),
  );

  const values = useControls({
    ...cornerSchema,
    Padding: folder(
      {
        pt: { label: 'top (px)', value: pad.top, min: 0, max: 96, step: 1 },
        pr: { label: 'right (px)', value: pad.right, min: 0, max: 96, step: 1 },
        pb: { label: 'bottom (px)', value: pad.bottom, min: 0, max: 96, step: 1 },
        pl: { label: 'left (px)', value: pad.left, min: 0, max: 96, step: 1 },
      },
      { collapsed: true },
    ),
    radius: { label: 'radius (rem)', value: ov?.radius ?? base.radius ?? 1.125, min: 0, max: 3, step: 0.125 },
    strokeWidth: { label: 'stroke width (px)', value: ov?.strokeWidth ?? base.strokeWidth ?? 1, min: 0, max: 4, step: 1 },
    fill: {
      value: ov?.fill ?? base.fill ?? 'var(--accent)',
      options: withCurrent(
        { Accent: 'var(--accent)', 'Surface 2': 'var(--surface-2)', Surface: 'var(--surface)', Transparent: 'transparent' },
        ov?.fill ?? base.fill,
      ),
    },
    stroke: {
      value: ov?.stroke ?? base.stroke ?? 'none',
      options: withCurrent(
        { None: 'none', Accent: 'var(--accent)', Border: 'var(--border)', 'Border 2': 'var(--border-2)' },
        ov?.stroke ?? base.stroke,
      ),
    },
  }) as unknown as Record<string, number | boolean | string>;

  // Push the live control values onto the selected instance.
  useEffect(() => {
    const corners = BEVEL_CORNERS.filter((c) => Boolean(values[`${c}_beveled`]));
    const perCorner: Partial<Record<BevelCorner, { cut: number; shoulder: number }>> = {};
    corners.forEach((c) => {
      perCorner[c] = { cut: Number(values[`${c}_cut`]), shoulder: Number(values[`${c}_shoulder`]) };
    });
    setOverride(id, {
      corners,
      perCorner,
      radius: Number(values.radius),
      strokeWidth: Number(values.strokeWidth),
      fill: String(values.fill),
      stroke: String(values.stroke),
      padding: {
        top: Number(values.pt),
        right: Number(values.pr),
        bottom: Number(values.pb),
        left: Number(values.pl),
      },
    });
  }, [values, id, setOverride]);

  return null;
}

export function BevelLevaPanel() {
  const { selectedId, getBase } = useBevelInspector();
  const label = selectedId ? getBase(selectedId)?.label : undefined;
  return (
    <>
      <Leva titleBar={{ title: `Bevel${label ? ` · ${label}` : ''}` }} />
      {selectedId ? <Controls key={selectedId} id={selectedId} /> : null}
    </>
  );
}
