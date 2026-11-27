/**
 * Deploy to main (ADR-0009, decisions 14 to 22). Pure rules, no Convex here.
 *
 * A project with a deploy target can release `main` to production from the
 * Portal. The Portal never deploys itself: it starts a GitHub workflow and the
 * workflow reports back. Only Peter starts a deploy run.
 */

export type DeployTarget = {
  /** `owner/name`, matched against the project's `agentRepo`. */
  repo: string;
  /** The workflow file that deploys, dispatched on `main`. */
  workflow: string;
  /**
   * The `main` commit production ran before the Portal recorded any deploy.
   * Used until the first deploy run succeeds.
   */
  baselineCommit: string;
};

/** Warehaus Portal only, until other projects have a deploy setting. */
export const DEPLOY_TARGETS: readonly DeployTarget[] = [
  {
    repo: 'warehauscollective/warehaus',
    workflow: 'portal-deploy.yml',
    baselineCommit: '37c0fcf40b1d99dd47fbfcd36f6a188577652406',
  },
];

/**
 * Token that can start the deploy workflow and read commits on the repo.
 * It cannot write to the repository. Set on production Convex by Peter.
 */
export const DEPLOY_GITHUB_TOKEN_ENV = 'DEPLOY_GITHUB_TOKEN';
/** Shared secret the workflow sends with each report. Set on production Convex and in GitHub. */
export const DEPLOY_REPORT_SECRET_ENV = 'DEPLOY_REPORT_SECRET';
export const DEPLOY_RUN_PATH = '/deploy-run';

/** A run with no report for this long is marked failed. */
export const DEPLOY_RUN_TIMEOUT_MS = 45 * 60 * 1000;
/** The compare is not asked for again inside this window. */
export const DEPLOY_CHECK_MIN_MS = 60 * 1000;
/** A merge this recent may not be in a compare that is already on its way back. */
export const DEPLOY_SETTLE_MS = 30 * 1000;
/** Commits kept from one compare. The total is stored beside them. */
export const DEPLOY_COMMIT_LIMIT = 40;

export const DEPLOY_ONLY_PETER = 'Only Peter can deploy to main';
export const DEPLOY_NOT_SET_UP = 'Deploy to main is not set up yet';
export const DEPLOY_NO_TARGET = 'This project has no deploy set up';
export const DEPLOY_RUNNING = 'A deploy is already running';
export const DEPLOY_STALE = 'main changed since this list was made. Check it again.';
export const DEPLOY_NOTHING = 'Nothing to deploy';
export const DEPLOY_NO_REPORT = 'The workflow did not report back';
export const DEPLOY_DID_NOT_START = 'The deploy workflow did not start';

export function deployTargetFor(agentRepo: string | null | undefined): DeployTarget | null {
  const repo = agentRepo?.trim().toLowerCase() ?? '';
  if (!repo) return null;
  return DEPLOY_TARGETS.find((target) => target.repo === repo) ?? null;
}

const SHA = /^[0-9a-f]{40}$/;

export function cleanCommitSha(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const sha = value.trim().toLowerCase();
  return SHA.test(sha) ? sha : null;
}

export function shortSha(sha: string): string {
  return sha.slice(0, 7);
}

export type DeployCommit = {
  sha: string;
  /** First line of the commit message. */
  title: string;
  /** The pull request this commit merged, when the title names one. */
  pr?: number;
};

