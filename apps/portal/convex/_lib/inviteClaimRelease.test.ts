import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { releaseHeldToken } from '../invites';
import { claim, release } from '../sync/outbox';
import { memoryCtx, type MemoryCtx } from './memoryCtx.testkit';
import { seedOrg } from './seedRows.testkit';

type Fields = Record<string, unknown>;

function seedOutbox(t: MemoryCtx, orgId: string, fields: Fields) {
  return t.seed('notionOutbox', {
    idempotencyKey: `key-${t.rows('notionOutbox').length + 1}`,
    kind: 'setInviteState',
    orgId,
    database: 'contacts',
    notionPageId: 'contact-page',
    payload: '{}',
    actor: 'system',
    status: 'queued',
    attempts: 0,
    nextAttemptAt: 0,
    createdAt: 1,
    ...fields,
  });
}

function seedToken(t: MemoryCtx, orgId: string, fields: Fields) {
  return t.seed('inviteTokens', {
    orgId,
    contactNotionPageId: 'contact-page',
    clientNotionPageId: 'client-page',
    emailNormalized: 'ada@northwind.test',
    tokenHash: `hash-${t.rows('inviteTokens').length + 1}`,
    status: 'live',
    expiresAt: Date.now() + 86_400_000,
    createdAt: 1,
    attempt: 0,
    ...fields,
  });
}

describe('invite outbox claim and release', () => {
  it('claims an invite write once, then releases it back to the queue', async () => {
    const t = memoryCtx();
    const orgId = seedOrg(t);
    const id = seedOutbox(t, orgId, {
      payload: JSON.stringify({ tokenId: 'token-1', properties: { 'Invite Status': 'Accepted' } }),
    });

    const first = await t.call(claim, { id });
    assert.deepEqual(first, { claimed: true });
    assert.equal(t.row(id)?.status, 'inflight');
    assert.equal(typeof t.row(id)?.claimedAt, 'number');

    const second = await t.call(claim, { id });
    assert.deepEqual(second, { claimed: false, reason: 'inflight' });

    const missing = await t.call(claim, { id: 'notionOutbox:999' });
    assert.deepEqual(missing, { claimed: false, reason: 'missing' });

    await t.call(release, { id });
    assert.equal(t.row(id)?.status, 'queued');
    assert.equal(t.row(id)?.claimedAt, undefined);

    await t.call(release, { id });
    assert.equal(t.row(id)?.status, 'queued');

    await t.db.patch(id, { status: 'done', resultJson: '{"issued":true}' });
    const done = await t.call<{ claimed: boolean; reason: string }>(claim, { id });
    assert.equal(done.claimed, false);
    assert.equal(done.reason, 'done');
  });

  it('releases a held invite token after a dead write and leaves a live token alone', async () => {
    const t = memoryCtx();
    const orgId = seedOrg(t);
    const heldToken = seedToken(t, orgId, { status: 'pending' });
    const liveToken = seedToken(t, orgId, { status: 'live' });
    const held = seedOutbox(t, orgId, { status: 'dead', payload: JSON.stringify({ tokenId: heldToken }) });
    const other = seedOutbox(t, orgId, {
      kind: 'createInvite',
      status: 'dead',
      payload: JSON.stringify({ tokenId: liveToken }),
    });

    await t.call(releaseHeldToken, { outboxId: held });
    assert.equal(t.row(heldToken)?.status, 'live');
    assert.equal(t.row(heldToken)?.attempt, 1);

    await t.call(releaseHeldToken, { outboxId: other });
    assert.equal(t.row(liveToken)?.status, 'live');
    assert.equal(t.row(liveToken)?.attempt, 0);

    await t.call(releaseHeldToken, { outboxId: held });
    assert.equal(t.row(heldToken)?.attempt, 1);
  });
});
