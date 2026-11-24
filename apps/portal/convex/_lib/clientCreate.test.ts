import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildClientCreateProperties, WRITEBACK_OFF_ERROR } from '@warehaus/portal-sync';
import { prepare, createInNotion, findByExternalId, findByNotionPage } from '../clientCreate';
import { clearAncestorHides } from '../sync/hide';
import { backfillClientNameKeys } from '../sync/nameKeyBackfill';
import { enqueue } from '../sync/outbox';
import { upsertClient } from '../sync/upsert';
import { memoryCtx, type MemoryCtx, type Respond, type RunCall } from './memoryCtx.testkit';
import { seedContact, seedOrg, seedProject } from './seedRows.testkit';

type Fields = Record<string, unknown>;
type Result = Record<string, unknown> & { ok?: boolean };

const STAFF_USER = 'user-staff';
const STAFF = { authUserId: STAFF_USER };

function properties(extra: { primaryEmail?: string; phone?: string } = {}) {
  const built = buildClientCreateProperties({ companyName: 'North Wind', ...extra });
  assert.equal(built.ok, true);
  if (!built.ok) throw new Error('expected properties');
  return built.properties;
}

/**
 * The Warehaus staff org and Peter's staff contact. Pass `contact` or `org`
 * overrides to turn the caller into a client.
 */
function staffWorld(options: { contact?: Fields; org?: Fields } = {}) {
  const t = memoryCtx();
  const staffOrgId = seedOrg(t, {
    slug: 'warehaus-internal',
    companyName: 'Warehaus',
    notionPageId: 'page-staff',
    portalAccess: 'Disabled',
    status: 'Active',
    nameKey: 'warehaus',
    ...options.org,
  });
  seedContact(t, staffOrgId, {
    name: 'Peter',
    email: 'peter@warehaus.co',
    authUserId: STAFF_USER,
    role: 'Warehaus Staff',
    portalAccess: 'Enabled',
    ...options.contact,
  });
  const client = (fields: Fields) => seedOrg(t, { status: 'Prospect', portalAccess: 'Disabled', ...fields });
  return { t, staffOrgId, client };
}

/** Reads of the clients table through a query, in order. */
const clientQueries = (t: MemoryCtx) => t.reads.all.filter((read) => read.table === 'clients');

const names = (t: MemoryCtx) => t.runs.map((run) => run.name);

/**
 * Answers createInNotion's nested calls. Queries and mutations really run on
 * the same in-memory db. processOne (the Notion sender) is stubbed with
 * `process`. Any invite, mail or email call fails the test.
 */
