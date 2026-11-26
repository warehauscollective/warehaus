/**
 * Rules for the runner: the CLI on a staff Mac that claims a milestone task,
 * opens Claude Code on the milestone branch, and reports back. Pure. No
 * Convex imports. The portal and Convex hold no model API key and make no
 * model call: the runner only starts the official `claude` binary.
 */

import { COMPLETE_STATUSES, type CompleteStatus } from '@warehaus/runner-protocol';
import { isBlockedTask } from './milestoneTasks';

export const RUNNER_ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,39}$/;
export const RUNNER_UNAUTHORIZED = 'Unauthorized';
export const RUNNER_ID_INVALID = 'Runner id must be 2 to 40 lowercase letters, digits or hyphens';
export const RUNNER_RATE_LIMITED = 'Too many requests from this runner. Wait a minute.';
export const RUN_NOT_FOUND = 'Run not found';
export const RUN_NOT_YOURS = 'That run belongs to another runner';
export const RUN_ENDED = 'That run has ended';
export const PLAN_NOT_PLANNING = 'That run is not a planning run';

export const RUNNER_RATE_WINDOW_MS = 60_000;
export const RUNNER_RATE_LIMIT = 120;
/** How often a runner row is patched. Calls inside this window do not write. */
export const RUNNER_TOUCH_INTERVAL_MS = 60_000;
/** A runner that has not called in this long reads as offline. */
export const RUNNER_OFFLINE_AFTER_MS = 10 * 60_000;

export function runnerRateDecision(input: {
  windowStart: number | null | undefined;
  count: number | null | undefined;
  now: number;
}): { ok: true; windowStart: number; count: number } | { ok: false; reason: string } {
  const start = input.windowStart ?? 0;
  if (input.now - start >= RUNNER_RATE_WINDOW_MS) return { ok: true, windowStart: input.now, count: 1 };
  const count = (input.count ?? 0) + 1;
  if (count > RUNNER_RATE_LIMIT) return { ok: false, reason: RUNNER_RATE_LIMITED };
  return { ok: true, windowStart: start, count };
}

/**
 * One runner call. The row is patched at most once a minute. A call inside
 * that minute does not write. A stored count already at the limit still
 * rejects until the window rolls.
 */
export function runnerTouchDecision(input: {
  lastSeenAt: number | null | undefined;
  windowStart: number | null | undefined;
  count: number | null | undefined;
  now: number;
}):
  | { ok: true; write: false }
  | { ok: true; write: true; windowStart: number; count: number; lastSeenAt: number }
  | { ok: false; reason: string } {
  const fresh = input.lastSeenAt != null && input.now - input.lastSeenAt < RUNNER_TOUCH_INTERVAL_MS;
  const windowOpen = input.windowStart != null && input.now - input.windowStart < RUNNER_RATE_WINDOW_MS;
  if (fresh && windowOpen) {
    if ((input.count ?? 0) >= RUNNER_RATE_LIMIT) return { ok: false, reason: RUNNER_RATE_LIMITED };
    return { ok: true, write: false };
  }
  const rate = runnerRateDecision({ windowStart: input.windowStart, count: input.count, now: input.now });
  if (!rate.ok) return rate;
  return { ok: true, write: true, windowStart: rate.windowStart, count: rate.count, lastSeenAt: input.now };
}

export function runnerOnline(lastSeenAt: number | null | undefined, now: number): boolean {
  return lastSeenAt != null && now - lastSeenAt < RUNNER_OFFLINE_AFTER_MS;
}

export const RUN_MODES = ['interactive', 'headless'] as const;
export type RunMode = (typeof RUN_MODES)[number];
export const RUN_TOOLS = ['claude_code', 'cursor'] as const;
export type RunTool = (typeof RUN_TOOLS)[number];

export function runMode(value: unknown): RunMode {
  return value === 'headless' ? 'headless' : 'interactive';
}

export function runTool(value: unknown): RunTool {
  return value === 'cursor' ? 'cursor' : 'claude_code';
}

/** The project's build agent. Absent means Claude Code, the existing path. */
export function buildAgent(value: unknown): RunTool {
  return runTool(value);
}

