/**
 * Staff Portal API decisions. Convex mutations call these before they write.
 *
 * Notion mirrors use the existing outbox. Field updates use kind `update`
 * (the patch path). Task create uses kind `create`. Stage moves stay kind
 * `task-stage` because the pending-stage cleanup only matches that kind.
 * Milestones have no Notion database, and comments have no Notion write, so
 * those writes do not enqueue a page.
 */

import { TASK_PRIORITIES, type TaskPriority } from './taskLiveFields';
import { isLiveTaskStatus, isPullRequestLink, planTaskCreate, planTaskStageWrite, type TaskWriteProperties } from './taskBoard';
import { validatePropertyPatch, type WriteProperties } from './writeback';

export const API_RATE_LIMIT_DEFAULT = 60;
export const API_RATE_WINDOW_MS = 60_000;
export const API_PAGE_DEFAULT = 25;
export const API_PAGE_MAX = 50;
export const API_TOKEN_NAME = /^[a-z0-9][a-z0-9-]{0,62}$/;

export const TASK_LINK_KINDS = [
  'chat request',
  'PR',
  'deploy',
  'agent',
  'Figma frame',
  'Notion page or doc',
  'Repo branch',
] as const;

/** One indexed page of task links. The Sources panel does not read past this. */
export const TASK_LINK_READ_CAP = 50;

export type TaskLinkKind = (typeof TASK_LINK_KINDS)[number];

const SOURCE_LINK_KINDS = ['PR', 'Figma frame', 'Repo branch'] as const;

const LINK_PROPERTY: Partial<Record<TaskLinkKind, string>> = {
  PR: 'GitHub Issue/PR',
  'Figma frame': 'Figma Frame',
  'Repo branch': 'Repo Branch',
};

const VISIBILITY_KEYS = [
  'publishToWarehaus',
  'portalAccess',
  'syncHidden',
  'syncHiddenAt',
  'syncHiddenReason',
  'clientVisible',
] as const;

const STAGE_RANK: Record<string, number> = {
  Idea: 0,
  Planning: 1,
  'Awaiting Go': 2,
  Building: 3,
  'Ready to Ship': 4,
  Shipped: 5,
};

export type FieldStamp = { updatedAt: number; updatedBy: string };
export type StampedField = 'status' | 'stage' | 'priority' | 'nextAction';
export type FieldOrigin = 'api' | 'event' | 'pull';

export type ApiOutboxWrite = {
  kind: 'update' | 'task-stage' | 'create';
  properties: WriteProperties | TaskWriteProperties;
};

export function bearerToken(header: string | null): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header);
  const token = match?.[1] ?? '';
  if (!token.startsWith('whp_') || token.length < 20) return null;
  return token;
}

export function apiTokenNameError(name: string): string | null {
  if (!API_TOKEN_NAME.test(name)) {
    return 'Token name must be lowercase letters, numbers, and hyphens';
  }
  return null;
}

export function apiTokenScope(value: unknown): 'read' | 'read-write' | null {
  if (value === 'read' || value === 'read-write') return value;
  return null;
}

export function apiRateLimit(value: unknown): number | null {
  if (value == null || value === '') return API_RATE_LIMIT_DEFAULT;
  const limit = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > 600) return null;
  return limit;
}

export function idempotencyKeyError(key: string | null | undefined): string | null {
  if (key == null || key === '') return 'Idempotency key is required';
  if (key.trim() === '' || key.trim() !== key) return 'Idempotency key cannot be blank';
  if (key.length > 200) return 'Idempotency key is too long';
  return null;
}

export function idempotencyMaterial(method: string, path: string, rawBody: string): string {
  return `${method}\n${path}\n${rawBody}`;
}

export function pageLimit(value: unknown): number | null {
  if (value == null || value === '') return API_PAGE_DEFAULT;
  const limit = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > API_PAGE_MAX) return null;
  return limit;
}

export function visibilityWriteError(
  body: Record<string, unknown>,
  allow: readonly string[] = [],
): string | null {
  for (const key of VISIBILITY_KEYS) {
    if (allow.includes(key)) continue;
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      return 'Client visibility cannot be changed through the API';
    }
  }
  return null;
}

