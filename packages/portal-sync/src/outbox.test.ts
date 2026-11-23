import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PORTAL_COLLECTIONS } from './collections';
import { createMemoryNotionClient, type MemoryNotion } from './notionMemory.testkit';
import {
  OUTBOX_BACKOFF_MS,
  OUTBOX_DEAD_AFTER_MS,
  OUTBOX_LEASE_MS,
  auditEventForOutcome,
  inviteIdempotencyKey,
  missingWritebackProperty,
  missingWritebackProperties,
  nextBackoffMs,
  planCreateResume,
  planIdempotentEnqueue,
  planOutboxAttempt,
  revertIdempotencyKey,
  outboxKindSendsInvite,
  runClientCreateAttempt,
  runOutboxAttempt,
  runProjectCreateAttempt,
  stateIdempotencyKey,
  takeOutboxLease,
  taskStatusIdempotencyKey,
  type OutboxItem,
} from './outbox';
import { WRITEBACK_OFF_ERROR, type WriteProperties } from './writeback';

const properties: WriteProperties = {
  Name: 'Ada Lovelace',
  Email: 'ada@example.com',
  Role: 'Client Member',
  Source: 'portal',
  'Portal Access': 'Disabled',
  'Client Company': ['client-page'],
};

function item(overrides: Partial<OutboxItem> = {}): OutboxItem {
  return {
    idempotencyKey: 'invite:org:ada@example.com:req-1',
    kind: 'createInvite',
    database: 'contacts',
    orgId: 'org',
    properties,
    status: 'queued',
    attempts: 0,
    nextAttemptAt: 0,
    createdAt: 0,
    ...overrides,
  };
}

const { contacts: CONTACTS, tasks: TASKS, projects: PROJECTS, clients: CLIENTS } = PORTAL_COLLECTIONS;
const CLIENT_PAGE = 'client-page';

/** Strict in-memory Notion with the data sources these tests write to. */
function fakeNotion(overrides: Record<string, readonly string[]> = {}): MemoryNotion {
  return createMemoryNotionClient({
    dataSources: {
      [CONTACTS]: ['Name', 'Email', 'Role', 'Source', 'Portal Access', 'Client Company', 'Invite Status'],
      [TASKS]: ['Name', 'Status', 'Estimate', 'Publish to Warehaus', 'Description'],
      [PROJECTS]: ['Name', 'Client', 'Publish to Warehaus', 'Archive', 'Source', 'External ID'],
      [CLIENTS]: ['Company Name', 'Slug', 'Status', 'External ID', 'Source', 'Portal access', 'Publish to Warehaus'],
      ...overrides,
    },
  });
}

function ops(notion: MemoryNotion): string[] {
  return notion.calls.map((call) => call.op);
}

function count(notion: MemoryNotion, op: string): number {
  return notion.calls.filter((call) => call.op === op).length;
}

function richText(value: string) {
  return { rich_text: [{ type: 'text', text: { content: value } }] };
}

/** A contact page with the invite's email, linked to this client page. */
function contactOf(clientPage: string) {
  return { Email: { email: 'ada@example.com' }, 'Client Company': { relation: [{ id: clientPage }] } };
}

