import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { getFunctionName } from 'convex/server';
import { OUTBOX_LEASE_MS } from '@warehaus/portal-sync';
import { applyOutcome, claim, get, listDue, release } from '../sync/outbox';
import { issueTokenAfterConfirm } from '../invites';
import { processOne } from '../sync/outboxWork';

type Row = Record<string, unknown> & { _id: string };
type Handler = (ctx: unknown, args: Record<string, unknown>) => Promise<unknown>;

function run(fn: object, ctx: unknown, args: Record<string, unknown> = {}) {
  return (fn as { _handler: Handler })._handler(ctx, args);
}

const properties = {
  Name: 'Ada Lovelace',
  Email: 'ada@example.com',
  Role: 'Warehaus Staff',
  Source: 'portal',
  'Portal Access': 'Disabled',
  'Invite Status': 'Pending',
  'Client Company': ['internal-page'],
};

function inviteRow(extra: Record<string, unknown> = {}): Row {
  return {
    _id: 'out-invite',
    idempotencyKey: 'invite:org-1:ada@example.com:req-1',
    kind: 'createInvite',
    database: 'contacts',
    orgId: 'org-1',
    payload: JSON.stringify({
      properties,
      invite: {
        name: 'Ada Lovelace',
        emailNormalized: 'ada@example.com',
        role: 'Warehaus Staff',
        clientNotionPageId: 'internal-page',
      },
    }),
    actor: 'staff',
    status: 'queued',
    attempts: 0,
    nextAttemptAt: 0,
    createdAt: Date.now(),
    ...extra,
  };
}

function actionCtx(row: Row) {
  const db = {
    async get(id: string) {
      return id === row._id ? row : null;
    },
    async patch(id: string, value: Record<string, unknown>) {
      if (id !== row._id) return;
      for (const [key, field] of Object.entries(value)) {
        if (field === undefined) delete row[key];
        else row[key] = field;
      }
    },
  };
  const emails: Array<Record<string, unknown>> = [];
  const ctx = {
    runQuery: async (ref: never, args: Record<string, unknown>) => {
      const name = getFunctionName(ref);
      if (name === 'sync/outbox:get') return run(get, { db }, args);
      if (name === 'sync/outbox:clientNotionId') return 'internal-page';
      throw new Error(`Unexpected query ${name}`);
    },
    runMutation: async (ref: never, args: Record<string, unknown>) => {
      const name = getFunctionName(ref);
      if (name === 'sync/outbox:claim') return run(claim, { db }, args);
      if (name === 'sync/outbox:release') return run(release, { db }, args);
      if (name === 'sync/outbox:applyOutcome') return null;
      if (name === 'invites:issueTokenAfterConfirm') {
        return {
          issued: true,
          raw: 'raw-token',
          to: 'ada@example.com',
          name: 'Ada Lovelace',
          alreadyHasLogin: false,
        };
      }
      throw new Error(`Unexpected mutation ${name}`);
    },
    runAction: async (ref: never, args: Record<string, unknown>) => {
      const name = getFunctionName(ref);
      if (name === 'invites:sendIssuedInvite') {
        emails.push(args);
        return { sent: true };
      }
      throw new Error(`Unexpected action ${name}`);
    },
  };
  return { ctx, emails };
}

