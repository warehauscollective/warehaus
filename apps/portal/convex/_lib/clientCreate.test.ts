import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildClientCreateProperties, WRITEBACK_OFF_ERROR } from '@warehaus/portal-sync';
import { prepare, createInNotion } from '../clientCreate';
import { clearAncestorHides } from '../sync/hide';
import { backfillClientNameKeys } from '../sync/nameKeyBackfill';
import { enqueue } from '../sync/outbox';
import { upsertClient } from '../sync/upsert';

type Row = Record<string, unknown> & { _id: string };

class EqBuilder {
  private eqs: Array<[string, unknown]> = [];
  private gts: Array<[string, number]> = [];
  eq(field: string, value: unknown): this {
    this.eqs.push([field, value]);
    return this;
  }
  gt(field: string, value: number): this {
    this.gts.push([field, value]);
    return this;
  }
  matches(row: Row): boolean {
    return (
      this.eqs.every(([field, value]) => row[field] === value) &&
      this.gts.every(([field, value]) => Number(row[field]) > value)
    );
  }
}

function memoryDb(tables: Record<string, Row[]>, takes: Array<{ table: string; count: number }>) {
  let seq = 1;
  return {
    async get(id: string) {
      for (const rows of Object.values(tables)) {
        const found = rows.find((row) => row._id === id);
        if (found) return found;
      }
      return null;
    },
    async insert(table: string, row: Record<string, unknown>) {
      const stored = { ...row, _id: `gen-${seq++}` } as Row;
      (tables[table] ??= []).push(stored);
      return stored._id;
    },
    async patch(id: string, value: Record<string, unknown>) {
      for (const rows of Object.values(tables)) {
        const row = rows.find((item) => item._id === id);
        if (!row) continue;
        for (const [key, field] of Object.entries(value)) {
          if (field === undefined) delete row[key];
          else row[key] = field;
        }
        return;
      }
    },
    query(table: string) {
      const chain = (list: Row[]) => ({
        withIndex(_name: string, build?: (q: EqBuilder) => EqBuilder) {
          const builder = new EqBuilder();
          build?.(builder);
          return chain(list.filter((row) => builder.matches(row)));
        },
        collect: async () => {
          if (table === 'clients') throw new Error('clients.collect is not used');
          return list;
        },
        take: async (count: number) => {
          takes.push({ table, count });
          if (table === 'clients' && count > 50) throw new Error(`clients.take(${count})`);
          return list.slice(0, count);
        },
        unique: async () => {
          if (list.length > 1) throw new Error('Expected a unique row');
          return list[0] ?? null;
        },
      });
      return chain(tables[table] ?? []);
    },
  };
}

type Handler = (ctx: unknown, args: Record<string, unknown>) => Promise<unknown>;

function run(fn: object, ctx: unknown, args: Record<string, unknown> = {}) {
  return (fn as { _handler: Handler })._handler(ctx, args);
}

function refName(ref: unknown): string {
  const name = (ref as { [key: symbol]: unknown })[Symbol.for('functionName')];
  if (typeof name !== 'string') throw new Error('not a function reference');
  return name;
}

function properties(extra: { primaryEmail?: string; phone?: string } = {}) {
  const built = buildClientCreateProperties({ companyName: 'North Wind', ...extra });
  assert.equal(built.ok, true);
  if (!built.ok) throw new Error('expected properties');
  return built.properties;
}

function staffTables(extraClients: Row[] = []): Record<string, Row[]> {
  return {
    contacts: [
      {
        _id: 'contact-staff',
        orgId: 'org-staff',
        name: 'Peter',
        email: 'peter@warehaus.co',
        authUserId: 'user-staff',
        role: 'Warehaus Staff',
        portalAccess: 'Enabled',
      },
    ],
    clients: [
      {
        _id: 'org-staff',
        slug: 'warehaus-internal',
        companyName: 'Warehaus',
        notionPageId: 'page-staff',
        portalAccess: 'Disabled',
        status: 'Active',
        nameKey: 'warehaus',
      },
      ...extraClients,
    ],
    notionOutbox: [],
  };
}

async function withFlag(on: boolean, fn: () => Promise<void>) {
  const previous = process.env.NOTION_WRITEBACK_ENABLED;
  if (on) process.env.NOTION_WRITEBACK_ENABLED = 'true';
  else delete process.env.NOTION_WRITEBACK_ENABLED;
  try {
    await fn();
  } finally {
    if (previous === undefined) delete process.env.NOTION_WRITEBACK_ENABLED;
    else process.env.NOTION_WRITEBACK_ENABLED = previous;
  }
}