describe('outbox keys and backoff', () => {
  it('builds stable idempotency keys', () => {
    assert.equal(inviteIdempotencyKey('org', 'ada@example.com', 'req-1'), 'invite:org:ada@example.com:req-1');
    assert.equal(stateIdempotencyKey('page', 'Accepted', 'tok'), 'state:page:Accepted:tok');
    assert.equal(revertIdempotencyKey('page', 'Portal Access', '2026-09-27T00:00:00.000Z'), 'revert:page:Portal Access:2026-09-27T00:00:00.000Z');
  });

  it('backs off 30s, 2m, 10m, 30m, 2h and honors a longer Retry-After', () => {
    assert.deepEqual(
      [1, 2, 3, 4, 5, 6].map((attempt) => nextBackoffMs(attempt)),
      [...OUTBOX_BACKOFF_MS, OUTBOX_BACKOFF_MS[OUTBOX_BACKOFF_MS.length - 1]],
    );
    assert.equal(nextBackoffMs(1, 90_000), 90_000);
    assert.equal(nextBackoffMs(1, 1_000), 30_000);
  });

  it('holds while write-back is off and marks dead after 24h', () => {
    assert.deepEqual(planOutboxAttempt(item(), 0, false), { action: 'hold', reason: 'writeback-disabled' });
    const dead = planOutboxAttempt(item(), OUTBOX_DEAD_AFTER_MS, true);
    assert.equal(dead.action, 'dead');
  });

  it('processes a row in the same pass that claims it', async () => {
    const now = 1_000_000;
    const taken = takeOutboxLease(item({ nextAttemptAt: now }), now);
    assert.equal(taken.claimed, true);
    if (!taken.claimed) return;
    assert.equal(taken.item.status, 'inflight');
    const notion = fakeNotion();
    const outcome = await runOutboxAttempt({
      item: taken.item,
      nowMs: now,
      writebackEnabled: true,
      owned: true,
      actor: 'staff',
      notion,
    });
    assert.equal(outcome.outcome, 'confirmed');
    assert.equal(count(notion, 'create'), 1);
    assert.equal(planOutboxAttempt(taken.item, now, true).action, 'wait');
  });

  it('rejects a missing writeback property by name before the write', async () => {
    const notionError =
      '{"object":"error","status":400,"code":"validation_error","message":"Invite Status is not a property that exists."}';
    assert.equal(missingWritebackProperty(notionError), 'Invite Status');
    assert.deepEqual(
      missingWritebackProperties(['Name', 'Invite Status', 'Portal Access'], ['Name', 'Portal Access']),
      ['Invite Status'],
    );

    const withInviteStatus = item({ properties: { ...properties, 'Invite Status': 'Pending' } });
    const preflightNotion = fakeNotion();
    const preflight = await runOutboxAttempt({
      item: withInviteStatus,
      nowMs: 0,
      writebackEnabled: true,
      actor: 'staff',
      livePropertyNames: ['Name', 'Email', 'Role', 'Source', 'Portal Access', 'Client Company'],
      notion: preflightNotion,
    });
    assert.equal(preflight.outcome, 'rejected');
    if (preflight.outcome === 'rejected') {
      assert.equal(preflight.reason, 'Notion is missing property "Invite Status".');
    }
    assert.equal(preflightNotion.calls.length, 0);

    const fromNotion = await runOutboxAttempt({
      item: withInviteStatus,
      nowMs: 0,
      writebackEnabled: true,
      actor: 'staff',
      notion: fakeNotion({ [CONTACTS]: ['Name', 'Email', 'Role', 'Source', 'Portal Access', 'Client Company'] }),
    });
    assert.equal(fromNotion.outcome, 'rejected');
    if (fromNotion.outcome === 'rejected') {
      assert.match(fromNotion.reason, /"Invite Status"/);
    }
  });

  it('still retries a Notion failure that does not name a missing property', async () => {
    const notion = fakeNotion();
    notion.failNext('create', 500);
    const outcome = await runOutboxAttempt({ item: item(), nowMs: 0, writebackEnabled: true, actor: 'staff', notion });
    assert.equal(outcome.outcome, 'retry');
  });

  it('skips an inflight row another attempt still holds', () => {
    const now = 1_000_000;
    const held = item({ status: 'inflight', claimedAt: now - 1_000, nextAttemptAt: 0 });
    assert.deepEqual(takeOutboxLease(held, now), { claimed: false, reason: 'inflight' });
    assert.equal(planOutboxAttempt(held, now, true).action, 'wait');
  });

  it('reclaims an inflight row whose lease has expired', async () => {
    const now = 1_000_000;
    const stale = item({ status: 'inflight', claimedAt: now - OUTBOX_LEASE_MS, nextAttemptAt: 0 });
    const taken = takeOutboxLease(stale, now);
    assert.equal(taken.claimed, true);
    if (!taken.claimed) return;
    const notion = fakeNotion();
    const outcome = await runOutboxAttempt({
      item: taken.item,
      nowMs: now,
      writebackEnabled: true,
      owned: true,
      actor: 'staff',
      notion,
    });
    assert.equal(outcome.outcome, 'confirmed');
    assert.equal(count(notion, 'create'), 1);
    assert.equal(planOutboxAttempt(stale, now, true).action, 'execute');
  });

  it('refuses to claim a row that is still in backoff', () => {
    const now = 1_000_000;
    const backing = item({ status: 'failed', attempts: 1, nextAttemptAt: now + OUTBOX_BACKOFF_MS[0] });
    assert.deepEqual(takeOutboxLease(backing, now), { claimed: false, reason: 'backoff' });
    assert.equal(planOutboxAttempt(backing, now, true).action, 'wait');
  });

  it('asks for a staff notice at 5 failures or 1 hour queued', () => {
    const fifth = planOutboxAttempt(item({ attempts: 5, status: 'failed' }), 1_000, true);
    assert.equal(fifth.action, 'execute');
    if (fifth.action === 'execute') assert.equal(fifth.notifyStaff, true);
    const hour = planOutboxAttempt(item({ attempts: 1, status: 'failed' }), 60 * 60 * 1000, true);
    assert.equal(hour.action, 'execute');
    if (hour.action === 'execute') assert.equal(hour.notifyStaff, true);
  });
});

