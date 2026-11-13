import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { buildClientCreateProperties } from '@warehaus/portal-sync';
import { getFunctionName } from 'convex/server';
import { findByExternalId, findByNotionPage } from '../clientCreate';
import { applyOutcome, attachClientId, claim, get, release } from '../sync/outbox';
import { processOne } from '../sync/outboxWork';
import { upsertClient } from '../sync/upsert';

type Row = Record<string, unknown> & { _id: string };
type Handler = (ctx: unknown, args: Record<string, unknown>) => Promise<unknown>;

function run(fn: object, ctx: unknown, args: Record<string, unknown> = {}) {
  return (fn as { _handler: Handler })._handler(ctx, args);
}

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
          throw new Error(`${table}.collect is not used`);
        },
        take: async (count: number) => list.slice(0, count),
        unique: async () => {
          if (list.length > 1) throw new Error('Expected a unique row');
          return list[0] ?? null;
        },
      });
      return chain(tables[table] ?? []);
    },
  };
}

function clientPayload() {
  const built = buildClientCreateProperties({ companyName: 'North Wind' });
  if (!built.ok) throw new Error(built.error);
  return built.properties;
}

const notionPage = {
  id: 'page-new',
  properties: {
    'Company Name': { type: 'title', title: [{ plain_text: 'North Wind' }] },
    Slug: { type: 'rich_text', rich_text: [{ plain_text: 'north-wind' }] },
    'External ID': { type: 'rich_text', rich_text: [{ plain_text: 'wh_cli_north-wind' }] },
    Status: { type: 'select', select: { name: 'Prospect' } },
    'Portal access': { type: 'select', select: { name: 'Disabled' } },
    Source: { type: 'select', select: { name: 'portal' } },
  },
};