export function runToolLabel(tool: string | null | undefined): string {
  return tool === 'cursor' ? 'Cursor' : 'Claude Code';
}

/** Event types the feed labels. Anything else is stored as `note`. */
export const EVENT_TYPES = ['run', 'tool', 'commit', 'blocked', 'note', 'planning', 'created', 'ready', 'stop', 'failed'] as const;
export type AgentEventType = (typeof EVENT_TYPES)[number];

export function eventType(value: unknown): AgentEventType {
  return typeof value === 'string' && (EVENT_TYPES as readonly string[]).includes(value)
    ? (value as AgentEventType)
    : 'note';
}

export const EVENT_SUMMARY_LIMIT = 240;
export const EVENT_PAYLOAD_LIMIT = 2000;
export const EVENT_SUMMARY_REQUIRED = 'An event needs a short summary';

const SECRET_KEY = /(token|secret|password|passwd|authorization|api[-_]?key|cookie|credential|private[-_]?key|session)/i;
const SECRET_VALUE =
  /(sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|whp_[A-Za-z0-9_-]{12,}|xox[baprs]-[A-Za-z0-9-]{10,}|Bearer\s+[A-Za-z0-9._~+/=-]{12,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{6,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/g;

/** Masks anything shaped like a credential. Applied to every stored string. */
export function redactSecrets(text: string): string {
  return text.replace(SECRET_VALUE, '[redacted]');
}

export function eventSummary(value: unknown): { ok: true; summary: string } | { ok: false; reason: string } {
  const text = typeof value === 'string' ? redactSecrets(value.replace(/\s+/g, ' ').trim()) : '';
  if (!text) return { ok: false, reason: EVENT_SUMMARY_REQUIRED };
  return { ok: true, summary: text.length > EVENT_SUMMARY_LIMIT ? `${text.slice(0, EVENT_SUMMARY_LIMIT - 1)}…` : text };
}

function scrub(value: unknown, depth: number): unknown {
  if (value == null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const clean = redactSecrets(value);
    return clean.length > 300 ? `${clean.slice(0, 299)}…` : clean;
  }
  if (depth >= 3) return '[trimmed]';
  if (Array.isArray(value)) return value.slice(0, 10).map((item) => scrub(item, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 20)) {
      // The environment and anything named like a credential never reach storage.
      if (key === 'env' || key === 'environment' || SECRET_KEY.test(key)) continue;
      out[key] = scrub(item, depth + 1);
    }
    return out;
  }
  return null;
}

/**
 * A hook payload, cut down for storage: no environment, no credential-named
 * keys, masked credential-shaped values, shallow, and capped in size. Returns
 * a JSON string, or null when nothing is worth keeping.
 */
export function trimEventPayload(payload: unknown): string | null {
  if (payload == null) return null;
  const scrubbed = scrub(payload, 0);
  if (scrubbed == null) return null;
  let text: string;
  try {
    text = JSON.stringify(scrubbed);
  } catch {
    return null;
  }
  if (!text || text === '{}' || text === '[]' || text === '""') return null;
  if (text.length <= EVENT_PAYLOAD_LIMIT) return text;
  return JSON.stringify({ trimmed: true, preview: text.slice(0, EVENT_PAYLOAD_LIMIT - 60) });
}

/**
 * A milestone created in Planning with no tasks is queued for a planning run,
 * whatever created it. Any other status waits until it enters Planning.
 */
export function planningForNewMilestone(input: { taskCount: number; status: string }): boolean {
  return input.taskCount === 0 && input.status === 'Planning';
}

export const PLANNING_RATE_LIMIT = 3;
export const PLANNING_RATE_WINDOW_MS = 60 * 60 * 1000;
export const PLANNING_RATE_SCAN = 20;
export const PLANNING_RATE_LIMITED = 'Planning is paused. Too many runs this hour.';
export const PLANNING_ALREADY_RUNNING = 'A planning run is already going.';

export type PlanningState = 'queued' | 'running' | 'blocked';

/**
 * One planning run per milestone and iteration. A second enter while that
 * run is queued writes nothing. Tasks that already exist are left alone
 * unless staff press Regenerate. A blocked plan waits for Retry.
 */
export function planningEnqueueDecision(input: {
  status: string;
  taskCount: number;
  planning?: PlanningState | null;
  planningIteration?: number | null;
  iteration: number;
  regenerate?: boolean;
  recentRuns: number;
}): { enqueue: boolean; replace: boolean; reason?: string } {
  if (input.status !== 'Planning') return { enqueue: false, replace: false };
  if (input.planning === 'running') {
    return { enqueue: false, replace: false, ...(input.regenerate ? { reason: PLANNING_ALREADY_RUNNING } : {}) };
  }
  if (input.recentRuns >= PLANNING_RATE_LIMIT) return { enqueue: false, replace: false, reason: PLANNING_RATE_LIMITED };
  if (input.planning === 'blocked' && !input.regenerate) return { enqueue: false, replace: false };
  const queuedHere = input.planning === 'queued' && (input.planningIteration ?? input.iteration) === input.iteration;
  if (queuedHere) return { enqueue: false, replace: false };
  if (input.planning === 'queued') return { enqueue: false, replace: false };
  if (input.regenerate) return { enqueue: true, replace: true };
  if (input.taskCount > 0) return { enqueue: false, replace: false };
  return { enqueue: true, replace: false };
}

export function planningRetryDecision(input: {
  status: string;
  planning?: PlanningState | null;
  recentRuns: number;
}): { ok: true } | { ok: false; reason: string } {
  if (input.status !== 'Planning' || input.planning !== 'blocked') {
    return { ok: false, reason: 'Nothing is waiting to retry.' };
  }
  if (input.recentRuns >= PLANNING_RATE_LIMIT) return { ok: false, reason: PLANNING_RATE_LIMITED };
  return { ok: true };
}

export function taskRetryDecision(task: { status: string; isDone: boolean } | null | undefined): { ok: true } | { ok: false; reason: string } {
  if (!task || !isBlockedTask(task)) return { ok: false, reason: 'That task is not blocked.' };
  return { ok: true };
}

/** How many planning runs in the window, from a bounded newest-first read. */
export function recentPlanningRuns(
  runs: readonly { kind: string; startedAt: number }[],
  now: number,
): number {
  return runs.filter((run) => run.kind === 'planning' && now - run.startedAt < PLANNING_RATE_WINDOW_MS).length;
}

/** A run whose runner has been quiet this long is released back to To do. */
export const STUCK_RUN_AFTER_MS = 30 * 60_000;
/** Running runs looked at per sweep. */
export const STUCK_RUN_SCAN = 25;

/** A Cursor build still running after this long is blocked for Peter (ADR-0005). No money budget for now. */
export const CURSOR_BUILD_MAX_MS = 2 * 60 * 60_000;
export const CURSOR_BUILD_TOO_LONG = 'The Cursor agent ran for 2 hours without finishing';

export function cursorBuildTooLong(input: { agentStartedAt?: number | null; startedAt: number; now: number }): boolean {
  return input.now - (input.agentStartedAt ?? input.startedAt) >= CURSOR_BUILD_MAX_MS;
}

export function runIsStuck(input: { lastSeenAt: number | null | undefined; startedAt: number; now: number }): boolean {
  const last = Math.max(input.lastSeenAt ?? 0, input.startedAt);
  return input.now - last >= STUCK_RUN_AFTER_MS;
}

/**
 * How long a run the Portal ended on its own still holds the milestone. The
 * runner has not said it stopped, so its process may still be committing.
 */
export const RUN_LEASE_GRACE_MS = 10 * 60_000;
export const RETRY_RUN_ACTIVE = 'A run is still going on this milestone. Retry opens when it ends.';
export const RETRY_RUN_WINDING_DOWN = 'The last run is still winding down. Try Retry again in a few minutes.';

export type LeaseRun = {
  status: string;
  kind: string;
  taskId?: string | null;
  endedAt?: number | null;
  /** When the runner itself said the run was over, or was seen idle after it. */
  settledAt?: number | null;
  /** Cursor cloud agent id. A new build follows this agent instead of starting another. */
  externalId?: string | null;
};

export type RunLease = { held: false } | { held: true; why: 'active' | 'winding_down'; until: number | null };

/**
 * One run's hold on its milestone. A running run holds it. A run the runner
 * closed itself, or one that succeeded, holds nothing. A run the Portal
 * closed (the stuck sweep) holds it for a grace window, unless the runner
 * settles it sooner. A Cursor build with an agent id holds nothing after it
 * ends, because the next build follows that same agent.
 */
export function runLease(run: LeaseRun, now: number): RunLease {
  if (run.status === 'running') return { held: true, why: 'active', until: null };
  if (run.status === 'succeeded' || run.settledAt != null) return { held: false };
  if (run.kind === 'build' && run.externalId) return { held: false };
  if (run.endedAt == null) return { held: false };
  const until = run.endedAt + RUN_LEASE_GRACE_MS;
  return now < until ? { held: true, why: 'winding_down', until } : { held: false };
}

/**
 * Whether staff may Retry now. A milestone retry (a blocked plan or a held
 * Cursor build) waits on every recent run. A task retry waits on that task's
 * own runs and on a build, never on another task's run: the claim already
 * keeps one run per milestone, so the retried task just queues behind it.
 */
export function retryLeaseDecision(input: {
  runs: readonly LeaseRun[];
  taskId?: string | null;
  now: number;
}): { ok: true } | { ok: false; reason: string; until: number | null } {
  let windingUntil: number | null = null;
  for (const run of input.runs) {
    if (input.taskId && run.kind !== 'build' && run.taskId !== input.taskId) continue;
    const lease = runLease(run, input.now);
    if (!lease.held) continue;
    if (lease.why === 'active') return { ok: false, reason: RETRY_RUN_ACTIVE, until: null };
    windingUntil = Math.max(windingUntil ?? 0, lease.until ?? 0);
  }
  if (windingUntil != null) return { ok: false, reason: RETRY_RUN_WINDING_DOWN, until: windingUntil };
  return { ok: true };
}

/**
 * The Cursor agent a new build should follow instead of starting another:
 * the newest build run, when staff retried it (cancelled), the runner never
 * reported its agent finished, and it has an agent id. Otherwise null.
 */
export function cursorAgentToResume<T extends LeaseRun & { externalUrl?: string | null }>(
  runs: readonly T[],
): { externalId: string; externalUrl: string | null } | null {
  const latest = runs.find((run) => run.kind === 'build');
  if (!latest || latest.status !== 'cancelled' || latest.settledAt != null || !latest.externalId) return null;
  return { externalId: latest.externalId, externalUrl: latest.externalUrl ?? null };
}

export { COMPLETE_STATUSES, type CompleteStatus };
export const COMPLETE_STATUS_INVALID = 'Status must be done, blocked, or failed';
export const BLOCKED_NEEDS_REASON = 'Say what the task is blocked on';
export const COMMIT_SHA_INVALID = 'Commit must be a git SHA';

/** What finishing a task run writes. `failed` hands the task back as To do. */
export function completeDecision(input: {
  status: unknown;
  commitSha?: unknown;
  reason?: unknown;
}):
  | {
      ok: true;
      status: CompleteStatus;
      commitSha: string | null;
      reason: string | null;
      task: { status: string; isDone: boolean };
      run: 'succeeded' | 'failed';
    }
  | { ok: false; reason: string } {
  if (typeof input.status !== 'string' || !(COMPLETE_STATUSES as readonly string[]).includes(input.status)) {
    return { ok: false, reason: COMPLETE_STATUS_INVALID };
  }
  const status = input.status as CompleteStatus;
  const sha = typeof input.commitSha === 'string' ? input.commitSha.trim().toLowerCase() : '';
  if (sha && !/^[0-9a-f]{7,40}$/.test(sha)) return { ok: false, reason: COMMIT_SHA_INVALID };
  const reason = typeof input.reason === 'string' ? redactSecrets(input.reason.replace(/\s+/g, ' ').trim()).slice(0, 240) : '';
  if (status === 'blocked' && !reason) return { ok: false, reason: BLOCKED_NEEDS_REASON };
  if (status === 'done') {
    return { ok: true, status, commitSha: sha || null, reason: null, task: { status: 'Done', isDone: true }, run: 'succeeded' };
  }
  if (status === 'blocked') {
    return { ok: true, status, commitSha: sha || null, reason, task: { status: 'Blocked', isDone: false }, run: 'failed' };
  }
  return {
    ok: true,
    status,
    commitSha: sha || null,
    reason: reason || 'The run failed',
    task: { status: 'Blocked', isDone: false },
    run: 'failed',
  };
}

/** `milestone/<slug>`: lowercase words from the name, at most 48 characters. */
export function milestoneBranch(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[^\x00-\x7F]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/g, '');
  return `milestone/${slug || 'untitled'}`;
}

/** A GitHub pull request link, or null. Nothing else is stored as the milestone's pull request. */
export function pullRequestUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/pull\/\d{1,7}$/.exec(value.trim());
  return match ? match[0] : null;
}

