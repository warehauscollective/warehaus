import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getSyncHealth } from '../portalData';
import { PortalAuthError } from './identity';
import { memoryCtx, type MemoryCtx } from './memoryCtx.testkit';
import { seedOrg } from './seedRows.testkit';

const now = Date.now();
const day = 24 * 60 * 60 * 1000;

type Health = {
  pull: { lastSyncedAt: string | null; lastError: string | null };
  writebackEnabled: boolean;
  outbox: {
    counts: { queued: number; inflight: number; failed: number; dead: number; conflict: number };
    oldestCreatedAt: number | null;
  };
  notices: Array<{ message: string }>;
  granola: { configured: boolean; lastRunAt: string | null; lastError: string | null };
};

function seedOutbox(t: MemoryCtx, orgId: string, key: string, fields: { status: string; createdAt: number; nextAttemptAt: number; payload: string }) {
  return t.seed('notionOutbox', {
    idempotencyKey: key,
    kind: 'update',
    orgId,
    database: 'tasks',
    actor: 'system',
    attempts: 0,
    ...fields,
  });
}

function world() {
  const t = memoryCtx();
  const orgId = seedOrg(t, { slug: 'northwind', companyName: 'Northwind' });
  t.seed('syncMeta', { key: 'notion-pull', lastSyncedAt: now - 60_000 });
  return { t, orgId };
}

describe('getSyncHealth', () => {
  it('rejects a client identity and lets staff read counts', async () => {
    const { t, orgId } = world();
    seedOutbox(t, orgId, 'out-queued', { status: 'queued', createdAt: now - 5_000, nextAttemptAt: now, payload: 'secret-queued-payload' });
    seedOutbox(t, orgId, 'out-failed-recent', {
      status: 'failed',
      createdAt: now - 60 * 60 * 1000,
      nextAttemptAt: now,
      payload: 'secret-failed-payload',
    });
    seedOutbox(t, orgId, 'out-failed-old', {
      status: 'failed',
      createdAt: now - day - 60_000,
      nextAttemptAt: now - day,
      payload: 'secret-old-payload',
    });
    seedOutbox(t, orgId, 'out-done', { status: 'done', createdAt: now - 1000, nextAttemptAt: now, payload: 'secret-done-payload' });
    t.seed('notices', { orgId, audience: 'staff', message: 'Homepage wireframes needs staff attention', createdAt: now, edgeCase: 'sync' });
    t.seed('notices', { orgId, audience: 'staff', message: 'Invite sent', createdAt: now - 1000, edgeCase: 'invite' });

    await assert.rejects(t.call(getSyncHealth, {}, { as: 'client' }), (err: unknown) => {
      assert.ok(err instanceof PortalAuthError);
      assert.equal(err.message, 'Staff role required');
      return true;
    });

    const result = await t.call<Health>(getSyncHealth, {}, { as: 'staff' });
    assert.equal(result.writebackEnabled, false);
    assert.equal(result.pull.lastError, null);
    assert.equal(result.pull.lastSyncedAt, new Date(now - 60_000).toISOString());
    assert.equal(result.outbox.counts.queued, 1);
    assert.equal(result.outbox.counts.failed, 1);
    assert.equal(result.outbox.counts.dead, 0);
    assert.equal(result.outbox.oldestCreatedAt, now - 60 * 60 * 1000);
    assert.equal(result.notices.length, 1);
    assert.match(result.notices[0]?.message ?? '', /Homepage wireframes/);
    assert.deepEqual(result.granola, { configured: false, lastRunAt: null, lastError: null });
    const encoded = JSON.stringify(result);
    assert.equal(encoded.includes('secret-'), false);
    assert.equal(encoded.includes('payload'), false);
    assert.equal(Array.isArray((result as { outbox?: unknown }).outbox), false);
  });

  it('caps each status instead of returning the row list', async () => {
    const { t, orgId } = world();
    for (let index = 0; index < 101; index += 1) {
      seedOutbox(t, orgId, `out-cap-${index}`, { status: 'queued', createdAt: now - index, nextAttemptAt: now, payload: `secret-cap-${index}` });
    }
    const result = await t.call<Health>(getSyncHealth, {}, { as: 'staff' });
    assert.equal(result.outbox.counts.queued, 100);
    assert.equal(JSON.stringify(result).includes('secret-cap'), false);
    assert.deepEqual(t.reads.unbounded(), []);
    assert.deepEqual(t.reads.unindexed(), []);
  });
});
