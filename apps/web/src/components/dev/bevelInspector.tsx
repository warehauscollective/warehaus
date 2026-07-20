'use client';

import dynamic from 'next/dynamic';
import type { ReactNode } from 'react';
import {
  BevelInspectorProvider as SharedBevelInspectorProvider,
} from '@warehaus/ui/bevel-inspector';

export {
  useBevelInspector,
  BEVEL_CORNERS,
  parseCorners,
  snippetFor,
  type BevelBase,
  type BevelOverride,
  type InspectorCtx,
} from '@warehaus/ui/bevel-inspector';
export type { BevelCorner } from '@warehaus/ui';

const LevaPanel = dynamic(() => import('./BevelLevaPanel').then((m) => m.BevelLevaPanel), {
  ssr: false,
});

/** Website provider — shared inspector chrome + Leva editing panel. */
export function BevelInspectorProvider({ children }: { children: ReactNode }) {
  return (
    <SharedBevelInspectorProvider panel={<LevaPanel />}>
      {children}
    </SharedBevelInspectorProvider>
  );
}
