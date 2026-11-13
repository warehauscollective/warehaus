/**
 * Notion outbox planning. Writes happen Notion-first.
 * No caller may create a Convex row that grants access until `confirmed`.
 */

import {
  asClientCreateProperties,
  clientCreateEnqueueError,
  decideClientCreateDedupe,
  type ClientCreateHit,
  type ClientCreateProperties,
} from './clientCreate';
import { decideProjectCreateDedupe } from './projectCreate';
import { PROJECT_PROPERTY_TIERS } from './tiers';
import {
  decideCreateDedupe,
  searchPlanForCreate,
  validatePropertyPatch,
  validateWriteback,
  WRITEBACK_OFF_ERROR,
  type WriteProperties,
  type WritebackDatabase,
} from './writeback';

export const OUTBOX_BACKOFF_MS = [30_000, 120_000, 600_000, 1_800_000, 7_200_000] as const;
export const OUTBOX_DEAD_AFTER_MS = 24 * 60 * 60 * 1000;
export const OUTBOX_STAFF_NOTICE_ATTEMPTS = 5;
export const OUTBOX_STAFF_NOTICE_QUEUED_MS = 60 * 60 * 1000;
/**
 * How long a claimed row stays with that attempt.
 * Convex actions and HTTP actions stop at 10 minutes. This is longer, so a
 * request that is still running cannot be handed to another attempt.
 */
export const OUTBOX_LEASE_MS = 15 * 60 * 1000;

export type OutboxStatus = 'queued' | 'inflight' | 'done' | 'failed' | 'dead' | 'conflict';

export type OutboxItem = {
  idempotencyKey: string;
  kind: string;
  database: WritebackDatabase;
  orgId: string;
  notionPageId?: string;
  /** ISO last_edited_time from the last read. Required for property updates. */
  expectedLastEditedTime?: string;
  properties: WriteProperties;
  status: OutboxStatus;
  attempts: number;
  nextAttemptAt: number;
  createdAt: number;
  /** Set when an attempt claims the row. Absent means the lease is not held. */
  claimedAt?: number;
  lastError?: string;
  staffNotifiedAt?: number;
};

export function inviteIdempotencyKey(orgId: string, normalizedEmail: string, requestId: string): string {
  return `invite:${orgId}:${normalizedEmail}:${requestId}`;
}

export function stateIdempotencyKey(pageId: string, targetStatus: string, tokenId: string): string {
  return `state:${pageId}:${targetStatus}:${tokenId}`;
}

export function revertIdempotencyKey(pageId: string, field: string, observedEditedTime: string): string {
  return `revert:${pageId}:${field}:${observedEditedTime}`;
}

/** One Status write for a task page. The same key is the same intended write. */
export function taskStatusIdempotencyKey(
  notionPageId: string,
  status: string,
  expectedLastEditedTime: string,
): string {
  return `task-status:${notionPageId}:${status}:${expectedLastEditedTime}`;
}

export function projectCreateIdempotencyKey(externalId: string): string {
  return `project-create:${externalId}`;
}

export function clientCreateIdempotencyKey(externalId: string): string {
  return `client-create:${externalId}`;
}

/** Invite mail runs only for these kinds. Client create is not one of them. */
export function outboxKindSendsInvite(kind: string): boolean {
  return kind === 'createInvite' || kind === 'setInviteState';
}

export type IdempotencyRow = {
  status: OutboxStatus;
  notionPageId?: string;
};

/**
 * Flag off inserts nothing. An existing key is reused and is not written again here.
 */
export function planIdempotentEnqueue(
  existing: IdempotencyRow | null,
  writebackEnabled: boolean,
):
  | { action: 'noop'; error: string }
  | { action: 'reuse' }
  | { action: 'insert' } {
  if (!writebackEnabled) return { action: 'noop', error: WRITEBACK_OFF_ERROR };
  if (existing) return { action: 'reuse' };
  return { action: 'insert' };
}

export type CreateResume =
  | { action: 'replay'; notionPageId: string; projectId?: string; clientId?: string; reused: boolean }
  | { action: 'busy' }
  | { action: 'retry' };

/**
 * A reused outbox row. `done` replays the stored page. `failed` and `dead`
 * may run processOne again. Anything still queued or inflight stays put, so a
 * retry does not take the lease or start a second Notion create.
 */
