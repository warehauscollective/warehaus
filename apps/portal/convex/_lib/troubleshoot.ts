/**
 * Run troubleshooting on screen (decisions 0012 to 0014): the Blocked cause
 * label and its one fix on a Blocked card, and what the staff-only
 * Troubleshoot section of the task modal shows. Pure, so the Convex query and
 * the Portal share one rule. Copy matches docs/design/run-troubleshooting.md.
 */

import type { BlockedCause } from '@warehaus/runner-protocol';

export type { BlockedCause };

export const CAUSE_LABELS: Record<BlockedCause, string> = {
  needs_input: 'Needs input',
  failed: 'Failed',
  stalled: 'Stalled',
};
export const RUNNING_LABEL = 'Running';

export const FIX_RERUN = 'Rerun';
export const FIX_ANSWER = 'Answer and rerun';
export const FIX_STOP = 'Stop run';

export type CauseTone = 'info' | 'danger' | 'warning';

/** The label colour: Needs input `--info`, Failed `--danger`, Stalled `--warning`. */
export function causeTone(cause: BlockedCause): CauseTone {
  if (cause === 'needs_input') return 'info';
  return cause === 'failed' ? 'danger' : 'warning';
}

/** A stored cause, or null: a task a person moved to Blocked has none. */
export function blockedCause(value: unknown): BlockedCause | null {
  return value === 'needs_input' || value === 'failed' || value === 'stalled' ? value : null;
}

export type CauseFix = 'rerun' | 'answer';

/** The one fix a Blocked cause offers. Needs input is answered; the rest are rerun. */
export function causeFix(cause: BlockedCause): CauseFix {
  return cause === 'needs_input' ? 'answer' : 'rerun';
}

export function fixLabel(fix: CauseFix): string {
  return fix === 'answer' ? FIX_ANSWER : FIX_RERUN;
}

/**
 * What a Blocked card shows for staff: the cause, the reason under it and the
 * fix. Null when the task is not Blocked or carries no runner cause, so the
 * card keeps its Waiting on text. A Done task never gets a fix.
 */
export function cardBlocked(task: {
  status: string;
  isDone: boolean;
  blockedCause?: string | null;
  blockedReason?: string | null;
  nextAction?: string | null;
}): { cause: BlockedCause; label: string; tone: CauseTone; reason: string | null; fix: CauseFix | null } | null {
  const cause = blockedCause(task.blockedCause);
  if (!cause || task.isDone || task.status !== 'Blocked') return null;
  return {
    cause,
    label: CAUSE_LABELS[cause],
    tone: causeTone(cause),
    reason: task.blockedReason || task.nextAction || null,
    fix: causeFix(cause),
  };
}

export type TroubleshootState = BlockedCause | 'running';

export type TroubleshootEvent = { id: string; summary: string; at: number };

export type TroubleshootView = {
  state: TroubleshootState;
  /** Why the task stopped. Null while a run is going. */
  reason: string | null;
  runnerId: string | null;
  /** The run's last sign of life. Null on a runner older than protocol 4. */
  aliveAt: number | null;
  /** Stop run is offered: a run is going on a runner that honours stop. */
  canStop: boolean;
  /** The run's events, oldest first. */
  events: TroubleshootEvent[];
  /** The end of a failed run's output. Null on every other state. */
  output: string | null;
  branch: string | null;
  /** Short SHA of the task's last commit. */
  commit: string | null;
};

export const SIGN_OF_LIFE = 'Sign of life';
export const LAST_SIGN_OF_LIFE = 'Last sign of life';
/** Events of one run the section lists. */
export const TROUBLESHOOT_EVENTS = 12;

type RunFacts = {
  status: string;
  runnerId: string;
  aliveAt?: number | null;
  failureOutput?: string | null;
};

/**
 * The Troubleshoot section for one task. Null when it has nothing to show:
 * the task is Done, or it is neither Blocked with a runner cause nor being
 * run. A run going wins over a stale cause. The sign of life is listed with
 * the run's events: "Sign of life" while running, "Last sign of life" on a
 * Stalled task. Output is kept for a Failed task only.
 */
export function troubleshootView(input: {
  task: { status: string; isDone: boolean; blockedCause?: string | null; blockedReason?: string | null; lastCommitSha?: string | null };
  /** The task's newest run. */
  run: RunFacts | null;
  events: readonly TroubleshootEvent[];
  branch: string | null;
  /** The runner honours stop (protocol 5). */
  runnerStops: boolean;
}): TroubleshootView | null {
  const { task, run } = input;
  if (task.isDone) return null;
  const running = run?.status === 'running';
  const cause = task.status === 'Blocked' ? blockedCause(task.blockedCause) : null;
  if (!running && !cause) return null;
  const state: TroubleshootState = running ? 'running' : cause!;
  const aliveAt = run?.aliveAt ?? null;
  const events = [...input.events];
  if (aliveAt != null && (state === 'running' || state === 'stalled')) {
    events.push({ id: 'sign-of-life', summary: state === 'running' ? SIGN_OF_LIFE : LAST_SIGN_OF_LIFE, at: aliveAt });
  }
  events.sort((a, b) => a.at - b.at);
  const sha = task.lastCommitSha?.trim() ?? '';
  return {
    state,
    reason: running ? null : task.blockedReason || null,
    runnerId: run?.runnerId ?? null,
    aliveAt,
    canStop: running && input.runnerStops,
    events,
    output: state === 'failed' ? run?.failureOutput || null : null,
    branch: input.branch,
    commit: sha ? sha.slice(0, 7) : null,
  };
}

/** "40 seconds ago", "3 minutes ago", "2 hours ago". */
export function agoText(at: number, now: number): string {
  const seconds = Math.max(0, Math.floor((now - at) / 1000));
  const say = (count: number, unit: string) => `${count} ${unit}${count === 1 ? '' : 's'} ago`;
  if (seconds < 60) return say(seconds, 'second');
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return say(minutes, 'minute');
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return say(hours, 'hour');
  return say(Math.floor(hours / 24), 'day');
}

/** The reason line while running: "<runner> · last sign of life <time> ago". */
export function runningLine(view: Pick<TroubleshootView, 'runnerId' | 'aliveAt'>, now: number): string {
  const parts = [view.runnerId, view.aliveAt != null ? `last sign of life ${agoText(view.aliveAt, now)}` : null];
  return parts.filter(Boolean).join(' · ');
}