describe('outbox attempt', () => {
  it('does not search or write when the flag is off', async () => {
    const notion = fakeNotion();
    const outcome = await runOutboxAttempt({
      item: item(),
      nowMs: 0,
      writebackEnabled: false,
      actor: 'clientAdmin',
      notion,
    });
    assert.deepEqual(outcome, { outcome: 'held', reason: 'writeback-disabled' });
    assert.equal(notion.calls.length, 0);
  });

  it('patches invite state without the full create payload', async () => {
    const notion = fakeNotion();
    notion.seedPage({ id: 'page-1', dataSourceId: CONTACTS });
    const outcome = await runOutboxAttempt({
      item: item({
        kind: 'setInviteState',
        notionPageId: 'page-1',
        properties: { 'Portal Access': 'Enabled', 'Invite Status': 'Accepted' },
      }),
      nowMs: 0,
      writebackEnabled: true,
      actor: 'system',
      notion,
    });
    assert.equal(outcome.outcome, 'confirmed');
    assert.deepEqual(ops(notion), ['patch']);
    assert.deepEqual(notion.page('page-1')?.properties['Invite Status'], { type: 'select', select: { name: 'Accepted' } });
  });

  it('does not call Notion for an invite state change when write-back is off', async () => {
    const notion = fakeNotion();
    const outcome = await runOutboxAttempt({
      item: item({
        kind: 'revert',
        notionPageId: 'page-1',
        properties: { 'Portal Access': 'Disabled' },
      }),
      nowMs: 0,
      writebackEnabled: false,
      actor: 'system',
      notion,
    });
    assert.deepEqual(outcome, { outcome: 'held', reason: 'writeback-disabled' });
    assert.equal(notion.calls.length, 0);
  });

  it('searches before create and confirms without granting access itself', async () => {
    const notion = fakeNotion();
    const outcome = await runOutboxAttempt({
      item: item(),
      nowMs: 0,
      writebackEnabled: true,
      actor: 'clientAdmin',
      clientNotionId: CLIENT_PAGE,
      notion,
    });
    assert.deepEqual(ops(notion), ['query', 'resolve', 'create']);
    assert.equal(outcome.outcome, 'confirmed');
    if (outcome.outcome === 'confirmed') {
      assert.ok(notion.page(outcome.write.notionPageId));
      assert.equal(outcome.reused, false);
    }
  });

  it('reuses a same-org page and retries a 429 with Retry-After', async () => {
    const notion = fakeNotion();
    notion.seedPage({ id: 'existing', dataSourceId: CONTACTS, properties: contactOf(CLIENT_PAGE) });
    const reused = await runOutboxAttempt({
      item: item(),
      nowMs: 0,
      writebackEnabled: true,
      actor: 'staff',
      clientNotionId: CLIENT_PAGE,
      notion,
    });
    assert.equal(reused.outcome, 'confirmed');
    if (reused.outcome === 'confirmed') {
      assert.equal(reused.reused, true);
      assert.equal(reused.write.notionPageId, 'existing');
    }
    assert.deepEqual(ops(notion), ['query', 'patch']);

    const limited = fakeNotion();
    limited.failNext('create', 429, { retryAfterMs: 90_000 });
    const retry = await runOutboxAttempt({
      item: item(),
      nowMs: 1_000,
      writebackEnabled: true,
      actor: 'staff',
      clientNotionId: CLIENT_PAGE,
      notion: limited,
    });
    assert.equal(retry.outcome, 'retry');
    if (retry.outcome === 'retry') {
      assert.equal(retry.attempts, 1);
      assert.equal(retry.nextAttemptAt, 1_000 + 90_000);
    }
  });

  it('rejects another client before writing', async () => {
    const notion = fakeNotion();
    notion.seedPage({ id: 'other', dataSourceId: CONTACTS, properties: contactOf('client-other') });
    const outcome = await runOutboxAttempt({
      item: item(),
      nowMs: 0,
      writebackEnabled: true,
      actor: 'clientAdmin',
      clientNotionId: CLIENT_PAGE,
      notion,
    });
    assert.equal(outcome.outcome, 'rejected');
    assert.deepEqual(ops(notion), ['query']);
  });

  it('does not insert or write when write-back is off', async () => {
    assert.deepEqual(planIdempotentEnqueue(null, false), {
      action: 'noop',
      error: WRITEBACK_OFF_ERROR,
    });
    const notion = fakeNotion();
    const outcome = await runProjectCreateAttempt({
      item: item({
        kind: 'project-create',
        database: 'projects',
        properties: {
          Name: 'Spring menu',
          Client: ['client-page'],
          'Publish to Warehaus': true,
          Archive: false,
          Source: 'portal',
          'External ID': 'wh_prj_menu',
        },
      }),
      nowMs: 0,
      writebackEnabled: false,
      notion,
    });
    assert.equal(outcome.outcome, 'held');
    assert.equal(notion.calls.length, 0);
    assert.equal(auditEventForOutcome(outcome), null);
  });

  it('does not write the same idempotency key twice', async () => {
    const expected = '2026-10-01T00:00:00.000Z';
    const key = taskStatusIdempotencyKey('page-1', 'Done', expected);
    assert.equal(planIdempotentEnqueue(null, true).action, 'insert');
    assert.equal(planIdempotentEnqueue({ status: 'queued' }, true).action, 'reuse');
    assert.equal(planIdempotentEnqueue({ status: 'done', notionPageId: 'page-1' }, true).action, 'reuse');

    const notion = fakeNotion();
    notion.seedPage({ id: 'page-1', dataSourceId: TASKS, lastEditedTime: expected });
    const statusItem = item({
      idempotencyKey: key,
      kind: 'task-status',
      database: 'tasks',
      notionPageId: 'page-1',
      expectedLastEditedTime: expected,
      properties: { Status: 'Done' },
    });
    const first = await runOutboxAttempt({ item: statusItem, nowMs: 0, writebackEnabled: true, actor: 'staff', notion });
    assert.equal(first.outcome, 'confirmed');
    assert.equal(auditEventForOutcome(first)?.action, 'outbox.confirmed');
    const second = await runOutboxAttempt({
      item: { ...statusItem, status: 'done' },
      nowMs: 1_000,
      writebackEnabled: true,
      actor: 'staff',
      notion,
    });
    assert.equal(second.outcome, 'wait');
    assert.equal(count(notion, 'patch'), 1);
  });

  it('conflicts when Notion changed since the last read and does not write', async () => {
    const notion = fakeNotion();
    notion.seedPage({ id: 'page-1', dataSourceId: TASKS, lastEditedTime: '2026-10-02T00:00:00.000Z' });
    const outcome = await runOutboxAttempt({
      item: item({
        kind: 'task-status',
        database: 'tasks',
        notionPageId: 'page-1',
        expectedLastEditedTime: '2026-10-01T00:00:00.000Z',
        properties: { Status: 'Done' },
      }),
      nowMs: 0,
      writebackEnabled: true,
      actor: 'staff',
      notion,
    });
    assert.equal(outcome.outcome, 'conflict');
    assert.equal(count(notion, 'patch'), 0);
    assert.equal(auditEventForOutcome(outcome)?.action, 'outbox.conflict');
  });

  it('holds a task-fields write when write-back is off and patches when it is on', async () => {
    const fields = item({
      kind: 'task-fields',
      database: 'tasks',
      notionPageId: 'page-1',
      expectedLastEditedTime: '2026-10-01T00:00:00.000Z',
      properties: { Estimate: 'M', 'Publish to Warehaus': true },
    });
    const notion = fakeNotion();
    notion.seedPage({ id: 'page-1', dataSourceId: TASKS, lastEditedTime: '2026-10-01T00:00:00.000Z' });
    const held = await runOutboxAttempt({ item: fields, nowMs: 0, writebackEnabled: false, actor: 'staff', notion });
    assert.deepEqual(held, { outcome: 'held', reason: 'writeback-disabled' });
    assert.equal(notion.calls.length, 0);

    const sent = await runOutboxAttempt({ item: fields, nowMs: 0, writebackEnabled: true, actor: 'staff', notion });
    assert.equal(sent.outcome, 'confirmed');
    if (sent.outcome === 'confirmed') {
      assert.deepEqual(sent.write.properties, { Estimate: 'M', 'Publish to Warehaus': true });
    }
    assert.deepEqual(ops(notion), ['getPage', 'patch']);
    const stored = notion.page('page-1')?.properties ?? {};
    assert.deepEqual(Object.keys(stored).sort(), ['Estimate', 'Publish to Warehaus']);
  });

  it('patches a task description and conflicts when Notion changed', async () => {
    const description = item({
      kind: 'task-description',
      database: 'tasks',
      notionPageId: 'page-1',
      expectedLastEditedTime: '2026-10-01T00:00:00.000Z',
      properties: { Description: 'Staff note' },
    });
    const notion = fakeNotion();
    notion.seedPage({ id: 'page-1', dataSourceId: TASKS, lastEditedTime: '2026-10-01T00:00:00.000Z' });
    const sent = await runOutboxAttempt({ item: description, nowMs: 0, writebackEnabled: true, actor: 'staff', notion });
    assert.equal(sent.outcome, 'confirmed');
    if (sent.outcome === 'confirmed') assert.deepEqual(sent.write.properties, { Description: 'Staff note' });
    assert.deepEqual(ops(notion), ['getPage', 'patch']);

    // The patch above moved last_edited_time, so the same expectation is now stale.
    const conflict = await runOutboxAttempt({ item: description, nowMs: 0, writebackEnabled: true, actor: 'staff', notion });
    assert.equal(conflict.outcome, 'conflict');
    assert.equal(count(notion, 'patch'), 1);
  });

  it('writes a task status when the re-read matches', async () => {
    const notion = fakeNotion();
    notion.seedPage({ id: 'page-1', dataSourceId: TASKS, lastEditedTime: '2026-10-01T00:00:00.000Z' });
    const outcome = await runOutboxAttempt({
      item: item({
        kind: 'task-status',
        database: 'tasks',
        notionPageId: 'page-1',
        expectedLastEditedTime: '2026-10-01T00:00:00.000Z',
        properties: { Status: 'In Progress' },
      }),
      nowMs: 0,
      writebackEnabled: true,
      actor: 'staff',
      notion,
    });
    assert.equal(outcome.outcome, 'confirmed');
    if (outcome.outcome === 'confirmed') assert.deepEqual(outcome.write.properties, { Status: 'In Progress' });
    assert.deepEqual(ops(notion), ['getPage', 'patch']);
  });
});

