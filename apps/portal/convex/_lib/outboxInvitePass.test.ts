import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { OUTBOX_LEASE_MS } from '@warehaus/portal-sync';
import { attachProjectId, applyOutcome, claim, clientNotionId, get, listDue, release } from '../sync/outbox';
import { drainPendingStages } from '../sync/taskWrite';
import { issueTokenAfterConfirm } from '../invites';
import { processDue, processOne } from '../sync/outboxWork';
import { memoryCtx, type MemoryCtx, type Respond } from './memoryCtx.testkit';
import { seedOrg, seedProject } from './seedRows.testkit';

type Fields = Record<string, unknown>;
type ProcessResult = { ok: boolean; error?: string };

const properties = {
  Name: 'Ada Lovelace',
  Email: 'ada@example.com',
  Role: 'Warehaus Staff',
  Source: 'portal',
  'Portal Access': 'Disabled',
  'Invite Status': 'Pending',
  'Client Company': ['internal-page'],
};

let keys = 0;

/** A queued createInvite row, with overrides. */
function outboxRow(t: MemoryCtx, orgId: string, extra: Fields = {}): string {
  return t.seed('notionOutbox', {
    idempotencyKey: `invite:${orgId}:ada@example.com:req-${(keys += 1)}`,
    kind: 'createInvite',
    database: 'contacts',
    orgId,
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
  });
}

/**
 * The outbox functions the worker calls really run on the in-memory ctx.
 * The invite email action is recorded and answered as sent.
 */
function world(clientPage: string, overrides: Record<string, (args: Fields) => unknown> = {}) {
  const t = memoryCtx();
  const orgId = seedOrg(t, { notionPageId: clientPage });
  const real: Record<string, unknown> = {
    'sync/outbox:get': get,
    'sync/outbox:listDue': listDue,
    'sync/outbox:clientNotionId': clientNotionId,
    'sync/outbox:claim': claim,
    'sync/outbox:release': release,
    'sync/outbox:applyOutcome': applyOutcome,
    'sync/outbox:attachProjectId': attachProjectId,
    'sync/taskWrite:drainPendingStages': drainPendingStages,
    'invites:issueTokenAfterConfirm': issueTokenAfterConfirm,
  };
  const respond: Respond = async (run) => {
    const override = overrides[run.name];
    if (override) return override(run.args);
    if (run.name === 'invites:sendIssuedInvite') return { sent: true };
    const fn = real[run.name];
    if (!fn) throw new Error(`Unexpected ${run.kind} ${run.name}`);
    return t.call(fn, run.args);
  };
  return {
    t,
    orgId,
    row: (extra: Fields = {}) => outboxRow(t, orgId, extra),
    process: (id: string) => t.call<ProcessResult>(processOne, { id }, { respond }),
    processDue: () => t.call<{ processed: number }>(processDue, {}, { respond }),
    emails: () => t.runs.filter((run) => run.name === 'invites:sendIssuedInvite').map((run) => run.args),
    outcomes: () =>
      t.runs.filter((run) => run.name === 'sync/outbox:applyOutcome').map((run) => run.args.outcome as Fields),
  };
}