export function shortSha(sha: string | null | undefined): string | null {
  const value = sha?.trim() ?? '';
  return value ? value.slice(0, 7) : null;
}

export const FEED_PAGE = 20;
export const FEED_MAX = 200;

/** Rows the feed asks for. Starts at 20 and grows by 20 with Load earlier, up to 200. */
export function feedLimit(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value)) return FEED_PAGE;
  return Math.min(FEED_MAX, Math.max(FEED_PAGE, Math.floor(value)));
}

export const FEED_LABEL: Record<AgentEventType, string> = {
  run: 'RUN',
  tool: 'TOOL',
  commit: 'COMMIT',
  blocked: 'BLOCKED',
  note: 'NOTE',
  planning: 'PLANNING',
  created: 'CREATED',
  ready: 'READY',
  stop: 'STOP',
  failed: 'FAILED',
};

/** `owner/name` on GitHub. */
export const AGENT_REPO_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}$/;
export const AGENT_REPO_INVALID = 'Use a GitHub repository as owner/name';
export const RUNNER_NEEDS_REPO = 'Tell the runner which repository it serves';

/** A stored repo setting, or null. Compared without regard to case, as GitHub does. */
export function agentRepo(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim().replace(/^https:\/\/github\.com\//i, '').replace(/\.git$/i, '').replace(/\/+$/, '');
  return AGENT_REPO_PATTERN.test(text) ? text.toLowerCase() : null;
}

/** The repositories a runner says it serves. Bad entries are dropped. At most 10. */
export function runnerRepos(value: unknown): string[] {
  const list = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  const repos: string[] = [];
  for (const item of list) {
    const repo = agentRepo(item);
    if (repo && !repos.includes(repo)) repos.push(repo);
    if (repos.length >= 10) break;
  }
  return repos;
}

/**
 * Fail safe: a runner is handed work only for a project that names its
 * repository, and only when the runner serves that repository.
 */
export function projectServedBy(project: { agentRepo?: string | null } | null | undefined, repos: readonly string[]): boolean {
  const repo = agentRepo(project?.agentRepo);
  return repo != null && repos.includes(repo);
}

export const LOCAL_PREVIEW_DEFAULT = 'http://localhost:3100/';

export function localPreviewCommand(branch: string): string {
  return `npm run preview:pr -- ${branch}`;
}

/**
 * The note left for Peter when a milestone is ready for review. He approves
 * from the local preview. The Vercel preview is for staff and is not named here.
 */
export function approvalNote(input: {
  milestoneName: string;
  iteration: number;
  branch: string;
  prUrl?: string | null;
  prNumber?: number | null;
  localPreviewUrl: string;
}): string {
  const pull = input.prUrl ?? (input.prNumber != null ? `PR #${input.prNumber}` : 'No pull request yet');
  return [
    `${input.milestoneName} · Iteration ${input.iteration} is Ready to Ship and needs your review.`,
    `Pull request: ${pull}`,
    `Local preview: run \`${localPreviewCommand(input.branch)}\`, then open ${input.localPreviewUrl} (your Mac, shared dev Convex, test data).`,
    'Reply approve, or request changes with your notes. Approve records the decision. Merge and deploy stay separate steps.',
  ].join('\n');
}

export function blockedNote(input: { milestoneName: string; taskOrder: string; taskName: string; reason: string; runnerId: string }): string {
  return [
    `${input.milestoneName} · Task ${input.taskOrder} is blocked and needs you.`,
    `Task: ${input.taskName}`,
    `Blocked on: ${input.reason}`,
    `Runner ${input.runnerId} stopped on this task. The milestone stays in Building until it is unblocked.`,
  ].join('\n');
}

export function planningBlockedNote(input: { milestoneName: string; reason: string }): string {
  return [
    `${input.milestoneName} is blocked in Planning and needs you.`,
    `Blocked on: ${input.reason}`,
    'Retry in the Portal when it can be planned again. The milestone stays in Planning.',
  ].join('\n');
}

export type BuildTaskState = 'queued' | 'claimed' | 'in_progress' | 'done' | 'blocked';

/** Live task state while a milestone is Building. */
export function buildTaskState(task: { status: string; isDone: boolean; claimedBy?: string | null }): BuildTaskState {
  if (task.isDone) return 'done';
  if (isBlockedTask(task)) return 'blocked';
  if (/in[\s_-]*progress/i.test(task.status)) return 'in_progress';
  if (task.claimedBy) return 'claimed';
  return 'queued';
}

/** A Cursor agent link. Anything else is refused, so a model cannot store an arbitrary URL. */
export function cursorAgentUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = /^https:\/\/cursor\.com\/agents\/[A-Za-z0-9_-]{8,80}$/.exec(value.trim());
  return match ? match[0] : null;
}

