import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  inviteIdempotencyKey,
  nextBackoffMs,
  planOutboxAttempt,
  revertIdempotencyKey,
  runOutboxAttempt,
  stateIdempotencyKey,
  OUTBOX_BACKOFF_MS,
  OUTBOX_DEAD_AFTER_MS,
  type OutboxItem,
} from './outbox';
import type { WriteProperties } from './writeback';

const properties: WriteProperties = {
  Name: 'Ada Lovelace',
  Email: 'ada@example.com',
  Role: 'Client Member',
  Source: 'portal',
  'Portal Access': 'Disabled',
  'Client Company': ['client-page'],
};

function item(overrides: Partial<OutboxItem> = {}): OutboxItem {
  return {
    idempotencyKey: 'invite:org:ada@example.com:req-1',
    kind: 'createInvite',
    database: 'contacts',
    orgId: 'org',
    properties,
    status: 'queued',
    attempts: 0,
    nextAttemptAt: 0,
    createdAt: 0,
    ...overrides,
  };
}

describe('outbox keys and backoff', () => {
  it('builds stable idempotency keys', () => {
    assert.equal(inviteIdempotencyKey('org', 'ada@example.com', 'req-1'), 'invite:org:ada@example.com:req-1');
    assert.equal(stateIdempotencyKey('page', 'Accepted', 'tok'), 'state:page:Accepted:tok');
    assert.equal(revertIdempotencyKey('page', 'Portal Access', '2026-09-27T00:00:00.000Z'), 'revert:page:Portal Access:2026-09-27T00:00:00.000Z');
  });

  it('backs off 30s, 2m, 10m, 30m, 2h and honors a longer Retry-After', () => {
    assert.deepEqual(
      [1, 2, 3, 4, 5, 6].map((attempt) => nextBackoffMs(attempt)),
      [...OUTBOX_BACKOFF_MS, OUTBOX_BACKOFF_MS[OUTBOX_BACKOFF_MS.length - 1]],
    );
    assert.equal(nextBackoffMs(1, 90_000), 90_000);
    assert.equal(nextBackoffMs(1, 1_000), 30_000);
  });

  it('holds while write-back is off and marks dead after 24h', () => {
    assert.deepEqual(planOutboxAttempt(item(), 0, false), { action: 'hold', reason: 'writeback-disabled' });
    const dead = planOutboxAttempt(item(), OUTBOX_DEAD_AFTER_MS, true);
    assert.equal(dead.action, 'dead');
  });

  it('asks for a staff notice at 5 failures or 1 hour queued', () => {
    const fifth = planOutboxAttempt(item({ attempts: 5, status: 'failed' }), 1_000, true);
    assert.equal(fifth.action, 'execute');
    if (fifth.action === 'execute') assert.equal(fifth.notifyStaff, true);
    const hour = planOutboxAttempt(item({ attempts: 1, status: 'failed' }), 60 * 60 * 1000, true);
    assert.equal(hour.action, 'execute');
    if (hour.action === 'execute') assert.equal(hour.notifyStaff, true);
  });
});

describe('outbox attempt', () => {
  it('does not search or write when the flag is off', async () => {
    let called = 0;
    const outcome = await runOutboxAttempt({
      item: item(),
      nowMs: 0,
      writebackEnabled: false,
      actor: 'clientAdmin',
      search: async () => {
        called += 1;
        return [];
      },
      write: async () => {
        called += 1;
        return { ok: true, status: 200, notionPageId: 'page' };
      },
    });
    assert.deepEqual(outcome, { outcome: 'held', reason: 'writeback-disabled' });
    assert.equal(called, 0);
  });

  it('searches before create and confirms without granting access itself', async () => {
    const calls: string[] = [];
    const outcome = await runOutboxAttempt({
      item: item(),
      nowMs: 0,
      writebackEnabled: true,
      actor: 'clientAdmin',
      search: async () => {
        calls.push('search');
        return [];
      },
      write: async () => {
        calls.push('write');
        return { ok: true, status: 200, notionPageId: 'page-1', lastEditedTime: '2026-09-27T00:01:00.000Z' };
      },
    });
    assert.deepEqual(calls, ['search', 'write']);
    assert.equal(outcome.outcome, 'confirmed');
    if (outcome.outcome === 'confirmed') {
      assert.equal(outcome.write.notionPageId, 'page-1');
      assert.equal(outcome.reused, false);
    }
  });

  it('reuses a same-org page and retries a 429 with Retry-After', async () => {
    const reused = await runOutboxAttempt({
      item: item(),
      nowMs: 0,
      writebackEnabled: true,
      actor: 'staff',
      search: async () => [{ notionPageId: 'existing', sameOrg: true }],
      write: async (request) => {
        assert.equal(request.method, 'update');
        assert.equal(request.notionPageId, 'existing');
        return { ok: true, status: 200, notionPageId: 'existing', lastEditedTime: null };
      },
    });
    assert.equal(reused.outcome, 'confirmed');
    if (reused.outcome === 'confirmed') assert.equal(reused.reused, true);

    const retry = await runOutboxAttempt({
      item: item(),
      nowMs: 1_000,
      writebackEnabled: true,
      actor: 'staff',
      search: async () => [],
      write: async () => ({ ok: false, status: 429, retryAfterMs: 90_000, error: 'rate limited' }),
    });
    assert.equal(retry.outcome, 'retry');
    if (retry.outcome === 'retry') {
      assert.equal(retry.attempts, 1);
      assert.equal(retry.nextAttemptAt, 1_000 + 90_000);
    }
  });

  it('rejects another client before writing', async () => {
    let wrote = false;
    const outcome = await runOutboxAttempt({
      item: item(),
      nowMs: 0,
      writebackEnabled: true,
      actor: 'clientAdmin',
      search: async () => [{ notionPageId: 'other', sameOrg: false }],
      write: async () => {
        wrote = true;
        return { ok: true, status: 200, notionPageId: 'other' };
      },
    });
    assert.equal(outcome.outcome, 'rejected');
    assert.equal(wrote, false);
  });
});