const issuedToken = () => ({
  issued: true,
  raw: 'raw-token',
  to: 'ada@example.com',
  name: 'Ada Lovelace',
  alreadyHasLogin: false,
});

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
    const w = world('internal-page', { 'invites:issueTokenAfterConfirm': issuedToken });
    const id = w.row();
    const result = await w.process(id);

    assert.equal(result.ok, true, result.error ?? 'not ok');
    assert.equal(calls.some((call) => call.startsWith('POST') && call.endsWith('/pages')), true);
    assert.equal(w.emails().length, 1);
    assert.equal(w.emails()[0]?.to, 'ada@example.com');
    assert.equal(typeof w.emails()[0]?.rawToken, 'string');
  });

  it('does not send while another attempt holds a live lease', async () => {
    const w = world('internal-page', { 'invites:issueTokenAfterConfirm': issuedToken });
    const id = w.row({ status: 'inflight', claimedAt: Date.now() });
    const result = await w.process(id);

    assert.equal(result.ok, false);
    assert.equal(w.emails().length, 0);
    assert.equal(calls.some((call) => call.endsWith('/pages')), false);
    assert.equal(w.t.row(id)?.status, 'inflight');
  });

  it('reclaims an invite whose lease expired and then sends it', async () => {
    const w = world('internal-page', { 'invites:issueTokenAfterConfirm': issuedToken });
    const id = w.row({ status: 'inflight', claimedAt: Date.now() - OUTBOX_LEASE_MS });
    const result = await w.process(id);

    assert.equal(result.ok, true, result.error ?? 'not ok');
    assert.equal(w.emails().length, 1);
    assert.equal(calls.some((call) => call.startsWith('POST') && call.endsWith('/pages')), true);
  });

  it('does not send an invite that is still in backoff', async () => {
    const w = world('internal-page', { 'invites:issueTokenAfterConfirm': issuedToken });
    const id = w.row({ status: 'failed', attempts: 1, nextAttemptAt: Date.now() + 30_000 });
    const result = await w.process(id);

    assert.equal(result.ok, false);
    assert.match(result.error ?? '', /not due/);
    assert.equal(w.emails().length, 0);
    assert.equal(calls.some((call) => call.endsWith('/pages')), false);
    assert.equal(w.t.row(id)?.status, 'failed');
  });

  it('patches a claimed task stage and confirms it', async () => {
    const w = world('internal-page', { 'invites:issueTokenAfterConfirm': issuedToken });
    const id = w.row({
      kind: 'task-stage',
      database: 'tasks',
      notionPageId: 'page-1',
      expectedLastEditedTime: '2026-11-10T00:00:00.000Z',
      payload: JSON.stringify({ properties: { Stage: 'Planning' } }),
      idempotencyKey: 'task-stage:page-1:Planning::2026-11-10T00:00:00.000Z',
    });
    const result = await w.process(id);

    assert.equal(result.ok, true, result.error ?? 'not ok');
    assert.equal(calls.some((call) => call.startsWith('GET ') && call.includes('/pages/page-1')), true);
    assert.equal(calls.some((call) => call.startsWith('PATCH ') && call.includes('/pages/page-1')), true);
    assert.equal(w.outcomes()[0]?.kind, 'confirmed');
    assert.equal(w.t.row(id)?.status, 'done');
    assert.equal(w.emails().length, 0);
  });

  it('confirms the invite, issues the token, and then calls the email handler', async () => {
    const w = world('internal-page');
    const id = w.row();
    const result = await w.process(id);

    assert.equal(result.ok, true, result.error ?? 'not ok');
    assert.equal(w.t.row(id)?.status, 'done');
    const tokens = w.t.rows('inviteTokens');
    assert.equal(tokens.length, 1);
    assert.equal(tokens[0]?.status, 'live');
    assert.equal(tokens[0]?.emailNormalized, 'ada@example.com');
    const emails = w.emails();
    assert.equal(emails.length, 1);
    assert.equal(emails[0]?.to, 'ada@example.com');
    assert.equal(typeof emails[0]?.rawToken, 'string');
    assert.equal(String(emails[0]?.rawToken).length > 0, true);
  });
});

describe('outbox rows due for another attempt', () => {
  it('returns an inflight row whose lease has expired and skips a live lease', async () => {
    const now = 1_000_000;
    const t = memoryCtx();
    const orgId = seedOrg(t);
    const ids: Record<string, string> = {};
    const seeds: Array<[string, Fields]> = [
      ['queued', { status: 'queued', nextAttemptAt: 0 }],
      ['failed', { status: 'failed', nextAttemptAt: now }],
      ['waiting', { status: 'queued', nextAttemptAt: now + 1 }],
      ['crashed', { status: 'inflight', nextAttemptAt: 0, claimedAt: now - OUTBOX_LEASE_MS }],
      ['held', { status: 'inflight', nextAttemptAt: 0, claimedAt: now - 1_000 }],
      ['early', { status: 'inflight', nextAttemptAt: now + 1, claimedAt: now - OUTBOX_LEASE_MS - 1 }],
    ];
    for (const [name, fields] of seeds) ids[name] = outboxRow(t, orgId, fields);
    const names = new Map(Object.entries(ids).map(([name, id]) => [id, name]));

    const due = await t.call<Array<{ _id: string }>>(listDue, { now });
    assert.deepEqual(
      due.map((row) => names.get(row._id)),
      ['crashed', 'queued', 'failed'],
    );
    assert.deepEqual(t.reads.unbounded(), []);
  });
});

