import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { accept, decline, issueTokenAfterConfirm, releaseHeldToken, revoke } from '../invites';
import { INVITE_CLIENT_FAILURE, hashInviteToken } from './inviteFlow';

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

class MemoryIndex {
  constructor(private readonly rows: Row[]) {}
  async collect() {
    return this.rows;
  }
  async unique() {
    if (this.rows.length > 1) throw new Error('Expected a unique row');
    return this.rows[0] ?? null;
  }
}

function memoryDb(tables: Record<string, Row[]>) {
  let seq = 1;
  return {
    async get(id: string) {
      for (const rows of Object.values(tables)) {
        const found = rows.find((row) => row._id === id);
        if (found) return found;
      }
      return null;
    },
    async insert(table: string, doc: Record<string, unknown>) {
      const row = { ...doc, _id: `${table}-${seq++}` } as Row;
      (tables[table] ??= []).push(row);
      return row._id;
    },
    async patch(id: string, fields: Record<string, unknown>) {
      for (const rows of Object.values(tables)) {
        const found = rows.find((row) => row._id === id);
        if (found) {
          Object.assign(found, fields);
          return;
        }
      }
    },
    query(table: string) {
      const rows = tables[table] ?? [];
      return {
        withIndex(_name: string, build?: (q: EqBuilder) => EqBuilder) {
          const matched = build ? rows.filter((row) => build(new EqBuilder()).matches(row)) : rows;
          return new MemoryIndex(matched);
        },
        collect: async () => rows,
      };
    },
  };
}

const user = {
  _id: 'user-1',
  id: 'user-1',
  email: 'ada@northwind.test',
  emailVerified: true,
};

function authCtx(subject: string, tables: Record<string, Row[]>, enqueues: Array<Record<string, unknown>>) {
  const db = memoryDb(tables);
  return {
    auth: { getUserIdentity: async () => ({ subject, sessionId: 'sess-1' }) },
    db,
    async runQuery(_ref: unknown, args: { model?: string }) {
      if (args.model === 'session') return { _id: 'sess-1', expiresAt: Date.now() + 60_000 };
      if (args.model === 'user') return user;
      return null;
    },
    async runMutation(_ref: unknown, args: Record<string, unknown>) {
      const outboxId = await db.insert('notionOutbox', {
        status: 'queued',
        kind: args.kind,
        orgId: args.orgId,
        notionPageId: args.notionPageId,
        payload: args.payload,
      });
      enqueues.push({ ...args, outboxId });
      return { ok: true as const, outboxId, duplicate: false };
    },
  };
}

type Handler = (ctx: ReturnType<typeof authCtx>, args: Record<string, unknown>) => Promise<unknown>;

function run(fn: object, ctx: ReturnType<typeof authCtx>, args: Record<string, unknown> = {}) {
  return (fn as { _handler: Handler })._handler(ctx, args);
}

async function tokenRow(id: string, raw: string) {
  return {
    _id: id,
    orgId: 'org-north',
    contactNotionPageId: 'contact-notion',
    clientNotionPageId: 'client-notion',
    emailNormalized: 'ada@northwind.test',
    tokenHash: await hashInviteToken(raw),
    status: 'live',
    expiresAt: Date.now() + 86_400_000,
    createdAt: 1,
    attempt: 0,
  };
}

function baseTables(token: Row): Record<string, Row[]> {
  return {
    clients: [{ _id: 'org-north', slug: 'northwind', portalAccess: 'Enabled', companyName: 'Northwind' }],
    contacts: [
      {
        _id: 'contact-client',
        orgId: 'org-north',
        name: 'Ada Client',
        email: 'ada@northwind.test',
        authUserId: 'user-1',
        role: 'Client Member',
        portalAccess: 'Enabled',
      },
      {
        _id: 'contact-staff',
        orgId: 'org-north',
        name: 'Alex Staff',
        email: 'alex@warehaus.co',
        authUserId: 'auth-staff',
        role: 'Warehaus Staff',
        portalAccess: 'Enabled',
      },
    ],
    inviteTokens: [token],
    notionWriteState: [],
    notionOutbox: [],
    pendingInvites: [],
  };
}

