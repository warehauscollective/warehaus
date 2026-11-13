/**
 * Signed GitHub and Vercel webhook decisions.
 * No database access. Callers write only when a plan says the link changed.
 * Secrets are compared here and are never returned.
 */

import { applyFieldWrite, type FieldStamp } from '@warehaus/portal-sync';
import { timingSafeEqualUtf8 } from './constantTime';

export const INBOUND_MAX_BODY_BYTES = 1_048_576;
export const INBOUND_MAX_TASKS = 5;
export const INBOUND_LINK_CAP = 50;
export const INBOUND_RATE_LIMIT = 60;
export const INBOUND_RATE_WINDOW_MS = 60_000;
export const INBOUND_RATE_KEY = 'inbound-webhook-rate';

/**
 * Ready to Ship is the review / final-checks stage already on the task enum.
 * A merged pull request never moves a task to Done or Shipped.
 */
export const MERGE_REVIEW_STAGE = 'Ready to Ship' as const;

export const VERCEL_PROJECT_NAME = 'warehaus-portal';

const REPO_NAME = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const SHA = /^[0-9a-f]{7,64}$/;
const DELIVERY_ID = /^[A-Za-z0-9_.:-]{8,180}$/;
const PORTAL_TASK = /Portal-Task:\s*([0-9a-fA-F-]{32,36})/g;

const CHECK_CONCLUSIONS = new Set([
  'success',
  'failure',
  'neutral',
  'cancelled',
  'timed_out',
  'action_required',
  'stale',
  'skipped',
]);

const VERCEL_STATES: Record<string, string> = {
  'deployment.created': 'created',
  'deployment.succeeded': 'succeeded',
  'deployment.error': 'error',
  'deployment.promoted': 'promoted',
};

export type InboundSource = 'github' | 'vercel';

export type InboundItem = {
  notionPageId: string;
  kind: 'PR' | 'deploy';
  url: string;
  state: string;
  sha: string;
  title?: string;
  moveStage: boolean;
};

export type InboundPlan =
  | { action: 'ignore'; reason: string }
  | {
      action: 'apply';
      source: InboundSource;
      deliveryId?: string;
      /** repo#number#sha#state, deploymentId#state, or check#sha#conclusion. */
      contentKey?: string;
      /** Set for check_suite and workflow_run. The mutation matches an existing PR link. */
      matchSha?: string;
      checkState?: string;
      items: InboundItem[];
    };

export type WebhookDecision =
  | { ok: false; status: 401 | 413; reason: 'missing_secret' | 'invalid_signature' | 'payload_too_large' }
  | { ok: true; plan: InboundPlan };

export function deliveryClaimId(source: InboundSource, deliveryId: string): string {
  return `${source}:delivery:${deliveryId}`;
}

export function snapshotClaimId(source: InboundSource, contentKey: string): string {
  return `${source}:snapshot:${contentKey}`;
}

/** True when the header or the raw body is over 1 MiB. Checked before the signature. */
export function payloadTooLarge(contentLength: string | null | undefined, rawBody: string): boolean {
  const bytes = new TextEncoder().encode(rawBody).length;
  if (bytes > INBOUND_MAX_BODY_BYTES) return true;
  const header = contentLength?.trim() ?? '';
  if (!header) return false;
  const parsed = Number(header);
  return Number.isFinite(parsed) && parsed > INBOUND_MAX_BODY_BYTES;
}

export function notionIdVariants(id: string): string[] {
  const hex = id.replace(/-/g, '').toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(hex)) return [id];
  const dashed = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  return [...new Set([hex, dashed])];
}

export function sameLinkSnapshot(
  existing: { url: string; sha?: string; state?: string } | null,
  incoming: { url: string; sha: string; state: string },
): boolean {
  if (!existing) return false;
  return existing.url === incoming.url && existing.sha === incoming.sha && existing.state === incoming.state;
}

/**
 * A merged link stays merged. A later check conclusion for the same SHA
 * must not walk the row backwards.
 */
