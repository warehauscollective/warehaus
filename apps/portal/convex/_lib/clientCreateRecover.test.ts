import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { buildClientCreateProperties } from '@warehaus/portal-sync';
import { findByExternalId, findByNotionPage } from '../clientCreate';
import { applyOutcome, attachClientId, claim, get, release } from '../sync/outbox';
import { processOne } from '../sync/outboxWork';
import { upsertClient } from '../sync/upsert';
import { memoryCtx, type MemoryCtx, type Respond } from './memoryCtx.testkit';
import { seedOrg } from './seedRows.testkit';

type Fields = Record<string, unknown>;
type Result = { ok: boolean; clientId?: string; error?: string };

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

/** A fresh ctx with the Warehaus staff org and one client-create outbox row on it. */
function world(row: Fields = {}) {
  const t = memoryCtx();
  const staffOrgId = seedOrg(t, { slug: 'warehaus-internal', companyName: 'Warehaus', nameKey: 'warehaus' });
  const outboxId = t.seed('notionOutbox', {
    idempotencyKey: 'client-create:wh_cli_north-wind',
    kind: 'client-create',
    database: 'clients',
    orgId: staffOrgId,
    payload: JSON.stringify({ properties: clientPayload() }),
    actor: 'staff',
    status: 'queued',
    attempts: 0,
    nextAttemptAt: 0,
    createdAt: Date.now(),
    ...row,
  });
  return { t, staffOrgId, outboxId, newClients: () => t.rows('clients').filter((item) => item._id !== staffOrgId) };
}

/**
 * Answers processOne's nested calls by really running them on the same db.
 * `upsert` can stand in for upsertClient (to make it throw). Mail and invites
 * fail the test.
 */
function responder(t: MemoryCtx, upsert?: (args: Fields) => unknown): Respond {
  return (run) => {
    if (run.kind === 'action') throw new Error(`client create must not send mail (${run.name})`);
    if (/invite|mail/.test(run.name)) throw new Error(`client create must not call ${run.name}`);
    switch (run.name) {
      case 'sync/outbox:get':
        return t.call(get, run.args);
      case 'clientCreate:findByNotionPage':
        return t.call(findByNotionPage, run.args);
      case 'clientCreate:findByExternalId':
        return t.call(findByExternalId, run.args);
      case 'sync/outbox:claim':
        return t.call(claim, run.args);
      case 'sync/outbox:release':
        return t.call(release, run.args);
      case 'sync/outbox:applyOutcome':
        return t.call(applyOutcome, run.args);
      case 'sync/outbox:attachClientId':
        return t.call(attachClientId, run.args);
      case 'sync/upsert:upsertClient':
        return upsert ? upsert(run.args) : t.call(upsertClient, run.args);
      default:
        throw new Error(`unexpected ${run.kind} ${run.name}`);
    }
  };
}

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
    const { t, outboxId, newClients } = world();
    let upserts = 0;
    const respond = responder(t, (args) => {
      upserts += 1;
      if (upserts === 1) throw new Error('convex upsert failed');
      return t.call(upsertClient, args);
    });

    const first = await t.call<Result>(processOne, { id: outboxId }, { respond });
    assert.equal(first.ok, false);
    assert.match(first.error ?? '', /convex upsert failed/);
    assert.equal(t.row(outboxId)?.status, 'failed');
    assert.notEqual(t.row(outboxId)?.status, 'done');
    assert.equal(posts, 1);
    assert.equal(newClients().length, 0);

    // Make the retry due now instead of after the backoff.
    await t.db.patch(outboxId, { nextAttemptAt: 0 });
    const second = await t.call<Result>(processOne, { id: outboxId }, { respond });
    assert.equal(second.ok, true, second.error ?? 'retry did not recover');
    // The retry found the page it already made and did not post a second one.
    assert.equal(posts, 1);
    const row = t.row(outboxId);
    assert.equal(row?.status, 'done');
    const clients = newClients();
    assert.equal(clients.length, 1);
    assert.equal(clients[0]?.notionPageId, 'page-new');
    assert.equal(clients[0]?.portalAccess, 'Disabled');
    assert.equal(clients[0]?.status, 'Prospect');
    assert.equal(clients[0]?.syncHiddenAt, undefined);
    assert.equal(row?.orgId, second.clientId);
    assert.equal(row?.orgId, clients[0]?._id);
    assert.equal(t.runs.some((run) => run.kind === 'action'), false);
  });

  it('upserts a done row that confirmed Notion and never stored a client', async () => {
    const { t, outboxId, newClients } = world({
      status: 'done',
      attempts: 1,
      notionPageId: 'page-done',
      resultJson: JSON.stringify({ notionPageId: 'page-done', reused: true }),
    });
    const result = await t.call<Result>(processOne, { id: outboxId }, { respond: responder(t) });
    assert.equal(result.ok, true, result.error ?? 'done row did not upsert');
    assert.equal(posts, 0);
    const clients = newClients();
    assert.equal(clients.length, 1);
    assert.equal(clients[0]?.notionPageId, 'page-done');
    const row = t.row(outboxId);
    assert.equal(row?.orgId, result.clientId);
    assert.match(String(row?.resultJson), /clientId/);
  });
});