export function unknownFieldError(body: Record<string, unknown>, allowed: readonly string[]): string | null {
  const extra = Object.keys(body).filter((key) => !allowed.includes(key));
  if (extra.length === 0) return null;
  return `Unknown field ${extra[0]}`;
}

export function authorizeApiCall(input: {
  token: { scope: 'read' | 'read-write'; revokedAt?: number | null } | null;
  method: 'GET' | 'POST';
}): { ok: true } | { ok: false; status: 401 | 403; reason: 'missing' | 'revoked' | 'scope' } {
  if (!input.token) return { ok: false, status: 401, reason: 'missing' };
  if (input.token.revokedAt != null) return { ok: false, status: 401, reason: 'revoked' };
  if (input.method !== 'GET' && input.token.scope !== 'read-write') {
    return { ok: false, status: 403, reason: 'scope' };
  }
  return { ok: true };
}

export function takeRateLimit(input: {
  windowStartedAt: number;
  windowCount: number;
  limit: number;
  windowMs: number;
  now: number;
}):
  | { ok: true; windowStartedAt: number; windowCount: number }
  | { ok: false; retryAt: number } {
  const expired = input.now - input.windowStartedAt >= input.windowMs;
  const started = expired ? input.now : input.windowStartedAt;
  const count = expired ? 0 : input.windowCount;
  if (count >= input.limit) return { ok: false, retryAt: started + input.windowMs };
  return { ok: true, windowStartedAt: started, windowCount: count + 1 };
}

export type IdempotencyRecord = {
  requestHash: string;
  state: 'pending' | 'done';
  status?: number;
  body?: string;
  createdAt?: number;
};

/**
 * A pending key younger than this returns 409. Convex actions and HTTP actions
 * stop at 10 minutes, so this is longer: a request that is still alive is not
 * replaced. After the lease, the same request may look at the outbox. An
 * inflight outbox row still returns 409 and is not claimed.
 */
export const API_IDEMPOTENCY_LEASE_MS = 15 * 60 * 1000;

export const IDEMPOTENCY_IN_PROGRESS_ERROR =
  'A request with this idempotency key is already in progress';

export function idempotencyDecision(input: {
  existing: IdempotencyRecord | null;
  requestHash: string;
  now?: number;
}):
  | { action: 'start' }
  | { action: 'reclaim' }
  | { action: 'replay'; status: number; body: string }
  | { action: 'mismatch' }
  | { action: 'in_progress' } {
  if (!input.existing) return { action: 'start' };
  if (input.existing.requestHash !== input.requestHash) return { action: 'mismatch' };
  if (input.existing.state === 'pending') {
    const createdAt = input.existing.createdAt;
    if (
      input.now != null &&
      createdAt != null &&
      input.now - createdAt >= API_IDEMPOTENCY_LEASE_MS
    ) {
      return { action: 'reclaim' };
    }
    return { action: 'in_progress' };
  }
  return {
    action: 'replay',
    status: input.existing.status ?? 500,
    body: input.existing.body ?? '',
  };
}

/**
 * Claim the key before any other write. A start replaces a missing row with
 * pending. A later overlapping call sees that pending row and does not start.
 * After `API_IDEMPOTENCY_LEASE_MS` the same request may resume that pending row.
 * Resuming does not delete it, and it does not start a second Notion create
 * while the matching outbox row is still inflight.
 */
export function claimIdempotency(
  existing: IdempotencyRecord | null,
  requestHash: string,
  now?: number,
):
  | { action: 'start'; record: IdempotencyRecord }
  | { action: 'reclaim'; record: IdempotencyRecord }
  | { action: 'replay'; status: number; body: string; record: IdempotencyRecord }
  | { action: 'mismatch'; record: IdempotencyRecord }
  | { action: 'in_progress'; record: IdempotencyRecord } {
  const decision = idempotencyDecision({ existing, requestHash, now });
  if (decision.action === 'start' || decision.action === 'reclaim') {
    return { action: decision.action, record: { requestHash, state: 'pending' } };
  }
  return { ...decision, record: existing as IdempotencyRecord };
}

export function completeIdempotency(
  record: IdempotencyRecord,
  result: { status: number; body: string },
): IdempotencyRecord {
  return { ...record, state: 'done', status: result.status, body: result.body };
}

