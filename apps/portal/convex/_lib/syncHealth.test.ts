import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getSyncHealth } from '../portalData';
import { PortalAuthError } from './identity';

type Row = Record<string, unknown> & { _id: string };

class EqBuilder {
  private eqs: Array<[string, unknown]> = [];
  eq(field: string, value: unknown): this {
    this.eqs.push([field, value]);
    return this;
  }
  matches(row: Row): boolean {
    return this.eqs.every(([field, value]) => row[field] === value);
  }
}

function memoryDb(tables: Record<string, Row[]>) {
  return {
    async get(id: string) {
      for (const rows of Object.values(tables)) {
        const found = rows.find((row) => row._id === id);
        if (found) return found;
      }
      return null;
    },
    query(table: string) {
      const rows = tables[table] ?? [];
      const chain = (list: Row[]) => ({
        order(direction: string) {
          const next = direction === 'desc' ? [...list].reverse() : [...list];
          return chain(next);
        },
        withIndex(_name: string, build?: (q: EqBuilder) => EqBuilder) {
          const matched = build ? list.filter((row) => build(new EqBuilder()).matches(row)) : list;
          return chain(matched);
        },
        collect: async () => list,
        unique: async () => {
          if (list.length > 1) throw new Error('Expected a unique row');
          return list[0] ?? null;
        },
        take: async (n: number) => list.slice(0, n),
      });
      return chain(rows);
    },
  };
}

const now = Date.now();
const day = 24 * 60 * 60 * 1000;

const tables: Record<string, Row[]> = {
  clients: [
    {
      _id: 'org-north',
      companyName: 'Northwind',
      slug: 'northwind',
      portalAccess: 'Enabled',
    },
  ],
  contacts: [
    {
      _id: 'contact-client',
      orgId: 'org-north',
      name: 'Ada Client',
      email: 'ada@northwind.test',
      authUserId: 'auth-client',
      role: 'Client Member',
      portalAccess: 'Enabled',
    },
    {
      _id: 'contact-staff',
      orgId: 'org-north',
      name: 'Maya Internal',
      email: 'maya@warehaus.studio',
      authUserId: 'auth-staff',
      role: 'Warehaus Staff',
      portalAccess: 'Enabled',
    },
  ],
  syncMeta: [
    {
      _id: 'sync-pull',
      key: 'notion-pull',
      lastSyncedAt: now - 60_000,
      lastError: null,
    },
  ],
  notionOutbox: [
    {
      _id: 'out-queued',
      status: 'queued',
      createdAt: now - 5_000,
      nextAttemptAt: now,
      payload: 'secret-queued-payload',
    },
    {
      _id: 'out-failed-recent',
      status: 'failed',
      createdAt: now - 60 * 60 * 1000,
      nextAttemptAt: now,
      payload: 'secret-failed-payload',
    },
    {
      _id: 'out-failed-old',
      status: 'failed',
      createdAt: now - day - 60_000,
      nextAttemptAt: now - day,
      payload: 'secret-old-payload',
    },
    {
      _id: 'out-done',
      status: 'done',
      createdAt: now - 1000,
      nextAttemptAt: now,
      payload: 'secret-done-payload',
    },
  ],
  notices: [
    {
      _id: 'notice-sync',
      audience: 'staff',
      message: 'Homepage wireframes needs staff attention',
      createdAt: now,
      edgeCase: 'sync',
    },
    {
      _id: 'notice-other',
      audience: 'staff',
      message: 'Invite sent',
      createdAt: now - 1000,
      edgeCase: 'invite',
    },
  ],
};

const clientCtx = {
  auth: { getUserIdentity: async () => ({ subject: 'auth-client' }) },
  db: memoryDb(tables),
};

const staffCtx = {
  auth: { getUserIdentity: async () => ({ subject: 'auth-staff' }) },
  db: memoryDb(tables),
};

type Handler = (ctx: typeof clientCtx, args: Record<string, unknown>) => Promise<unknown>;

function run(ctx: typeof clientCtx) {
  return (getSyncHealth as unknown as { _handler: Handler })._handler(ctx, {});
}

describe('getSyncHealth', () => {
  it('rejects a client identity and lets staff read counts', async () => {
    await assert.rejects(run(clientCtx), (err: unknown) => {
      assert.ok(err instanceof PortalAuthError);
      assert.equal(err.message, 'Staff role required');
      return true;
    });

    const result = await run(staffCtx) as {
      pull: { lastSyncedAt: string | null; lastError: string | null };
      writebackEnabled: boolean;
      outbox: {
        counts: { queued: number; inflight: number; failed: number; dead: number; conflict: number };
        oldestCreatedAt: number | null;
      };
      notices: Array<{ message: string }>;
    };
    assert.equal(result.writebackEnabled, false);
    assert.equal(result.pull.lastError, null);
    assert.equal(result.outbox.counts.queued, 1);
    assert.equal(result.outbox.counts.failed, 1);
    assert.equal(result.outbox.counts.dead, 0);
    assert.equal(result.outbox.oldestCreatedAt, now - 60 * 60 * 1000);
    assert.equal(result.notices.length, 1);
    assert.match(result.notices[0]?.message ?? '', /Homepage wireframes/);
    const encoded = JSON.stringify(result);
    assert.equal(encoded.includes('secret-'), false);
    assert.equal(encoded.includes('payload'), false);
    assert.equal(Array.isArray((result as { outbox?: { length?: number } }).outbox), false);
  });

  it('caps each status instead of returning the row list', async () => {
    const queued = Array.from({ length: 101 }, (_, index) => ({
      _id: `out-cap-${index}`,
      status: 'queued',
      createdAt: now - index,
      nextAttemptAt: now,
      payload: `secret-cap-${index}`,
    }));
    const ctx = {
      auth: staffCtx.auth,
      db: memoryDb({ ...tables, notionOutbox: queued, notices: [] }),
    };
    const result = await run(ctx as typeof clientCtx) as {
      outbox: { counts: { queued: number }; oldestCreatedAt: number | null };
    };
    assert.equal(result.outbox.counts.queued, 100);
    assert.equal(JSON.stringify(result).includes('secret-cap'), false);
  });
});