export function linkWriteAction(
  existing: { url: string; sha?: string; state?: string } | null,
  incoming: { url: string; sha: string; state: string },
): 'insert' | 'patch' | 'noop' {
  if (!existing) return 'insert';
  if (existing.state === 'merged' && incoming.state !== 'merged') return 'noop';
  if (sameLinkSnapshot(existing, incoming)) return 'noop';
  return 'patch';
}

/**
 * Stage change for a merged pull request.
 * Ready to Ship only. Done and a backwards stage, including Shipped, stay put.
 */
export function stageMoveForMerge(input: {
  moveStage: boolean;
  status: string;
  isDone: boolean;
  stage: string | null | undefined;
  stamp: FieldStamp | null;
  lastEditedTime: string | null | undefined;
  now: number;
}): { ok: true; stage: typeof MERGE_REVIEW_STAGE; stamp: FieldStamp } | { ok: false; reason: string } {
  if (!input.moveStage) return { ok: false, reason: 'not_merged' };
  if (input.isDone || input.status === 'Done') return { ok: false, reason: 'done' };
  const edited = input.lastEditedTime?.trim() ?? '';
  if (!edited) return { ok: false, reason: 'no_edited_time' };
  const current = input.stage?.trim() || null;
  if (current === 'Parked') return { ok: false, reason: 'parked' };
  if (current === MERGE_REVIEW_STAGE) return { ok: false, reason: 'already' };
  const decision = applyFieldWrite({
    field: 'stage',
    origin: 'event',
    currentValue: current,
    currentStamp: input.stamp,
    nextValue: MERGE_REVIEW_STAGE,
    updatedAt: input.now,
    updatedBy: 'github-webhook',
  });
  if (!decision.apply) return { ok: false, reason: decision.reason };
  return { ok: true, stage: MERGE_REVIEW_STAGE, stamp: decision.stamp };
}