export function portalRequestAuth(input: {
  authorization: string | null;
  method: 'GET' | 'POST';
  stored: { scope: 'read' | 'read-write'; revokedAt?: number | null } | null;
}): { ok: true; token: string } | { ok: false; status: 401 | 403; error: string } {
  const token = bearerToken(input.authorization);
  if (!token || !input.stored || input.stored.revokedAt != null) {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }
  const auth = authorizeApiCall({
    token: { scope: input.stored.scope, revokedAt: input.stored.revokedAt ?? null },
    method: input.method,
  });
  if (!auth.ok) {
    return {
      ok: false,
      status: auth.status,
      error: auth.reason === 'scope' ? 'This token is read-only' : 'Unauthorized',
    };
  }
  return { ok: true, token };
}

export type TaskListIndex =
  | 'by_projectId'
  | 'by_projectId_status'
  | 'by_projectId_stage'
  | 'by_projectId_updatedAt'
  | 'by_status'
  | 'by_stage'
  | 'by_updatedAt'
  | 'by_milestone';

export function taskListPlan(input: {
  projectId?: string;
  milestoneId?: string;
  status?: string;
  stage?: string;
  updatedSince?: number;
}): { ok: true; index: TaskListIndex } | { ok: false; error: string } {
  const status = input.status?.trim() ?? '';
  const stage = input.stage?.trim() ?? '';
  const hasProject = Boolean(input.projectId);
  const hasMilestone = Boolean(input.milestoneId);
  const hasStatus = status.length > 0;
  const hasStage = stage.length > 0;
  const hasSince = input.updatedSince != null;
  if (hasStatus && !isLiveTaskStatus(status)) return { ok: false, error: 'Unknown status' };
  if (hasStage && !(stage in STAGE_RANK) && stage !== 'Parked') return { ok: false, error: 'Unknown stage' };
  if (hasSince && (!Number.isFinite(input.updatedSince) || (input.updatedSince ?? 0) < 0)) {
    return { ok: false, error: 'updatedSince must be a time in milliseconds' };
  }
  const filters = Number(hasStatus) + Number(hasStage) + Number(hasSince);
  if (hasMilestone && filters > 0) {
    return { ok: false, error: 'Filter by one of status, stage, updatedSince, or milestone' };
  }
  if (!hasProject && !hasMilestone && filters === 0) {
    return { ok: false, error: 'Choose a project, milestone, status, stage, or updatedSince' };
  }
  if (filters > 1) {
    return { ok: false, error: 'Filter by one of status, stage, or updatedSince' };
  }
  if (hasMilestone) return { ok: true, index: 'by_milestone' };
  if (hasProject && hasStatus) return { ok: true, index: 'by_projectId_status' };
  if (hasProject && hasStage) return { ok: true, index: 'by_projectId_stage' };
  if (hasProject && hasSince) return { ok: true, index: 'by_projectId_updatedAt' };
  if (hasProject) return { ok: true, index: 'by_projectId' };
  if (hasStatus) return { ok: true, index: 'by_status' };
  if (hasStage) return { ok: true, index: 'by_stage' };
  return { ok: true, index: 'by_updatedAt' };
}

export function asTaskLinkKind(value: string): TaskLinkKind | null {
  return (TASK_LINK_KINDS as readonly string[]).includes(value) ? (value as TaskLinkKind) : null;
}

export function sourceLinksFromFields(input: {
  pullRequestUrl?: string | null;
  figmaFrame?: string | null;
  repoBranch?: string | null;
}): Array<{ kind: TaskLinkKind; url: string }> {
  const links: Array<{ kind: TaskLinkKind; url: string }> = [];
  const pullRequest = input.pullRequestUrl?.trim() ?? '';
  const figma = input.figmaFrame?.trim() ?? '';
  const branch = input.repoBranch?.trim() ?? '';
  if (pullRequest) links.push({ kind: 'PR', url: pullRequest });
  if (figma) links.push({ kind: 'Figma frame', url: figma });
  if (branch) links.push({ kind: 'Repo branch', url: branch });
  return links;
}

export function isSourceLinkKind(kind: string): boolean {
  return (SOURCE_LINK_KINDS as readonly string[]).includes(kind);
}