export function planCreateResume(row: { status: OutboxStatus; resultJson?: string | null }): CreateResume {
  if (row.status === 'failed' || row.status === 'dead') return { action: 'retry' };
  if (row.status !== 'done') return { action: 'busy' };
  if (!row.resultJson) return { action: 'busy' };
  try {
    const parsed = JSON.parse(row.resultJson) as {
      notionPageId?: unknown;
      projectId?: unknown;
      clientId?: unknown;
      reused?: unknown;
    };
    if (typeof parsed.notionPageId !== 'string' || parsed.notionPageId.length === 0) return { action: 'busy' };
    return {
      action: 'replay',
      notionPageId: parsed.notionPageId,
      ...(typeof parsed.projectId === 'string' ? { projectId: parsed.projectId } : {}),
      ...(typeof parsed.clientId === 'string' ? { clientId: parsed.clientId } : {}),
      reused: parsed.reused === true,
    };
  } catch {
    return { action: 'busy' };
  }
}

export function nextBackoffMs(failedAttempts: number, retryAfterMs?: number): number {
  const index = Math.min(Math.max(failedAttempts, 1), OUTBOX_BACKOFF_MS.length) - 1;
  const slot = OUTBOX_BACKOFF_MS[index] ?? OUTBOX_BACKOFF_MS[OUTBOX_BACKOFF_MS.length - 1]!;
  if (retryAfterMs != null && retryAfterMs > slot) return retryAfterMs;
  return slot;
}

export function shouldNotifyStaff(item: Pick<OutboxItem, 'attempts' | 'createdAt' | 'status'>, nowMs: number): boolean {
  if (item.status === 'done') return false;
  if (item.attempts >= OUTBOX_STAFF_NOTICE_ATTEMPTS) return true;
  return nowMs - item.createdAt >= OUTBOX_STAFF_NOTICE_QUEUED_MS && item.status !== 'inflight';
}

export function isOutboxDead(item: Pick<OutboxItem, 'createdAt' | 'status'>, nowMs: number): boolean {
  if (item.status === 'done' || item.status === 'dead') return item.status === 'dead';
  return nowMs - item.createdAt >= OUTBOX_DEAD_AFTER_MS;
}

export type AttemptPlan =
  | { action: 'wait' }
  | { action: 'hold'; reason: 'writeback-disabled' }
  | { action: 'dead'; notifyStaff: boolean }
  | { action: 'execute'; notifyStaff: boolean };

export type LeaseTake =
  | { claimed: false; reason: 'done' | 'dead' | 'conflict' | 'inflight' | 'backoff' }
  | { claimed: true; item: OutboxItem };

type LeaseInput = {
  status: OutboxStatus;
  claimedAt?: number;
  nextAttemptAt?: number;
};

export function outboxLeaseUnexpired(claimedAt: number | undefined, nowMs: number): boolean {
  return claimedAt != null && nowMs - claimedAt < OUTBOX_LEASE_MS;
}

/**
 * One attempt takes the row. A live lease stays with the attempt that holds it.
 * An expired lease, or a row that was never claimed, can be taken.
 * A row whose next attempt is still in the future is not claimed.
 */
export function takeOutboxLease<T extends LeaseInput>(
  item: T,
  nowMs: number,
): { claimed: false; reason: 'done' | 'dead' | 'conflict' | 'inflight' | 'backoff' } | { claimed: true; item: T & { status: 'inflight'; claimedAt: number } } {
  if (item.status === 'done' || item.status === 'dead' || item.status === 'conflict') {
    return { claimed: false, reason: item.status };
  }
  if (item.status === 'inflight' && outboxLeaseUnexpired(item.claimedAt, nowMs)) {
    return { claimed: false, reason: 'inflight' };
  }
  if (typeof item.nextAttemptAt === 'number' && nowMs < item.nextAttemptAt) {
    return { claimed: false, reason: 'backoff' };
  }
  return { claimed: true, item: { ...item, status: 'inflight', claimedAt: nowMs } };
}

/**
 * Flag off holds the row and does not call Notion.
 * `owned` means this attempt just claimed the row. That row is processed in
 * this pass. Waiting is only for a lease another attempt still holds, or for
 * backoff (`nextAttemptAt` in the future).
 */
