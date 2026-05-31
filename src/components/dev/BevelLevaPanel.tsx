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
  const cornerInit = (c: BevelCorner) => {
    const o = ov?.perCorner?.[c];
    return {
      beveled: beveledSet.has(c),
      cut: o?.cut ?? base.perCorner?.[c]?.cut ?? base.cut ?? 40,
      shoulder: o?.shoulder ?? base.perCorner?.[c]?.shoulder ?? base.shoulder ?? 14,
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
            [`${c}_cut`]: { label: 'cut', value: e.cut, min: 0, max: 96, step: 1 },
            [`${c}_shoulder`]: { label: 'shoulder', value: e.shoulder, min: 0, max: 48, step: 1 },
          },
          { collapsed: !e.beveled },
        ),
      ];
    }),
  );

  const values = useControls({
    ...cornerSchema,
    radius: { value: ov?.radius ?? base.radius ?? 18, min: 0, max: 48, step: 1 },
    strokeWidth: { label: 'stroke width', value: ov?.strokeWidth ?? base.strokeWidth ?? 1, min: 0, max: 4, step: 1 },
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
