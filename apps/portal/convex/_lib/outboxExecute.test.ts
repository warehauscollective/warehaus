import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { getFunctionName } from 'convex/server';
import { claim, get, release } from '../sync/outbox';
import { processOne } from '../sync/outboxWork';

type Row = Record<string, unknown> & { _id: string };
type Handler = (ctx: unknown, args: Record<string, unknown>) => Promise<unknown>;

function run(fn: object, ctx: unknown, args: Record<string, unknown> = {}) {
  return (fn as { _handler: Handler })._handler(ctx, args);
}

const TIME = '2026-10-28T00:00:00.000Z';

function outboxRow(extra: Record<string, unknown> = {}): Row {
  return {
    _id: 'out-1',
    idempotencyKey: `task-status:page-1:To Do:${TIME}`,
    kind: 'task-status',
    database: 'tasks',
    orgId: 'org-1',
    notionPageId: 'page-1',
    expectedLastEditedTime: TIME,
    payload: JSON.stringify({ properties: { Status: 'To Do' } }),
    actor: 'staff',
    status: 'queued',
    attempts: 0,
    nextAttemptAt: 0,
    createdAt: Date.now(),
    ...extra,
  };
}

/** Real claim/get/release over one row; applyOutcome is recorded, not applied. */
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
  const outcomes: Array<Record<string, unknown>> = [];
  const ctx = {
    runQuery: async (ref: never, args: Record<string, unknown>) => {
      const name = getFunctionName(ref);
      if (name === 'sync/outbox:get') return run(get, { db }, args);
      if (name === 'sync/outbox:clientNotionId') return null;
      throw new Error(`Unexpected query ${name}`);
    },
    runMutation: async (ref: never, args: Record<string, unknown>) => {
      const name = getFunctionName(ref);
      if (name === 'sync/outbox:claim') return run(claim, { db }, args);
      if (name === 'sync/outbox:release') return run(release, { db }, args);
      if (name === 'sync/outbox:applyOutcome') {
        outcomes.push(args.outcome as Record<string, unknown>);
        return null;
      }
      throw new Error(`Unexpected mutation ${name}`);
    },
  };
  return { ctx, outcomes };
}

describe('outbox execute', () => {
  const env = { ...process.env };
  const realFetch = globalThis.fetch;
  let calls: Array<{ method: string; url: string }>;

  beforeEach(() => {
    process.env.NOTION_WRITEBACK_ENABLED = 'true';
    process.env.NOTION_WAREHAUS_TOKEN = 'test-token';
    calls = [];
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      calls.push({ method: init?.method ?? 'GET', url });
      return new Response(JSON.stringify({ id: 'page-1', last_edited_time: TIME, properties: {} }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;
  });

  afterEach(() => {
    process.env = { ...env };
    globalThis.fetch = realFetch;
  });

  it('writes a claimed queued row instead of releasing it as inflight', async () => {
    const row = outboxRow();
    const { ctx, outcomes } = actionCtx(row);
    const result = (await run(processOne, ctx, { id: row._id })) as { ok: boolean; error?: string };

    assert.equal(result.ok, true, result.error ?? 'not ok');
    assert.deepEqual(
      calls.map((call) => call.method),
      ['GET', 'PATCH'],
    );
    assert.equal(outcomes.length, 1);
    assert.equal(outcomes[0].kind, 'confirmed');
  });

  it('retries a failed row once it is due', async () => {
    const row = outboxRow({ status: 'failed', attempts: 1, lastError: 'Notion 502' });
    const { ctx, outcomes } = actionCtx(row);
    const result = (await run(processOne, ctx, { id: row._id })) as { ok: boolean; error?: string };

    assert.equal(result.ok, true, result.error ?? 'not ok');
    assert.equal(outcomes[0].kind, 'confirmed');
  });

  it('leaves a row another attempt holds untouched', async () => {
    const row = outboxRow({ status: 'inflight', claimedAt: Date.now() });
    const { ctx, outcomes } = actionCtx(row);
    const result = (await run(processOne, ctx, { id: row._id })) as { ok: boolean; error?: string };

    assert.equal(result.ok, false);
    assert.equal(calls.length, 0);
    assert.equal(outcomes.length, 0);
    assert.equal(row.status, 'inflight');
  });
});
