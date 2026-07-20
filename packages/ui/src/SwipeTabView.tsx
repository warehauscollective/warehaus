'use client';

import type { CSSProperties, ReactNode, RefObject } from 'react';
import { cn } from './cn';

export interface SwipeTabViewProps<T extends string> {
  tabs: readonly T[];
  scrollRef: RefObject<HTMLDivElement | null>;
  panelRefs: Record<T, RefObject<HTMLDivElement | null>>;
  renderPanel: (tab: T) => ReactNode;
  /** Extra classes on the horizontal snap track. */
  className?: string;
  /** Extra classes on each vertical panel. */
  panelClassName?: string;
  /** Merge into each panel's inline style (e.g. portal locks page scroll). */
  panelStyle?: CSSProperties;
}

const trackStyle: CSSProperties = {
  display: 'flex',
  height: '100%',
  overflowX: 'auto',
  overflowY: 'hidden',
  scrollSnapType: 'x mandatory',
  overscrollBehaviorX: 'contain',
  scrollbarWidth: 'none',
  willChange: 'scroll-position',
  msOverflowStyle: 'none',
  // Prefer horizontal gestures on the track (touch / trackpad).
  touchAction: 'pan-x',
};

const panelStyle: CSSProperties = {
  height: '100%',
  // Match the track's clientWidth exactly (not 100vw) so scrollLeft math and
  // scroll-snap stay aligned across website + portal shells.
  flex: '0 0 100%',
  width: '100%',
  minWidth: '100%',
  maxWidth: '100%',
  scrollSnapAlign: 'start',
  overflowY: 'auto',
  overflowX: 'hidden',
  touchAction: 'pan-y',
};

/**
 * Standard Warehaus swipe-tab page shell — full-viewport horizontal scroll-snap
 * track with one vertically scrollable panel per tab.
 *
 * Pair with `useSwipeTabs` for settle-debounced tab sync. Critical geometry uses
 * inline styles so apps don't depend on Tailwind scanning `packages/ui`.
 */
export function SwipeTabView<T extends string>({
  tabs,
  scrollRef,
  panelRefs,
  renderPanel,
  className,
  panelClassName,
  panelStyle: panelStyleOverride,
}: SwipeTabViewProps<T>) {
  return (
    <div ref={scrollRef} className={cn(className)} style={trackStyle}>
      {tabs.map((tab) => (
        <div
          key={tab}
          id={`tabpanel-${tab}`}
          role="tabpanel"
          aria-labelledby={`tab-${tab}`}
          ref={panelRefs[tab]}
          className={cn(panelClassName)}
          style={{ ...panelStyle, ...panelStyleOverride }}
        >
          {renderPanel(tab)}
        </div>
      ))}
    </div>
  );
}