describe('invite accept, decline, and revoke', () => {
  it('holds the token in the same mutation and refuses a second accept', async () => {
    const tables = baseTables(await tokenRow('tok-accept', 'raw-accept'));
    const enqueues: Array<Record<string, unknown>> = [];
    const ctx = authCtx('user-1', tables, enqueues);

    const first = await run(accept, ctx, { token: 'raw-accept' });
    assert.deepEqual(first, { ok: true, status: 'pending' });
    assert.equal(tables.inviteTokens?.[0]?.status, 'pending');
    assert.equal(enqueues.length, 1);

    const second = await run(accept, ctx, { token: 'raw-accept' });
    assert.deepEqual(second, { ok: false, status: 'unusable' });
    assert.equal(tables.inviteTokens?.[0]?.status, 'pending');
    assert.equal(enqueues.length, 1);
  });

  it('puts the token back when the write dies, then marks it used when Notion confirms', async () => {
    const tables = baseTables(await tokenRow('tok-accept', 'raw-accept'));
    const enqueues: Array<Record<string, unknown>> = [];
    const ctx = authCtx('user-1', tables, enqueues);
    await run(accept, ctx, { token: 'raw-accept' });
    const outboxId = enqueues[0]?.outboxId as string;

    await run(releaseHeldToken, ctx, { outboxId });
    assert.equal(tables.inviteTokens?.[0]?.status, 'live');
    assert.equal(tables.inviteTokens?.[0]?.attempt, 1);

    const again = await run(accept, ctx, { token: 'raw-accept' });
    assert.deepEqual(again, { ok: true, status: 'pending' });

    const held = tables.notionOutbox?.find((row) => row._id === enqueues[1]?.outboxId);
    assert.ok(held);
    held.status = 'done';
    held.kind = 'setInviteState';
    await run(issueTokenAfterConfirm, ctx, { outboxId: held._id, notionPageId: 'contact-notion' });
    assert.equal(tables.inviteTokens?.[0]?.status, 'used');

    const after = await run(accept, ctx, { token: 'raw-accept' });
    assert.deepEqual(after, { ok: false, status: 'unusable' });
    assert.equal(tables.inviteTokens?.[0]?.status, 'used');
  });

  it('refuses a second decline and kills the token when Notion confirms', async () => {
    const tables = baseTables(await tokenRow('tok-decline', 'raw-decline'));
    const enqueues: Array<Record<string, unknown>> = [];
    const ctx = authCtx('user-1', tables, enqueues);

    assert.deepEqual(await run(decline, ctx, { token: 'raw-decline' }), { ok: true, status: 'pending' });
    assert.deepEqual(await run(decline, ctx, { token: 'raw-decline' }), { ok: false, status: 'unusable' });
    assert.equal(enqueues.length, 1);

    const held = tables.notionOutbox?.[0];
    assert.ok(held);
    held.status = 'done';
    held.kind = 'setInviteState';
    const payload = JSON.parse(String(held.payload)) as { properties?: Record<string, string> };
    payload.properties = { ...(payload.properties ?? {}), 'Invite Status': 'Declined' };
    held.payload = JSON.stringify(payload);
    await run(issueTokenAfterConfirm, ctx, { outboxId: held._id, notionPageId: 'contact-notion' });
    assert.equal(tables.inviteTokens?.[0]?.status, 'killed');
    assert.deepEqual(await run(accept, ctx, { token: 'raw-decline' }), { ok: false, status: 'unusable' });
  });

  it('refuses a second revoke and kills the token when Notion confirms', async () => {
    const tables = baseTables(await tokenRow('tok-revoke', 'raw-revoke'));
    const enqueues: Array<Record<string, unknown>> = [];
    const ctx = authCtx('auth-staff', tables, enqueues);

    const first = await run(revoke, ctx, { contactNotionPageId: 'contact-notion' });
    assert.deepEqual(first, { ok: true, status: 'pending' });
    assert.equal(tables.inviteTokens?.[0]?.status, 'pending');

    const second = await run(revoke, ctx, { contactNotionPageId: 'contact-notion' });
    assert.deepEqual(second, { ok: false, message: INVITE_CLIENT_FAILURE });
    assert.equal(enqueues.length, 1);

    const held = tables.notionOutbox?.[0];
    assert.ok(held);
    held.status = 'done';
    held.kind = 'setInviteState';
    const payload = JSON.parse(String(held.payload)) as { properties?: Record<string, string> };
    payload.properties = { ...(payload.properties ?? {}), 'Invite Status': 'Revoked' };
    held.payload = JSON.stringify(payload);
    await run(issueTokenAfterConfirm, ctx, { outboxId: held._id, notionPageId: 'contact-notion' });
    assert.equal(tables.inviteTokens?.[0]?.status, 'killed');
  });
});