function responder(
  t: MemoryCtx,
  process: (args: Fields) => Promise<Fields> = async () => ({ ok: true, notionPageId: 'page-new', reused: false }),
): Respond {
  return (run: RunCall) => {
    if (/invite|mail|email/.test(run.name)) throw new Error(`client create must not call ${run.name}`);
    if (run.kind === 'query') {
      if (run.name === 'clientCreate:prepare') return t.call(prepare, run.args);
      if (run.name === 'clientCreate:findByNotionPage') return t.call(findByNotionPage, run.args);
      if (run.name === 'clientCreate:findByExternalId') return t.call(findByExternalId, run.args);
    }
    if (run.kind === 'mutation') {
      if (run.name === 'sync/outbox:enqueue') return t.call(enqueue, run.args);
      if (run.name === 'sync/upsert:upsertClient') return t.call(upsertClient, run.args);
    }
    if (run.kind === 'action' && run.name === 'sync/outboxWork:processOne') return process(run.args);
    throw new Error(`unexpected ${run.kind} ${run.name}`);
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

describe('staff client create', () => {
  it('rejects a client role before any client lookup', async () => {
    const { t } = staffWorld({ contact: { role: 'Client Admin' }, org: { portalAccess: 'Enabled' } });
    await assert.rejects(
      () => t.call(prepare, { authUserId: STAFF_USER, companyName: 'North Wind' }),
      /Staff role required/,
    );
    assert.deepEqual(clientQueries(t), []);
    assert.equal(t.rows('notionOutbox').length, 0);
    assert.equal(t.rows('clients').length, 1);
  });

  it('reuses a nameKey hit with one bounded take and does not enqueue', async () => {
    const { t, client } = staffWorld();
    const clientA = client({
      notionPageId: 'page-a',
      companyName: 'North Wind',
      slug: 'north-wind',
      nameKey: 'north wind',
      syncHiddenAt: 50,
      syncHiddenReason: 'gate',
    });
    client({
      notionPageId: 'page-b',
      companyName: 'North Wind',
      slug: 'north-wind-2',
      nameKey: 'north wind',
    });
    const prepared = await t.call(prepare, { authUserId: STAFF_USER, companyName: '  NORTH   WIND  ' });
    assert.deepEqual(prepared, { ok: true, reused: true, clientId: clientA, notionPageId: 'page-a' });
    // Two rows share the nameKey, so a unique() read would have thrown. The
    // take count itself is not recorded by the adapter.
    assert.deepEqual(clientQueries(t), [{ table: 'clients', index: 'by_nameKey', eq: ['nameKey'], terminal: 'take', limit: 2 }]);
    assert.equal(t.row(clientA)?.syncHiddenAt, 50);

    const result = await t.call(createInNotion, { companyName: 'North Wind' }, { as: STAFF, respond: responder(t) });
    assert.deepEqual(result, { ok: true, clientId: clientA, notionPageId: 'page-a', reused: true });
    assert.equal(names(t).includes('sync/outbox:enqueue'), false);
    assert.equal(names(t).includes('sync/upsert:upsertClient'), false);
    assert.equal(t.rows('notionOutbox').length, 0);
    assert.equal(t.rows('clients').length, 3);
  });

  it('reuses a slug when the old row has no nameKey', async () => {
    const { t, client } = staffWorld();
    const old = client({
      notionPageId: 'page-old',
      companyName: 'North Wind',
      slug: 'north-wind',
      portalAccess: 'Enabled',
      status: 'Active',
    });
    const prepared = await t.call(prepare, { authUserId: STAFF_USER, companyName: 'North Wind' });
    assert.deepEqual(prepared, { ok: true, reused: true, clientId: old, notionPageId: 'page-old' });
    assert.deepEqual(
      clientQueries(t).map((read) => [read.index, read.terminal, read.limit]),
      [
        ['by_nameKey', 'take', 2],
        ['by_slug', 'take', 2],
      ],
    );
  });

  it('rejects a reserved slug and a bad email without writing', async () => {
    const { t, staffOrgId } = staffWorld();
    const reserved = await t.call(prepare, { authUserId: STAFF_USER, companyName: 'Warehaus Internal' });
    assert.deepEqual(reserved, { ok: false, error: 'That slug is reserved', field: 'slug' });
    const email = await t.call<Result>(prepare, {
      authUserId: STAFF_USER,
      companyName: 'North Wind',
      primaryEmail: 'not-an-email',
    });
    assert.equal(email.ok, false);
    assert.deepEqual(clientQueries(t), []);
    assert.equal(t.rows('clients').some((row) => row.slug === 'warehaus-internal' && row._id !== staffOrgId), false);
    assert.equal(t.rows('clients').length, 1);
  });

  it('queues nothing and inserts no client when write-back is off', async () => {
    const { t } = staffWorld();
    await withFlag(false, async () => {
      const result = await t.call(
        createInNotion,
        { companyName: 'North Wind', hostSlug: 'other-host' },
        { as: STAFF, respond: responder(t) },
      );
      assert.deepEqual(result, { ok: false, error: WRITEBACK_OFF_ERROR });
      assert.equal(names(t).includes('sync/outbox:enqueue'), false);
      assert.equal(names(t).includes('sync/outboxWork:processOne'), false);
      assert.equal(t.rows('notionOutbox').length, 0);
      assert.equal(t.rows('clients').length, 1);
      assert.equal(t.scheduled.length, 0);
    });
  });

  it('enqueues client-create on the staff org and upserts only after a page id', async () => {
    const { t, staffOrgId } = staffWorld();
    await withFlag(true, async () => {
      const result = await t.call<Result & { clientId?: string; reused?: boolean }>(
        createInNotion,
        { companyName: 'North Wind', primaryEmail: 'ada@example.com', phone: '415 555 0100', hostSlug: 'other-host' },
        { as: STAFF, respond: responder(t) },
      );
      assert.equal(result.ok, true);
      assert.equal(result.reused, false);
      assert.equal(t.scheduled.length, 0);
      // The upsert runs after the sender returned a page id, never before.
      const order = names(t);
      assert.ok(order.indexOf('sync/outboxWork:processOne') < order.indexOf('sync/upsert:upsertClient'));
      assert.equal(t.rows('notionOutbox').length, 1);
      const row = t.rows('notionOutbox')[0]!;
      assert.equal(row.kind, 'client-create');
      assert.equal(row.orgId, staffOrgId);
      assert.equal(row.database, 'clients');
      assert.equal(row.idempotencyKey, 'client-create:wh_cli_north-wind');
      const payload = JSON.parse(String(row.payload)) as { properties: Record<string, unknown> };
      assert.equal(payload.properties.Status, 'Prospect');
      assert.equal(payload.properties['Portal access'], 'Disabled');
      assert.equal(payload.properties['Publish to Warehaus'], false);
      assert.equal(payload.properties.Source, 'portal');
      assert.equal('Contacts' in payload.properties, false);
      assert.equal('Invite Status' in payload.properties, false);
      assert.equal(order.includes('invites:issueTokenAfterConfirm'), false);
      const created = t.row(String(result.clientId));
      assert.equal(created?.nameKey, 'north wind');
      assert.equal(created?.status, 'Prospect');
      assert.equal(created?.portalAccess, 'Disabled');
      assert.equal(created?.source, 'portal');
      assert.equal(created?.externalId, 'wh_cli_north-wind');
      assert.equal(created?.primaryEmail, 'ada@example.com');
      assert.equal(created?.phone, '415 555 0100');
      assert.equal(created?.notionPageId, 'page-new');
      assert.equal(created?.syncHiddenAt, undefined);
      assert.equal(t.rows('clients').length, 2);
    });
  });

  it('a second create for the same name reuses the first client and queues nothing new', async () => {
    const { t } = staffWorld();
    await withFlag(true, async () => {
      const respond = responder(t);
      const first = await t.call<Result & { clientId?: string }>(createInNotion, { companyName: 'North Wind' }, { as: STAFF, respond });
      const second = await t.call<Result & { clientId?: string; reused?: boolean }>(
        createInNotion,
        { companyName: 'north  wind' },
        { as: STAFF, respond },
      );
      assert.equal(second.ok, true);
      assert.equal(second.reused, true);
      assert.equal(second.clientId, first.clientId);
      assert.equal(t.rows('clients').length, 2);
      assert.equal(t.rows('notionOutbox').length, 1);
      assert.equal(names(t).filter((name) => name === 'sync/outboxWork:processOne').length, 1);
    });
  });

  it('does not upsert or unhide a client that is already in Convex', async () => {
    const { t, client } = staffWorld();
    const hidden = client({
      notionPageId: 'page-hidden',
      companyName: 'Hidden Co',
      slug: 'hidden-co',
      nameKey: 'hidden co',
      status: 'Active',
      syncHiddenAt: 99,
      syncHiddenReason: 'gate',
    });
    await withFlag(true, async () => {
      const result = await t.call(
        createInNotion,
        { companyName: 'Fresh Co' },
        { as: STAFF, respond: responder(t, async () => ({ ok: true, notionPageId: 'page-hidden', reused: false })) },
      );
      assert.deepEqual(result, { ok: true, clientId: hidden, notionPageId: 'page-hidden', reused: true });
      assert.equal(names(t).includes('sync/upsert:upsertClient'), false);
      assert.equal(t.row(hidden)?.syncHiddenAt, 99);
      assert.equal(t.row(hidden)?.syncHiddenReason, 'gate');
      assert.equal(t.row(hidden)?.status, 'Active');
      assert.equal(t.rows('clients').length, 2);
    });
  });

  it('upserts when Notion already confirmed the page and Convex has no row', async () => {
    const { t } = staffWorld();
    await withFlag(true, async () => {
      const result = await t.call<Result & { clientId?: string; reused?: boolean }>(
        createInNotion,
        { companyName: 'Fresh Co' },
        { as: STAFF, respond: responder(t, async () => ({ ok: true, notionPageId: 'page-remote', reused: true })) },
      );
      assert.equal(result.ok, true);
      assert.equal(result.reused, false);
      assert.equal(names(t).includes('sync/upsert:upsertClient'), true);
      const created = t.row(String(result.clientId));
      assert.equal(created?.notionPageId, 'page-remote');
      assert.equal(created?.status, 'Prospect');
      assert.equal(created?.portalAccess, 'Disabled');
      assert.equal(created?.syncHiddenAt, undefined);
      assert.equal(t.rows('clients').length, 2);
    });
  });

  it('finds an existing client by name after nameKey is filled, even with a different slug', async () => {
    const { t, client } = staffWorld();
    const oldName = client({
      notionPageId: 'page-old-name',
      companyName: 'North Wind',
      slug: 'different-slug',
      status: 'Active',
      syncHiddenAt: 40,
      syncHiddenReason: 'gate',
    });
    const filled = await t.call<{ updated: number; unchanged: number; scanned: number; isDone: boolean }>(
      backfillClientNameKeys,
      { numItems: 25 },
    );
    assert.equal(filled.updated, 1);
    assert.equal(filled.unchanged, 1);
    assert.equal(filled.isDone, true);
    assert.equal(t.row(oldName)?.nameKey, 'north wind');
    assert.deepEqual(clientQueries(t).map((read) => [read.index, read.terminal, read.limit]), [['by_creation_time', 'take', 25]]);
    // A caller cannot ask for more than 50 rows in one batch.
    t.reads.reset();
    await t.call(backfillClientNameKeys, { numItems: 500 });
    assert.deepEqual(clientQueries(t).map((read) => read.limit), [50]);
    // The batch is bounded by numItems: one row per call leaves the pass unfinished.
    const one = await t.call<{ scanned: number; isDone: boolean }>(backfillClientNameKeys, { numItems: 1 });
    assert.equal(one.scanned, 1);
    assert.equal(one.isDone, false);
    assert.deepEqual(t.reads.unbounded(), []);

    const prepared = await t.call<Result & { reused?: boolean; clientId?: string }>(prepare, {
      authUserId: STAFF_USER,
      companyName: 'North Wind',
    });
    assert.equal(prepared.ok, true);
    assert.equal(prepared.reused, true);
    assert.equal(prepared.clientId, oldName);
    assert.equal(t.rows('notionOutbox').length, 0);
  });

  it('clears a stale Disabled gate stamp and leaves trash concealed', async () => {
    const t = memoryCtx();
    const disabled = seedOrg(t, {
      portalAccess: 'Disabled',
      syncHiddenAt: 70,
      syncHiddenReason: 'gate',
      companyName: 'North Wind',
      slug: 'north-wind',
    });
    const project = seedProject(t, disabled, { syncHiddenAt: 70, syncHiddenReason: 'ancestor', name: 'Site' });
    const trashed = seedOrg(t, {
      portalAccess: 'Disabled',
      syncHiddenAt: 80,
      syncHiddenReason: 'trashed',
      companyName: 'Gone',
      slug: 'gone',
    });
    await t.call(clearAncestorHides, { orgId: disabled });
    assert.equal(t.row(disabled)?.syncHiddenAt, undefined);
    assert.equal(t.row(disabled)?.syncHiddenReason, undefined);
    assert.equal(t.row(project)?.syncHiddenAt, undefined);
    assert.equal(t.row(project)?.syncHiddenReason, undefined);
    await t.call(clearAncestorHides, { orgId: trashed });
    assert.equal(t.row(trashed)?.syncHiddenAt, 80);
    assert.equal(t.row(trashed)?.syncHiddenReason, 'trashed');
  });

  it('rejects a non-staff session and an anonymous session', async () => {
    const { t } = staffWorld({ contact: { role: 'Client Member' }, org: { portalAccess: 'Enabled' } });
    const denied = await t.call(createInNotion, { companyName: 'North Wind' }, { as: STAFF, respond: responder(t) });
    assert.deepEqual(denied, { ok: false, error: 'Staff role required' });
    const signedOut = await t.call(createInNotion, { companyName: 'North Wind' }, { respond: responder(t) });
    assert.deepEqual(signedOut, { ok: false, error: 'Not authenticated' });
    assert.equal(t.rows('notionOutbox').length, 0);
    assert.equal(t.rows('clients').length, 1);
  });

  it('accepts a client-create payload and rejects publish, status, and contact fields', async () => {
    const t = memoryCtx();
    const orgId = seedOrg(t, { slug: 'warehaus-internal' });
    const enqueueClient = (idempotencyKey: string, props: Fields) =>
      t.call(enqueue, {
        idempotencyKey,
        kind: 'client-create',
        orgId,
        database: 'clients',
        payload: JSON.stringify({ properties: props }),
        actor: 'staff',
        schedule: false,
      });

    await withFlag(true, async () => {
      const ok = (await enqueueClient('client-create:wh_cli_north-wind', properties())) as Result;
      assert.equal(ok.ok, true);
      assert.equal(t.rows('notionOutbox').length, 1);

      const publish = await enqueueClient('client-create:bad-publish', { ...properties(), 'Publish to Warehaus': true });
      assert.deepEqual(publish, { ok: false, error: 'Publish to Warehaus must be off' });

      const active = await enqueueClient('client-create:bad-status', { ...properties(), Status: 'Active' });
      assert.deepEqual(active, { ok: false, error: 'Status must be Prospect' });

      const contacts = await enqueueClient('client-create:bad-contacts', { ...properties(), Contacts: ['page'] });
      assert.deepEqual(contacts, { ok: false, error: 'Contacts is not part of client create' });
      assert.equal(t.rows('notionOutbox').length, 1);
    });

    await withFlag(false, async () => {
      const off = await enqueueClient('client-create:wh_cli_other', properties());
      assert.deepEqual(off, { ok: false, error: WRITEBACK_OFF_ERROR });
      assert.equal(t.rows('notionOutbox').length, 1);
    });
    assert.equal(t.scheduled.length, 0);
  });
});