async function hmacHex(hash: 'SHA-1' | 'SHA-256', secret: string, rawBody: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
  return [...new Uint8Array(mac)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function githubSignatureHeader(rawBody: string, secret: string): Promise<string> {
  return `sha256=${await hmacHex('SHA-256', secret, rawBody)}`;
}

export async function vercelSignatureHeader(rawBody: string, secret: string): Promise<string> {
  return hmacHex('SHA-1', secret, rawBody);
}

async function signatureDecision(input: {
  rawBody: string;
  signatureHeader: string | null | undefined;
  secret: string | null | undefined;
  expected: (secret: string) => Promise<string>;
}): Promise<Extract<WebhookDecision, { ok: false }> | { ok: true }> {
  const secret = input.secret?.trim() ?? '';
  if (!secret) return { ok: false, status: 401, reason: 'missing_secret' };
  const header = input.signatureHeader?.trim() ?? '';
  const digest = await input.expected(secret);
  if (!timingSafeEqualUtf8(digest, header)) {
    return { ok: false, status: 401, reason: 'invalid_signature' };
  }
  return { ok: true };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asNonEmpty(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function portalTaskIds(rawBody: string): string[] {
  const ids: string[] = [];
  for (const match of rawBody.matchAll(PORTAL_TASK)) {
    const hex = match[1]?.replace(/-/g, '').toLowerCase() ?? '';
    if (!/^[0-9a-f]{32}$/.test(hex)) continue;
    if (ids.includes(hex)) continue;
    ids.push(hex);
    if (ids.length >= INBOUND_MAX_TASKS) break;
  }
  return ids;
}

function cleanDeliveryId(value: string | null): string | undefined {
  if (!value || !DELIVERY_ID.test(value)) return undefined;
  return value;
}

function cleanTitle(value: unknown): string | undefined {
  const title = asNonEmpty(value)?.replace(/[\r\n]+/g, ' ').slice(0, 200);
  return title || undefined;
}

function pullNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 1_000_000) return null;
  return value;
}

function cleanSha(value: unknown): string | null {
  const sha = asNonEmpty(value)?.toLowerCase() ?? '';
  return SHA.test(sha) ? sha : null;
}

function pullUrl(repo: string, number: number): string | null {
  if (!REPO_NAME.test(repo)) return null;
  return `https://github.com/${repo}/pull/${number}`;
}

function itemsForPull(input: {
  ids: string[];
  repo: string;
  number: number;
  sha: string;
  state: string;
  title?: string;
  moveStage: boolean;
}): InboundItem[] | null {
  const url = pullUrl(input.repo, input.number);
  if (!url) return null;
  return input.ids.map((notionPageId) => ({
    notionPageId,
    kind: 'PR' as const,
    url,
    state: input.state,
    sha: input.sha,
    ...(input.title ? { title: input.title } : {}),
    moveStage: input.moveStage,
  }));
}

function parseJson(rawBody: string): Record<string, unknown> | null {
  try {
    return asRecord(JSON.parse(rawBody) as unknown);
  } catch {
    return null;
  }
}

function githubPullFields(body: Record<string, unknown>): {
  repo: string;
  number: number;
  sha: string;
  title?: string;
  merged: boolean;
} | null {
  const repository = asRecord(body.repository);
  const pull = asRecord(body.pull_request);
  const repo = asNonEmpty(repository?.full_name);
  const sha = cleanSha(asRecord(pull?.head)?.sha);
  const number = pullNumber(pull?.number);
  if (!repo || !sha || number == null) return null;
  const title = cleanTitle(pull?.title);
  return { repo, number, sha, ...(title ? { title } : {}), merged: pull?.merged === true };
}

function githubCheckFields(body: Record<string, unknown>, key: 'check_suite' | 'workflow_run'): {
  sha: string;
  conclusion: string;
} | null {
  const node = asRecord(body[key]);
  const sha = cleanSha(node?.head_sha);
  const conclusion = asNonEmpty(node?.conclusion);
  if (!sha || !conclusion || !CHECK_CONCLUSIONS.has(conclusion)) return null;
  return { sha, conclusion };
}

function planGitHub(rawBody: string, eventHeader: string | null, deliveryHeader: string | null): InboundPlan {
  const event = eventHeader?.trim() ?? '';
  const body = parseJson(rawBody);
  if (!body) return { action: 'ignore', reason: 'invalid_json' };
  const ids = portalTaskIds(rawBody);
  const deliveryId = cleanDeliveryId(asNonEmpty(deliveryHeader));

  if (event === 'pull_request') {
    const action = asNonEmpty(body.action);
    if (action !== 'opened' && action !== 'synchronize' && action !== 'closed') {
      return { action: 'ignore', reason: 'event' };
    }
    if (ids.length === 0) return { action: 'ignore', reason: 'no_portal_task' };
    const pull = githubPullFields(body);
    if (!pull) return { action: 'ignore', reason: 'no_pull_request' };
    const merged = action === 'closed' && pull.merged;
    const state = merged ? 'merged' : action === 'closed' ? 'closed' : 'open';
    const items = itemsForPull({
      ids,
      repo: pull.repo,
      number: pull.number,
      sha: pull.sha,
      state,
      ...(pull.title ? { title: pull.title } : {}),
      moveStage: merged,
    });
    if (!items) return { action: 'ignore', reason: 'no_pull_request' };
    return {
      action: 'apply',
      source: 'github',
      ...(deliveryId ? { deliveryId } : {}),
      // State stays on the key so an open and a later merge of the same head sha
      // are not the same snapshot. A replay of the same state still no-ops.
      contentKey: `${pull.repo}#${pull.number}#${pull.sha}#${state}`,
      items,
    };
  }

  if (event === 'check_suite' || event === 'workflow_run') {
    const fields = githubCheckFields(body, event);
    if (!fields) return { action: 'ignore', reason: 'event' };
    return {
      action: 'apply',
      source: 'github',
      ...(deliveryId ? { deliveryId } : {}),
      contentKey: `check#${fields.sha}#${fields.conclusion}`,
      matchSha: fields.sha,
      checkState: fields.conclusion,
      items: [],
    };
  }

  return { action: 'ignore', reason: 'event' };
}

function deployUrl(deployment: Record<string, unknown> | null): string | null {
  const host = asNonEmpty(deployment?.url)?.replace(/^https:\/\//, '').replace(/\/.*$/, '') ?? '';
  if (!/^[A-Za-z0-9.-]+$/.test(host) || host.length > 200) return null;
  return `https://${host}`;
}

function planVercel(rawBody: string): InboundPlan {
  const body = parseJson(rawBody);
  if (!body) return { action: 'ignore', reason: 'invalid_json' };
  const type = asNonEmpty(body.type);
  const state = type ? VERCEL_STATES[type] : undefined;
  if (!state) return { action: 'ignore', reason: 'event' };
  const payload = asRecord(body.payload) ?? body;
  const projectName = asNonEmpty(asRecord(payload.project)?.name);
  const deployment = asRecord(payload.deployment);
  const deploymentName = asNonEmpty(deployment?.name);
  const names = [projectName, deploymentName].filter((name): name is string => Boolean(name));
  if (names.length === 0 || names.some((name) => name !== VERCEL_PROJECT_NAME)) {
    return { action: 'ignore', reason: 'project' };
  }
  const ids = portalTaskIds(rawBody);
  if (ids.length === 0) return { action: 'ignore', reason: 'no_portal_task' };
  const meta = asRecord(deployment?.meta);
  const sha = cleanSha(meta?.githubCommitSha) ?? cleanSha(meta?.gitCommitSha);
  const url = deployUrl(deployment);
  if (!sha || !url) return { action: 'ignore', reason: 'no_deploy' };
  const deliveryId = cleanDeliveryId(asNonEmpty(body.id));
  const deploymentId = cleanDeliveryId(asNonEmpty(deployment?.id)) ?? url;
  return {
    action: 'apply',
    source: 'vercel',
    ...(deliveryId ? { deliveryId } : {}),
    contentKey: `${deploymentId}#${state}`,
    items: ids.map((notionPageId) => ({
      notionPageId,
      kind: 'deploy' as const,
      url,
      state,
      sha,
      moveStage: false,
    })),
  };
}

export async function decideGitHubWebhook(input: {
  rawBody: string;
  signatureHeader: string | null | undefined;
  eventHeader: string | null | undefined;
  deliveryHeader: string | null | undefined;
  contentLength?: string | null;
  secret: string | null | undefined;
}): Promise<WebhookDecision> {
  if (payloadTooLarge(input.contentLength, input.rawBody)) {
    return { ok: false, status: 413, reason: 'payload_too_large' };
  }
  const signed = await signatureDecision({
    rawBody: input.rawBody,
    signatureHeader: input.signatureHeader,
    secret: input.secret,
    expected: (secret) => githubSignatureHeader(input.rawBody, secret),
  });
  if (!signed.ok) return signed;
  return {
    ok: true,
    plan: planGitHub(input.rawBody, input.eventHeader ?? null, input.deliveryHeader ?? null),
  };
}

export async function decideVercelWebhook(input: {
  rawBody: string;
  signatureHeader: string | null | undefined;
  contentLength?: string | null;
  secret: string | null | undefined;
}): Promise<WebhookDecision> {
  if (payloadTooLarge(input.contentLength, input.rawBody)) {
    return { ok: false, status: 413, reason: 'payload_too_large' };
  }
  const signed = await signatureDecision({
    rawBody: input.rawBody,
    signatureHeader: input.signatureHeader,
    secret: input.secret,
    expected: (secret) => vercelSignatureHeader(input.rawBody, secret),
  });
  if (!signed.ok) return signed;
  return { ok: true, plan: planVercel(input.rawBody) };
}