export function planOutboxAttempt(
  item: OutboxItem,
  nowMs: number,
  writebackEnabled: boolean,
  options?: { owned?: boolean },
): AttemptPlan {
  if (!writebackEnabled) return { action: 'hold', reason: 'writeback-disabled' };
  if (item.status === 'done' || item.status === 'dead' || item.status === 'conflict') {
    return { action: 'wait' };
  }
  if (isOutboxDead(item, nowMs)) {
    return { action: 'dead', notifyStaff: item.staffNotifiedAt == null };
  }
  const heldByOther =
    item.status === 'inflight' && !options?.owned && outboxLeaseUnexpired(item.claimedAt, nowMs);
  if (heldByOther) return { action: 'wait' };
  if (nowMs < item.nextAttemptAt) return { action: 'wait' };
  const forNotice =
    options?.owned && item.status === 'inflight' ? { ...item, status: 'queued' as const } : item;
  return {
    action: 'execute',
    notifyStaff: shouldNotifyStaff(forNotice, nowMs) && item.staffNotifiedAt == null,
  };
}

export type NotionWriteResponse = {
  ok: boolean;
  status: number;
  notionPageId?: string;
  lastEditedTime?: string | null;
  retryAfterMs?: number;
  error?: string;
};

export type ConfirmedWrite = {
  notionPageId: string;
  lastEditedTime: string | null;
  properties: WriteProperties;
};

export type AttemptOutcome =
  | { outcome: 'held'; reason: 'writeback-disabled' }
  | { outcome: 'wait' }
  | { outcome: 'dead'; notifyStaff: boolean; error: string }
  | { outcome: 'retry'; attempts: number; nextAttemptAt: number; lastError: string; notifyStaff: boolean }
  | { outcome: 'rejected'; reason: string }
  | {
      outcome: 'conflict';
      reason: string;
      expectedLastEditedTime: string;
      observedLastEditedTime: string | null;
    }
  | { outcome: 'confirmed'; write: ConfirmedWrite; reused: boolean };

/** Audit row for a Notion write that was sent, and for a conflict that blocked one. */
export function auditEventForOutcome(
  outcome: AttemptOutcome,
): { action: string; after: string } | null {
  if (outcome.outcome === 'confirmed') {
    return { action: 'outbox.confirmed', after: JSON.stringify(outcome.write.properties) };
  }
  if (outcome.outcome === 'conflict') {
    return {
      action: 'outbox.conflict',
      after: `${outcome.reason} expected ${outcome.expectedLastEditedTime} observed ${outcome.observedLastEditedTime ?? 'none'}`,
    };
  }
  return null;
}

export type PageRead =
  | { ok: true; lastEditedTime: string | null }
  | { ok: false; status: number; retryAfterMs?: number; error: string };

/**
 * One outbox attempt. `search` and `write` are not called when the flag is off,
 * when validation fails, or when dedupe rejects the row.
 */
