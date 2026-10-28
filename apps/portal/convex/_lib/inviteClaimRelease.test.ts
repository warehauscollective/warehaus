import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { releaseHeldToken } from '../invites';
import { claim, release } from '../sync/outbox';

type Row = Record<string, unknown> & { _id: string };

function memoryDb(tables: Record<string, Row[]>) {
  return {
    async get(id: string) {
      for (const rows of Object.values(tables)) {
        const found = rows.find((row) => row._id === id);
        if (found) return found;
      }
      return null;
    },
    async patch(id: string, patch: Record<string, unknown>) {
      for (const rows of Object.values(tables)) {
        const row = rows.find((item) => item._id === id);
        if (!row) continue;
        for (const [key, value] of Object.entries(patch)) {
          if (value === undefined) delete row[key];
          else row[key] = value;
        }
        return;
      }
    },
  };
}

type Handler = (
  ctx: { db: ReturnType<typeof memoryDb> },
  args: Record<string, unknown>,
) => Promise<unknown>;

function run(fn: object, ctx: { db: ReturnType<typeof memoryDb> }, args: Record<string, unknown>) {
  return (fn as { _handler: Handler })._handler(ctx, args);
}

describe('invite outbox claim and release', () => {
  it('claims an invite write once, then releases it back to the queue', async () => {
    const tables: Record<string, Row[]> = {
      notionOutbox: [
        {
          _id: 'outbox-invite',
          kind: 'setInviteState',
          status: 'queued',
          orgId: 'org-1',
          database: 'contacts',
          notionPageId: 'contact-page',
          payload: JSON.stringify({ tokenId: 'token-1', properties: { 'Invite Status': 'Accepted' } }),
          actor: 'system',
          attempts: 0,
          createdAt: 1,
        },
      ],
      inviteTokens: [],
    };
    const ctx = { db: memoryDb(tables) };

    const first = await run(claim, ctx, { id: 'outbox-invite' });
    assert.deepEqual(first, { claimed: true });
    assert.equal(tables.notionOutbox[0]?.status, 'inflight');
    assert.equal(typeof tables.notionOutbox[0]?.claimedAt, 'number');

    const second = await run(claim, ctx, { id: 'outbox-invite' });
    assert.deepEqual(second, { claimed: false, reason: 'inflight' });

    const missing = await run(claim, ctx, { id: 'missing' });
    assert.deepEqual(missing, { claimed: false, reason: 'missing' });

    await run(release, ctx, { id: 'outbox-invite' });
    assert.equal(tables.notionOutbox[0]?.status, 'queued');
    assert.equal(tables.notionOutbox[0]?.claimedAt, undefined);

    await run(release, ctx, { id: 'outbox-invite' });
    assert.equal(tables.notionOutbox[0]?.status, 'queued');

    tables.notionOutbox[0]!.status = 'done';
    tables.notionOutbox[0]!.resultJson = '{"issued":true}';
    const done = await run(claim, ctx, { id: 'outbox-invite' });
    assert.equal((done as { claimed: boolean }).claimed, false);
    assert.equal((done as { reason: string }).reason, 'done');
  });

  it('releases a held invite token after a dead write and leaves a live token alone', async () => {
    const tables: Record<string, Row[]> = {
      notionOutbox: [
        {
          _id: 'outbox-held',
          kind: 'setInviteState',
          status: 'dead',
          orgId: 'org-1',
          payload: JSON.stringify({ tokenId: 'token-1' }),
        },
        {
          _id: 'outbox-other',
          kind: 'createInvite',
          status: 'dead',
          orgId: 'org-1',
          payload: JSON.stringify({ tokenId: 'token-2' }),
        },
      ],
      inviteTokens: [
        { _id: 'token-1', status: 'pending', attempt: 0, orgId: 'org-1' },
        { _id: 'token-2', status: 'live', attempt: 0, orgId: 'org-1' },
      ],
    };
    const ctx = { db: memoryDb(tables) };

    await run(releaseHeldToken, ctx, { outboxId: 'outbox-held' });
    assert.equal(tables.inviteTokens[0]?.status, 'live');
    assert.equal(tables.inviteTokens[0]?.attempt, 1);

    await run(releaseHeldToken, ctx, { outboxId: 'outbox-other' });
    assert.equal(tables.inviteTokens[1]?.status, 'live');
    assert.equal(tables.inviteTokens[1]?.attempt, 0);

    await run(releaseHeldToken, ctx, { outboxId: 'outbox-held' });
    assert.equal(tables.inviteTokens[0]?.attempt, 1);
  });
});