function actionCtx(
  tables: Record<string, Row[]>,
  takes: Array<{ table: string; count: number }>,
  options: {
    subject?: string | null;
    process?: (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
  } = {},
) {
  const calls: string[] = [];
  let scheduled = 0;
  const ctx = {
    db: memoryDb(tables, takes),
    auth: {
      getUserIdentity: async () => (options.subject === null ? null : { subject: options.subject ?? 'user-staff' }),
    },
    scheduler: {
      runAfter: async () => {
        scheduled += 1;
      },
    },
    runQuery: async (ref: unknown, args: Record<string, unknown>) => {
      const name = refName(ref);
      calls.push(name);
      if (name === 'clientCreate:prepare') return run(prepare, ctx, args);
      if (name === 'clientCreate:findByNotionPage') {
        const row = (tables.clients ?? []).find((item) => item.notionPageId === args.notionPageId);
        return row ? { id: row._id } : null;
      }
      if (name === 'clientCreate:findByExternalId') {
        const row = (tables.clients ?? []).find((item) => item.externalId === args.externalId);
        return row ? { id: row._id } : null;
      }
      throw new Error(`unexpected query ${name}`);
    },
    runMutation: async (ref: unknown, args: Record<string, unknown>) => {
      const name = refName(ref);
      calls.push(name);
      if (name.includes('invite') || name.includes('mail') || name.includes('email')) {
        throw new Error(`client create must not call ${name}`);
      }
      if (name === 'sync/outbox:enqueue') return run(enqueue, ctx, args);
      if (name === 'sync/upsert:upsertClient') return run(upsertClient, ctx, args);
      throw new Error(`unexpected mutation ${name}`);
    },
    runAction: async (ref: unknown, args: Record<string, unknown>) => {
      const name = refName(ref);
      calls.push(name);
      if (name !== 'sync/outboxWork:processOne') throw new Error(`unexpected action ${name}`);
      if (!options.process) return { ok: true, notionPageId: 'page-new', reused: false };
      return options.process(args);
    },
  };
  return { ctx, calls, scheduled: () => scheduled };
}

describe('staff client create', () => {
  it('rejects a client role before any client lookup', async () => {
    const tables = staffTables();
    tables.contacts![0]!.role = 'Client Admin';
    tables.clients![0]!.portalAccess = 'Enabled';
    const takes: Array<{ table: string; count: number }> = [];
    await assert.rejects(
      () => run(prepare, { db: memoryDb(tables, takes) }, { authUserId: 'user-staff', companyName: 'North Wind' }),
      /Staff role required/,
    );
    assert.equal(takes.length, 0);
    assert.equal(tables.notionOutbox!.length, 0);
    assert.equal(tables.clients!.length, 1);
  });

  it('reuses a nameKey hit with take(2) and does not enqueue', async () => {
    const tables = staffTables([
      {
        _id: 'client-a',
        notionPageId: 'page-a',
        companyName: 'North Wind',
        slug: 'north-wind',
        nameKey: 'north wind',
        portalAccess: 'Disabled',
        status: 'Prospect',
        syncHiddenAt: 50,
      },
      {
        _id: 'client-b',
        notionPageId: 'page-b',
        companyName: 'North Wind',
        slug: 'north-wind-2',
        nameKey: 'north wind',
        portalAccess: 'Disabled',
        status: 'Prospect',
      },
    ]);
    const takes: Array<{ table: string; count: number }> = [];
    const prepared = await run(prepare, { db: memoryDb(tables, takes) }, {
      authUserId: 'user-staff',
      companyName: '  NORTH   WIND  ',
    });
    assert.deepEqual(prepared, {
      ok: true,
      reused: true,
      clientId: 'client-a',
      notionPageId: 'page-a',
    });
    assert.deepEqual(takes, [{ table: 'clients', count: 2 }]);
    assert.equal(tables.clients!.find((row) => row._id === 'client-a')!.syncHiddenAt, 50);

    const actionTakes: Array<{ table: string; count: number }> = [];
    const { ctx, calls } = actionCtx(tables, actionTakes);
    const result = await run(createInNotion, ctx, { companyName: 'North Wind' });
    assert.deepEqual(result, {
      ok: true,
      clientId: 'client-a',
      notionPageId: 'page-a',
      reused: true,
    });
    assert.equal(calls.includes('sync/outbox:enqueue'), false);
    assert.equal(calls.includes('sync/upsert:upsertClient'), false);
    assert.equal(tables.notionOutbox!.length, 0);
  });

  it('reuses a slug when the old row has no nameKey', async () => {
    const tables = staffTables([
      {
        _id: 'client-old',
        notionPageId: 'page-old',
        companyName: 'North Wind',
        slug: 'north-wind',
        portalAccess: 'Enabled',
        status: 'Active',
      },
    ]);
    const takes: Array<{ table: string; count: number }> = [];
    const prepared = await run(prepare, { db: memoryDb(tables, takes) }, {
      authUserId: 'user-staff',
      companyName: 'North Wind',
    });
    assert.deepEqual(prepared, {
      ok: true,
      reused: true,
      clientId: 'client-old',
      notionPageId: 'page-old',
    });
    assert.deepEqual(
      takes.map((item) => item.count),
      [2, 2],
    );
  });

  it('rejects a reserved slug and a bad email without writing', async () => {
    const tables = staffTables();
    const takes: Array<{ table: string; count: number }> = [];
    const reserved = await run(prepare, { db: memoryDb(tables, takes) }, {
      authUserId: 'user-staff',
      companyName: 'Warehaus Internal',
    });
    assert.deepEqual(reserved, { ok: false, error: 'That slug is reserved', field: 'slug' });
    const email = await run(prepare, { db: memoryDb(tables, takes) }, {
      authUserId: 'user-staff',
      companyName: 'North Wind',
      primaryEmail: 'not-an-email',
    });
    assert.equal((email as { ok: boolean }).ok, false);
    assert.equal(takes.length, 0);
    assert.equal(tables.clients!.some((row) => row.slug === 'warehaus-internal' && row._id !== 'org-staff'), false);
  });

  it('queues nothing and inserts no client when write-back is off', async () => {
    const tables = staffTables();
    const takes: Array<{ table: string; count: number }> = [];
    await withFlag(false, async () => {
      const { ctx, calls, scheduled } = actionCtx(tables, takes);
      const result = await run(createInNotion, ctx, { companyName: 'North Wind', hostSlug: 'other-host' });
      assert.deepEqual(result, { ok: false, error: WRITEBACK_OFF_ERROR });
      assert.equal(calls.includes('sync/outbox:enqueue'), false);
      assert.equal(tables.notionOutbox!.length, 0);
      assert.equal(tables.clients!.length, 1);
      assert.equal(scheduled(), 0);
    });
  });

  it('enqueues client-create on the staff org and upserts only after a page id', async () => {
    const tables = staffTables();
    const takes: Array<{ table: string; count: number }> = [];
    await withFlag(true, async () => {
      const { ctx, calls, scheduled } = actionCtx(tables, takes);
      const result = (await run(createInNotion, ctx, {
        companyName: 'North Wind',
        primaryEmail: 'ada@example.com',
        phone: '415 555 0100',
        hostSlug: 'other-host',
      })) as { ok: boolean; clientId?: string; reused?: boolean };
      assert.equal(result.ok, true);
      assert.equal(result.reused, false);
      assert.equal(scheduled(), 0);
      assert.equal(tables.notionOutbox!.length, 1);
      const row = tables.notionOutbox![0]!;
      assert.equal(row.kind, 'client-create');
      assert.equal(row.orgId, 'org-staff');
      assert.equal(row.database, 'clients');
      assert.equal(row.idempotencyKey, 'client-create:wh_cli_north-wind');
      const payload = JSON.parse(String(row.payload)) as { properties: Record<string, unknown> };
      assert.equal(payload.properties.Status, 'Prospect');
      assert.equal(payload.properties['Portal access'], 'Disabled');
      assert.equal(payload.properties['Publish to Warehaus'], false);
      assert.equal(payload.properties.Source, 'portal');
      assert.equal('Contacts' in payload.properties, false);
      assert.equal('Invite Status' in payload.properties, false);
      assert.equal(calls.includes('invites:issueTokenAfterConfirm'), false);
      const created = tables.clients!.find((item) => item._id === result.clientId);
      assert.equal(created?.nameKey, 'north wind');
      assert.equal(created?.status, 'Prospect');
      assert.equal(created?.portalAccess, 'Disabled');
      assert.equal(created?.source, 'portal');
      assert.equal(created?.externalId, 'wh_cli_north-wind');
      assert.equal(created?.primaryEmail, 'ada@example.com');
      assert.equal(created?.phone, '415 555 0100');
      assert.equal(created?.notionPageId, 'page-new');
      assert.equal(created?.syncHiddenAt, undefined);
    });
  });

  it('does not upsert or unhide a client that is already in Convex', async () => {
    const hidden: Row = {
      _id: 'client-hidden',
      notionPageId: 'page-hidden',
      companyName: 'Hidden Co',
      slug: 'hidden-co',
      nameKey: 'hidden co',
      portalAccess: 'Disabled',
      status: 'Active',
      syncHiddenAt: 99,
      syncHiddenReason: 'gate',
    };
    const tables = staffTables([hidden]);
    const takes: Array<{ table: string; count: number }> = [];
    await withFlag(true, async () => {
      const { ctx, calls } = actionCtx(tables, takes, {
        process: async () => ({ ok: true, notionPageId: 'page-hidden', reused: false }),
      });
      const result = await run(createInNotion, ctx, { companyName: 'Fresh Co' });
      assert.deepEqual(result, {
        ok: true,
        clientId: 'client-hidden',
        notionPageId: 'page-hidden',
        reused: true,
      });
      assert.equal(calls.includes('sync/upsert:upsertClient'), false);
      assert.equal(hidden.syncHiddenAt, 99);
      assert.equal(hidden.status, 'Active');
      assert.equal(tables.clients!.length, 2);
    });
  });

  it('upserts when Notion already confirmed the page and Convex has no row', async () => {
    const tables = staffTables();
    const takes: Array<{ table: string; count: number }> = [];
    await withFlag(true, async () => {
      const { ctx, calls } = actionCtx(tables, takes, {
        process: async () => ({ ok: true, notionPageId: 'page-remote', reused: true }),
      });
      const result = (await run(createInNotion, ctx, { companyName: 'Fresh Co' })) as {
        ok: boolean;
        clientId?: string;
        reused?: boolean;
      };
      assert.equal(result.ok, true);
      assert.equal(result.reused, false);
      assert.equal(calls.includes('sync/upsert:upsertClient'), true);
      const created = tables.clients!.find((row) => row._id === result.clientId);
      assert.equal(created?.notionPageId, 'page-remote');
      assert.equal(created?.status, 'Prospect');
      assert.equal(created?.portalAccess, 'Disabled');
      assert.equal(created?.syncHiddenAt, undefined);
    });
  });

  it('finds an existing client by name after nameKey is filled, even with a different slug', async () => {
    const tables = staffTables([
      {
        _id: 'client-old-name',
        _creationTime: 20,
        notionPageId: 'page-old-name',
        companyName: 'North Wind',
        slug: 'different-slug',
        portalAccess: 'Disabled',
        status: 'Active',
        syncHiddenAt: 40,
        syncHiddenReason: 'gate',
      },
    ]);
    tables.clients![0]!._creationTime = 10;
    const takes: Array<{ table: string; count: number }> = [];
    const db = memoryDb(tables, takes);
    const filled = (await run(backfillClientNameKeys, { db }, { numItems: 25 })) as {
      updated: number;
      isDone: boolean;
    };
    assert.equal(filled.updated, 1);
    assert.equal(filled.isDone, true);
    assert.equal(tables.clients!.find((row) => row._id === 'client-old-name')!.nameKey, 'north wind');
    assert.deepEqual(
      takes.filter((item) => item.table === 'clients').map((item) => item.count),
      [25],
    );

    const prepared = (await run(prepare, { db: memoryDb(tables, takes) }, {
      authUserId: 'user-staff',
      companyName: 'North Wind',
    })) as { ok: boolean; reused?: boolean; clientId?: string };
    assert.equal(prepared.ok, true);
    assert.equal(prepared.reused, true);
    assert.equal(prepared.clientId, 'client-old-name');
    assert.equal(tables.notionOutbox!.length, 0);
  });

  it('clears a stale Disabled gate stamp and leaves trash concealed', async () => {
    const client = {
      _id: 'org-disabled',
      portalAccess: 'Disabled',
      syncHiddenAt: 70,
      syncHiddenReason: 'gate',
      companyName: 'North Wind',
      slug: 'north-wind',
    };
    const project = {
      _id: 'project-1',
      orgId: 'org-disabled',
      syncHiddenAt: 70,
      syncHiddenReason: 'ancestor',
      name: 'Site',
    };
    const trashed = {
      _id: 'org-trash',
      portalAccess: 'Disabled',
      syncHiddenAt: 80,
      syncHiddenReason: 'trashed',
      companyName: 'Gone',
      slug: 'gone',
    };
    const tables: Record<string, Row[]> = {
      clients: [client, trashed],
      projects: [project],
      tasks: [],
      sharedResources: [],
      clientDocs: [],
      contacts: [],
    };
    const db = memoryDb(tables, []);
    await run(clearAncestorHides, { db }, { orgId: 'org-disabled' });
    assert.equal(client.syncHiddenAt, undefined);
    assert.equal(client.syncHiddenReason, undefined);
    assert.equal(project.syncHiddenAt, undefined);
    assert.equal(project.syncHiddenReason, undefined);
    await run(clearAncestorHides, { db }, { orgId: 'org-trash' });
    assert.equal(trashed.syncHiddenAt, 80);
    assert.equal(trashed.syncHiddenReason, 'trashed');
  });

  it('rejects a non-staff session and an anonymous session', async () => {
    const tables = staffTables();
    tables.contacts![0]!.role = 'Client Member';
    tables.clients![0]!.portalAccess = 'Enabled';
    const takes: Array<{ table: string; count: number }> = [];
    const { ctx } = actionCtx(tables, takes);
    const denied = await run(createInNotion, ctx, { companyName: 'North Wind' });
    assert.deepEqual(denied, { ok: false, error: 'Staff role required' });
    const anon = actionCtx(tables, takes, { subject: null });
    const signedOut = await run(createInNotion, anon.ctx, { companyName: 'North Wind' });
    assert.deepEqual(signedOut, { ok: false, error: 'Not authenticated' });
    assert.equal(tables.notionOutbox!.length, 0);
  });

  it('accepts a client-create payload and rejects publish, status, and contact fields', async () => {
    const tables = { notionOutbox: [] as Row[] };
    const takes: Array<{ table: string; count: number }> = [];
    const ctx = {
      db: memoryDb(tables, takes),
      scheduler: { runAfter: async () => { throw new Error('schedule'); } },
    };
    await withFlag(true, async () => {
      const ok = (await run(enqueue, ctx, {
        idempotencyKey: 'client-create:wh_cli_north-wind',
        kind: 'client-create',
        orgId: 'org-staff',
        database: 'clients',
        payload: JSON.stringify({ properties: properties() }),
        actor: 'staff',
        schedule: false,
      })) as { ok: boolean };
      assert.equal(ok.ok, true);
      assert.equal(tables.notionOutbox.length, 1);

      const publish = await run(enqueue, ctx, {
        idempotencyKey: 'client-create:bad-publish',
        kind: 'client-create',
        orgId: 'org-staff',
        database: 'clients',
        payload: JSON.stringify({ properties: { ...properties(), 'Publish to Warehaus': true } }),
        actor: 'staff',
        schedule: false,
      });
      assert.deepEqual(publish, { ok: false, error: 'Publish to Warehaus must be off' });

      const active = await run(enqueue, ctx, {
        idempotencyKey: 'client-create:bad-status',
        kind: 'client-create',
        orgId: 'org-staff',
        database: 'clients',
        payload: JSON.stringify({ properties: { ...properties(), Status: 'Active' } }),
        actor: 'staff',
        schedule: false,
      });
      assert.deepEqual(active, { ok: false, error: 'Status must be Prospect' });

      const contacts = await run(enqueue, ctx, {
        idempotencyKey: 'client-create:bad-contacts',
        kind: 'client-create',
        orgId: 'org-staff',
        database: 'clients',
        payload: JSON.stringify({ properties: { ...properties(), Contacts: ['page'] } }),
        actor: 'staff',
        schedule: false,
      });
      assert.deepEqual(contacts, { ok: false, error: 'Contacts is not part of client create' });
      assert.equal(tables.notionOutbox.length, 1);
    });

    await withFlag(false, async () => {
      const off = await run(enqueue, ctx, {
        idempotencyKey: 'client-create:wh_cli_other',
        kind: 'client-create',
        orgId: 'org-staff',
        database: 'clients',
        payload: JSON.stringify({ properties: properties() }),
        actor: 'staff',
        schedule: false,
      });
      assert.deepEqual(off, { ok: false, error: WRITEBACK_OFF_ERROR });
      assert.equal(tables.notionOutbox.length, 1);
    });
  });
});