const EXPECTED = '2026-11-10T00:00:00.000Z';

function schemaFetch(properties: Record<string, unknown>, onSchema: () => void) {
  const calls: string[] = [];
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    const path = String(url);
    const method = init?.method ?? 'GET';
    calls.push(`${method} ${path}`);
    if (path.includes('/databases/')) return new Response('not a database', { status: 404 });
    if (path.includes('/data_sources/') && path.endsWith('/query')) {
      return new Response(JSON.stringify({ results: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (path.includes('/data_sources/')) {
      onSchema();
      return new Response(JSON.stringify({ properties }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (method === 'GET' && path.includes('/pages/')) {
      return new Response(JSON.stringify({ id: 'page-1', last_edited_time: EXPECTED }), {
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
      return new Response(JSON.stringify({ id: 'page-new', last_edited_time: EXPECTED }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response('unexpected', { status: 500 });
  }) as typeof fetch;
  return calls;
}

/** The worker world: invite issue is answered as not issued, project upsert returns a seeded project. */
function workerWorld() {
  let projectId = '';
  const w = world('client-page', {
    'invites:issueTokenAfterConfirm': () => ({ issued: false }),
    'sync/upsert:upsertProject': () => projectId,
  });
  projectId = seedProject(w.t, w.orgId);
  return { ...w, projectId };
}

describe('outbox work with a live property list', () => {
  const env = { ...process.env };
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    process.env.NOTION_WRITEBACK_ENABLED = 'true';
    process.env.NOTION_WAREHAUS_TOKEN = 'test-token';
  });

  afterEach(() => {
    process.env = { ...env };
    globalThis.fetch = realFetch;
  });

  it('patches a task description after the re-read matches, and conflicts when it does not', async () => {
    const w = workerWorld();
    const description = (key: string) =>
      w.row({
        kind: 'task-description',
        database: 'tasks',
        notionPageId: 'page-1',
        expectedLastEditedTime: EXPECTED,
        payload: JSON.stringify({ properties: { Description: 'Staff note' } }),
        idempotencyKey: key,
      });
    const id = description('task-description:page-1');
    let schemas = 0;
    const calls = schemaFetch({ Description: { type: 'rich_text' }, Name: { type: 'title' } }, () => {
      schemas += 1;
    });
    const result = await w.process(id);
    assert.equal(result.ok, true, result.error ?? 'not ok');
    assert.equal(schemas, 1);
    assert.equal(w.outcomes()[0]?.kind, 'confirmed');
    assert.equal(w.t.row(id)?.status, 'done');
    assert.equal(calls.some((call) => call.startsWith('PATCH ')), true);
    const patch = calls.find((call) => call.startsWith('PATCH '));
    assert.ok(patch);

    // The first row is done, so the conflict pass runs on a second queued row.
    const conflictId = description('task-description:page-1:again');
    schemas = 0;
    globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
      const path = String(url);
      const method = init?.method ?? 'GET';
      if (path.includes('/databases/')) return new Response('no', { status: 404 });
      if (path.includes('/data_sources/')) {
        schemas += 1;
        return new Response(JSON.stringify({ properties: { Description: {} } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (method === 'GET' && path.includes('/pages/')) {
        return new Response(JSON.stringify({ id: 'page-1', last_edited_time: '2026-11-11T00:00:00.000Z' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (method === 'PATCH') return new Response('should not patch', { status: 500 });
      return new Response('unexpected', { status: 500 });
    }) as typeof fetch;
    const conflicted = await w.process(conflictId);
    assert.equal(conflicted.ok, false);
    assert.match(conflicted.error ?? '', /Nothing was written/);
    const outcomes = w.outcomes();
    assert.equal(outcomes[outcomes.length - 1]?.kind, 'conflict');
    assert.equal(w.t.row(conflictId)?.status, 'conflict');
  });

  it('checks invite-state and project-create against the live property list', async () => {
    const inviteState = (w: ReturnType<typeof workerWorld>) =>
      w.row({
        kind: 'setInviteState',
        database: 'contacts',
        notionPageId: 'page-1',
        expectedLastEditedTime: EXPECTED,
        payload: JSON.stringify({ properties: { 'Portal Access': 'Enabled', 'Invite Status': 'Accepted' } }),
        idempotencyKey: 'state:page-1',
      });
    let schemas = 0;
    schemaFetch(
      { 'Portal Access': { type: 'select' }, Name: { type: 'title' }, Email: { type: 'email' } },
      () => {
        schemas += 1;
      },
    );
    const missing = workerWorld();
    const missingId = inviteState(missing);
    const rejected = await missing.process(missingId);
    assert.equal(rejected.ok, false);
    assert.equal(rejected.error, 'Notion is missing property "Invite Status".');
    assert.equal(missing.outcomes()[0]?.kind, 'rejected');
    assert.equal(missing.t.row(missingId)?.status, 'dead');
    assert.equal(schemas, 1);

    schemas = 0;
    schemaFetch(
      {
        'Portal Access': { type: 'select' },
        'Invite Status': { type: 'select' },
        Name: { type: 'title' },
      },
      () => {
        schemas += 1;
      },
    );
    const present = workerWorld();
    const presentId = inviteState(present);
    const accepted = await present.process(presentId);
    assert.equal(accepted.ok, true, accepted.error ?? 'not ok');
    assert.equal(present.outcomes()[0]?.kind, 'confirmed');
    assert.equal(present.t.row(presentId)?.status, 'done');

    const projectCreate = (w: ReturnType<typeof workerWorld>) =>
      w.row({
        kind: 'project-create',
        database: 'projects',
        payload: JSON.stringify({
          properties: {
            Name: 'Spring menu',
            Client: ['client-page'],
            'Publish to Warehaus': true,
            Archive: false,
            Source: 'portal',
            'External ID': 'wh_prj_menu',
          },
        }),
        idempotencyKey: 'project-create:wh_prj_menu',
      });
    schemas = 0;
    schemaFetch(
      {
        Name: {},
        Client: {},
        'Publish to Warehaus': {},
        Archive: {},
        Source: {},
      },
      () => {
        schemas += 1;
      },
    );
    const incomplete = workerWorld();
    const incompleteId = projectCreate(incomplete);
    const projectRejected = await incomplete.process(incompleteId);
    assert.equal(projectRejected.ok, false);
    assert.match(projectRejected.error ?? '', /External ID/);
    assert.equal(incomplete.outcomes()[0]?.kind, 'rejected');
    assert.equal(incomplete.t.row(incompleteId)?.status, 'dead');

    schemaFetch(
      {
        Name: {},
        Client: {},
        'Publish to Warehaus': {},
        Archive: {},
        Source: {},
        'External ID': {},
      },
      () => {
        schemas += 1;
      },
    );
    const created = workerWorld();
    const createdId = projectCreate(created);
    const projectOk = await created.process(createdId);
    assert.equal(projectOk.ok, true, projectOk.error ?? 'not ok');
    assert.equal(created.outcomes()[0]?.kind, 'confirmed');
    assert.equal(created.t.row(createdId)?.status, 'done');
    assert.equal(JSON.parse(String(created.t.row(createdId)?.resultJson)).projectId, created.projectId);
  });

  it('reads each data source once per processDue run', async () => {
    const w = workerWorld();
    const first = w.row({
      kind: 'task-description',
      database: 'tasks',
      notionPageId: 'page-1',
      expectedLastEditedTime: EXPECTED,
      payload: JSON.stringify({ properties: { Description: 'One' } }),
    });
    const second = w.row({
      kind: 'task-stage',
      database: 'tasks',
      notionPageId: 'page-1',
      expectedLastEditedTime: EXPECTED,
      payload: JSON.stringify({ properties: { Stage: 'Planning' } }),
    });
    let schemas = 0;
    schemaFetch({ Description: {}, Stage: {}, Name: {} }, () => {
      schemas += 1;
    });
    const result = await w.processDue();
    assert.equal(result.processed, 2);
    assert.equal(schemas, 1);
    assert.deepEqual(
      w.t.runs.filter((run) => run.name === 'sync/outbox:claim').map((run) => run.args.id),
      [first, second],
    );
  });
});
