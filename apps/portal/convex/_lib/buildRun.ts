/**
 * The Building indicator (glossary: Building indicator, Sign of life, Stalled;
 * decisions 0011 and 0014). A Building milestone animates only while it has a
 * run going. Otherwise its status says why it is still: Queued, Blocked or
 * Stalled. Pure, so the server view and the client tile share one rule.
 */

/** The runner protocol that sends a sign of life for each run it holds. */
export const SIGN_OF_LIFE_PROTOCOL = 4;
/** A run's sign of life is written at most this often. */
export const RUN_ALIVE_WRITE_MS = 60_000;
/** A run with no sign of life for this long shows Stalled. */
export const RUN_STALLED_AFTER_MS = 5 * 60_000;
/** A run with no sign of life for this long is blocked by the stuck sweep (cause Stalled). */
export const RUN_SILENT_BLOCK_AFTER_MS = 15 * 60_000;

/**
 * What the server knows about a Building milestone's run. `aliveAt` is absent
 * on a run from a runner older than protocol 4, which never shows Stalled.
 * `blocked` is staff only: some task on the milestone is Blocked.
 */
export type BuildRunFacts = {
  running: boolean;
  aliveAt?: number | null;
  /** The task the running run is building. Absent on a planning run or a Cursor build. */
  taskId?: string | null;
  blocked?: boolean;
};

export type BuildRunState = 'live' | 'queued' | 'blocked' | 'stalled';

/** Whether a run's last sign of life is old enough to show Stalled. */
export function runStalled(aliveAt: number | null | undefined, now: number): boolean {
  return aliveAt != null && now - aliveAt >= RUN_STALLED_AFTER_MS;
}

/** Whether a sign of life for this run should be written now. Skips no-op writes. */
export function aliveWriteDue(aliveAt: number | null | undefined, now: number): boolean {
  return aliveAt == null || now - aliveAt >= RUN_ALIVE_WRITE_MS;
}

/**
 * The indicator state for a milestone. Null unless it is Building. A run going
 * wins over a blocked task: the runner is still working on the milestone.
 */
export function buildRunState(
  status: string,
  facts: BuildRunFacts | null | undefined,
  now: number,
): BuildRunState | null {
  if (status !== 'Building') return null;
  if (facts?.running) return runStalled(facts.aliveAt, now) ? 'stalled' : 'live';
  if (facts?.blocked) return 'blocked';
  return 'queued';
}

/** The words after "Building · ". Live has none. */
export function buildRunSuffix(state: BuildRunState | null): string | null {
  if (state === 'queued') return 'Queued';
  if (state === 'blocked') return 'Blocked';
  if (state === 'stalled') return 'Stalled';
  return null;
}

/** "Building", "Building · Queued", and so on. */
export function buildRunLabel(status: string, state: BuildRunState | null): string {
  const suffix = buildRunSuffix(state);
  return suffix ? `${status} · ${suffix}` : status;
}

/**
 * Clients see only whether a run is going: no blocked flag. Their tile
 * animates on a live run and shows plain Building otherwise (decision 0012:
 * clients see no failure details).
 */
export function buildRunFactsForAudience(
  facts: BuildRunFacts | undefined,
  audience: 'staff' | 'client',
): BuildRunFacts | undefined {
  if (!facts || audience === 'staff') return facts;
  return {
    running: facts.running,
    ...(facts.aliveAt != null ? { aliveAt: facts.aliveAt } : {}),
    ...(facts.taskId ? { taskId: facts.taskId } : {}),
  };
}

/** What a client's tile shows: the live indicator, or nothing extra. */
export function clientBuildRunState(state: BuildRunState | null): 'live' | null {
  return state === 'live' ? 'live' : null;
}
