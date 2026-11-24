import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { API_IDEMPOTENCY_LEASE_MS, IDEMPOTENCY_IN_PROGRESS_ERROR } from '@warehaus/portal-sync';
import { openWrite } from '../portalApi';
import { createForToken, prepareForToken } from '../projectCreate';
import { enqueue } from '../sync/outbox';
import { memoryCtx, type MemoryCtx, type Respond } from './memoryCtx.testkit';
import { seedOrg } from './seedRows.testkit';

const CLIENT_PAGE = '5165ca6e-352e-45af-8918-98779fd76e61';

type CreateResult = { ok: boolean; projectId?: string; notionPageId?: string; reused?: boolean; status?: number; error?: string };

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

/** A client that has not been given portal access yet, and one API token. */
function world() {
  const t = memoryCtx();
  const orgId = seedOrg(t, { notionPageId: CLIENT_PAGE, companyName: 'North', slug: 'north', portalAccess: 'Disabled' });
  const tokenId = t.seed('apiTokens', {
    name: 'bot',
    tokenHash: 'hash-token',
    tokenPrefix: 'wh_',
    scope: 'read-write',
    createdAt: 0,
    rateLimit: 60,
    rateWindowMs: 60_000,
    windowStartedAt: 0,
    windowCount: 0,
  });
  return { t, orgId, tokenId };
}

/**
 * The prepare query and the outbox enqueue really run. The Notion worker is
 * answered with a created page, as `processOne` returns after a create.
 */
function respondFor(t: MemoryCtx): Respond {
  return (run) => {
    if (run.name === 'projectCreate:prepareForToken') return t.call(prepareForToken, run.args);
    if (run.name === 'sync/outbox:enqueue') return t.call(enqueue, run.args);
    if (run.name === 'sync/outboxWork:processOne') {
      return { ok: true, notionPageId: 'page-new', projectId: 'proj-new', reused: false, ...run.args };
    }
    throw new Error(`unexpected ${run.kind} ${run.name}`);
  };
}

function seedOutbox(t: MemoryCtx, orgId: string, fields: Record<string, unknown>) {
  return t.seed('notionOutbox', {
    idempotencyKey: 'project-create:wh_prj_draft1',
    kind: 'project-create',
    orgId,
    database: 'projects',
    payload: '{}',
    actor: 'staff',
    status: 'queued',
    attempts: 1,
    nextAttemptAt: 0,
    createdAt: 1,
    ...fields,
  });
}

const ran = (t: MemoryCtx, name: string) => t.runs.some((run) => run.name === name);

