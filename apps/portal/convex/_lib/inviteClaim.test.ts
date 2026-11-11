import assert from 'node:assert/strict';
import { ConvexError } from 'convex/values';
import { describe, it } from 'node:test';
import { applyContactRead } from '../invitesSync';
import { enqueue } from '../sync/outbox';
import { grantInviteSignupFromHook, takeInviteSignupFromHook } from '../auth';
import {
  accept,
  create,
  decline,
  expireDue,
  grantSignupPermit,
  issueTokenAfterConfirm,
  listTeam,
  releaseHeldToken,
  remove,
  revoke,
  takeSignupPermit,
} from '../invites';
import { decideContactSync, isOrgVisibleToClients } from '@warehaus/portal-sync';
import { pendingInviteSyncConceal } from '../sync/pull';
import { selectContactForJoin } from './contactJoin';
import { INVITE_CLIENT_FAILURE, hashInviteToken, teamInviteActions } from './inviteFlow';

const REAL_WAREHAUS_PAGE = '3b1ffd60-316b-813f-987b-f9912477dbc0';

/** The map `resolveIds` stores and `pullAll` passes to `decideContactSync`. */
function clientEnabledForPull(clients: Row[]): (id: string | undefined) => boolean {
  const enabled: Record<string, boolean> = {};
  for (const client of clients) {
    if (typeof client.notionPageId !== 'string') continue;
    const portalAccess = client.portalAccess === 'Enabled' ? 'Enabled' : 'Disabled';
    enabled[client.notionPageId] = isOrgVisibleToClients({
      portalAccess,
      syncHiddenAt: typeof client.syncHiddenAt === 'number' ? client.syncHiddenAt : null,
    });
  }
  return (id) => (id ? enabled[id] === true : false);
}

type Row = Record<string, unknown> & { _id: string };