export function sourceLinksChanged(
  existing: ReadonlyArray<{ kind: string; url: string; addedBy: string }>,
  wanted: ReadonlyArray<{ kind: string; url: string }>,
): boolean {
  const wantedKey = new Set(wanted.map((link) => `${link.kind}\n${link.url}`));
  for (const link of wanted) {
    if (!existing.some((row) => row.kind === link.kind && row.url === link.url)) return true;
  }
  for (const row of existing) {
    if (row.addedBy !== 'notion' || !isSourceLinkKind(row.kind)) continue;
    if (!wantedKey.has(`${row.kind}\n${row.url}`)) return true;
  }
  return false;
}

function httpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

export function planApiLink(input: {
  kind: string;
  url: string;
  title?: string;
}): { ok: true; kind: TaskLinkKind; url: string; title?: string; property: string | null } | { ok: false; error: string } {
  const kind = asTaskLinkKind(input.kind.trim());
  if (!kind) return { ok: false, error: 'Unknown link kind' };
  const url = input.url.trim();
  if (!url || url.length > 2000 || url.includes('\n')) return { ok: false, error: 'Link URL is required' };
  if (kind === 'PR' && !isPullRequestLink(url)) return { ok: false, error: 'Pull request link must be a GitHub pull request' };
  if (kind === 'Repo branch') {
    if (url.length > 200) return { ok: false, error: 'Repo branch is too long' };
  } else if (!httpsUrl(url) && !(kind === 'PR' && isPullRequestLink(url))) {
    return { ok: false, error: 'Link URL must start with https' };
  }
  const title = input.title?.trim() ?? '';
  if (title.length > 200) return { ok: false, error: 'Link title is too long' };
  const property = LINK_PROPERTY[kind] ?? null;
  return { ok: true, kind, url, ...(title ? { title } : {}), property };
}

const KIND_LABEL: Record<TaskLinkKind, string> = {
  'chat request': 'Chat request',
  PR: 'Cursor PR',
  deploy: 'Deploy',
  agent: 'Agent run',
  'Figma frame': 'Figma frame',
  'Notion page or doc': 'Doc',
  'Repo branch': 'Branch',
};

export function sourceKindLabel(kind: string): string {
  return KIND_LABEL[kind as TaskLinkKind] ?? kind;
}

const GOOD_LINK_STATES = new Set(['merged', 'deployed', 'shipped', 'success', 'succeeded', 'ready']);
const BAD_LINK_STATES = new Set(['closed', 'canceled', 'cancelled', 'failure', 'failed', 'error']);
const WARN_LINK_STATES = new Set(['open', 'building', 'pending', 'queued', 'in_progress', 'in progress']);

const STATE_PLAIN: Record<string, string> = {
  merged: 'Merged',
  deployed: 'Deployed',
  succeeded: 'Deployed',
  ready: 'Deployed',
  open: 'Open',
  failed: 'Failed',
  failure: 'Failed',
  error: 'Failed',
};

const ADDED_BY_PLAIN: Record<string, string> = {
  cursor: 'Added by Cursor',
  github: 'Added by GitHub',
  'github-webhook': 'Added by GitHub',
  vercel: 'Added by Vercel',
  'vercel-webhook': 'Added by Vercel',
  staff: 'Added by Staff',
  notion: 'Added by Notion',
};

export const SOURCE_NO_STATUS = 'No status';

export type SourceChipTone = 'neutral' | 'good' | 'warn' | 'bad';

