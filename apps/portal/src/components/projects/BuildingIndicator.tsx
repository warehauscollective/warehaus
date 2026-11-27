'use client';

import { useEffect, useState } from 'react';
import {
  buildRunState,
  buildRunSuffix,
  clientBuildRunState,
  type BuildRunFacts,
  type BuildRunState,
} from '@convex/_lib/buildRun';

/** How often a tile rechecks the clock, so a quiet run turns Stalled without a new query result. */
export const BUILD_CLOCK_TICK_MS = 30_000;

/**
 * The time now, ticking every 30 seconds while `active`. Convex queries do not
 * rerun as time passes, so Stalled (5 minutes without a sign of life) is
 * worked out here from the run's `aliveAt`.
 */
export function useNow(active: boolean, tickMs = BUILD_CLOCK_TICK_MS): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), tickMs);
    return () => window.clearInterval(id);
  }, [active, tickMs]);
  return now;
}

/**
 * The Building indicator state for a milestone. Null unless it is Building.
 * Clients only ever get live or null (decision 0012).
 */
export function useBuildRunState(
  status: string,
  facts: BuildRunFacts | null | undefined,
  staff: boolean,
): BuildRunState | null {
  const now = useNow(status === 'Building' && Boolean(facts?.running && facts.aliveAt != null));
  const state = buildRunState(status, facts, now);
  return staff ? state : clientBuildRunState(state);
}

const STATE_LABEL: Record<BuildRunState, string> = {
  live: 'Building now',
  queued: 'Queued',
  blocked: 'Blocked',
  stalled: 'Stalled',
};

/**
 * Figma Atom/Indicator/Building (1302:28943). Live pulses in info blue, and
 * holds still under reduced motion. Queued is a dashed muted ring, Blocked a
 * danger dot, Stalled a warning dot.
 */
export function BuildingIndicator({ state, size = 12 }: { state: BuildRunState; size?: number }) {
  return (
    <span
      className="building-indicator"
      data-testid="building-indicator"
      data-state={state}
      role="img"
      aria-label={STATE_LABEL[state]}
      style={{ width: size, height: size }}
    >
      <span className="building-indicator-dot" />
    </span>
  );
}

/**
 * " · Queued" after the status. Hidden below 768px, where the dot alone
 * carries the state (Figma 390 frames).
 */
export function BuildRunSuffix({ state }: { state: BuildRunState | null }) {
  const suffix = buildRunSuffix(state);
  if (!suffix) return null;
  return (
    <span className="building-suffix" data-testid="building-suffix" style={{ color: 'var(--muted)' }}>
      {` · ${suffix}`}
    </span>
  );
}
