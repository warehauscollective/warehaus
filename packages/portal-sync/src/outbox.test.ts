import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  OUTBOX_BACKOFF_MS,
  OUTBOX_DEAD_AFTER_MS,
  auditEventForOutcome,
  inviteIdempotencyKey,
  nextBackoffMs,
  planIdempotentEnqueue,
  planOutboxAttempt,
  revertIdempotencyKey,
  runOutboxAttempt,
  runProjectCreateAttempt,
  stateIdempotencyKey,
  taskStatusIdempotencyKey,
  type OutboxItem,
} from './outbox';
import { WRITEBACK_OFF_ERROR, type WriteProperties } from './writeback';

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

  it('patches invite state without the full create payload', async () => {
    const outcome = await runOutboxAttempt({
      item: item({
        kind: 'setInviteState',
        notionPageId: 'page-1',
        properties: { 'Portal Access': 'Enabled', 'Invite Status': 'Accepted' },
      }),
      nowMs: 0,
      writebackEnabled: true,
      actor: 'system',
      search: async () => {
        throw new Error('search should not run');
      },
      write: async (request) => {
        assert.equal(request.method, 'update');
        assert.equal(request.properties['Invite Status'], 'Accepted');
        return { ok: true, status: 200, notionPageId: 'page-1', lastEditedTime: null };
      },
    });
    assert.equal(outcome.outcome, 'confirmed');
  });

  it('does not call Notion for an invite state change when write-back is off', async () => {
    let called = 0;
    const outcome = await runOutboxAttempt({
      item: item({
        kind: 'revert',
        notionPageId: 'page-1',
        properties: { 'Portal Access': 'Disabled' },
      }),
      nowMs: 0,
      writebackEnabled: false,
      actor: 'system',
      search: async () => {
        called += 1;
        return [];
      },
      write: async () => {
        called += 1;
        return { ok: true, status: 200, notionPageId: 'page-1' };
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

  it('does not insert or write when write-back is off', async () => {
    assert.deepEqual(planIdempotentEnqueue(null, false), {
      action: 'noop',
      error: WRITEBACK_OFF_ERROR,
    });
    let called = 0;
    const outcome = await runProjectCreateAttempt({
      item: item({
        kind: 'project-create',
        database: 'projects',
        properties: {
          Name: 'Spring menu',
          Client: ['client-page'],
          'Publish to Warehaus': true,
          Archive: false,
          Source: 'portal',
          'External ID': 'wh_prj_menu',
        },
      }),
      nowMs: 0,
      writebackEnabled: false,
      projectCreateEnabled: true,
      search: async () => {
        called += 1;
        return [];
      },
      create: async () => {
        called += 1;
        return { ok: true, status: 200, notionPageId: 'page' };
      },
    });
    assert.equal(outcome.outcome, 'held');
    assert.equal(called, 0);
    assert.equal(auditEventForOutcome(outcome), null);
  });

  it('does not write the same idempotency key twice', async () => {
    const expected = '2026-10-01T00:00:00.000Z';
    const key = taskStatusIdempotencyKey('page-1', 'Done', expected);
    assert.equal(planIdempotentEnqueue(null, true).action, 'insert');
    assert.equal(planIdempotentEnqueue({ status: 'queued' }, true).action, 'reuse');
    assert.equal(planIdempotentEnqueue({ status: 'done', notionPageId: 'page-1' }, true).action, 'reuse');

    let writes = 0;
    const statusItem = item({
      idempotencyKey: key,
      kind: 'task-status',
      database: 'tasks',
      notionPageId: 'page-1',
      expectedLastEditedTime: expected,
      properties: { Status: 'Done' },
    });
    const write = async () => {
      writes += 1;
      return { ok: true, status: 200, notionPageId: 'page-1', lastEditedTime: expected };
    };
    const first = await runOutboxAttempt({
      item: statusItem,
      nowMs: 0,
      writebackEnabled: true,
      actor: 'staff',
      search: async () => [],
      readPage: async () => ({ ok: true, lastEditedTime: expected }),
      write,
    });
    assert.equal(first.outcome, 'confirmed');
    assert.equal(auditEventForOutcome(first)?.action, 'outbox.confirmed');
    const second = await runOutboxAttempt({
      item: { ...statusItem, status: 'done' },
      nowMs: 1_000,
      writebackEnabled: true,
      actor: 'staff',
      search: async () => [],
      readPage: async () => ({ ok: true, lastEditedTime: expected }),
      write,
    });
    assert.equal(second.outcome, 'wait');
    assert.equal(writes, 1);
  });

  it('conflicts when Notion changed since the last read and does not write', async () => {
    let wrote = false;
    const outcome = await runOutboxAttempt({
      item: item({
        kind: 'task-status',
        database: 'tasks',
        notionPageId: 'page-1',
        expectedLastEditedTime: '2026-10-01T00:00:00.000Z',
        properties: { Status: 'Done' },
      }),
      nowMs: 0,
      writebackEnabled: true,
      actor: 'staff',
      search: async () => [],
      readPage: async () => ({ ok: true, lastEditedTime: '2026-10-02T00:00:00.000Z' }),
      write: async () => {
        wrote = true;
        return { ok: true, status: 200, notionPageId: 'page-1' };
      },
    });
    assert.equal(outcome.outcome, 'conflict');
    assert.equal(wrote, false);
    assert.equal(auditEventForOutcome(outcome)?.action, 'outbox.conflict');
  });

  it('writes a task status when the re-read matches', async () => {
    const outcome = await runOutboxAttempt({
      item: item({
        kind: 'task-status',
        database: 'tasks',
        notionPageId: 'page-1',
        expectedLastEditedTime: '2026-10-01T00:00:00.000Z',
        properties: { Status: 'In Progress' },
      }),
      nowMs: 0,
      writebackEnabled: true,
      actor: 'staff',
      search: async () => {
        throw new Error('search should not run');
      },
      readPage: async () => ({ ok: true, lastEditedTime: '2026-10-01T00:00:00.000Z' }),
      write: async (request) => {
        assert.equal(request.method, 'update');
        assert.deepEqual(request.properties, { Status: 'In Progress' });
        return { ok: true, status: 200, notionPageId: 'page-1', lastEditedTime: '2026-10-01T00:01:00.000Z' };
      },
    });
    assert.equal(outcome.outcome, 'confirmed');
  });
});