class EqBuilder {
  private preds: Array<(row: Row) => boolean> = [];
  eq(field: string, value: unknown): this {
    this.preds.push((row) => row[field] === value);
    return this;
  }
  gte(field: string, value: number): this {
    this.preds.push((row) => typeof row[field] === 'number' && (row[field] as number) >= value);
    return this;
  }
  lt(field: string, value: number): this {
    this.preds.push((row) => typeof row[field] === 'number' && (row[field] as number) < value);
    return this;
  }
  matches(row: Row): boolean {
    return this.preds.every((pred) => pred(row));
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
  async take(count: number) {
    return this.rows.slice(0, count);
  }
}

const seqByTables = new WeakMap<Record<string, Row[]>, { n: number }>();

function memoryDb(tables: Record<string, Row[]>) {
  const seq = seqByTables.get(tables) ?? { n: 1 };
  seqByTables.set(tables, seq);
  return {
    async get(id: string) {
      for (const rows of Object.values(tables)) {
        const found = rows.find((row) => row._id === id);
        if (found) return found;
      }
      return null;
    },
    async insert(table: string, doc: Record<string, unknown>) {
      const row = { ...doc, _id: `${table}-${seq.n++}` } as Row;
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
    async delete(id: string) {
      for (const rows of Object.values(tables)) {
        const index = rows.findIndex((row) => row._id === id);
        if (index >= 0) {
          rows.splice(index, 1);
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
  email: 'ada@northwind.test',
  emailVerified: true,
};

const newStaffUser = {
  _id: 'user-new',
  email: 'new.staff@warehaus.co',
  emailVerified: true,
};

function readCtx(tables: Record<string, Row[]>) {
  const db = memoryDb(tables);
  const ctx = {
    auth: { getUserIdentity: async () => ({ subject: 'auth-staff', sessionId: 'sess-1' }) },
    db,
    scheduler: { runAfter: async () => undefined },
    async runQuery() {
      return null;
    },
    async runMutation(_ref: unknown, args: Record<string, unknown>) {
      const handler = enqueue as unknown as {
        _handler: (ctx: unknown, args: Record<string, unknown>) => Promise<{ ok: boolean; duplicate?: boolean }>;
      };
      return handler._handler(ctx, args);
    },
  };
  return ctx as unknown as ReturnType<typeof authCtx>;
}

function legacyRead(overrides: Partial<Parameters<typeof decideContactSync>[0]> = {}) {
  return decideContactSync({
    portalAccess: 'Disabled',
    inviteStatus: undefined,
    prevInviteStatus: null,
    source: 'portal',
    clientNotionId: REAL_WAREHAUS_PAGE,
    clientEnabled: () => true,
    liveToken: { clientNotionPageId: REAL_WAREHAUS_PAGE },
    verifiedAcceptance: false,
    ...overrides,
  });
}

function legacyTables(): Record<string, Row[]> {
  return {
    pendingInvites: [],
    inviteTokens: [
      {
        _id: 'tok-legacy',
        status: 'live',
        emailNormalized: 'legacy@warehaus.co',
        contactNotionPageId: 'page-legacy',
        clientNotionPageId: REAL_WAREHAUS_PAGE,
        expiresAt: Date.now() + 86_400_000,
      },
    ],
    notionOutbox: [],
    notionWriteState: [],
    auditEvents: [],
    notices: [],
  };
}

function legacyArgs(decision: ReturnType<typeof decideContactSync>, extra: Record<string, unknown> = {}) {
  return {
    notionPageId: 'page-legacy',
    orgId: 'org-real',
    name: 'Legacy Staff',
    email: 'legacy@warehaus.co',
    role: 'Warehaus Staff',
    source: 'portal',
    placement: decision.placement,
    inviteStatus: decision.effective.inviteStatus,
    actionsJson: JSON.stringify(decision.actions),
    observedJson: '{}',
    ...extra,
  };
}

function authCtx(
  subject: string,
  tables: Record<string, Row[]>,
  enqueues: Array<Record<string, unknown>>,
  enqueueOk = true,
  authUser: Row = user,
  accounts: Row[] = [],
) {
  const db = memoryDb(tables);
  const known = [authUser, ...accounts];
  return {
    auth: { getUserIdentity: async () => ({ subject, sessionId: 'sess-1' }) },
    db,
    async runQuery(_ref: unknown, args: { model?: string; where?: Array<{ field?: string; value?: unknown }> }) {
      if (args.model === 'session') return { _id: 'sess-1', expiresAt: Date.now() + 60_000 };
      if (args.model === 'user') {
        const where = args.where ?? [];
        const id = where.find((item) => item.field === '_id')?.value;
        if (id != null) return known.find((row) => row._id === id) ?? null;
        const email = where.find((item) => item.field === 'email')?.value;
        if (email != null) return known.find((row) => row.email === email) ?? null;
        return authUser;
      }
      return null;
    },
    async runMutation(_ref: unknown, args: Record<string, unknown>) {
      if (!enqueueOk) {
        return { ok: false as const, error: 'Write-back is off. Nothing was sent to Notion.' };
      }
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
  return (fn as { _handler: Handler })._handler(ctx, args) as Promise<{
    ok: boolean;
    status?: string;
    message?: string;
  }>;
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

function asStaffInvite(tables: Record<string, Row[]>, token: Row) {
  tables.clients?.push({
    _id: 'org-wh',
    slug: 'warehaus-internal',
    notionPageId: 'wh-notion',
    portalAccess: 'Enabled',
    companyName: 'Warehaus',
  });
  token.orgId = 'org-wh';
  token.emailNormalized = newStaffUser.email;
  tables.pendingInvites = [
    {
      _id: 'pending-staff',
      orgId: 'org-wh',
      notionPageId: String(token.contactNotionPageId),
      name: 'New Staff',
      email: newStaffUser.email,
      role: 'Warehaus Staff',
      inviteStatus: 'Pending',
      source: 'portal',
      lastSyncedAt: 1,
    },
  ];
  return tables;
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
    const token = await tokenRow('tok-accept', 'raw-accept');
    const tables = asStaffInvite(baseTables(token), token);
    const enqueues: Array<Record<string, unknown>> = [];
    const ctx = authCtx('user-new', tables, enqueues, true, newStaffUser);
    assert.equal('id' in newStaffUser, false);

    const first = await run(accept, ctx, { token: 'raw-accept' });
    assert.deepEqual(first, { ok: true, status: 'pending' });
    assert.equal(tables.inviteTokens?.[0]?.status, 'pending');
    assert.equal(enqueues.length, 1);
    const payload = JSON.parse(String(enqueues[0]?.payload)) as { authUserId?: string; staffLink?: { role?: string } };
    assert.equal(payload.authUserId, newStaffUser._id);
    assert.equal(payload.staffLink?.role, 'Warehaus Staff');

    const second = await run(accept, ctx, { token: 'raw-accept' });
    assert.equal(second.ok, false);
    assert.equal(second.status, 'unusable');
    assert.equal(tables.inviteTokens?.[0]?.status, 'pending');
    assert.equal(enqueues.length, 1);
  });

  it('puts the token back when the write dies, then marks it used when Notion confirms', async () => {
    const token = await tokenRow('tok-accept', 'raw-accept');
    const tables = asStaffInvite(baseTables(token), token);
    const enqueues: Array<Record<string, unknown>> = [];
    const ctx = authCtx('user-new', tables, enqueues, true, newStaffUser);
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
    assert.equal(after.ok, false);
    assert.equal(after.status, 'used');
    assert.match(String(after.message), /already used/);
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
    assert.deepEqual(await run(accept, ctx, { token: 'raw-decline' }), {
      ok: false,
      status: 'revoked',
      message: 'This invite was revoked.',
    });
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

  it('enqueues a portal-access disable for a client person and refuses staff', async () => {
    const tables = baseTables(await tokenRow('tok-remove', 'raw-remove'));
    tables.contacts?.push({
      _id: 'contact-member',
      orgId: 'org-north',
      notionPageId: 'member-notion',
      name: 'Bea North',
      email: 'bea@northwind.test',
      role: 'Client Admin',
      portalAccess: 'Enabled',
    });
    const staff = tables.contacts?.find((row) => row._id === 'contact-staff');
    if (staff) staff.notionPageId = 'staff-notion';
    const enqueues: Array<Record<string, unknown>> = [];
    const ctx = authCtx('auth-staff', tables, enqueues);

    const refused = await run(remove, ctx, { contactNotionPageId: 'staff-notion', requestId: 'req-staff' });
    assert.deepEqual(refused, { ok: false, message: 'You cannot remove this person' });
    assert.equal(enqueues.length, 0);

    const queued = await run(remove, ctx, { contactNotionPageId: 'member-notion', requestId: 'req-1' });
    assert.deepEqual(queued, { ok: true, status: 'pending', message: 'Removal pending' });
    assert.equal(enqueues.length, 1);
    assert.equal(enqueues[0]?.kind, 'setInviteState');
    assert.equal(enqueues[0]?.database, 'contacts');
    assert.equal(enqueues[0]?.notionPageId, 'member-notion');
    assert.equal(enqueues[0]?.idempotencyKey, 'state:member-notion:Disabled:req-1');
    const payload = JSON.parse(String(enqueues[0]?.payload)) as { properties?: Record<string, string> };
    assert.equal(payload.properties?.['Portal Access'], 'Disabled');
    assert.equal(tables.inviteTokens?.[0]?.status, 'live');
  });

  it('does not enqueue a removal when write-back is off', async () => {
    const tables = baseTables(await tokenRow('tok-remove-off', 'raw-remove-off'));
    tables.contacts?.push({
      _id: 'contact-member',
      orgId: 'org-north',
      notionPageId: 'member-notion',
      name: 'Bea North',
      email: 'bea@northwind.test',
      role: 'Client Member',
      portalAccess: 'Enabled',
    });
    const enqueues: Array<Record<string, unknown>> = [];
    const ctx = authCtx('auth-staff', tables, enqueues, false);
    const result = await run(remove, ctx, { contactNotionPageId: 'member-notion', requestId: 'req-off' });
    assert.deepEqual(result, { ok: false, message: 'Write-back is off. Nothing was sent to Notion.' });
    assert.equal(enqueues.length, 0);
  });

  it('refuses accept unless the invite is Warehaus Staff on the internal org', async () => {
    const token = await tokenRow('tok-client', 'raw-client');
    const tables = baseTables(token);
    tables.pendingInvites = [
      {
        _id: 'pending-client',
        orgId: 'org-north',
        notionPageId: 'contact-notion',
        name: 'Ada Client',
        email: 'ada@northwind.test',
        role: 'Client Member',
        inviteStatus: 'Pending',
        source: 'portal',
        lastSyncedAt: 1,
      },
    ];
    const enqueues: Array<Record<string, unknown>> = [];
    const ctx = authCtx('user-1', tables, enqueues);
    const refused = await run(accept, ctx, { token: 'raw-client' });
    assert.equal(refused.ok, false);
    assert.equal(refused.status, 'unusable');
    assert.equal(tables.inviteTokens?.[0]?.status, 'live');
    assert.equal(enqueues.length, 0);
  });

  it('does not enqueue a staff invite when the Warehaus page id is a seed id', async () => {
    const previousWriteback = process.env.NOTION_WRITEBACK_ENABLED;
    const previousEmail = process.env.INVITE_EMAIL_ENABLED;
    const previousUrl = process.env.PORTAL_PUBLIC_URL;
    process.env.NOTION_WRITEBACK_ENABLED = 'true';
    process.env.INVITE_EMAIL_ENABLED = 'true';
    process.env.PORTAL_PUBLIC_URL = 'http://localhost:3100';
    try {
      const tables = baseTables(await tokenRow('tok-seed', 'raw-seed'));
      tables.clients?.push({
        _id: 'org-wh',
        slug: 'warehaus-internal',
        notionPageId: 'seed-warehaus-org',
        portalAccess: 'Enabled',
        companyName: 'Warehaus',
      });
      const enqueues: Array<Record<string, unknown>> = [];
      const tokensBefore = tables.inviteTokens?.length ?? 0;
      const contactsBefore = tables.contacts?.length ?? 0;
      const created = await run(create, authCtx('auth-staff', tables, enqueues), {
        name: 'New Staff',
        email: 'new.staff@warehaus.co',
        requestId: 'req-seed',
      });
      assert.equal(created.ok, false);
      assert.match(created.message ?? '', /seed-warehaus-org/);
      assert.match(created.message ?? '', /Nothing was queued/);
      assert.equal(enqueues.length, 0);
      assert.equal(tables.inviteTokens?.length, tokensBefore);
      assert.equal(tables.contacts?.length, contactsBefore);
      assert.equal(tables.pendingInvites?.length ?? 0, 0);
      assert.equal(
        tables.contacts?.some((row) => row.email === 'new.staff@warehaus.co'),
        false,
      );
      assert.equal(tables.notices?.length, 1);
      assert.match(String(tables.notices?.[0]?.message), /Nothing was queued/);
    } finally {
      process.env.NOTION_WRITEBACK_ENABLED = previousWriteback;
      process.env.INVITE_EMAIL_ENABLED = previousEmail;
      process.env.PORTAL_PUBLIC_URL = previousUrl;
    }
  });

  it('does not queue an invite when the holder row is portal-disabled', async () => {
    const previousWriteback = process.env.NOTION_WRITEBACK_ENABLED;
    const previousEmail = process.env.INVITE_EMAIL_ENABLED;
    const previousUrl = process.env.PORTAL_PUBLIC_URL;
    process.env.NOTION_WRITEBACK_ENABLED = 'true';
    process.env.INVITE_EMAIL_ENABLED = 'true';
    process.env.PORTAL_PUBLIC_URL = 'http://localhost:3100';
    try {
      const tables = baseTables(await tokenRow('tok-disabled', 'raw-disabled'));
      tables.clients?.push(
        {
          _id: 'org-seed',
          slug: 'warehaus-internal',
          notionPageId: 'seed-warehaus-org',
          portalAccess: 'Enabled',
          companyName: 'Warehaus (Internal)',
        },
        {
          _id: 'org-real',
          slug: 'warehaus',
          notionPageId: REAL_WAREHAUS_PAGE,
          portalAccess: 'Disabled',
          companyName: 'Warehaus',
        },
      );
      const enqueues: Array<Record<string, unknown>> = [];
      const tokensBefore = tables.inviteTokens?.length ?? 0;
      const created = await run(create, authCtx('auth-staff', tables, enqueues), {
        name: 'New Staff',
        email: 'disabled.holder@warehaus.co',
        requestId: 'req-disabled',
      });
      assert.equal(created.ok, false);
      assert.match(created.message ?? '', /portal access is disabled/);
      assert.match(created.message ?? '', /Nothing was queued/);
      assert.equal(enqueues.length, 0);
      assert.equal(tables.inviteTokens?.length, tokensBefore);
      assert.equal(tables.pendingInvites?.some((row) => row.email === 'disabled.holder@warehaus.co'), false);
      assert.equal(tables.notices?.length, 1);
      assert.match(String(tables.notices?.[0]?.message), /Nothing was queued/);
    } finally {
      if (previousWriteback === undefined) delete process.env.NOTION_WRITEBACK_ENABLED;
      else process.env.NOTION_WRITEBACK_ENABLED = previousWriteback;
      if (previousEmail === undefined) delete process.env.INVITE_EMAIL_ENABLED;
      else process.env.INVITE_EMAIL_ENABLED = previousEmail;
      if (previousUrl === undefined) delete process.env.PORTAL_PUBLIC_URL;
      else process.env.PORTAL_PUBLIC_URL = previousUrl;
    }
  });

  it('does not queue an invite when the holder row is hidden from sync', async () => {
    const previousWriteback = process.env.NOTION_WRITEBACK_ENABLED;
    const previousEmail = process.env.INVITE_EMAIL_ENABLED;
    const previousUrl = process.env.PORTAL_PUBLIC_URL;
    process.env.NOTION_WRITEBACK_ENABLED = 'true';
    process.env.INVITE_EMAIL_ENABLED = 'true';
    process.env.PORTAL_PUBLIC_URL = 'http://localhost:3100';
    try {
      const tables = baseTables(await tokenRow('tok-hidden', 'raw-hidden'));
      tables.clients?.push({
        _id: 'org-real',
        slug: 'warehaus',
        notionPageId: REAL_WAREHAUS_PAGE,
        portalAccess: 'Enabled',
        syncHiddenAt: 1,
        companyName: 'Warehaus',
      });
      const enqueues: Array<Record<string, unknown>> = [];
      const created = await run(create, authCtx('auth-staff', tables, enqueues), {
        name: 'New Staff',
        email: 'hidden.holder@warehaus.co',
        requestId: 'req-hidden',
      });
      assert.equal(created.ok, false);
      assert.match(created.message ?? '', /hidden from sync/);
      assert.match(created.message ?? '', /Nothing was queued/);
      assert.equal(enqueues.length, 0);
      assert.equal(tables.pendingInvites?.some((row) => row.email === 'hidden.holder@warehaus.co'), false);
      assert.equal(tables.contacts?.some((row) => row.email === 'hidden.holder@warehaus.co'), false);
      assert.equal(tables.notices?.length, 1);
    } finally {
      if (previousWriteback === undefined) delete process.env.NOTION_WRITEBACK_ENABLED;
      else process.env.NOTION_WRITEBACK_ENABLED = previousWriteback;
      if (previousEmail === undefined) delete process.env.INVITE_EMAIL_ENABLED;
      else process.env.INVITE_EMAIL_ENABLED = previousEmail;
      if (previousUrl === undefined) delete process.env.PORTAL_PUBLIC_URL;
      else process.env.PORTAL_PUBLIC_URL = previousUrl;
    }
  });

  it('keeps a legacy pending invite whose Notion Invite Status is empty and backfills it', async () => {
    const previous = process.env.NOTION_WRITEBACK_ENABLED;
    process.env.NOTION_WRITEBACK_ENABLED = 'true';
    try {
      const decision = decideContactSync({
        portalAccess: 'Disabled',
        inviteStatus: undefined,
        prevInviteStatus: null,
        source: 'portal',
        clientNotionId: REAL_WAREHAUS_PAGE,
        clientEnabled: () => true,
        liveToken: { clientNotionPageId: REAL_WAREHAUS_PAGE },
        verifiedAcceptance: false,
      });
      assert.equal(decision.placement, 'UPSERT_PENDING_INVITE');
      assert.equal(decision.effective.inviteStatus, 'Pending');
      const conceal = pendingInviteSyncConceal(decision.placement);
      assert.equal(conceal?.revokeSessions, false);

      const tables: Record<string, Row[]> = {
        pendingInvites: [],
        inviteTokens: [
          {
            _id: 'tok-legacy',
            status: 'live',
            emailNormalized: 'legacy@warehaus.co',
            contactNotionPageId: 'page-legacy',
            clientNotionPageId: REAL_WAREHAUS_PAGE,
            expiresAt: Date.now() + 86_400_000,
          },
        ],
        notionOutbox: [],
        notionWriteState: [],
        auditEvents: [],
        notices: [],
      };
      const enqueues: Array<Record<string, unknown>> = [];
      await run(applyContactRead, authCtx('auth-staff', tables, enqueues), {
        notionPageId: 'page-legacy',
        orgId: 'org-real',
        name: 'Legacy Staff',
        email: 'legacy@warehaus.co',
        role: 'Warehaus Staff',
        source: 'portal',
        placement: 'UPSERT_PENDING_INVITE',
        inviteStatus: 'Pending',
        actionsJson: JSON.stringify(decision.actions),
        observedJson: '{}',
      });
      const kept = tables.pendingInvites?.find((row) => row.notionPageId === 'page-legacy');
      assert.equal(kept?.inviteStatus, 'Pending');
      assert.equal(tables.inviteTokens?.[0]?.status, 'live');
      assert.equal(enqueues[0]?.kind, 'revert');
      const payload = JSON.parse(String(enqueues[0]?.payload)) as { properties?: { 'Invite Status'?: string } };
      assert.equal(payload.properties?.['Invite Status'], 'Pending');
      assert.equal(String(enqueues[0]?.idempotencyKey).includes('legacy-pending'), true);
    } finally {
      if (previous === undefined) delete process.env.NOTION_WRITEBACK_ENABLED;
      else process.env.NOTION_WRITEBACK_ENABLED = previous;
    }
  });

  it('keeps a legacy pending invite when write-back is off and enqueues nothing', async () => {
    const previous = process.env.NOTION_WRITEBACK_ENABLED;
    delete process.env.NOTION_WRITEBACK_ENABLED;
    try {
      const decision = legacyRead();
      const tables = legacyTables();
      await run(applyContactRead, readCtx(tables), legacyArgs(decision));
      assert.equal(tables.notionOutbox?.length, 0);
      assert.equal(tables.pendingInvites?.find((row) => row.notionPageId === 'page-legacy')?.inviteStatus, 'Pending');
      assert.equal(tables.inviteTokens?.[0]?.status, 'live');
      assert.equal(
        tables.auditEvents?.some((row) => row.action === 'invite.backfill.Invite Status'),
        false,
      );
    } finally {
      if (previous === undefined) delete process.env.NOTION_WRITEBACK_ENABLED;
      else process.env.NOTION_WRITEBACK_ENABLED = previous;
    }
  });

  it('enqueues one backfill per observed edit through the real enqueue', async () => {
    const previous = process.env.NOTION_WRITEBACK_ENABLED;
    process.env.NOTION_WRITEBACK_ENABLED = 'true';
    try {
      const decision = legacyRead();
      const tables = legacyTables();
      const ctx = readCtx(tables);
      const args = legacyArgs(decision);
      await run(applyContactRead, ctx, args);
      await run(applyContactRead, ctx, args);
      assert.equal(tables.notionOutbox?.length, 1);
      assert.equal(String(tables.notionOutbox?.[0]?.idempotencyKey).includes('legacy-pending'), true);
      assert.equal(tables.pendingInvites?.[0]?.inviteStatus, 'Pending');
      assert.equal(tables.inviteTokens?.[0]?.status, 'live');
      assert.equal(
        tables.auditEvents?.filter((row) => row.action === 'invite.backfill.Invite Status').length,
        1,
      );

      const edited = '2026-11-01T00:00:00.000Z';
      await run(applyContactRead, ctx, { ...args, notionLastEditedTime: edited });
      await run(applyContactRead, ctx, { ...args, notionLastEditedTime: edited });
      assert.equal(tables.notionOutbox?.length, 2);
      assert.equal(
        tables.notionOutbox?.filter((row) => String(row.idempotencyKey).endsWith(edited)).length,
        1,
      );
      assert.equal(
        tables.auditEvents?.filter((row) => row.action === 'invite.backfill.Invite Status').length,
        2,
      );
    } finally {
      if (previous === undefined) delete process.env.NOTION_WRITEBACK_ENABLED;
      else process.env.NOTION_WRITEBACK_ENABLED = previous;
    }
  });

  it('hides a pending invite without revoking sessions, and revokes when the invite is dropped', () => {
    const kept = pendingInviteSyncConceal('UPSERT_PENDING_INVITE');
    assert.equal(kept?.action, 'hide');
    assert.equal(kept?.revokeSessions, false);
    const dropped = pendingInviteSyncConceal('SKIP_AND_DROP_PENDING');
    assert.equal(dropped?.revokeSessions, true);
  });

  it('treats the slug row and the holder row as one staff org', async () => {
    const previousWriteback = process.env.NOTION_WRITEBACK_ENABLED;
    const previousEmail = process.env.INVITE_EMAIL_ENABLED;
    const previousUrl = process.env.PORTAL_PUBLIC_URL;
    process.env.NOTION_WRITEBACK_ENABLED = 'true';
    process.env.INVITE_EMAIL_ENABLED = 'true';
    process.env.PORTAL_PUBLIC_URL = 'http://localhost:3100';
    try {
      const tables = baseTables(await tokenRow('tok-same-org', 'raw-same-org'));
      tables.clients?.push(
        {
          _id: 'org-seed',
          slug: 'warehaus-internal',
          notionPageId: 'seed-warehaus-org',
          portalAccess: 'Enabled',
          companyName: 'Warehaus (Internal)',
        },
        {
          _id: 'org-real',
          slug: 'warehaus',
          notionPageId: REAL_WAREHAUS_PAGE,
          portalAccess: 'Enabled',
          companyName: 'Warehaus',
        },
      );
      tables.pendingInvites?.push({
        _id: 'pending-seed-email',
        orgId: 'org-seed',
        notionPageId: 'page-seed-email',
        name: 'Moved Staff',
        email: 'moved.staff@warehaus.co',
        role: 'Warehaus Staff',
        inviteStatus: 'Pending',
        source: 'portal',
        lastSyncedAt: 1,
      });
      const enqueues: Array<Record<string, unknown>> = [];
      const created = await run(create, authCtx('auth-staff', tables, enqueues), {
        name: 'Moved Staff',
        email: 'moved.staff@warehaus.co',
        requestId: 'req-same-org',
      });
      assert.equal(created.ok, true);
      assert.equal(enqueues[0]?.orgId, 'org-real');
    } finally {
      if (previousWriteback === undefined) delete process.env.NOTION_WRITEBACK_ENABLED;
      else process.env.NOTION_WRITEBACK_ENABLED = previousWriteback;
      if (previousEmail === undefined) delete process.env.INVITE_EMAIL_ENABLED;
      else process.env.INVITE_EMAIL_ENABLED = previousEmail;
      if (previousUrl === undefined) delete process.env.PORTAL_PUBLIC_URL;
      else process.env.PORTAL_PUBLIC_URL = previousUrl;
    }
  });

  it('names a duplicate warehaus-internal slug instead of a unique-index error', async () => {
    const token = await tokenRow('tok-dup', 'raw-dup');
    const tables = asStaffInvite(baseTables(token), token);
    tables.clients?.push({
      _id: 'org-wh-2',
      slug: 'warehaus-internal',
      notionPageId: 'seed-warehaus-org-2',
      portalAccess: 'Enabled',
      companyName: 'Warehaus other',
    });
    await assert.rejects(
      () => run(accept, authCtx('user-new', tables, [], true, newStaffUser), { token: 'raw-dup' }),
      (err: unknown) => {
        assert.ok(err instanceof ConvexError);
        assert.equal(err.data, 'More than one client uses the warehaus-internal slug. Nothing was queued.');
        return true;
      },
    );
  });

  it('keeps an invite on the row that holds the Notion page through the next sync', async () => {
    const previousWriteback = process.env.NOTION_WRITEBACK_ENABLED;
    const previousEmail = process.env.INVITE_EMAIL_ENABLED;
    const previousUrl = process.env.PORTAL_PUBLIC_URL;
    const previousClient = process.env.WAREHAUS_INTERNAL_CLIENT_ID;
    process.env.NOTION_WRITEBACK_ENABLED = 'true';
    process.env.INVITE_EMAIL_ENABLED = 'true';
    process.env.PORTAL_PUBLIC_URL = 'http://localhost:3100';
    process.env.WAREHAUS_INTERNAL_CLIENT_ID = 'org-real';
    try {
      const tables = baseTables(await tokenRow('tok-real', 'raw-real'));
      tables.clients?.push(
        {
          _id: 'org-seed',
          slug: 'warehaus-internal',
          notionPageId: 'seed-warehaus-org',
          portalAccess: 'Enabled',
          companyName: 'Warehaus (Internal)',
        },
        {
          _id: 'org-real',
          slug: 'warehaus',
          notionPageId: REAL_WAREHAUS_PAGE,
          portalAccess: 'Enabled',
          companyName: 'Warehaus',
        },
      );
      tables.contacts?.push({
        _id: 'contact-seed-staff',
        orgId: 'org-seed',
        name: 'Seed Staff',
        email: 'seed.staff@warehaus.co',
        authUserId: 'user-seed',
        role: 'Warehaus Staff',
        portalAccess: 'Enabled',
      });
      const enqueues: Array<Record<string, unknown>> = [];
      const staffCtx = authCtx('auth-staff', tables, enqueues);
      const created = await run(create, staffCtx, {
        name: 'New Staff',
        email: 'new.staff@warehaus.co',
        requestId: 'req-real',
      });
      assert.deepEqual(created, { ok: true, status: 'pending', message: 'Invite pending' });
      assert.equal(enqueues[0]?.orgId, 'org-real');
      const payload = JSON.parse(String(enqueues[0]?.payload)) as {
        properties?: { 'Client Company'?: string[] };
        invite?: { clientNotionPageId?: string };
      };
      assert.deepEqual(payload.properties?.['Client Company'], [REAL_WAREHAUS_PAGE]);
      assert.equal(payload.invite?.clientNotionPageId, REAL_WAREHAUS_PAGE);
      assert.equal(String(enqueues[0]?.orgId) === 'org-seed', false);

      const outbox = tables.notionOutbox?.[0];
      assert.ok(outbox);
      outbox.status = 'done';
      outbox.kind = 'createInvite';
      const issued = (await run(issueTokenAfterConfirm, staffCtx, {
        outboxId: outbox._id,
        notionPageId: 'contact-new',
      })) as { issued?: boolean; raw?: string };
      assert.equal(issued.issued, true);
      const pending = tables.pendingInvites?.find((row) => row.email === 'new.staff@warehaus.co');
      assert.ok(pending);
      assert.equal(pending.orgId, 'org-real');
      const live = tables.inviteTokens?.find((row) => row.emailNormalized === 'new.staff@warehaus.co');
      assert.equal(live?.clientNotionPageId, REAL_WAREHAUS_PAGE);
      assert.equal(live?.orgId, 'org-real');

      const clientEnabled = clientEnabledForPull(tables.clients ?? []);
      assert.equal(clientEnabled(REAL_WAREHAUS_PAGE), true);
      const decision = decideContactSync({
        portalAccess: 'Disabled',
        inviteStatus: 'Pending',
        source: 'portal',
        clientNotionId: REAL_WAREHAUS_PAGE,
        clientEnabled,
        liveToken: { clientNotionPageId: REAL_WAREHAUS_PAGE },
        verifiedAcceptance: false,
      });
      const placement: string = decision.placement;
      assert.equal(placement === 'SKIP_AND_DROP_PENDING', false);
      assert.equal(placement, 'UPSERT_PENDING_INVITE');
      const conceal = pendingInviteSyncConceal(placement);
      assert.ok(conceal);
      assert.equal(conceal.revokeSessions, false);
      await run(applyContactRead, staffCtx, {
        notionPageId: 'contact-new',
        orgId: 'org-real',
        name: 'New Staff',
        email: 'new.staff@warehaus.co',
        role: 'Warehaus Staff',
        source: 'portal',
        placement: decision.placement as 'UPSERT_PENDING_INVITE',
        inviteStatus: 'Pending',
        actionsJson: '[]',
        observedJson: '{}',
      });
      const kept = tables.pendingInvites?.find((row) => row.notionPageId === 'contact-new');
      assert.ok(kept);
      assert.equal(kept.orgId, 'org-real');
      assert.equal(kept.inviteStatus, 'Pending');
      assert.ok(tables.contacts?.find((row) => row._id === 'contact-seed-staff'));
      assert.equal(tables.inviteTokens?.find((row) => row._id === live?._id)?.status, 'live');

      const team = (await run(listTeam, staffCtx)) as unknown as {
        invites: Array<{ email?: string }>;
        members: Array<{ email?: string }>;
      };
      assert.equal(
        team.invites.some((invite) => invite.email === 'new.staff@warehaus.co'),
        true,
      );
      assert.equal(
        team.members.some((member) => member.email === 'seed.staff@warehaus.co'),
        true,
      );

      const invitee = { _id: 'user-new', email: 'new.staff@warehaus.co', emailVerified: true };
      const accepted = await run(accept, authCtx('user-new', tables, enqueues, true, invitee), {
        token: issued.raw,
      });
      assert.deepEqual(accepted, { ok: true, status: 'pending' });
      const held = tables.notionOutbox?.find((row) => row._id === enqueues.at(-1)?.outboxId);
      assert.ok(held);
      held.status = 'done';
      held.kind = 'setInviteState';
      await run(issueTokenAfterConfirm, staffCtx, { outboxId: held._id, notionPageId: 'contact-new' });
      const linked = tables.contacts?.find((row) => row.email === 'new.staff@warehaus.co');
      assert.ok(linked);
      assert.equal(linked.orgId, 'org-real');
      assert.equal(linked.role, 'Warehaus Staff');
      assert.equal(linked.authUserId, 'user-new');
    } finally {
      if (previousWriteback === undefined) delete process.env.NOTION_WRITEBACK_ENABLED;
      else process.env.NOTION_WRITEBACK_ENABLED = previousWriteback;
      if (previousEmail === undefined) delete process.env.INVITE_EMAIL_ENABLED;
      else process.env.INVITE_EMAIL_ENABLED = previousEmail;
      if (previousUrl === undefined) delete process.env.PORTAL_PUBLIC_URL;
      else process.env.PORTAL_PUBLIC_URL = previousUrl;
      if (previousClient === undefined) delete process.env.WAREHAUS_INTERNAL_CLIENT_ID;
      else process.env.WAREHAUS_INTERNAL_CLIENT_ID = previousClient;
    }
  });

  it('links a new user and an existing account, then sign-in finds the staff contact', async () => {
    const previousWriteback = process.env.NOTION_WRITEBACK_ENABLED;
    const previousEmail = process.env.INVITE_EMAIL_ENABLED;
    const previousUrl = process.env.PORTAL_PUBLIC_URL;
    process.env.NOTION_WRITEBACK_ENABLED = 'true';
    process.env.INVITE_EMAIL_ENABLED = 'true';
    process.env.PORTAL_PUBLIC_URL = 'http://localhost:3100';
    try {
      for (const existing of [false, true]) {
        const email = existing ? 'sam.existing@warehaus.co' : 'new.staff@warehaus.co';
        const authId = existing ? 'user-existing' : 'user-new';
        const account = { _id: authId, email, emailVerified: true };
        const tables = baseTables(await tokenRow(`tok-${authId}`, `raw-${authId}`));
        tables.clients?.push({
          _id: 'org-wh',
          slug: 'warehaus-internal',
          notionPageId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          portalAccess: 'Enabled',
          companyName: 'Warehaus',
        });
        const enqueues: Array<Record<string, unknown>> = [];
        const staffCtx = authCtx('auth-staff', tables, enqueues, true, user, existing ? [account] : []);
        const created = await run(create, staffCtx, {
          name: existing ? 'Sam Existing' : 'New Staff',
          email,
          requestId: `req-${authId}`,
        });
        assert.deepEqual(created, { ok: true, status: 'pending', message: 'Invite pending' });
        const outbox = tables.notionOutbox?.[0];
        assert.ok(outbox);
        outbox.status = 'done';
        outbox.kind = 'createInvite';
        const issued = await (
          issueTokenAfterConfirm as unknown as {
            _handler: (ctx: ReturnType<typeof authCtx>, args: Record<string, unknown>) => Promise<{
              issued?: boolean;
              alreadyHasLogin?: boolean;
              inviterName?: string;
              expiresOn?: string;
              raw?: string;
            }>;
          }
        )._handler(staffCtx, { outboxId: outbox._id, notionPageId: `page-${authId}` });
        assert.equal(issued.issued, true);
        assert.equal(issued.alreadyHasLogin, existing);
        assert.equal(issued.inviterName, 'Alex Staff');
        assert.match(issued.expiresOn ?? '', /[A-Z][a-z]+ \d+, \d{4}/);
        assert.equal((issued.expiresOn ?? '').includes('7 days from now'), false);

        const inviteeCtx = authCtx(authId, tables, enqueues, true, account);
        const accepted = await run(accept, inviteeCtx, { token: issued.raw });
        assert.deepEqual(accepted, { ok: true, status: 'pending' });
        const held = tables.notionOutbox?.find((row) => row._id === enqueues.at(-1)?.outboxId);
        assert.ok(held);
        held.status = 'done';
        held.kind = 'setInviteState';
        await run(issueTokenAfterConfirm, inviteeCtx, { outboxId: held._id, notionPageId: `page-${authId}` });
        const linked = tables.contacts?.find((row) => row.email === email && row.role === 'Warehaus Staff');
        assert.ok(linked);
        assert.equal(linked.authUserId, authId);
        assert.equal(linked.portalAccess, 'Enabled');
        const joined = selectContactForJoin({
          email,
          authUserId: authId,
          emailVerified: true,
          contacts: [
            {
              _id: String(linked._id),
              orgId: String(linked.orgId),
              email: String(linked.email),
              name: String(linked.name),
              role: 'Warehaus Staff',
              portalAccess: 'Enabled',
              authUserId: String(linked.authUserId),
              notionPageId: String(linked.notionPageId),
            },
          ],
        });
        assert.equal(joined.authUserId, authId);
        tables.notionOutbox = [];
        enqueues.length = 0;
      }
    } finally {
      if (previousWriteback === undefined) delete process.env.NOTION_WRITEBACK_ENABLED;
      else process.env.NOTION_WRITEBACK_ENABLED = previousWriteback;
      if (previousEmail === undefined) delete process.env.INVITE_EMAIL_ENABLED;
      else process.env.INVITE_EMAIL_ENABLED = previousEmail;
      if (previousUrl === undefined) delete process.env.PORTAL_PUBLIC_URL;
      else process.env.PORTAL_PUBLIC_URL = previousUrl;
    }
  });

  it('queues Expired for Notion and keeps that status when sync sends Pending again', async () => {
    const token = await tokenRow('tok-expire', 'raw-expire');
    token.expiresAt = Date.now() - 1_000;
    token.status = 'live';
    const tables = asStaffInvite(baseTables(token), token);
    const pending = tables.pendingInvites?.[0];
    assert.ok(pending);
    pending.inviteStatus = 'Pending';
    const enqueues: Array<Record<string, unknown>> = [];
    const ctx = authCtx('user-1', tables, enqueues);
    const result = await run(expireDue, ctx);
    assert.equal(result.ok, undefined);
    assert.equal(tables.inviteTokens?.[0]?.status, 'expired');
    assert.equal(tables.pendingInvites?.[0]?.inviteStatus, 'Expired');
    const payload = JSON.parse(String(enqueues[0]?.payload)) as { properties?: Record<string, string> };
    assert.equal(payload.properties?.['Invite Status'], 'Expired');

    const held = tables.notionOutbox?.find((row) => row._id === enqueues[0]?.outboxId);
    assert.ok(held);
    held.status = 'done';
    held.kind = 'setInviteState';
    await run(issueTokenAfterConfirm, ctx, { outboxId: held._id, notionPageId: 'contact-notion' });
    assert.equal(tables.pendingInvites?.length, 1);
    assert.equal(tables.pendingInvites?.[0]?.inviteStatus, 'Expired');

    await run(applyContactRead, ctx, {
      notionPageId: 'contact-notion',
      orgId: 'org-wh',
      name: 'New Staff',
      email: newStaffUser.email,
      role: 'Warehaus Staff',
      source: 'portal',
      placement: 'UPSERT_PENDING_INVITE',
      inviteStatus: 'Pending',
      actionsJson: '[]',
      observedJson: '{}',
    });
    assert.equal(tables.pendingInvites?.[0]?.inviteStatus, 'Expired');

    await run(applyContactRead, ctx, {
      notionPageId: 'contact-notion',
      orgId: 'org-wh',
      name: 'New Staff',
      email: newStaffUser.email,
      role: 'Warehaus Staff',
      source: 'portal',
      placement: 'SKIP_AND_DROP_PENDING',
      inviteStatus: 'Expired',
      actionsJson: '[]',
      observedJson: '{}',
    });
    assert.equal(tables.pendingInvites?.length, 1);
    assert.equal(tables.pendingInvites?.[0]?.inviteStatus, 'Expired');

    const staffCtx = authCtx('auth-staff', tables, enqueues);
    const team = await run(listTeam, staffCtx);
    const listed = (team as { invites?: Array<{ email?: string; inviteStatus?: string }> }).invites ?? [];
    const row = listed.find((invite) => invite.email === newStaffUser.email);
    assert.ok(row);
    assert.equal(row.inviteStatus, 'Expired');
    assert.deepEqual(teamInviteActions(row.inviteStatus), { resend: true, revoke: false });

    const before = tables.pendingInvites?.length ?? 0;
    await run(applyContactRead, ctx, {
      notionPageId: 'never-issued',
      orgId: 'org-wh',
      name: 'Ghost',
      email: 'ghost@warehaus.co',
      role: 'Warehaus Staff',
      source: 'portal',
      placement: 'SKIP_AND_DROP_PENDING',
      inviteStatus: 'Expired',
      actionsJson: '[]',
      observedJson: '{}',
    });
    assert.equal(tables.pendingInvites?.some((row) => row.notionPageId === 'never-issued'), false);
    assert.equal(tables.pendingInvites?.length, before);
  });

  it('consumes a signup permit once and ignores an expired one', async () => {
    const token = await tokenRow('tok-permit', 'raw-permit');
    const tables = asStaffInvite(baseTables(token), token);
    const enqueues: Array<Record<string, unknown>> = [];
    const ctx = authCtx('auth-staff', tables, enqueues, true, user);
    const granted = await run(grantSignupPermit, ctx, { token: 'raw-permit', email: newStaffUser.email });
    assert.deepEqual(granted, { ok: true });
    assert.equal(tables.inviteSignupPermits?.length, 1);
    const first = await run(takeSignupPermit, ctx, { email: 'New.Staff@warehaus.co' });
    assert.deepEqual(first, { ok: true });
    assert.equal(tables.inviteSignupPermits?.length, 0);
    const second = await run(takeSignupPermit, ctx, { email: newStaffUser.email });
    assert.deepEqual(second, { ok: false });

    tables.inviteSignupPermits = [
      {
        _id: 'permit-old',
        tokenHash: 'dead',
        email: newStaffUser.email,
        expiresAt: Date.now() - 1,
      },
    ];
    const expired = await run(takeSignupPermit, ctx, { email: newStaffUser.email });
    assert.deepEqual(expired, { ok: false });
    assert.equal(tables.inviteSignupPermits.length, 0);
  });

  it('verifies a new invite user through the auth signup permit hooks', async () => {
    const token = await tokenRow('tok-hook', 'raw-hook');
    const tables = asStaffInvite(baseTables(token), token);
    const enqueues: Array<Record<string, unknown>> = [];
    const ctx = authCtx('auth-staff', tables, enqueues, true, user);
    const runMutation = async (_ref: unknown, args: Record<string, unknown>) => {
      const email = String(args.email ?? '');
      if (typeof args.token === 'string') return run(grantSignupPermit, ctx, { token: args.token, email });
      return run(takeSignupPermit, ctx, { email });
    };
    const granted = await grantInviteSignupFromHook(runMutation, { token: 'raw-hook', email: newStaffUser.email });
    assert.equal(granted, true);
    assert.equal(tables.inviteSignupPermits?.length, 1);
    const created = await takeInviteSignupFromHook(runMutation, { email: 'New.Staff@warehaus.co', name: 'New Staff' });
    assert.equal(created?.data.emailVerified, true);
    assert.equal(created?.data.name, 'New Staff');
    assert.equal(tables.inviteSignupPermits?.length, 0);
    const again = await takeInviteSignupFromHook(runMutation, { email: newStaffUser.email, name: 'New Staff' });
    assert.equal(again, null);
  });
});
