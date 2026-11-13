import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { API_IDEMPOTENCY_LEASE_MS, IDEMPOTENCY_IN_PROGRESS_ERROR } from '@warehaus/portal-sync';
import { openWrite } from '../portalApi';
import { createForToken, prepareForToken } from '../projectCreate';
import { enqueue } from '../sync/outbox';

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
    async delete(id: string) {
      throw new Error(`reclaim must not delete ${id}`);
    },
    async patch(id: string, value: Record<string, unknown>) {
      for (const rows of Object.values(tables)) {
        const row = rows.find((item) => item._id === id);
        if (!row) continue;
        Object.assign(row, value);
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

const CLIENT_PAGE = '5165ca6e-352e-45af-8918-98779fd76e61';

function tables(): Record<string, Row[]> {
  return {
    clients: [
      {
        _id: 'client-1',
        notionPageId: CLIENT_PAGE,
        companyName: 'North',
        slug: 'north',
        portalAccess: 'Disabled',
      },
    ],
    notionOutbox: [],
    projects: [],
    apiIdempotency: [],
  };
}

async function withWriteback(fn: () => Promise<void>) {
  const previous = process.env.NOTION_WRITEBACK_ENABLED;
  process.env.NOTION_WRITEBACK_ENABLED = 'true';
  try {
    await fn();
  } finally {
    if (previous === undefined) delete process.env.NOTION_WRITEBACK_ENABLED;
    else process.env.NOTION_WRITEBACK_ENABLED = previous;
  }
}

function actionCtx(store: Record<string, Row[]>) {
  const calls: string[] = [];
  const ctx = {
    db: memoryDb(store),
    scheduler: { runAfter: async () => {} },
    runQuery: async (ref: unknown, args: Record<string, unknown>) => {
      const name = refName(ref);
      calls.push(name);
      if (name === 'projectCreate:prepareForToken') return run(prepareForToken, ctx, args);
      throw new Error(`unexpected query ${name}`);
    },
    runMutation: async (ref: unknown, args: Record<string, unknown>) => {
      const name = refName(ref);
      calls.push(name);
      if (name === 'sync/outbox:enqueue') return run(enqueue, ctx, args);
      if (name === 'sync/upsert:upsertProject') {
        const id = await ctx.db.insert('projects', args);
        return id;
      }
      throw new Error(`unexpected mutation ${name}`);
    },
    runAction: async (ref: unknown, args: Record<string, unknown>) => {
      const name = refName(ref);
      calls.push(name);
      if (name !== 'sync/outboxWork:processOne') throw new Error(`unexpected action ${name}`);
      return { ok: true, notionPageId: 'page-new', projectId: 'proj-new', reused: false, ...args };
    },
  };
  return { ctx, calls };
}

describe('project create resume', () => {
  it('returns 409 for a pending key that is still inside the lease', async () => {
    const store = tables();
    const now = Date.now();
    store.apiIdempotency!.push({
      _id: 'idem-1',
      tokenId: 'token-1',
      key: 'key-1',
      requestHash: 'hash-1',
      state: 'pending',
      createdAt: now,
    });
    const result = (await run(openWrite, { db: memoryDb(store) }, {
      tokenId: 'token-1',
      key: 'key-1',
      requestHash: 'hash-1',
    })) as { status?: number; body?: { error?: string }; action?: string };
    assert.equal(result.status, 409);
    assert.equal(result.body?.error, IDEMPOTENCY_IN_PROGRESS_ERROR);
    assert.equal(store.apiIdempotency!.length, 1);
    assert.equal(store.apiIdempotency![0]!.state, 'pending');
  });

  it('replays a done outbox row and does not create again', async () => {
    await withWriteback(async () => {
      const store = tables();
      store.notionOutbox!.push({
        _id: 'out-1',
        idempotencyKey: 'project-create:wh_prj_draft1',
        kind: 'project-create',
        orgId: 'client-1',
        database: 'projects',
        payload: '{}',
        actor: 'staff',
        status: 'done',
        attempts: 1,
        nextAttemptAt: 0,
        createdAt: 1,
        resultJson: JSON.stringify({ notionPageId: 'page-done', projectId: 'proj-done', reused: false }),
      });
      const { ctx, calls } = actionCtx(store);
      const result = (await run(createForToken, ctx, {
        orgId: 'client-1',
        name: 'Draft site',
        externalId: 'wh_prj_draft1',
      })) as { ok: boolean; projectId?: string; notionPageId?: string; reused?: boolean };
      assert.equal(result.ok, true);
      assert.equal(result.projectId, 'proj-done');
      assert.equal(result.notionPageId, 'page-done');
      assert.equal(result.reused, true);
      assert.equal(calls.includes('sync/outboxWork:processOne'), false);
      assert.equal(store.notionOutbox!.length, 1);
    });
  });

  it('returns 409 for an expired idempotency row while the outbox is inflight', async () => {
    await withWriteback(async () => {
      const store = tables();
      const now = Date.now();
      store.apiIdempotency!.push({
        _id: 'idem-1',
        tokenId: 'token-1',
        key: 'key-1',
        requestHash: 'hash-1',
        state: 'pending',
        createdAt: now - API_IDEMPOTENCY_LEASE_MS,
      });
      store.notionOutbox!.push({
        _id: 'out-1',
        idempotencyKey: 'project-create:wh_prj_draft1',
        kind: 'project-create',
        orgId: 'client-1',
        database: 'projects',
        payload: '{}',
        actor: 'staff',
        status: 'inflight',
        attempts: 1,
        nextAttemptAt: 0,
        createdAt: 1,
        claimedAt: now - API_IDEMPOTENCY_LEASE_MS,
      });
      const opened = (await run(openWrite, { db: memoryDb(store) }, {
        tokenId: 'token-1',
        key: 'key-1',
        requestHash: 'hash-1',
      })) as { action?: string; id?: string; status?: number };
      assert.equal(opened.action, 'start');
      assert.equal(opened.id, 'idem-1');
      assert.equal(store.apiIdempotency!.length, 1);
      assert.equal(store.apiIdempotency![0]!.state, 'pending');

      const { ctx, calls } = actionCtx(store);
      const result = (await run(createForToken, ctx, {
        orgId: 'client-1',
        name: 'Draft site',
        externalId: 'wh_prj_draft1',
      })) as { ok: boolean; status?: number; error?: string };
      assert.equal(result.ok, false);
      assert.equal(result.status, 409);
      assert.equal(result.error, IDEMPOTENCY_IN_PROGRESS_ERROR);
      assert.equal(calls.includes('sync/outboxWork:processOne'), false);
      assert.equal(store.notionOutbox!.length, 1);
      assert.equal(store.notionOutbox![0]!.status, 'inflight');
    });
  });

  it('leaves a token project unpublished unless publishToWarehaus is true', async () => {
    await withWriteback(async () => {
      const draft = tables();
      const draftRun = actionCtx(draft);
      const hidden = (await run(createForToken, draftRun.ctx, {
        orgId: 'client-1',
        name: 'Draft site',
        externalId: 'wh_prj_draft1',
      })) as { ok: boolean };
      assert.equal(hidden.ok, true);
      const draftPayload = JSON.parse(String(draft.notionOutbox![0]!.payload)) as {
        properties: { 'Publish to Warehaus': boolean };
      };
      assert.equal(draftPayload.properties['Publish to Warehaus'], false);

      const published = tables();
      const publishedRun = actionCtx(published);
      const shown = (await run(createForToken, publishedRun.ctx, {
        orgId: 'client-1',
        name: 'Live site',
        externalId: 'wh_prj_live1',
        publishToWarehaus: true,
      })) as { ok: boolean };
      assert.equal(shown.ok, true);
      const livePayload = JSON.parse(String(published.notionOutbox![0]!.payload)) as {
        properties: { 'Publish to Warehaus': boolean };
      };
      assert.equal(livePayload.properties['Publish to Warehaus'], true);
    });
  });
});