const SQUASH = /\(#(\d+)\)\s*$/;
const MERGE = /^Merge pull request #(\d+)\b/;

/** The pull request a `main` commit merged: a squash title ends `(#12)`, a merge commit starts `Merge pull request #12`. */
export function pullNumberFromTitle(title: string): number | null {
  const match = SQUASH.exec(title) ?? MERGE.exec(title);
  if (!match?.[1]) return null;
  const number = Number(match[1]);
  return Number.isInteger(number) && number > 0 ? number : null;
}

/**
 * Reads GitHub's compare response into the commits on `main` after the
 * deployed commit, oldest first. Returns null when the body is not a compare.
 */
export function readCompare(body: unknown): { total: number; commits: DeployCommit[] } | null {
  if (!body || typeof body !== 'object') return null;
  const compare = body as { total_commits?: unknown; commits?: unknown };
  if (!Array.isArray(compare.commits)) return null;
  const commits: DeployCommit[] = [];
  for (const entry of compare.commits) {
    if (!entry || typeof entry !== 'object') continue;
    const node = entry as { sha?: unknown; commit?: unknown };
    const sha = cleanCommitSha(node.sha);
    const message = node.commit && typeof node.commit === 'object' ? (node.commit as { message?: unknown }).message : null;
    if (!sha || typeof message !== 'string') continue;
    const title = (message.split('\n')[0] ?? '').trim().slice(0, 200);
    const pr = pullNumberFromTitle(title);
    commits.push({ sha, title, ...(pr != null ? { pr } : {}) });
  }
  const total = typeof compare.total_commits === 'number' && compare.total_commits >= commits.length ? compare.total_commits : commits.length;
  return { total, commits: commits.slice(-DEPLOY_COMMIT_LIMIT) };
}

export type DeployPending = {
  /** `main` when it was last compared. */
  sha: string;
  /** Commits on `main` after the deployed commit. */
  total: number;
  commits: DeployCommit[];
  checkedAt: number;
};

/** True when `main` holds commits production does not run yet. */
export function mainIsAhead(pending: DeployPending | null | undefined, deployed: string): boolean {
  return pending != null && pending.total > 0 && pending.sha !== deployed;
}

export type DeployMark = 'none' | 'not-deployed' | 'deployed';

/**
 * The mark staff see on a Shipped milestone. A milestone with no recorded
 * merge (Figma-only work, or one merged before this field existed) has none.
 */
export function deployMark(milestone: {
  status: string;
  mergedAt?: number | null;
  deployFinishedAt?: number | null;
}): DeployMark {
  if (milestone.status !== 'Shipped') return 'none';
  if (milestone.deployFinishedAt != null) return 'deployed';
  return milestone.mergedAt != null ? 'not-deployed' : 'none';
}

export type DeployRunStatus = 'starting' | 'running' | 'failed' | 'done';
export type DeployStep = 'dispatch' | 'convex' | 'vercel';
export type DeployReportEvent = 'started' | 'convex_ok' | 'vercel_ok' | 'failed';

export function isDeployReportEvent(value: unknown): value is DeployReportEvent {
  return value === 'started' || value === 'convex_ok' || value === 'vercel_ok' || value === 'failed';
}

export function isDeployStep(value: unknown): value is DeployStep {
  return value === 'dispatch' || value === 'convex' || value === 'vercel';
}

export function deployRunActive(status: DeployRunStatus): boolean {
  return status === 'starting' || status === 'running';
}

type RunState = { status: DeployRunStatus; step?: DeployStep; convexDone?: boolean };

/**
 * What one workflow report does to a run. A report for a finished run, or one
 * that repeats what is stored, changes nothing. Reports only move forward:
 * a late `started` never undoes `convex_ok`.
 */
export function applyDeployReport(
  run: RunState,
  report: { event: DeployReportEvent; step?: DeployStep },
): { changed: false } | { changed: true; next: RunState } {
  if (!deployRunActive(run.status)) return { changed: false };
  if (report.event === 'started') {
    if (run.status === 'running') return { changed: false };
    return { changed: true, next: { status: 'running', step: 'convex' } };
  }
  if (report.event === 'convex_ok') {
    if (run.convexDone) return { changed: false };
    return { changed: true, next: { status: 'running', step: 'vercel', convexDone: true } };
  }
  if (report.event === 'vercel_ok') {
    return { changed: true, next: { status: 'done', convexDone: true } };
  }
  const step = report.step ?? run.step ?? 'dispatch';
  return { changed: true, next: { status: 'failed', step, ...(run.convexDone ? { convexDone: true } : {}) } };
}

/** "Convex deployed, then Vercel failed." and its siblings, for the Ask and the dialog. */
export function deployFailureLine(step: DeployStep | undefined, convexDone: boolean): string {
  if (step === 'vercel') return 'Convex deployed, then Vercel failed. The site is still on the last Vercel build.';
  if (step === 'convex') return convexDone ? 'The deploy failed after Convex.' : 'Convex did not deploy. Nothing changed in production.';
  return 'The deploy did not start. Nothing changed in production.';
}

export function deployReportUrl(siteUrl: string): string {
  return `${siteUrl.replace(/\/+$/, '')}${DEPLOY_RUN_PATH}`;
}

/** What the project page reads for the counter, the button and the dialog. Staff only. */
export type DeploySummary = {
  /** The secrets are set, so a deploy can start. Until then only the counter shows. */
  setUp: boolean;
  isPeter: boolean;
  /** Short sha production runs. */
  deployed: string;
  /** Shipped milestones not deployed yet. */
  waiting: number;
  /** `main` holds commits production does not run. */
  ahead: boolean;
  /** `main` as last compared. Sent back when a run starts. */
  sha: string | null;
  milestones: Array<{ id: string; name: string; mergedAt: number | null }>;
  loose: Array<{ sha: string; title: string }>;
  /** Commits on `main` after the deployed commit, including ones not listed. */
  commitTotal: number;
  run: {
    id: string;
    status: 'starting' | 'running' | 'failed';
    step: DeployStep | null;
    convexDone: boolean;
    sha: string;
    milestoneCount: number;
    failure: string | null;
    workflowUrl: string | null;
  } | null;
};

export type DeployChipState = 'ready' | 'deploying' | 'failed';

export type DeployChipCopy = {
  state: DeployChipState;
  /** The counter. */
  label: string;
  /** Null when the viewer gets the counter only. */
  button: { label: string; disabled: boolean } | null;
};

export const DEPLOY_BUTTON = 'Deploy to main';
export const DEPLOY_BUTTON_BUSY = 'Deploying…';
export const DEPLOY_RETRY = 'Retry';

/**
 * The counter and button on the project page (Figma Organism/DeployToMain).
 * Null hides both: nothing waits and no run needs attention. Only Peter gets
 * the button, and only once the secrets are set.
 */
export function deployChipCopy(view: DeploySummary | null | undefined): DeployChipCopy | null {
  if (!view) return null;
  const peter = view.isPeter && view.setUp;
  if (view.run && view.run.status !== 'failed') {
    return { state: 'deploying', label: DEPLOY_BUTTON_BUSY, button: peter ? { label: DEPLOY_BUTTON_BUSY, disabled: true } : null };
  }
  if (view.run) {
    return { state: 'failed', label: 'Deploy failed', button: peter ? { label: DEPLOY_RETRY, disabled: false } : null };
  }
  if (view.waiting === 0 && !view.ahead) return null;
  return {
    state: 'ready',
    label: `${view.waiting} to deploy`,
    // Without a compared `main` there is no commit to confirm yet.
    button: peter && view.sha ? { label: DEPLOY_BUTTON, disabled: false } : null,
  };
}

export type DeployDialogCopy = {
  state: 'confirm' | 'running' | 'failed';
  title: string;
  lead: string;
  rows: Array<{ label: string; value: string; href?: string }>;
  note: string;
  cancel: string;
  primary: { label: string; disabled: boolean };
};

function milestonesPhrase(count: number): string {
  return count === 1 ? '1 milestone' : `${count} milestones`;
}

function commitsPhrase(count: number): string {
  return count === 1 ? '1 commit' : `${count} commits`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Nov 27", in UTC so server and browser agree. */
export function mergedDayLabel(at: number): string {
  const date = new Date(at);
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}`;
}

/**
 * The dialog for the state the project is in (Figma Organism/ConfirmFrame,
 * Kind=deploy-main). `narrow` is the 390 bottom sheet, with shorter lines.
 */
export function deployDialogCopy(view: DeploySummary, narrow: boolean): DeployDialogCopy {
  const run = view.run;
  if (run && run.status !== 'failed') {
    const count = milestonesPhrase(run.milestoneCount);
    return {
      state: 'running',
      title: 'Deploying to main',
      lead: narrow ? `Deploying ${count}. You can close this.` : `Deploying ${count} to production. You can close this and the deploy keeps running.`,
      rows: [
        { label: 'CONVEX', value: run.convexDone ? 'Deployed' : run.status === 'starting' ? 'Starting…' : 'Deploying…' },
        { label: 'VERCEL', value: run.convexDone ? 'Building…' : 'Waiting on Convex' },
      ],
      note: 'Another deploy cannot start until this one finishes.',
      cancel: 'Close',
      primary: { label: DEPLOY_BUTTON_BUSY, disabled: true },
    };
  }
  if (run) {
    const failedStep = run.step ?? 'dispatch';
    const log = run.workflowUrl ? { href: run.workflowUrl } : {};
    return {
      state: 'failed',
      title: 'Deploy failed',
      lead: run.failure ?? deployFailureLine(failedStep, run.convexDone),
      rows: [
        {
          label: 'CONVEX',
          value: run.convexDone ? 'Deployed' : failedStep === 'convex' ? 'Failed · open the workflow log' : 'Did not start',
          ...(!run.convexDone && failedStep === 'convex' ? log : {}),
        },
        {
          label: 'VERCEL',
          value: failedStep === 'vercel' ? 'Failed · open the workflow log' : 'Did not start',
          ...(failedStep === 'vercel' ? log : {}),
        },
      ],
      note: narrow ? `Retry runs again from the same commit, ${run.sha}.` : `Retry runs the deploy again from the same commit, ${run.sha}.`,
      cancel: 'Close',
      primary: { label: DEPLOY_RETRY, disabled: false },
    };
  }
  const count = view.milestones.length;
  const looseTotal = Math.max(0, view.commitTotal - count);
  const rows: DeployDialogCopy['rows'] = view.milestones.map((milestone) => ({
    label: 'MILESTONE',
    value: narrow || milestone.mergedAt == null ? milestone.name : `${milestone.name} · merged ${mergedDayLabel(milestone.mergedAt)}`,
  }));
  if (looseTotal > 0) {
    rows.push({
      label: 'ALSO GOES OUT',
      value: narrow
        ? `${commitsPhrase(looseTotal)} since ${view.deployed}`
        : `${commitsPhrase(looseTotal)} on main with no milestone, since ${view.deployed}`,
    });
  }
  rows.push({ label: 'DEPLOYS', value: narrow ? 'Convex, then Vercel, one commit' : 'Convex, then Vercel, from one main commit' });
  const lead =
    count === 0
      ? narrow
        ? 'No milestone is waiting.'
        : 'No milestone is waiting. This deploys the commits on main since the last deploy.'
      : narrow
        ? `${milestonesPhrase(count)} ${count === 1 ? 'goes' : 'go'} to production.`
        : `${milestonesPhrase(count)} ${count === 1 ? 'goes' : 'go'} to production. This deploys everything merged to main since the last deploy.`;
  return {
    state: 'confirm',
    title: 'Deploy to main?',
    lead,
    rows,
    note: narrow
      ? 'Deploys main as it is now. Later merges wait for the next deploy.'
      : 'Deploys main as it is now. Anything merged during the run waits for the next deploy.',
    cancel: 'Cancel',
    primary: { label: DEPLOY_BUTTON, disabled: false },
  };
}

export const DEPLOY_FIXTURE_STATES = ['ready', 'ready-staff', 'loose', 'deploying', 'failed', 'none'] as const;
export type DeployFixtureState = (typeof DEPLOY_FIXTURE_STATES)[number];

export function deployFixtureState(value: string | null | undefined): DeployFixtureState {
  return (DEPLOY_FIXTURE_STATES as readonly string[]).includes(value ?? '') ? (value as DeployFixtureState) : 'ready';
}

/** Fixture previews: `?deploy=` picks the state. The copy matches the Figma frames. */
export function deployFixture(state: DeployFixtureState): DeploySummary | null {
  if (state === 'none') return null;
  const base: DeploySummary = {
    setUp: true,
    isPeter: state !== 'ready-staff',
    deployed: '37c0fcf',
    waiting: 2,
    ahead: true,
    sha: 'f'.repeat(40),
    milestones: [
      { id: 'fixture-filters', name: 'Add filters in the project list', mergedAt: Date.UTC(2026, 10, 27, 20) },
      { id: 'fixture-iconsax', name: 'Iconsax icons across the Portal', mergedAt: Date.UTC(2026, 10, 27, 21) },
    ],
    loose: [
      { sha: 'f44c86e', title: 'Docs: ADR-0009 Shipped merges, Deploy to main' },
      { sha: 'a41e0c2', title: 'Runner: wait out the usage limit' },
    ],
    commitTotal: 4,
    run: null,
  };
  if (state === 'loose') return { ...base, waiting: 0, milestones: [], commitTotal: 2 };
  if (state === 'deploying') {
    return {
      ...base,
      run: { id: 'fixture-run', status: 'running', step: 'vercel', convexDone: true, sha: '37c0fcf', milestoneCount: 2, failure: null, workflowUrl: null },
    };
  }
  if (state === 'failed') {
    return {
      ...base,
      run: {
        id: 'fixture-run',
        status: 'failed',
        step: 'vercel',
        convexDone: true,
        sha: '37c0fcf',
        milestoneCount: 2,
        failure: deployFailureLine('vercel', true),
        workflowUrl: 'https://github.com/warehauscollective/warehaus/actions/runs/1',
      },
    };
  }
  return base;
}
