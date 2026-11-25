/**
 * Runner health for the staff chip on the project page. Pure. No Convex
 * imports. Nothing here returns a runner token: only runner ids.
 *
 * ADR-0005: online means a runner serving the project's repository was seen
 * in the last 10 minutes. The modal names the runner by its id and, when no
 * runner is online, gives the start command.
 */

/** A runner seen inside this window reads as Ready. After it, Offline. */
export const RUNNER_READY_WITHIN_MS = 10 * 60_000;

export type RunnerHealthRunner = {
  id: string;
  lastSeenAt: number | null;
  /** Registered from the Portal. Every runner is, since the `RUNNER_TOKENS` fallback was removed. */
  registered?: boolean;
  protocolVersion?: number | null;
  /** Paused from the runner app on its Mac: it takes no new work. */
  paused?: boolean;
};
export type RunnerHealthMilestone = { milestoneId: string; milestoneName: string };

/** What the staff query returns for one project. */
export type RunnerHealthView = {
  repoSet: boolean;
  /** The project's repository, `owner/name`, when set. */
  repo: string | null;
  /** True on the production deployment, where the runner needs `--production`. */
  production: boolean;
  runnerAllowed: boolean;
  runners: RunnerHealthRunner[];
  /** The milestone a runner is on right now, for this project. */
  working: RunnerHealthMilestone | null;
  /** A milestone on this project in Building, if any. */
  building: RunnerHealthMilestone | null;
  /** Runners registered on this deployment, whatever the project. */
  registeredCount?: number;
  /** The lowest runner protocol the Portal takes claims from. */
  protocolMin?: number;
};

export const RUNNER_HEALTH_STATES = ['ready', 'working', 'paused', 'offline', 'offline-building', 'no-repo', 'no-runner'] as const;
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
  const fresh = view.runners.filter((runner) => runner.lastSeenAt != null && now - runner.lastSeenAt < RUNNER_READY_WITHIN_MS);
  // One runner taking work is enough for Ready. Paused only when every runner seen is paused.
  if (fresh.some((runner) => !runner.paused)) return 'ready';
  if (fresh.length > 0) return 'paused';
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
export const RUNNER_SET_UP = 'Set up runner';
export const RUNNER_SETUP_TITLE = 'No runner set up';
export const RUNNER_SETUP_HELPER =
  "The command prints an 8-character code. Enter it here to pair that Mac. Its secret goes straight to the Mac's Keychain and is never shown.";
export const RUNNER_CONFIRM_HELPER = 'Only confirm a code you can see in your own terminal. Codes expire after 10 minutes.';
export const RUNNER_PAIRED_HELPER = 'Installing adds a login item that starts the runner at login and restarts it if it stops.';
export const RUNNER_LIST_HELPER = 'Revoking a runner stops it taking work at once. Any run in progress goes back to the queue.';
export const RUNNER_PAUSED_HELPER =
  'Paused from the runner app on this Mac. A run in progress finishes; no new work starts until someone resumes it there.';
export const RUNNER_SERVES = 'Every project with a repository this Mac can reach';

/** The command staff run on the Mac that will take work. */
export function runnerSetupCommand(production: boolean): string {
  return `npm run runner -- setup${production ? ' --production' : ''}`;
}

/** Keeps the runner running: a login item per deployment. */
export function runnerInstallCommand(production: boolean): string {
  return `npm run runner -- install${production ? ' --production' : ''}`;
}

/** The revoke helper. On the last runner it says what waits. */
export function runnerRevokeHelper(lastRunner: boolean, production: boolean): string {
  const base = 'It stops taking work at once, and any run in progress goes back to the queue.';
  if (!lastRunner) return base;
  const where = production ? 'production' : 'shared dev';
  return `${base} This is the last ${where} runner, so ${where} milestones wait until another is paired.`;
}

export type RunnerOutOfDate = { runner: string; lastSeen: string; version: string; update: string; helper: string };