describe('client create recovers a failed upsert', () => {
  const env = { ...process.env };
  const realFetch = globalThis.fetch;
  let posts: number;
  let searches: number;

  beforeEach(() => {
    process.env.NOTION_WRITEBACK_ENABLED = 'true';
    process.env.NOTION_WAREHAUS_TOKEN = 'test-token';
    posts = 0;
    searches = 0;
    globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
      const path = String(url);
      const method = init?.method ?? 'GET';
      if (path.includes('/databases/')) return new Response('not a database', { status: 404 });
      if (method === 'GET' && path.includes('/data_sources/')) {
        return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (path.includes('/query')) {
        searches += 1;
        const results = searches === 1 ? [] : [notionPage];
        return new Response(JSON.stringify({ results }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (method === 'POST' && path.endsWith('/pages')) {
        posts += 1;
        return new Response(JSON.stringify({ id: 'page-new', last_edited_time: '2026-11-13T00:00:00.000Z' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('unexpected', { status: 500 });
    }) as typeof fetch;
  });

  afterEach(() => {
    process.env = { ...env };
    globalThis.fetch = realFetch;
  });

  it('does not mark the outbox done when the upsert throws, then the retry inserts the client', async () => {
    const row: Row = {
      _id: 'out-1',
      idempotencyKey: 'client-create:wh_cli_north-wind',
      kind: 'client-create',
      database: 'clients',
      orgId: 'org-staff',
      payload: JSON.stringify({ properties: clientPayload() }),
      actor: 'staff',
      status: 'queued',
      attempts: 0,
      nextAttemptAt: 0,
      createdAt: Date.now(),
    };
    const tables: Record<string, Row[]> = {
      notionOutbox: [row],
      clients: [],
      notionWriteState: [],
      auditEvents: [],
    };
    const db = memoryDb(tables);
    let upserts = 0;
    const ctx = {
      runQuery: async (ref: never, args: Record<string, unknown>) => {
        const name = getFunctionName(ref);
        if (name === 'sync/outbox:get') return run(get, { db }, args);
        if (name === 'clientCreate:findByNotionPage') return run(findByNotionPage, { db }, args);
        if (name === 'clientCreate:findByExternalId') return run(findByExternalId, { db }, args);
        throw new Error(`unexpected query ${name}`);
      },
      runMutation: async (ref: never, args: Record<string, unknown>) => {
        const name = getFunctionName(ref);
        if (name === 'sync/outbox:claim') return run(claim, { db }, args);
        if (name === 'sync/outbox:release') return run(release, { db }, args);
        if (name === 'sync/outbox:applyOutcome') return run(applyOutcome, { db }, args);
        if (name === 'sync/outbox:attachClientId') return run(attachClientId, { db }, args);
        if (name === 'sync/upsert:upsertClient') {
          upserts += 1;
          if (upserts === 1) throw new Error('convex upsert failed');
          return run(upsertClient, { db }, args);
        }
        if (name.includes('invite') || name.includes('mail')) throw new Error(`client create must not call ${name}`);
        throw new Error(`unexpected mutation ${name}`);
      },
      runAction: async () => {
        throw new Error('client create must not send mail');
      },
    };

    const first = (await run(processOne, ctx, { id: row._id })) as { ok: boolean; error?: string };
    assert.equal(first.ok, false);
    assert.match(first.error ?? '', /convex upsert failed/);
    assert.equal(row.status, 'failed');
    assert.notEqual(row.status, 'done');
    assert.equal(posts, 1);
    assert.equal(tables.clients.length, 0);

    row.nextAttemptAt = 0;
    const second = (await run(processOne, ctx, { id: row._id })) as { ok: boolean; clientId?: string };
    assert.equal(second.ok, true, (second as { error?: string }).error ?? 'retry did not recover');
    assert.equal(posts, 1);
    assert.equal(row.status, 'done');
    assert.equal(tables.clients.length, 1);
    assert.equal(tables.clients[0]?.notionPageId, 'page-new');
    assert.equal(tables.clients[0]?.portalAccess, 'Disabled');
    assert.equal(tables.clients[0]?.status, 'Prospect');
    assert.equal(tables.clients[0]?.syncHiddenAt, undefined);
    assert.equal(row.orgId, second.clientId);
    assert.equal(row.orgId, tables.clients[0]?._id);
  });

  it('upserts a done row that confirmed Notion and never stored a client', async () => {
    const row: Row = {
      _id: 'out-done',
      idempotencyKey: 'client-create:wh_cli_north-wind',
      kind: 'client-create',
      database: 'clients',
      orgId: 'org-staff',
      payload: JSON.stringify({ properties: clientPayload() }),
      actor: 'staff',
      status: 'done',
      attempts: 1,
      nextAttemptAt: 0,
      createdAt: Date.now(),
      notionPageId: 'page-done',
      resultJson: JSON.stringify({ notionPageId: 'page-done', reused: true }),
    };
    const tables: Record<string, Row[]> = {
      notionOutbox: [row],
      clients: [],
      notionWriteState: [],
      auditEvents: [],
    };
    const db = memoryDb(tables);
    const ctx = {
      runQuery: async (ref: never, args: Record<string, unknown>) => {
        const name = getFunctionName(ref);
        if (name === 'sync/outbox:get') return run(get, { db }, args);
        if (name === 'clientCreate:findByNotionPage') return run(findByNotionPage, { db }, args);
        if (name === 'clientCreate:findByExternalId') return run(findByExternalId, { db }, args);
        throw new Error(`unexpected query ${name}`);
      },
      runMutation: async (ref: never, args: Record<string, unknown>) => {
        const name = getFunctionName(ref);
        if (name === 'sync/outbox:claim') return run(claim, { db }, args);
        if (name === 'sync/outbox:attachClientId') return run(attachClientId, { db }, args);
        if (name === 'sync/upsert:upsertClient') return run(upsertClient, { db }, args);
        throw new Error(`unexpected mutation ${name}`);
      },
      runAction: async () => {
        throw new Error('no mail');
      },
    };
    const result = (await run(processOne, ctx, { id: row._id })) as { ok: boolean; clientId?: string; error?: string };
    assert.equal(result.ok, true, result.error ?? 'done row did not upsert');
    assert.equal(posts, 0);
    assert.equal(tables.clients.length, 1);
    assert.equal(tables.clients[0]?.notionPageId, 'page-done');
    assert.equal(row.orgId, result.clientId);
    assert.match(String(row.resultJson), /clientId/);
  });
});