export async function runOutboxAttempt(input: {
  item: OutboxItem;
  nowMs: number;
  writebackEnabled: boolean;
  actor: 'staff' | 'clientAdmin' | 'system';
  search: (plan: { property: string; value: string }) => Promise<Array<{ notionPageId: string; sameOrg: boolean }>>;
  write: (request: {
    method: 'create' | 'update';
    notionPageId?: string;
    properties: WriteProperties;
  }) => Promise<NotionWriteResponse>;
  /** Re-read before an update. Required when `expectedLastEditedTime` is set. */
  readPage?: (notionPageId: string) => Promise<PageRead>;
  /** This attempt just claimed the row, so its own lease is not "not due". */
  owned?: boolean;
  /**
   * Property names on the live data source. When set, a payload key that is
   * absent is rejected before search or write. Omit when the schema was not read.
   */
  livePropertyNames?: readonly string[];
}): Promise<AttemptOutcome> {
  const plan = planOutboxAttempt(input.item, input.nowMs, input.writebackEnabled, { owned: input.owned });
  if (plan.action === 'hold') return { outcome: 'held', reason: plan.reason };
  if (plan.action === 'wait') return { outcome: 'wait' };
  if (plan.action === 'dead') {
    return { outcome: 'dead', notifyStaff: plan.notifyStaff, error: 'Outbox item exceeded 24h' };
  }

  const inviteState = input.item.kind === 'setInviteState' || input.item.kind === 'revert';
  if (inviteState) {
    const validated = validatePropertyPatch({
      database: input.item.database,
      properties: input.item.properties,
    });
    if (!validated.ok) return { outcome: 'rejected', reason: validated.errors.join('; ') };
    const inviteSchema = rejectIfSchemaMissing(validated.properties, input.livePropertyNames);
    if (inviteSchema) return inviteSchema;
    if (!input.item.notionPageId) {
      return { outcome: 'rejected', reason: 'State changes need an existing Notion page' };
    }
    if (input.item.expectedLastEditedTime) {
      return runPatchAttempt({
        item: input.item,
        nowMs: input.nowMs,
        properties: validated.properties,
        readPage: input.readPage,
        write: input.write,
      });
    }
    const response = await input.write({
      method: 'update',
      notionPageId: input.item.notionPageId,
      properties: validated.properties,
    });
    if (!response.ok || !response.notionPageId) return retryOutcome(input.item, input.nowMs, response);
    return {
      outcome: 'confirmed',
      reused: false,
      write: {
        notionPageId: response.notionPageId,
        lastEditedTime: response.lastEditedTime ?? null,
        properties: validated.properties,
      },
    };
  }

  // Partial edits use the patch path and its last-edited conflict check.
  // Full-page validation stays for creates only: `create` and `createInvite`
  // send a new page. `project-create` and `client-create` have their own
  // attempts. A client slug hit must not fall through here: this path PATCHes
  // a reused page, and client create must not.
  // `setInviteState` and `revert` already use validatePropertyPatch above.
  // They re-read only when expectedLastEditedTime is present, because some
  // state changes have no prior read. That is not the full-page bug.
  const isPatch =
    input.item.kind === 'task-status' ||
    input.item.kind === 'task-stage' ||
    input.item.kind === 'task-description' ||
    input.item.kind === 'update' ||
    input.item.kind === 'task-fields';
  const validated = isPatch
    ? validatePropertyPatch({
        database: input.item.database,
        properties: input.item.properties,
      })
    : validateWriteback({
        database: input.item.database,
        properties: input.item.properties,
        actor: input.actor,
      });
  if (!validated.ok) {
    return { outcome: 'rejected', reason: validated.errors.join('; ') };
  }
  const schemaMiss = rejectIfSchemaMissing(validated.properties, input.livePropertyNames);
  if (schemaMiss) return schemaMiss;

  if (isPatch) {
    return runPatchAttempt({
      item: input.item,
      nowMs: input.nowMs,
      properties: validated.properties,
      readPage: input.readPage,
      write: input.write,
    });
  }

  let notionPageId = input.item.notionPageId;
  let reused = false;
  if (!notionPageId) {
    const search = searchPlanForCreate(input.item.database, validated.properties);
    if ('error' in search) return { outcome: 'rejected', reason: search.error };
    const hits = await input.search(search);
    const dedupe = decideCreateDedupe(hits);
    if (dedupe.action === 'reject') return { outcome: 'rejected', reason: dedupe.reason };
    if (dedupe.action === 'reuse') {
      notionPageId = dedupe.notionPageId;
      reused = true;
    }
  }

  const response = await input.write({
    method: notionPageId ? 'update' : 'create',
    notionPageId,
    properties: validated.properties,
  });

  if (!response.ok || !response.notionPageId) return retryOutcome(input.item, input.nowMs, response);

  return {
    outcome: 'confirmed',
    reused,
    write: {
      notionPageId: response.notionPageId,
      lastEditedTime: response.lastEditedTime ?? null,
      properties: validated.properties,
    },
  };
}