/** Title-case a stored word. Separators become spaces. This does not hide an id. */
export function sourcePlainWords(value: string): string {
  return value
    .trim()
    .replace(/[_-]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      const lower = word.toLowerCase();
      if (lower === 'github') return 'GitHub';
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

function plainStateLabel(value: string): string {
  return STATE_PLAIN[value.trim().toLowerCase()] ?? sourcePlainWords(value);
}

/**
 * Staff pill for a stored link state.
 * A blank value is "No status". Oversized or multiline values stay off the panel.
 */
export function sourceStateChip(state: string | null | undefined): { label: string; tone: SourceChipTone } | null {
  const raw = state?.trim() ?? '';
  if (!raw) return { label: SOURCE_NO_STATUS, tone: 'neutral' };
  if (raw.length > 40 || /[\n\r]/.test(raw)) return null;
  const key = raw.toLowerCase();
  const tone: SourceChipTone = GOOD_LINK_STATES.has(key)
    ? 'good'
    : BAD_LINK_STATES.has(key)
      ? 'bad'
      : WARN_LINK_STATES.has(key)
        ? 'warn'
        : 'neutral';
  return { label: plainStateLabel(raw), tone };
}

/**
 * A Convex id, a UUID, or one long alphanumeric token.
 * A short name such as `claude_bot` is not an id.
 */
function looksLikeOpaqueId(value: string): boolean {
  const lower = value.trim().toLowerCase();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(lower)) return true;
  const compact = lower.replace(/[_-]/g, '');
  if (compact.length < 16 || !/^[a-z0-9]+$/.test(compact)) return false;
  if (!/[_-]/.test(lower)) return true;
  return /\d/.test(compact);
}

/**
 * Drop a trailing bot or source marker so `claude_bot` is "Claude", not "Claude Bot".
 * A name that is only that marker stays as written.
 */
function actorName(value: string): string {
  const parts = value.trim().toLowerCase().split(/[_-]+/).filter(Boolean);
  const tail = parts[parts.length - 1];
  if (parts.length > 1 && (tail === 'bot' || tail === 'source')) parts.pop();
  return sourcePlainWords(parts.join(' '));
}

/**
 * Who added the link, in plain words.
 * Known actors, including Notion, are named.
 * A Convex id or other long alphanumeric is "Added by Staff", not a title-cased id.
 * Every other short name is "Added by {name}". A bot or source suffix is not part of the name.
 */
export function sourceAddedByLabel(addedBy: string | null | undefined): string {
  const raw = addedBy?.trim() ?? '';
  if (!raw) return 'Unknown';
  const named = ADDED_BY_PLAIN[raw.toLowerCase()];
  if (named) return named;
  if (looksLikeOpaqueId(raw)) return 'Added by Staff';
  const name = actorName(raw);
  return name ? `Added by ${name}` : 'Unknown';
}

/** https links can be opened. A repo branch and any other scheme stay plain text. */
export function sourceLinkHref(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function planApiComment(body: string): { ok: true; body: string } | { ok: false; error: string } {
  const text = body.trim();
  if (!text) return { ok: false, error: 'Comment requires a message' };
  if (text.length > 2000) return { ok: false, error: 'Comment is too long' };
  return { ok: true, body: text };
}

function movesBackward(field: 'status' | 'stage', current: string | null, next: string | null): string | null {
  if (field === 'status') {
    if (current === 'Done' && next !== 'Done') return 'An event cannot reopen a task that is Done';
    return null;
  }
  if (!current || !next || current === 'Parked' || next === 'Parked') return null;
  const from = STAGE_RANK[current];
  const to = STAGE_RANK[next];
  if (from == null || to == null || to >= from) return null;
  return 'An event cannot move a task to an earlier stage';
}

/**
 * Last write wins per field. A stamp older than the one already stored loses.
 * Event writes also cannot move status off Done or a stage backwards.
 * API and Notion pulls are not events: a newer staff or Notion write may move back.
 */
export function applyFieldWrite(input: {
  field: StampedField;
  origin: FieldOrigin;
  currentValue: string | null;
  currentStamp?: FieldStamp | null;
  nextValue: string | null;
  updatedAt: number;
  updatedBy: string;
}): { apply: true; stamp: FieldStamp } | { apply: false; reason: string } {
  const current = input.currentStamp;
  if (current && input.updatedAt < current.updatedAt) {
    return { apply: false, reason: 'A newer write already set this field' };
  }
  if (input.origin === 'event' && (input.field === 'status' || input.field === 'stage')) {
    const reason = movesBackward(input.field, input.currentValue, input.nextValue);
    if (reason) return { apply: false, reason };
  }
  return { apply: true, stamp: { updatedAt: input.updatedAt, updatedBy: input.updatedBy } };
}

export function mergePulledField(input: {
  field: 'status' | 'priority' | 'nextAction';
  notionValue: string | null;
  notionEditedMs: number | null;
  localValue: string | null;
  localStamp: FieldStamp | null;
}): { applied: boolean; value: string | null; stamp: FieldStamp | null } {
  const decision = applyFieldWrite({
    field: input.field,
    origin: 'pull',
    currentValue: input.localValue,
    currentStamp: input.localStamp,
    nextValue: input.notionValue,
    updatedAt: input.notionEditedMs ?? 0,
    updatedBy: 'notion',
  });
  if (!decision.apply) return { applied: false, value: input.localValue, stamp: input.localStamp };
  return { applied: true, value: input.notionValue, stamp: decision.stamp };
}

/**
 * Stage from a pull. An in-flight move keeps `mergePulledStage`. Otherwise the
 * Notion edit time has to beat `fieldStamps.stage`. An older pull keeps the
 * local stage. Event writes are not pulls: `applyFieldWrite` still rejects a
 * status or stage that moves backwards when origin is `event`.
 */
export function resolvePulledStage(input: {
  pending: boolean;
  notionStage: string | null;
  notionEditedMs: number | null;
  localStage: string | null;
  localStamp: FieldStamp | null;
  pulledStage: string | null;
  pulledStageSynced: string | null;
  pulledLastEditedTime: string | null;
}): {
  stage: string | null;
  stageSynced: string | null;
  lastEditedTime: string | null;
  stamp: FieldStamp | null;
  keptLocal: boolean;
} {
  if (input.pending) {
    const changed = (input.localStage ?? null) !== (input.pulledStage ?? null);
    return {
      stage: input.pulledStage,
      stageSynced: input.pulledStageSynced,
      lastEditedTime: input.pulledLastEditedTime,
      stamp: changed ? { updatedAt: input.notionEditedMs ?? 0, updatedBy: 'notion' } : null,
      keptLocal: false,
    };
  }
  const decision = applyFieldWrite({
    field: 'stage',
    origin: 'pull',
    currentValue: input.localStage,
    currentStamp: input.localStamp,
    nextValue: input.notionStage,
    updatedAt: input.notionEditedMs ?? 0,
    updatedBy: 'notion',
  });
  if (!decision.apply) {
    return {
      stage: input.localStage,
      stageSynced: input.pulledStageSynced,
      lastEditedTime: input.pulledLastEditedTime,
      stamp: null,
      keptLocal: true,
    };
  }
  return {
    stage: input.pulledStage,
    stageSynced: input.pulledStageSynced,
    lastEditedTime: input.pulledLastEditedTime,
    stamp: decision.stamp,
    keptLocal: false,
  };
}

export type PullFieldSnapshot = {
  name: string | null;
  date: string | null;
  description: string | null;
  status: string | null;
  isDone: boolean;
  stage: string | null;
  priority: string | null;
  nextAction: string | null;
  pullRequestUrl: string | null;
  figmaFrame: string | null;
  repoBranch: string | null;
};

export function pullFieldsChanged(before: PullFieldSnapshot | null, after: PullFieldSnapshot): boolean {
  if (!before) return true;
  return (
    (before.name ?? null) !== (after.name ?? null) ||
    (before.date ?? null) !== (after.date ?? null) ||
    (before.description ?? null) !== (after.description ?? null) ||
    before.status !== after.status ||
    before.isDone !== after.isDone ||
    (before.stage ?? null) !== (after.stage ?? null) ||
    (before.priority ?? null) !== (after.priority ?? null) ||
    (before.nextAction ?? null) !== (after.nextAction ?? null) ||
    (before.pullRequestUrl ?? null) !== (after.pullRequestUrl ?? null) ||
    (before.figmaFrame ?? null) !== (after.figmaFrame ?? null) ||
    (before.repoBranch ?? null) !== (after.repoBranch ?? null)
  );
}

/** Keep Notion's page time even when the stage stamp wins. */
export function storedPullLastEditedTime(
  resolved: string | null,
  existing: string | null | undefined,
): string | null | undefined {
  return resolved ?? existing;
}

export function pullUpdatedAt(input: {
  previousUpdatedAt?: number | null;
  now: number;
  fieldsChanged: boolean;
  linksChanged: boolean;
}): number | undefined {
  if (input.fieldsChanged || input.linksChanged) return input.now;
  return input.previousUpdatedAt ?? undefined;
}

function priorityProperty(value: string | null): { ok: true; value: string | null } | { ok: false; error: string } {
  if (value == null) return { ok: true, value: null };
  const text = value.trim();
  if (!text) return { ok: true, value: null };
  if (!(TASK_PRIORITIES as readonly string[]).includes(text)) return { ok: false, error: 'Unknown priority' };
  return { ok: true, value: text as TaskPriority };
}

export function planApiTaskUpdate(input: {
  notionPageId: string;
  expectedLastEditedTime: string;
  status?: string;
  priority?: string | null;
  nextAction?: string | null;
  stage?: string;
  pullRequestLink?: string;
}): { ok: true; writes: ApiOutboxWrite[] } | { ok: false; error: string } {
  if (!input.notionPageId) return { ok: false, error: 'Updates require a Notion page' };
  if (!input.expectedLastEditedTime) return { ok: false, error: 'Updates require the last read time' };

  const properties: WriteProperties = {};
  if (input.status !== undefined) {
    if (!isLiveTaskStatus(input.status)) return { ok: false, error: 'Unknown status' };
    properties.Status = input.status;
  }
  if (input.priority !== undefined) {
    const priority = priorityProperty(input.priority);
    if (!priority.ok) return priority;
    properties.Priority = priority.value;
  }
  if (input.nextAction !== undefined) {
    const text = input.nextAction?.trim() ?? '';
    if (text.length > 500) return { ok: false, error: 'Next action is too long' };
    properties['Next Action'] = text.length > 0 ? text : null;
  }

  const writes: ApiOutboxWrite[] = [];
  if (Object.keys(properties).length > 0) {
    const validated = validatePropertyPatch({ database: 'tasks', properties });
    if (!validated.ok) return { ok: false, error: validated.errors.join('; ') };
    writes.push({ kind: 'update', properties });
  }
  if (input.stage !== undefined) {
    const stage = planTaskStageWrite({
      actor: 'staff',
      stage: input.stage,
      pullRequestLink: input.pullRequestLink,
      notionPageId: input.notionPageId,
      expectedLastEditedTime: input.expectedLastEditedTime,
    });
    if (!stage.ok) return stage;
    writes.push({ kind: 'task-stage', properties: stage.properties });
  }
  if (writes.length === 0) return { ok: false, error: 'At least one field is required' };
  return { ok: true, writes };
}

export function planApiTaskCreate(input: {
  name: string;
  status: string;
  projectNotionId: string;
  externalId: string;
  date?: string;
  stage?: string;
}): { ok: true; kind: 'create'; properties: TaskWriteProperties; idempotencyKey: string } | { ok: false; error: string } {
  const planned = planTaskCreate({
    actor: 'staff',
    name: input.name,
    status: input.status,
    projectNotionId: input.projectNotionId,
    externalId: input.externalId,
    date: input.date,
    stage: input.stage,
  });
  if (!planned.ok) return planned;
  return { ok: true, kind: 'create', properties: planned.properties, idempotencyKey: planned.idempotencyKey };
}

export function planApiLinkPatch(property: string, url: string): { ok: true; kind: 'update'; properties: WriteProperties } | { ok: false; error: string } {
  const properties: WriteProperties = { [property]: url };
  const validated = validatePropertyPatch({ database: 'tasks', properties });
  if (!validated.ok) return { ok: false, error: validated.errors.join('; ') };
  return { ok: true, kind: 'update', properties };
}

export function toPortalTokenListItem(input: {
  id: string;
  name: string;
  prefix: string;
  scope: 'read' | 'read-write';
  revokedAt?: number | null;
  lastUsedAt?: number | null;
  createdAt: number;
  rateLimit: number;
  token?: string;
  tokenHash?: string;
}): {
  id: string;
  name: string;
  prefix: string;
  scope: 'read' | 'read-write';
  revokedAt: number | null;
  lastUsedAt: number | null;
  createdAt: number;
  rateLimit: number;
} {
  return {
    id: input.id,
    name: input.name,
    prefix: input.prefix,
    scope: input.scope,
    revokedAt: input.revokedAt ?? null,
    lastUsedAt: input.lastUsedAt ?? null,
    createdAt: input.createdAt,
    rateLimit: input.rateLimit,
  };
}