/**
 * Commits the Cursor agent pushed, matched to tasks by the `Portal-Task:`
 * trailer. The first matching commit for a task wins. Unknown tasks are ignored.
 */
export function mapCursorCommits(
  commits: readonly { sha?: unknown; message?: unknown }[],
  tasks: readonly { id: string }[],
): { taskId: string; commitSha: string }[] {
  const wanted = new Set(tasks.map((task) => task.id));
  const done: { taskId: string; commitSha: string }[] = [];
  for (const commit of commits) {
    const sha = typeof commit.sha === 'string' ? commit.sha.trim().toLowerCase() : '';
    const message = typeof commit.message === 'string' ? commit.message : '';
    const match = /Portal-Task:\s*([A-Za-z0-9:_-]{4,120})/.exec(message);
    if (!match || !wanted.has(match[1]) || !/^[0-9a-f]{7,40}$/.test(sha)) continue;
    if (done.some((row) => row.taskId === match[1])) continue;
    done.push({ taskId: match[1], commitSha: sha });
  }
  return done;
}

/** Open notes a single read returns. */
export const NEEDS_PETER_LIMIT = 20;

/**
 * Parallel runs. A runner holds at most this many open runs at once, each on
 * a different milestone. One run per milestone stays the rule: tasks on a
 * milestone share one branch.
 */