const clientProperties: WriteProperties = {
  'Company Name': 'North Wind',
  Slug: 'north-wind',
  Status: 'Prospect',
  'External ID': 'wh_cli_north-wind',
  Source: 'portal',
  'Portal access': 'Disabled',
  'Publish to Warehaus': false,
};

describe('client create attempt', () => {
  it('does not search or post when write-back is off', async () => {
    const notion = fakeNotion();
    const outcome = await runClientCreateAttempt({
      item: item({
        idempotencyKey: 'client-create:wh_cli_north-wind',
        kind: 'client-create',
        database: 'clients',
        properties: clientProperties,
      }),
      nowMs: 0,
      writebackEnabled: false,
      notion,
    });
    assert.equal(outcome.outcome, 'held');
    assert.equal(notion.calls.length, 0);
    assert.equal(outboxKindSendsInvite('client-create'), false);
  });

  it('reuses a slug hit and does not post or patch', async () => {
    const notion = fakeNotion();
    notion.seedPage({
      id: 'page-existing',
      dataSourceId: CLIENTS,
      properties: { Slug: richText('north-wind'), 'External ID': richText('wh_cli_other') },
    });
    const outcome = await runClientCreateAttempt({
      item: item({ kind: 'client-create', database: 'clients', properties: clientProperties }),
      nowMs: 0,
      writebackEnabled: true,
      owned: true,
      notion,
    });
    assert.equal(outcome.outcome, 'confirmed');
    if (outcome.outcome !== 'confirmed') return;
    assert.equal(outcome.reused, true);
    assert.equal(outcome.reuseKind, 'slug');
    assert.equal(outcome.write.notionPageId, 'page-existing');
    assert.deepEqual(ops(notion), ['query']);
  });

  it('posts once when External ID and Slug are new', async () => {
    const notion = fakeNotion();
    const outcome = await runClientCreateAttempt({
      item: item({ kind: 'client-create', database: 'clients', properties: clientProperties }),
      nowMs: 0,
      writebackEnabled: true,
      owned: true,
      notion,
    });
    assert.equal(count(notion, 'create'), 1);
    assert.equal(outcome.outcome, 'confirmed');
    if (outcome.outcome !== 'confirmed') return;
    assert.equal(outcome.reused, false);
    const stored = notion.page(outcome.write.notionPageId)?.properties ?? {};
    assert.deepEqual(stored['Portal access'], { type: 'select', select: { name: 'Disabled' } });
    assert.deepEqual(stored.Status, { type: 'select', select: { name: 'Prospect' } });
    assert.deepEqual(stored['Publish to Warehaus'], { type: 'checkbox', checkbox: false });
  });
});

describe('create resume', () => {
  it('replays a done row and leaves an inflight row alone', () => {
    assert.deepEqual(
      planCreateResume({
        status: 'done',
        resultJson: JSON.stringify({ notionPageId: 'page-1', projectId: 'proj-1', reused: false }),
      }),
      { action: 'replay', notionPageId: 'page-1', projectId: 'proj-1', reused: false },
    );
    assert.deepEqual(planCreateResume({ status: 'inflight', resultJson: null }), { action: 'busy' });
    assert.deepEqual(planCreateResume({ status: 'queued' }), { action: 'busy' });
    assert.equal(planCreateResume({ status: 'failed' }).action, 'retry');
    assert.equal(planCreateResume({ status: 'dead' }).action, 'retry');
  });
});