describe('invite outbox pass', () => {
  const env = { ...process.env };
  const realFetch = globalThis.fetch;
  let calls: string[];

  beforeEach(() => {
    process.env.NOTION_WRITEBACK_ENABLED = 'true';
    process.env.NOTION_WAREHAUS_TOKEN = 'test-token';
    calls = [];
    globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
      const path = String(url);
      const method = init?.method ?? 'GET';
      calls.push(`${method} ${path}`);
      if (path.includes('/databases/')) {
        return new Response('not a database', { status: 404 });
      }
      if (path.includes('/query')) {
        return new Response(JSON.stringify({ results: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (method === 'GET' && path.includes('/pages/')) {
        return new Response(JSON.stringify({ id: 'page-1', last_edited_time: '2026-11-10T00:00:00.000Z' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (method === 'PATCH' && path.includes('/pages/')) {
        return new Response(JSON.stringify({ id: 'page-1', last_edited_time: '2026-11-10T00:00:01.000Z' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (method === 'POST' && path.endsWith('/pages')) {
        return new Response(JSON.stringify({ id: 'page-new', last_edited_time: '2026-11-10T00:00:00.000Z' }), {
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

  it('sends a queued invite to Notion and the email handler in the claiming pass', async () => {
    const row = inviteRow();
    const { ctx, emails } = actionCtx(row);
    const result = (await run(processOne, ctx, { id: row._id })) as { ok: boolean; error?: string };

    assert.equal(result.ok, true, result.error ?? 'not ok');
    assert.equal(calls.some((call) => call.startsWith('POST') && call.endsWith('/pages')), true);
    assert.equal(emails.length, 1);
    assert.equal(emails[0]?.to, 'ada@example.com');
    assert.equal(typeof emails[0]?.rawToken, 'string');
  });

  it('does not send while another attempt holds a live lease', async () => {
    const row = inviteRow({ status: 'inflight', claimedAt: Date.now() });
    const { ctx, emails } = actionCtx(row);
    const result = (await run(processOne, ctx, { id: row._id })) as { ok: boolean; error?: string };

    assert.equal(result.ok, false);
    assert.equal(emails.length, 0);
    assert.equal(calls.some((call) => call.endsWith('/pages')), false);
    assert.equal(row.status, 'inflight');
  });

  it('reclaims an invite whose lease expired and then sends it', async () => {
    const row = inviteRow({ status: 'inflight', claimedAt: Date.now() - OUTBOX_LEASE_MS });
    const { ctx, emails } = actionCtx(row);
    const result = (await run(processOne, ctx, { id: row._id })) as { ok: boolean; error?: string };

    assert.equal(result.ok, true, result.error ?? 'not ok');
    assert.equal(emails.length, 1);
    assert.equal(calls.some((call) => call.startsWith('POST') && call.endsWith('/pages')), true);
  });

  it('does not send an invite that is still in backoff', async () => {
    const row = inviteRow({ status: 'failed', attempts: 1, nextAttemptAt: Date.now() + 30_000 });
    const { ctx, emails } = actionCtx(row);
    const result = (await run(processOne, ctx, { id: row._id })) as { ok: boolean; error?: string };

    assert.equal(result.ok, false);
    assert.match(result.error ?? '', /not due/);
    assert.equal(emails.length, 0);
    assert.equal(calls.some((call) => call.endsWith('/pages')), false);
    assert.equal(row.status, 'failed');
  });

  it('patches a claimed task stage and confirms it', async () => {
    const row = inviteRow({
      kind: 'task-stage',
      database: 'tasks',
      notionPageId: 'page-1',
      expectedLastEditedTime: '2026-11-10T00:00:00.000Z',
      payload: JSON.stringify({ properties: { Stage: 'Planning' } }),
      idempotencyKey: 'task-stage:page-1:Planning::2026-11-10T00:00:00.000Z',
    });
    const outcomes: Array<Record<string, unknown>> = [];
    const { ctx, emails } = actionCtx(row);
    const original = ctx.runMutation;
    ctx.runMutation = async (ref: never, args: Record<string, unknown>) => {
      if (getFunctionName(ref) === 'sync/outbox:applyOutcome') {
        outcomes.push(args.outcome as Record<string, unknown>);
        return null;
      }
      return original(ref, args);
    };
    const result = (await run(processOne, ctx, { id: row._id })) as { ok: boolean; error?: string };

    assert.equal(result.ok, true, result.error ?? 'not ok');
    assert.equal(calls.some((call) => call.startsWith('GET ') && call.includes('/pages/page-1')), true);
    assert.equal(calls.some((call) => call.startsWith('PATCH ') && call.includes('/pages/page-1')), true);
    assert.equal(outcomes[0]?.kind, 'confirmed');
    assert.equal(emails.length, 0);
  });

  it('confirms the invite, issues the token, and then calls the email handler', async () => {
    const row = inviteRow();
    const tables: Record<string, Row[]> = {
      notionOutbox: [row],
      inviteTokens: [],
      pendingInvites: [],
      contacts: [],
      notionWriteState: [],
      auditEvents: [],
    };
    const db = chainDb(tables);
    const emails: Array<Record<string, unknown>> = [];
    const mutationCtx = {
      db,
      runQuery: async () => null,
      runMutation: async () => null,
    };
    const ctx = {
      runQuery: async (ref: never, args: Record<string, unknown>) => {
        const name = getFunctionName(ref);
        if (name === 'sync/outbox:get') return run(get, mutationCtx, args);
        if (name === 'sync/outbox:clientNotionId') return 'internal-page';
        throw new Error(`Unexpected query ${name}`);
      },
      runMutation: async (ref: never, args: Record<string, unknown>) => {
        const name = getFunctionName(ref);
        if (name === 'sync/outbox:claim') return run(claim, mutationCtx, args);
        if (name === 'sync/outbox:release') return run(release, mutationCtx, args);
        if (name === 'sync/outbox:applyOutcome') return run(applyOutcome, mutationCtx, args);
        if (name === 'invites:issueTokenAfterConfirm') return run(issueTokenAfterConfirm, mutationCtx, args);
        throw new Error(`Unexpected mutation ${name}`);
      },
      runAction: async (ref: never, args: Record<string, unknown>) => {
        const name = getFunctionName(ref);
        if (name === 'invites:sendIssuedInvite') {
          emails.push(args);
          return { sent: true };
        }
        throw new Error(`Unexpected action ${name}`);
      },
    };
    const result = (await run(processOne, ctx, { id: row._id })) as { ok: boolean; error?: string };

    assert.equal(result.ok, true, result.error ?? 'not ok');
    assert.equal(row.status, 'done');
    assert.equal(tables.inviteTokens.length, 1);
    assert.equal(tables.inviteTokens[0]?.status, 'live');
    assert.equal(tables.inviteTokens[0]?.emailNormalized, 'ada@example.com');
    assert.equal(emails.length, 1);
    assert.equal(emails[0]?.to, 'ada@example.com');
    assert.equal(typeof emails[0]?.rawToken, 'string');
    assert.equal(String(emails[0]?.rawToken).length > 0, true);
  });
});

class EqBuilder {
  private checks: Array<(row: Row) => boolean> = [];
  eq(field: string, value: unknown): this {
    this.checks.push((row) => row[field] === value);
    return this;
  }
  lte(field: string, value: number): this {
    this.checks.push((row) => typeof row[field] === 'number' && (row[field] as number) <= value);
    return this;
  }
  matches(row: Row): boolean {
    return this.checks.every((check) => check(row));
  }
}

function chainDb(tables: Record<string, Row[]>) {
  let seq = 1;
  return {
    async get(id: string) {
      for (const rows of Object.values(tables)) {
        const found = rows.find((row) => row._id === id);
        if (found) return found;
      }
      return null;
    },
    async insert(table: string, value: Record<string, unknown>) {
      const stored = { ...value, _id: `gen-${seq++}` } as Row;
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
        collect: async () => list,
        unique: async () => {
          if (list.length > 1) throw new Error('Expected a unique row');
          return list[0] ?? null;
        },
        take: async (n: number) => list.slice(0, n),
      });
      return chain(tables[table] ?? []);
    },
  };
}

describe('outbox rows due for another attempt', () => {
  it('returns an inflight row whose lease has expired and skips a live lease', async () => {
    const now = 1_000_000;
    const rows: Row[] = [
      { _id: 'queued', status: 'queued', nextAttemptAt: 0, claimedAt: undefined },
      { _id: 'failed', status: 'failed', nextAttemptAt: now, claimedAt: undefined },
      { _id: 'waiting', status: 'queued', nextAttemptAt: now + 1, claimedAt: undefined },
      { _id: 'crashed', status: 'inflight', nextAttemptAt: 0, claimedAt: now - OUTBOX_LEASE_MS },
      { _id: 'held', status: 'inflight', nextAttemptAt: 0, claimedAt: now - 1_000 },
      { _id: 'early', status: 'inflight', nextAttemptAt: now + 1, claimedAt: now - OUTBOX_LEASE_MS - 1 },
    ];
    const due = (await run(listDue, { db: chainDb({ notionOutbox: rows }) }, { now })) as Row[];
    assert.deepEqual(
      due.map((row) => row._id),
      ['crashed', 'queued', 'failed'],
    );
  });
});