export const RUNNER_MAX_SLOTS = 5;
export const RUNNER_BUSY = 'Every run slot on this runner is in use.';

/** The slots a claim asks for. A runner that sends none (protocol 2) has one. */
export function runnerSlots(raw: unknown): number {
  const n = typeof raw === 'number' && Number.isFinite(raw) ? Math.floor(raw) : 1;
  return Math.min(RUNNER_MAX_SLOTS, Math.max(1, n));
}

/** The run ids the runner says it is working on, deduplicated and capped. */
export function heldRunIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const ids = raw.filter((id): id is string => typeof id === 'string' && id.length > 0 && id.length <= 64);
  return [...new Set(ids)].slice(0, RUNNER_MAX_SLOTS * 2);
}

/**
 * What a claim does with the runner's open runs. An open run the runner did
 * not list is one it lost track of (it restarted, or a Cursor build came back
 * to be followed again): hand that back first, oldest first. Otherwise the
 * runner gets new work only while it has a free slot.
 */
export function openRunDecision(input: { open: string[]; held: string[]; slots: number }): { resume: string | null; full: boolean } {
  const held = new Set(input.held);
  const resume = input.open.find((id) => !held.has(id)) ?? null;
  const inUse = input.open.filter((id) => held.has(id)).length;
  return { resume, full: inUse >= input.slots };
}
