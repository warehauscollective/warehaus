/**
 * Notion outbox planning. Writes happen Notion-first.
 * No caller may create a Convex row that grants access until `confirmed`.
 */

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

/** Flag off holds the row queued and does not call Notion. */
export function planOutboxAttempt(item: OutboxItem, nowMs: number, writebackEnabled: boolean): AttemptPlan {
  if (!writebackEnabled) return { action: 'hold', reason: 'writeback-disabled' };
  if (item.status === 'done' || item.status === 'dead' || item.status === 'conflict') {
    return { action: 'wait' };
  }
  if (isOutboxDead(item, nowMs)) {
    return { action: 'dead', notifyStaff: item.staffNotifiedAt == null };
  }
  if (item.status === 'inflight') return { action: 'wait' };
  if (nowMs < item.nextAttemptAt) return { action: 'wait' };
  return { action: 'execute', notifyStaff: shouldNotifyStaff(item, nowMs) && item.staffNotifiedAt == null };
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
  | { outcome: 'held'; reason: 'writeback-disabled' | 'project-create-disabled' }
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
}): Promise<AttemptOutcome> {
  const plan = planOutboxAttempt(input.item, input.nowMs, input.writebackEnabled);
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

  const isPatch = input.item.kind === 'task-status' || input.item.kind === 'update';
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

  if (!response.ok || !response.notionPageId) {
    const attempts = input.item.attempts + 1;
    const delay = nextBackoffMs(attempts, response.retryAfterMs);
    const next: OutboxItem = { ...input.item, attempts, status: 'failed', createdAt: input.item.createdAt };
    return {
      outcome: 'retry',
      attempts,
      nextAttemptAt: input.nowMs + delay,
      lastError: response.error ?? `Notion HTTP ${response.status}`,
      notifyStaff: shouldNotifyStaff(next, input.nowMs) && input.item.staffNotifiedAt == null,
    };
  }

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

function retryOutcome(item: OutboxItem, nowMs: number, response: NotionWriteResponse): AttemptOutcome {
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
  projectCreateEnabled: boolean;
  search: (
    externalId: string,
  ) => Promise<Array<{ notionPageId: string; clientNotionIds: readonly string[] }>>;
  create: (properties: WriteProperties) => Promise<NotionWriteResponse>;
}): Promise<AttemptOutcome> {
  const plan = planOutboxAttempt(input.item, input.nowMs, input.writebackEnabled);
  if (plan.action === 'hold') return { outcome: 'held', reason: plan.reason };
  if (plan.action === 'wait') return { outcome: 'wait' };
  if (plan.action === 'dead') {
    return { outcome: 'dead', notifyStaff: plan.notifyStaff, error: 'Outbox item exceeded 24h' };
  }
  if (!input.projectCreateEnabled) {
    return { outcome: 'held', reason: 'project-create-disabled' };
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
