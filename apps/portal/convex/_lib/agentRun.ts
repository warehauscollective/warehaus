/**
 * Rules for the runner: the CLI on a staff Mac that claims a milestone task,
 * opens Claude Code on the milestone branch, and reports back. Pure. No
 * Convex imports. The portal and Convex hold no model API key and make no
 * model call: the runner only starts the official `claude` binary.
 */

import { isPortalOwnedTask, isToDoTask } from './milestoneTasks';
import { timingSafeEqualUtf8 } from './constantTime';

export const RUNNER_ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,39}$/;
export const RUNNER_UNCONFIGURED = 'The runner is not configured';
export const RUNNER_UNAUTHORIZED = 'Unauthorized';
export const RUNNER_ID_INVALID = 'Runner id must be 2 to 40 lowercase letters, digits or hyphens';
export const RUNNER_RATE_LIMITED = 'Too many requests from this runner. Wait a minute.';
export const RUN_NOT_FOUND = 'Run not found';
export const RUN_NOT_YOURS = 'That run belongs to another runner';
export const RUN_ENDED = 'That run has ended';
export const PLAN_NOT_PLANNING = 'That run is not a planning run';

export type RunnerToken = { token: string; repos: string[] };

/**
 * `RUNNER_TOKENS` in the Convex environment. One runner per entry, separated
 * by a new line or by a comma that starts the next `id=`. Each entry is
 * `id=token` and the repositories that runner may serve, separated by spaces.
 * A token under 24 characters is ignored. A runner with no repository is
 * handed nothing.
 */
export function parseRunnerTokens(raw: string | null | undefined): Map<string, RunnerToken> {
  const tokens = new Map<string, RunnerToken>();
  const entries = (raw ?? '').split(/\n|,(?=\s*[a-z0-9][a-z0-9-]{1,39}\s*=)/);
  for (const part of entries) {
    const at = part.indexOf('=');
    if (at < 1) continue;
    const id = part.slice(0, at).trim().toLowerCase();
    const pieces = part.slice(at + 1).trim().split(/\s+/).filter(Boolean);
    const token = pieces[0] ?? '';
    if (!RUNNER_ID_PATTERN.test(id) || token.length < 24) continue;
    tokens.set(id, { token, repos: runnerRepos(pieces.slice(1)) });
  }
  return tokens;
}

/** Bearer token for the named runner. Compared in constant time. */
export function authorizeRunner(input: {
  configured: string | null | undefined;
  authorizationHeader: string | null;
  runnerId: string | null | undefined;
}): { ok: true; runnerId: string; repos: string[] } | { ok: false; status: 400 | 401 | 503; reason: string } {
  const tokens = parseRunnerTokens(input.configured);
  if (tokens.size === 0) return { ok: false, status: 503, reason: RUNNER_UNCONFIGURED };
  const runnerId = (input.runnerId ?? '').trim().toLowerCase();
  if (!RUNNER_ID_PATTERN.test(runnerId)) return { ok: false, status: 400, reason: RUNNER_ID_INVALID };
  const match = /^Bearer\s+(\S+)\s*$/.exec(input.authorizationHeader ?? '');
  const expected = tokens.get(runnerId);
  // Compare against something even when the id is unknown, so timing does not name valid ids.
  const reference = expected?.token ?? 'x'.repeat(32);
  const given = match?.[1] ?? '';
  const same = timingSafeEqualUtf8(given, reference);
  if (!expected || !same) return { ok: false, status: 401, reason: RUNNER_UNAUTHORIZED };
  return { ok: true, runnerId, repos: expected.repos };
}

/**
 * Repositories this claim may see: the ones the request named that the
 * token also allows. An empty allowlist or an empty request yields none.
 */
export function reposForRunner(allowed: readonly string[], requested: unknown): string[] {
  const asked = runnerRepos(requested);
  if (allowed.length === 0 || asked.length === 0) return [];
  const permit = new Set(allowed);
  return asked.filter((repo) => permit.has(repo));
}