/** The latest runner, when it speaks an older protocol than the Portal takes. */
export function runnerOutOfDateCopy(view: RunnerHealthView, now: number): RunnerOutOfDate | null {
  const runner = latestRunner(view.runners);
  const min = view.protocolMin;
  if (!runner?.registered || min == null || runner.protocolVersion == null || runner.protocolVersion >= min) return null;
  return {
    runner: runner.id,
    lastSeen: runner.lastSeenAt != null ? agoLabel(runner.lastSeenAt, now) : RUNNER_NOT_SEEN,
    version: `Protocol ${runner.protocolVersion} · the Portal needs ${min}`,
    update: `git pull && ${runnerInstallCommand(view.production)}`,
    helper: 'The Portal refuses claims from this runner until it is updated. The runner never updates its own code.',
  };
}
export const RUNNER_NOT_SEEN = 'not seen yet';
export const RUNNER_EMPTY = '—';

const LABEL: Record<RunnerHealthState, { full: string; compact: string }> = {
  ready: { full: 'Runner ready', compact: 'Ready' },
  working: { full: 'Runner working', compact: 'Working' },
  paused: { full: 'Runner paused', compact: 'Paused' },
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
  /** Only while no runner is online: the command that starts one for this repository. */
  startCommand: string | null;
  /** Only on Not set up with a repository: the command that pairs a Mac. */
  setupCommand: string | null;
  lastSeen: string;
  milestone: string;
  helper: string;
};

/**
 * The command that starts a runner serving `repo`, as a staff member types it
 * on the runner's Mac. A registered runner reads its id from the file setup
 * wrote, so only a fallback runner needs `--id`.
 */
export function runnerStartCommand(runnerId: string, repo: string, production: boolean, registered = false): string {
  // A registered runner serves every project with a repository, in its own clones.
  if (registered) return `npm run runner -- start${production ? ' --production' : ''}`;
  return `npm run runner -- start${production ? ' --production' : ''} --id ${runnerId} --repo ${repo}`;
}

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
      startCommand: null,
      setupCommand: null,
      lastSeen: RUNNER_EMPTY,
      milestone: RUNNER_EMPTY,
      helper: 'This project has no GitHub repo. Add a repo before the runner can start an agent.',
    };
  }
  if (state === 'no-runner') {
    return {
      ...base,
      dot: 'unset',
      meta: RUNNER_SET_UP,
      runner: RUNNER_EMPTY,
      startCommand: null,
      setupCommand: runnerSetupCommand(view.production),
      lastSeen: RUNNER_EMPTY,
      milestone: RUNNER_EMPTY,
      helper: RUNNER_SETUP_HELPER,
    };
  }
  const runner = latestRunner(view.runners);
  const name = runner?.id ?? RUNNER_EMPTY;
  const seen = runner?.lastSeenAt != null ? agoLabel(runner.lastSeenAt, now) : null;
  const fields = { runner: name, lastSeen: seen ?? RUNNER_EMPTY, startCommand: null, setupCommand: null };
  const startCommand = runner && view.repo ? runnerStartCommand(runner.id, view.repo, view.production, runner.registered === true) : null;
  if (state === 'working') {
    const milestone = view.working?.milestoneName ?? RUNNER_EMPTY;
    return { ...base, ...fields, dot: 'warning', meta: milestone, milestone, helper: 'The runner is working on this milestone.' };
  }
  if (state === 'paused') {
    const paused = latestRunner(view.runners.filter((one) => one.paused)) ?? runner;
    const pausedSeen = paused?.lastSeenAt != null ? agoLabel(paused.lastSeenAt, now) : RUNNER_EMPTY;
    return {
      ...base,
      ...fields,
      runner: paused?.id ?? name,
      lastSeen: pausedSeen,
      dot: 'warning',
      meta: `${paused?.id ?? name} · paused`,
      milestone: RUNNER_EMPTY,
      helper: RUNNER_PAUSED_HELPER,
    };
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
      startCommand,
      meta: milestone,
      milestone,
      helper: `${milestone} is Building and waiting for the runner. Start it to pick the milestone up.`,
    };
  }
  return {
    ...base,
    ...fields,
    dot: 'offline',
    startCommand,
    meta: seen ? `last seen ${seen}` : RUNNER_NOT_SEEN,
    milestone: RUNNER_EMPTY,
    helper: "No runner serving this repository has been seen in the last 10 minutes. Moving a milestone to Building won't start an agent until one is running.",
  };
}

/** How often an idle runner says it is alive, so a healthy one stays inside the Ready window. */
export const RUNNER_HEARTBEAT_MS = 75_000;