describe('project create resume', () => {
  it('returns 409 for a pending key that is still inside the lease', async () => {
    const { t, tokenId } = world();
    const idemId = t.seed('apiIdempotency', {
      tokenId,
      key: 'key-1',
      requestHash: 'hash-1',
      state: 'pending',
      createdAt: Date.now(),
    });
    const before = t.rows('apiIdempotency');
    const result = await t.call<{ status?: number; body?: { error?: string }; action?: string }>(openWrite, {
      tokenId,
      key: 'key-1',
      requestHash: 'hash-1',
    });
    assert.equal(result.status, 409);
    assert.equal(result.body?.error, IDEMPOTENCY_IN_PROGRESS_ERROR);
    assert.equal(result.action, undefined);
    assert.deepEqual(t.rows('apiIdempotency'), before);
    assert.equal(t.row(idemId)?.state, 'pending');
  });

  it('replays a done outbox row and does not create again', async () => {
    await withWriteback(async () => {
      const { t, orgId } = world();
      seedOutbox(t, orgId, {
        status: 'done',
        resultJson: JSON.stringify({ notionPageId: 'page-done', projectId: 'proj-done', reused: false }),
      });
      const before = t.rows('notionOutbox');
      const result = await t.call<CreateResult>(
        createForToken,
        { orgId, name: 'Draft site', externalId: 'wh_prj_draft1' },
        { respond: respondFor(t) },
      );
      assert.equal(result.ok, true);
      assert.equal(result.projectId, 'proj-done');
      assert.equal(result.notionPageId, 'page-done');
      assert.equal(result.reused, true);
      assert.equal(ran(t, 'sync/outboxWork:processOne'), false);
      assert.equal(ran(t, 'sync/upsert:upsertProject'), false);
      assert.deepEqual(t.rows('notionOutbox'), before);
      assert.deepEqual(t.rows('projects'), []);
    });
  });

  it('returns 409 for an expired idempotency row while the outbox is inflight', async () => {
    await withWriteback(async () => {
      const { t, orgId, tokenId } = world();
      const now = Date.now();
      const idemId = t.seed('apiIdempotency', {
        tokenId,
        key: 'key-1',
        requestHash: 'hash-1',
        state: 'pending',
        createdAt: now - API_IDEMPOTENCY_LEASE_MS,
      });
      const outboxId = seedOutbox(t, orgId, { status: 'inflight', claimedAt: now - API_IDEMPOTENCY_LEASE_MS });

      const opened = await t.call<{ action?: string; id?: string; status?: number }>(openWrite, {
        tokenId,
        key: 'key-1',
        requestHash: 'hash-1',
      });
      // The expired row is reclaimed in place: same id, still pending, never deleted or duplicated.
      assert.equal(opened.action, 'start');
      assert.equal(opened.id, idemId);
      assert.equal(t.rows('apiIdempotency').length, 1);
      assert.equal(t.row(idemId)?.state, 'pending');

      const result = await t.call<CreateResult>(
        createForToken,
        { orgId, name: 'Draft site', externalId: 'wh_prj_draft1' },
        { respond: respondFor(t) },
      );
      assert.equal(result.ok, false);
      assert.equal(result.status, 409);
      assert.equal(result.error, IDEMPOTENCY_IN_PROGRESS_ERROR);
      assert.equal(ran(t, 'sync/outboxWork:processOne'), false);
      assert.equal(t.rows('notionOutbox').length, 1);
      assert.equal(t.row(outboxId)?.status, 'inflight');
      assert.deepEqual(t.rows('projects'), []);
    });
  });

  it('leaves a token project unpublished unless publishToWarehaus is true', async () => {
    await withWriteback(async () => {
      const draft = world();
      const hidden = await draft.t.call<CreateResult>(
        createForToken,
        { orgId: draft.orgId, name: 'Draft site', externalId: 'wh_prj_draft1' },
        { respond: respondFor(draft.t) },
      );
      assert.equal(hidden.ok, true);
      assert.equal(hidden.projectId, 'proj-new');
      const [draftRow] = draft.t.rows('notionOutbox');
      assert.equal(draftRow?.idempotencyKey, 'project-create:wh_prj_draft1');
      assert.equal(draftRow?.kind, 'project-create');
      assert.equal(draftRow?.status, 'queued');
      const draftPayload = JSON.parse(String(draftRow?.payload)) as { properties: { 'Publish to Warehaus': boolean } };
      assert.equal(draftPayload.properties['Publish to Warehaus'], false);
      // The action runs the worker itself; enqueue schedules nothing.
      assert.deepEqual(draft.t.scheduled, []);
      assert.ok(ran(draft.t, 'sync/outboxWork:processOne'));

      const published = world();
      const shown = await published.t.call<CreateResult>(
        createForToken,
        { orgId: published.orgId, name: 'Live site', externalId: 'wh_prj_live1', publishToWarehaus: true },
        { respond: respondFor(published.t) },
      );
      assert.equal(shown.ok, true);
      const [liveRow] = published.t.rows('notionOutbox');
      const livePayload = JSON.parse(String(liveRow?.payload)) as { properties: { 'Publish to Warehaus': boolean } };
      assert.equal(livePayload.properties['Publish to Warehaus'], true);
    });
  });
});