export const RUNNER_RATE_WINDOW_MS = 60_000;
export const RUNNER_RATE_LIMIT = 120;
/** How often a runner's last-seen stamp is written. The rate counter still moves every call. */
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
 * One runner call. The counter moves every time, so the 120-a-minute cap
 * still holds. `lastSeenAt` is null when the stored stamp is still fresh
 * and the caller should leave it alone.
 */
export function runnerTouchDecision(input: {
  lastSeenAt: number | null | undefined;
  windowStart: number | null | undefined;
  count: number | null | undefined;
  now: number;
}): { ok: true; windowStart: number; count: number; lastSeenAt: number | null } | { ok: false; reason: string } {
  const rate = runnerRateDecision({ windowStart: input.windowStart, count: input.count, now: input.now });
  if (!rate.ok) return rate;
  const fresh = input.lastSeenAt != null && input.now - input.lastSeenAt < RUNNER_TOUCH_INTERVAL_MS;
  return { ok: true, windowStart: rate.windowStart, count: rate.count, lastSeenAt: fresh ? null : input.now };
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

type ClaimableTask = {
  id: string;
  status: string;
  isDone: boolean;
  milestoneOrder?: number | null;
  parentTaskId?: string | null;
  claimedBy?: string | null;
  archivedAt?: number | null;
  source?: string | null;
  notionPageId?: string | null;
};

/**
 * The next task a runner may take on one milestone: the lowest-order task
 * that is still To do, unclaimed, top level, and owned by the portal. A task
 * that syncs from Notion is left for a person, because a status written here
 * would be overwritten by the next pull.
 */
export function nextClaimableTask<T extends ClaimableTask>(tasks: readonly T[]): T | null {
  const open = tasks
    .filter((task) => task.archivedAt == null && !task.parentTaskId && !task.claimedBy)
    .filter((task) => isToDoTask(task) && isPortalOwnedTask(task))
    .sort((a, b) => (a.milestoneOrder ?? Number.MAX_SAFE_INTEGER) - (b.milestoneOrder ?? Number.MAX_SAFE_INTEGER));
  return open[0] ?? null;
}

/**
 * A milestone created with no tasks is queued for a planning run, whatever
 * created it. One that arrives with tasks, or that is parked, is not.
 */
export function planningForNewMilestone(input: { taskCount: number; status: string }): boolean {
  return input.taskCount === 0 && input.status !== 'Parked' && input.status !== 'Shipped';
}

/** A run whose runner has been quiet this long is released back to To do. */
export const STUCK_RUN_AFTER_MS = 30 * 60_000;
/** Running runs looked at per sweep. */
export const STUCK_RUN_SCAN = 25;

export function runIsStuck(input: { lastSeenAt: number | null | undefined; startedAt: number; now: number }): boolean {
  const last = Math.max(input.lastSeenAt ?? 0, input.startedAt);
  return input.now - last >= STUCK_RUN_AFTER_MS;
}

/**
 * Open tasks on a milestone that the runner will never take, because they
 * sync from Notion or are subtasks. The milestone stays in Building until a
 * person closes them, so the feed names them.
 */
export function tasksWaitingOnPerson<
  T extends { name: string; isDone: boolean; archivedAt?: number | null; parentTaskId?: string | null; source?: string | null; notionPageId?: string | null },
>(tasks: readonly T[]): T[] {
  return tasks.filter(
    (task) => task.archivedAt == null && !task.isDone && (Boolean(task.parentTaskId) || !isPortalOwnedTask(task)),
  );
}

/** True when every task on the milestone is done. An empty list is not done. */
export function allTasksDone(tasks: readonly { isDone: boolean; archivedAt?: number | null }[]): boolean {
  const live = tasks.filter((task) => task.archivedAt == null);
  return live.length > 0 && live.every((task) => task.isDone);
}

export const COMPLETE_STATUSES = ['done', 'blocked', 'failed'] as const;
export type CompleteStatus = (typeof COMPLETE_STATUSES)[number];
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
  return { ok: true, status, commitSha: sha || null, reason: reason || null, task: { status: 'To Do', isDone: false }, run: 'failed' };
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

/** Open notes a single read returns. */
export const NEEDS_PETER_LIMIT = 20;
