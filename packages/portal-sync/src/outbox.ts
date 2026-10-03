/**
 * Notion outbox planning. Writes happen Notion-first.
 * No caller may create a Convex row that grants access until `confirmed`.
 */

import {
  decideCreateDedupe,
  searchPlanForCreate,
  validateWriteback,
  type WriteProperties,
  type WritebackDatabase,
} from './writeback';

export const OUTBOX_BACKOFF_MS = [30_000, 120_000, 600_000, 1_800_000, 7_200_000] as const;
export const OUTBOX_DEAD_AFTER_MS = 24 * 60 * 60 * 1000;
export const OUTBOX_STAFF_NOTICE_ATTEMPTS = 5;
export const OUTBOX_STAFF_NOTICE_QUEUED_MS = 60 * 60 * 1000;

export type OutboxStatus = 'queued' | 'inflight' | 'done' | 'failed' | 'dead';

export type OutboxItem = {
  idempotencyKey: string;
  kind: string;
  database: WritebackDatabase;
  orgId: string;
  notionPageId?: string;
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
  if (item.status === 'done' || item.status === 'dead') return { action: 'wait' };
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
  | { outcome: 'held'; reason: 'writeback-disabled' }
  | { outcome: 'wait' }
  | { outcome: 'dead'; notifyStaff: boolean; error: string }
  | { outcome: 'retry'; attempts: number; nextAttemptAt: number; lastError: string; notifyStaff: boolean }
  | { outcome: 'rejected'; reason: string }
  | { outcome: 'confirmed'; write: ConfirmedWrite; reused: boolean };

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
}): Promise<AttemptOutcome> {
  const plan = planOutboxAttempt(input.item, input.nowMs, input.writebackEnabled);
  if (plan.action === 'hold') return { outcome: 'held', reason: plan.reason };
  if (plan.action === 'wait') return { outcome: 'wait' };
  if (plan.action === 'dead') {
    return { outcome: 'dead', notifyStaff: plan.notifyStaff, error: 'Outbox item exceeded 24h' };
  }

  const stateChange = input.item.kind === 'setInviteState' || input.item.kind === 'revert';
  let properties = input.item.properties;
  if (!stateChange) {
    const validated = validateWriteback({
      database: input.item.database,
      properties: input.item.properties,
      actor: input.actor,
    });
    if (!validated.ok) {
      return { outcome: 'rejected', reason: validated.errors.join('; ') };
    }
    properties = validated.properties;
  } else if (!input.item.notionPageId) {
    return { outcome: 'rejected', reason: 'State changes need an existing Notion page' };
  }

  let notionPageId = input.item.notionPageId;
  let reused = false;
  if (!notionPageId) {
    const search = searchPlanForCreate(input.item.database, properties);
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
    properties,
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
      properties,
    },
  };
}
