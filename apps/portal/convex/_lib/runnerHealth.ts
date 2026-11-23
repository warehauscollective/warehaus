/**
 * Runner health for the staff chip on the project page. Pure. No Convex
 * imports. Nothing here returns a runner token: only ids and display names.
 */

import { agentRepo, parseRunnerTokens } from './agentRun';

/** A runner seen inside this window reads as Ready. After it, Offline. */
export const RUNNER_READY_WITHIN_MS = 2 * 60_000;
/** Runners one project read looks at. */
export const RUNNER_HEALTH_MAX_RUNNERS = 10;

/** Display names by runner id. Not a secret. An id with no entry shows as the id. */
export const RUNNER_NAMES: Readonly<Record<string, string>> = {
  'peter-mbp': "Peter's Mac",
};

export function runnerName(runnerId: string): string {
  return RUNNER_NAMES[runnerId] ?? runnerId;
}

/**
 * Ids of the runners in `RUNNER_TOKENS` that may serve this repository.
 * The tokens are parsed and dropped here. Only ids leave.
 */
export function runnersAllowedFor(configured: string | null | undefined, projectRepo: string | null | undefined): string[] {
  const repo = agentRepo(projectRepo);
  if (!repo) return [];
  const ids: string[] = [];
  for (const [id, entry] of parseRunnerTokens(configured)) {
    if (entry.repos.includes(repo)) ids.push(id);
    if (ids.length >= RUNNER_HEALTH_MAX_RUNNERS) break;
  }
  return ids;
}

export type RunnerHealthRunner = { id: string; name: string; lastSeenAt: number | null };
export type RunnerHealthMilestone = { milestoneId: string; milestoneName: string };

/** What the staff query returns for one project. */
export type RunnerHealthView = {
  repoSet: boolean;
  runnerAllowed: boolean;
  runners: RunnerHealthRunner[];
  /** The milestone a runner is on right now, for this project. */
  working: RunnerHealthMilestone | null;
  /** A milestone on this project in Building, if any. */
  building: RunnerHealthMilestone | null;
};

export const RUNNER_HEALTH_STATES = ['ready', 'working', 'offline', 'offline-building', 'no-repo', 'no-runner'] as const;
export type RunnerHealthState = (typeof RUNNER_HEALTH_STATES)[number];

/** The allowed runner seen most recently. One never seen sorts last. */
export function latestRunner(runners: readonly RunnerHealthRunner[]): RunnerHealthRunner | null {
  let best: RunnerHealthRunner | null = null;
  for (const runner of runners) {
    if (!best || (runner.lastSeenAt ?? -1) > (best.lastSeenAt ?? -1)) best = runner;
  }
  return best;
}

export function runnerHealthState(view: RunnerHealthView, now: number): RunnerHealthState {
  if (!view.repoSet) return 'no-repo';
  if (!view.runnerAllowed || view.runners.length === 0) return 'no-runner';
  if (view.working) return 'working';
  const seen = latestRunner(view.runners)?.lastSeenAt;
  if (seen != null && now - seen < RUNNER_READY_WITHIN_MS) return 'ready';
  return view.building ? 'offline-building' : 'offline';
}

/** `20s ago`, `5m ago`, `2h ago`, `3d ago`. A time ahead of the clock reads as now. */
export function agoLabel(at: number, now: number): string {
  const seconds = Math.max(0, Math.floor((now - at) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export const RUNNER_MODAL_TITLE = 'Runner status';
export const RUNNER_ADD_REPO = 'Add repo';
export const RUNNER_NOT_SEEN = 'not seen yet';
export const RUNNER_EMPTY = '—';

const LABEL: Record<RunnerHealthState, { full: string; compact: string }> = {
  ready: { full: 'Runner ready', compact: 'Ready' },
  working: { full: 'Runner working', compact: 'Working' },
  offline: { full: 'Runner offline', compact: 'Offline' },
  'offline-building': { full: 'Runner offline', compact: 'Offline' },
  'no-repo': { full: 'Runner not set up', compact: 'Not set up' },
  'no-runner': { full: 'Runner not set up', compact: 'Not set up' },
};

export type RunnerDot = 'ready' | 'warning' | 'offline' | 'unset';

export type RunnerHealthCopy = {
  state: RunnerHealthState;
  dot: RunnerDot;
  /** Amber outline, label and helper: offline while a milestone is Building. */
  warning: boolean;
  label: string;
  compactLabel: string;
  /** Text after the label on the 1440 chip. On `no-repo` it is the Add repo link. */
  meta: string;
  runner: string;
  lastSeen: string;
  milestone: string;
  helper: string;
};

/** Every string the chip and the modal show for one state. */
export function runnerHealthCopy(view: RunnerHealthView, now: number): RunnerHealthCopy {
  const state = runnerHealthState(view, now);
  const base = {
    state,
    warning: state === 'offline-building',
    label: LABEL[state].full,
    compactLabel: LABEL[state].compact,
  };
  if (state === 'no-repo') {
    return {
      ...base,
      dot: 'unset',
      meta: RUNNER_ADD_REPO,
      runner: RUNNER_EMPTY,
      lastSeen: RUNNER_EMPTY,
      milestone: RUNNER_EMPTY,
      helper: 'This project has no GitHub repo. Add a repo before the runner can start an agent.',
    };
  }
  if (state === 'no-runner') {
    return {
      ...base,
      dot: 'unset',
      meta: 'No runner allowed',
      runner: RUNNER_EMPTY,
      lastSeen: RUNNER_EMPTY,
      milestone: RUNNER_EMPTY,
      helper: 'No runner is allowed for this project.',
    };
  }
  const runner = latestRunner(view.runners);
  const name = runner?.name ?? RUNNER_EMPTY;
  const seen = runner?.lastSeenAt != null ? agoLabel(runner.lastSeenAt, now) : null;
  const fields = { runner: name, lastSeen: seen ?? RUNNER_EMPTY };
  if (state === 'working') {
    const milestone = view.working?.milestoneName ?? RUNNER_EMPTY;
    return { ...base, ...fields, dot: 'warning', meta: milestone, milestone, helper: 'The runner is working on this milestone.' };
  }
  if (state === 'ready') {
    return {
      ...base,
      ...fields,
      dot: 'ready',
      meta: `${name} · seen ${seen}`,
      milestone: RUNNER_EMPTY,
      helper: 'The runner will start an agent when a milestone moves to Building.',
    };
  }
  if (state === 'offline-building') {
    const milestone = view.building?.milestoneName ?? RUNNER_EMPTY;
    return {
      ...base,
      ...fields,
      dot: 'warning',
      meta: milestone,
      milestone,
      helper: `${milestone} is Building and waiting for the runner.`,
    };
  }
  return {
    ...base,
    ...fields,
    dot: 'offline',
    meta: seen ? `last seen ${seen}` : RUNNER_NOT_SEEN,
    milestone: RUNNER_EMPTY,
    helper: "Your Mac is asleep or the runner is off. Moving a milestone to Building won't start an agent.",
  };
}

/** How often an idle runner says it is alive, so a healthy one stays inside the Ready window. */
export const RUNNER_HEARTBEAT_MS = 75_000;