/** Notion's validation error names the property. The match is the property name. */
export function missingWritebackProperty(error: string | undefined): string | null {
  if (!error) return null;
  const match = error.match(/([A-Za-z][^"\\]{0,80}?) is not a property that exists/);
  const name = match?.[1]?.trim();
  return name ? name : null;
}

/** Payload keys that the live data source does not have, in payload order. */
export function missingWritebackProperties(
  payloadKeys: readonly string[],
  liveNames: readonly string[],
): string[] {
  const live = new Set(liveNames);
  return payloadKeys.filter((name) => !live.has(name));
}

export function missingWritebackReason(names: readonly string[]): string {
  const quoted = names.map((name) => `"${name}"`).join(', ');
  return names.length === 1
    ? `Notion is missing property ${quoted}.`
    : `Notion is missing properties ${quoted}.`;
}

/** True when a rejection names a Notion property the data source does not have. */
export function isMissingPropertyRejection(reason: string | undefined): boolean {
  if (!reason) return false;
  return reason.startsWith('Notion is missing property ') || reason.startsWith('Notion is missing properties ');
}

function rejectIfSchemaMissing(
  properties: WriteProperties,
  livePropertyNames: readonly string[] | undefined,
): AttemptOutcome | null {
  if (!livePropertyNames) return null;
  const missing = missingWritebackProperties(Object.keys(properties), livePropertyNames);
  if (missing.length === 0) return null;
  return { outcome: 'rejected', reason: missingWritebackReason(missing) };
}

function retryOutcome(item: OutboxItem, nowMs: number, response: NotionWriteResponse): AttemptOutcome {
  const missing = missingWritebackProperty(response.error);
  if (missing) return { outcome: 'rejected', reason: missingWritebackReason([missing]) };
  const attempts = item.attempts + 1;
  const delay = nextBackoffMs(attempts, response.retryAfterMs);
  const next: OutboxItem = { ...item, attempts, status: 'failed', createdAt: item.createdAt };
  return {
    outcome: 'retry',
    attempts,
    nextAttemptAt: nowMs + delay,
    lastError: response.error ?? `Notion HTTP ${response.status}`,
    notifyStaff: shouldNotifyStaff(next, nowMs) && item.staffNotifiedAt == null,
  };
}

/**
 * Property update. Re-reads last_edited_time and does not write when Notion
 * changed since the caller's last read.
 */
async function runPatchAttempt(input: {
  item: OutboxItem;
  nowMs: number;
  properties: WriteProperties;
  readPage?: (notionPageId: string) => Promise<PageRead>;
  write: (request: {
    method: 'create' | 'update';
    notionPageId?: string;
    properties: WriteProperties;
  }) => Promise<NotionWriteResponse>;
}): Promise<AttemptOutcome> {
  const notionPageId = input.item.notionPageId;
  const expected = input.item.expectedLastEditedTime;
  if (!notionPageId) return { outcome: 'rejected', reason: 'Updates require a Notion page' };
  if (!expected) return { outcome: 'rejected', reason: 'Updates require the last read time' };
  if (!input.readPage) return { outcome: 'rejected', reason: 'Updates require a page re-read' };

  const current = await input.readPage(notionPageId);
  if (!current.ok) return retryOutcome(input.item, input.nowMs, current);
  if (current.lastEditedTime !== expected) {
    return {
      outcome: 'conflict',
      reason: 'Notion changed since the last read',
      expectedLastEditedTime: expected,
      observedLastEditedTime: current.lastEditedTime,
    };
  }

  const response = await input.write({
    method: 'update',
    notionPageId,
    properties: input.properties,
  });
  if (!response.ok || !response.notionPageId) return retryOutcome(input.item, input.nowMs, response);
  return {
    outcome: 'confirmed',
    reused: false,
    write: {
      notionPageId: response.notionPageId,
      lastEditedTime: response.lastEditedTime ?? null,
      properties: input.properties,
    },
  };
}

/**
 * Staff project create on the outbox. Reuses the existing dedupe rules.
 * A same-client hit is reused and is not patched. Write-back off calls nothing.
 */
export async function runProjectCreateAttempt(input: {
  item: OutboxItem;
  nowMs: number;
  writebackEnabled: boolean;
  search: (
    externalId: string,
  ) => Promise<Array<{ notionPageId: string; clientNotionIds: readonly string[] }>>;
  create: (properties: WriteProperties) => Promise<NotionWriteResponse>;
  /** This attempt just claimed the row, so its own lease is not "not due". */
  owned?: boolean;
  /** Property names on the live Projects data source. Omit when the schema was not read. */
  livePropertyNames?: readonly string[];
}): Promise<AttemptOutcome> {
  const plan = planOutboxAttempt(input.item, input.nowMs, input.writebackEnabled, { owned: input.owned });
  if (plan.action === 'hold') return { outcome: 'held', reason: plan.reason };
  if (plan.action === 'wait') return { outcome: 'wait' };
  if (plan.action === 'dead') {
    return { outcome: 'dead', notifyStaff: plan.notifyStaff, error: 'Outbox item exceeded 24h' };
  }

  const properties = input.item.properties;
  const unknown = Object.keys(properties).filter((name) => !(name in PROJECT_PROPERTY_TIERS));
  if (unknown.length > 0) {
    return { outcome: 'rejected', reason: unknown.map((name) => `Unknown property ${name}`).join('; ') };
  }
  const externalId = properties['External ID'];
  const client = properties.Client;
  if (typeof externalId !== 'string' || !Array.isArray(client) || client.length !== 1) {
    return { outcome: 'rejected', reason: 'Project create payload is incomplete' };
  }
  const schemaMiss = rejectIfSchemaMissing(properties, input.livePropertyNames);
  if (schemaMiss) return schemaMiss;

  const hits = await input.search(externalId);
  const dedupe = decideProjectCreateDedupe({ hits, clientNotionPageId: client[0]! });
  if (dedupe.action === 'reject') return { outcome: 'rejected', reason: dedupe.reason };
  if (dedupe.action === 'reuse') {
    return {
      outcome: 'confirmed',
      reused: true,
      write: { notionPageId: dedupe.notionPageId, lastEditedTime: null, properties },
    };
  }

  const response = await input.create(properties);
  if (!response.ok || !response.notionPageId) return retryOutcome(input.item, input.nowMs, response);
  return {
    outcome: 'confirmed',
    reused: false,
    write: {
      notionPageId: response.notionPageId,
      lastEditedTime: response.lastEditedTime ?? null,
      properties,
    },
  };
}

export type ClientCreateAttempt = AttemptOutcome & {
  reuseKind?: 'external-id' | 'slug';
  existingNotionProperties?: Record<string, unknown>;
};

/**
 * Staff client create. External ID and Slug hits are reused and not patched.
 * Write-back off calls nothing. This attempt does not send mail.
 */
export async function runClientCreateAttempt(input: {
  item: OutboxItem;
  nowMs: number;
  writebackEnabled: boolean;
  search: () => Promise<readonly ClientCreateHit[]>;
  create: (properties: ClientCreateProperties) => Promise<NotionWriteResponse>;
  owned?: boolean;
  livePropertyNames?: readonly string[];
}): Promise<ClientCreateAttempt> {
  const plan = planOutboxAttempt(input.item, input.nowMs, input.writebackEnabled, { owned: input.owned });
  if (plan.action === 'hold') return { outcome: 'held', reason: plan.reason };
  if (plan.action === 'wait') return { outcome: 'wait' };
  if (plan.action === 'dead') {
    return { outcome: 'dead', notifyStaff: plan.notifyStaff, error: 'Outbox item exceeded 24h' };
  }

  const invalid = clientCreateEnqueueError(input.item.properties);
  if (invalid) return { outcome: 'rejected', reason: invalid };
  const schemaMiss = rejectIfSchemaMissing(input.item.properties, input.livePropertyNames);
  if (schemaMiss) return schemaMiss;

  const externalId = input.item.properties['External ID'];
  const slug = input.item.properties.Slug;
  if (typeof externalId !== 'string' || typeof slug !== 'string') {
    return { outcome: 'rejected', reason: 'Client create payload is incomplete' };
  }

  const hits = await input.search();
  const dedupe = decideClientCreateDedupe({ externalId, slug, hits });
  if (dedupe.action === 'reuse') {
    const hit = hits.find((row) => row.notionPageId === dedupe.notionPageId);
    return {
      outcome: 'confirmed',
      reused: true,
      reuseKind: dedupe.kind,
      existingNotionProperties: hit?.properties,
      write: { notionPageId: dedupe.notionPageId, lastEditedTime: null, properties: input.item.properties },
    };
  }

  const shaped = asClientCreateProperties(input.item.properties);
  if (!shaped) return { outcome: 'rejected', reason: 'Client create payload is incomplete' };
  const response = await input.create(shaped);
  if (!response.ok || !response.notionPageId) return retryOutcome(input.item, input.nowMs, response);
  return {
    outcome: 'confirmed',
    reused: false,
    write: {
      notionPageId: response.notionPageId,
      lastEditedTime: response.lastEditedTime ?? null,
      properties: input.item.properties,
    },
  };
}
