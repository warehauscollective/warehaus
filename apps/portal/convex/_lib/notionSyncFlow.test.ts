/**
 * Pull and outbox against the in-memory Notion adapter, through the same
 * helpers the Convex actions call. Convex ctx is not involved: these tests
 * cover everything from the attempt logic down to Notion.
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  PORTAL_COLLECTIONS,
  WRITEBACK_OFF_ERROR,
  clientCreateHitFromNotion,
  readNotionPlain,
  runClientCreateAttempt,
  runOutboxAttempt,
  runProjectCreateAttempt,
  type OutboxItem,
  type ProjectCreateProperties,
  type WritebackDatabase,
} from '@warehaus/portal-sync';
import { fetchPlainPageBody, fetchSafeDocBody } from '../sync/docBody';
import { setNotionClientForTests } from '../sync/notion';
import { DEFAULT_MEMORY_ENV, createMemoryNotionClient, type MemoryNotion } from '../sync/notion/memory.testkit';
import type { NotionEnv } from '../sync/notion/policy';
import {
  fetchNotionPage,
  listDataSourcePropertyNames,
  queryAllDataSourcePages,
  writeSharedResourceUrl,
} from '../sync/notionApi';
import {
  archiveNotionPage,
  createNotionClientPage,
  createNotionProjectPage,
  readNotionLastEdited,
  searchClientCreateHits,
  searchNotionPages,
  searchProjectCreateHits,
  writeNotionPage,
} from '../sync/notionWrite';

const { tasks: TASKS, contacts: CONTACTS, projects: PROJECTS, clients: CLIENTS, sharedResources: RESOURCES } =
  PORTAL_COLLECTIONS;

const CLIENT_PAGE = 'client-north-wind';
const OTHER_CLIENT_PAGE = 'client-elsewhere';

let notion: MemoryNotion;

function useNotion(env: NotionEnv = DEFAULT_MEMORY_ENV, pageSize = 2): MemoryNotion {
  notion = createMemoryNotionClient({
    env,
    pageSize,
    dataSources: {
      [TASKS]: ['Name', 'Status', 'Stage'],
      [CONTACTS]: ['Name', 'Email', 'Role', 'Source', 'Portal Access', 'Client Company'],
      [PROJECTS]: ['Name', 'Client', 'Publish to Warehaus', 'Archive', 'Source', 'External ID'],
      [CLIENTS]: ['Company Name', 'Slug', 'Status', 'External ID', 'Source', 'Portal access', 'Publish to Warehaus'],
      [RESOURCES]: ['Name', 'URL'],
    },
  });
  setNotionClientForTests(notion);
  return notion;
}

beforeEach(() => {
  useNotion();
});

afterEach(() => {
  setNotionClientForTests(null);
});

function text(value: string) {
  return { rich_text: [{ type: 'text', text: { content: value } }] };
}

function paragraph(value: string) {
  return { type: 'paragraph', paragraph: { rich_text: [{ plain_text: value }] } };
}

function item(overrides: Partial<OutboxItem>): OutboxItem {
  return {
    idempotencyKey: 'key',
    kind: 'createInvite',
    database: 'contacts',
    orgId: 'org',
    properties: {},
    status: 'inflight',
    attempts: 0,
    nextAttemptAt: 0,
    createdAt: 0,
    ...overrides,
  };
}

/** The wiring `outboxWork.execute` uses for property writes. Task 3 moves this into `runOutboxAttempt`. */
function outboxAttempt(outboxItem: OutboxItem, clientNotionId: string | null) {
  const database = outboxItem.database as Exclude<WritebackDatabase, 'activity'>;
  return runOutboxAttempt({
    item: outboxItem,
    nowMs: 1_000,
    writebackEnabled: true,
    owned: true,
    actor: 'staff',
    readPage: async (notionPageId) => {
      const read = await readNotionLastEdited(notionPageId);
      if (!read.ok) {
        return { ok: false, status: read.status, retryAfterMs: read.retryAfterMs, error: read.error ?? 'read failed' };
      }
      return { ok: true, lastEditedTime: read.lastEditedTime ?? null };
    },
    search: async (plan) => {
      const property = plan.property as 'Slug' | 'Email' | 'External ID';
      const hits = await searchNotionPages(database, { property, value: plan.value });
      return hits.map((hit) => {
        const ids = readNotionPlain(hit.properties['Client Company']);
        const sameOrg = database !== 'contacts' || (Array.isArray(ids) && ids.includes(clientNotionId ?? ''));
        return { notionPageId: hit.notionPageId, sameOrg };
      });
    },
    write: (request) => writeNotionPage(database, request),
  });
}

const invite = {
  Name: 'Ada Lovelace',
  Email: 'ada@example.com',
  Role: 'Client Member',
  Source: 'portal',
  'Portal Access': 'Disabled',
  'Client Company': [CLIENT_PAGE],
};

describe('pull against in-memory Notion', () => {
  it('loads only pages edited since the watermark, across cursor pages', async () => {
    for (let i = 1; i <= 5; i += 1) {
      notion.seedPage({ id: `task-${i}`, dataSourceId: TASKS, lastEditedTime: `2026-11-0${i}T00:00:00.000Z` });
    }
    const rows = await queryAllDataSourcePages(TASKS, { editedSinceIso: '2026-11-02T12:00:00.000Z' });
    assert.deepEqual(rows.map((row) => row.id), ['task-3', 'task-4', 'task-5']);
    assert.equal(notion.calls.filter((call) => call.op === 'query').length, 2);
  });

  it('marks pages from the archived query as archived, and a missing retry page as null', async () => {
    notion.seedPage({ id: 'live', dataSourceId: TASKS });
    notion.seedPage({ id: 'binned', dataSourceId: TASKS, inTrash: true });
    const archived = await queryAllDataSourcePages(TASKS, { archived: true });
    assert.deepEqual(
      archived.map((row) => ({ id: row.id, archived: row.archived, inTrash: row.inTrash })),
      [{ id: 'binned', archived: true, inTrash: true }],
    );
    assert.equal(await fetchNotionPage('deleted-in-notion'), null);
    assert.equal((await fetchNotionPage('live'))?.archived, false);
  });

  it('reads a task body across block pages, and stops quietly when Notion fails', async () => {
    notion.seedPage({ id: 'task', dataSourceId: TASKS, blocks: ['one', 'two', 'three'].map(paragraph) });
    assert.equal(await fetchPlainPageBody('task'), 'one\ntwo\nthree');

    notion.failNext('listBlocks', 502);
    assert.equal(await fetchPlainPageBody('task'), '');
  });

  it('keeps only allowlisted blocks in a client doc body', async () => {
    notion.seedPage({
      id: 'doc',
      dataSourceId: TASKS,
      blocks: [paragraph('Welcome'), { type: 'child_database', child_database: { title: 'Secret' } }, { type: 'divider', divider: {} }],
    });
    const body = await fetchSafeDocBody('doc', 'org');
    assert.deepEqual(JSON.parse(body.body!), [{ type: 'paragraph', text: 'Welcome' }, { type: 'divider' }]);
  });

  it('writes a resource URL only with write-back on and a Blob token', async () => {
    useNotion({ ...DEFAULT_MEMORY_ENV, blobToken: 'blob' });
    notion.seedPage({ id: 'res', dataSourceId: RESOURCES });
    assert.equal(await writeSharedResourceUrl({ notionPageId: 'res', url: 'https://blob/x.pdf' }), 'written');
    assert.deepEqual(notion.page('res')?.properties.URL, { type: 'url', url: 'https://blob/x.pdf' });
    assert.equal(
      await writeSharedResourceUrl({ notionPageId: 'res', url: 'https://blob/x.pdf', currentUrl: 'https://blob/x.pdf' }),
      'skipped',
    );

    useNotion({ ...DEFAULT_MEMORY_ENV, blobToken: 'blob', writebackFlag: undefined });
    notion.seedPage({ id: 'res', dataSourceId: RESOURCES });
    assert.equal(await writeSharedResourceUrl({ notionPageId: 'res', url: 'https://blob/y.pdf' }), 'skipped');
    assert.equal(notion.page('res')?.properties.URL, undefined);

    useNotion();
    notion.seedPage({ id: 'res', dataSourceId: RESOURCES });
    assert.equal(await writeSharedResourceUrl({ notionPageId: 'res', url: 'https://blob/z.pdf' }), 'skipped');
  });

  it('reads property names, and returns null when Notion cannot be read', async () => {
    assert.deepEqual(await listDataSourcePropertyNames(RESOURCES), ['Name', 'URL']);
    notion.failNext('listPropertyNames', 500);
    assert.equal(await listDataSourcePropertyNames(RESOURCES), null);
  });
});

describe('outbox against in-memory Notion', () => {
  it('patches a task status after the re-read matches, then the pull sees it', async () => {
    const seeded = notion.seedPage({ id: 'task', dataSourceId: TASKS });
    const outcome = await outboxAttempt(
      item({
        kind: 'task-status',
        database: 'tasks',
        notionPageId: 'task',
        expectedLastEditedTime: seeded.lastEditedTime,
        properties: { Status: 'Done' },
      }),
      null,
    );
    assert.equal(outcome.outcome, 'confirmed');
    const pulled = await queryAllDataSourcePages(TASKS, { editedSinceIso: seeded.lastEditedTime });
    assert.deepEqual(pulled.map((row) => row.id), ['task']);
    assert.ok(pulled[0].properties.Status);
  });

  it('does not write when someone edited the page in Notion since the last read', async () => {
    const seeded = notion.seedPage({ id: 'task', dataSourceId: TASKS });
    await notion.patchProperties('writeback', 'task', { Name: { title: [{ text: { content: 'Edited' } }] } });
    const outcome = await outboxAttempt(
      item({
        kind: 'task-status',
        database: 'tasks',
        notionPageId: 'task',
        expectedLastEditedTime: seeded.lastEditedTime,
        properties: { Status: 'Done' },
      }),
      null,
    );
    assert.equal(outcome.outcome, 'conflict');
    assert.equal(notion.page('task')?.properties.Status, undefined);
  });

  it('creates an invite contact, then reuses it on a retry instead of creating twice', async () => {
    const first = await outboxAttempt(item({ properties: invite }), CLIENT_PAGE);
    assert.equal(first.outcome, 'confirmed');
    const second = await outboxAttempt(item({ properties: invite }), CLIENT_PAGE);
    assert.equal(second.outcome, 'confirmed');
    assert.ok(second.outcome === 'confirmed' && second.reused);
    assert.equal(notion.calls.filter((call) => call.op === 'create').length, 1);
  });

  it('rejects an invite whose email belongs to another client', async () => {
    notion.seedPage({
      id: 'theirs',
      dataSourceId: CONTACTS,
      properties: { Email: { email: 'ada@example.com' }, 'Client Company': { relation: [{ id: OTHER_CLIENT_PAGE }] } },
    });
    const outcome = await outboxAttempt(item({ properties: invite }), CLIENT_PAGE);
    assert.equal(outcome.outcome, 'rejected');
    assert.equal(notion.calls.filter((call) => call.op === 'create' || call.op === 'patch').length, 0);
  });

  it('retries after a 429 using Retry-After', async () => {
    const seeded = notion.seedPage({ id: 'task', dataSourceId: TASKS });
    notion.failNext('patch', 429, { retryAfterMs: 600_000 });
    const outcome = await outboxAttempt(
      item({
        kind: 'task-status',
        database: 'tasks',
        notionPageId: 'task',
        expectedLastEditedTime: seeded.lastEditedTime,
        properties: { Status: 'Done' },
      }),
      null,
    );
    assert.equal(outcome.outcome, 'retry');
    assert.ok(outcome.outcome === 'retry' && outcome.nextAttemptAt >= 1_000 + 600_000);
  });

  it('rejects a write naming a property Notion no longer has', async () => {
    notion = createMemoryNotionClient({ dataSources: { [CONTACTS]: ['Name', 'Email', 'Role', 'Source', 'Client Company'] } });
    setNotionClientForTests(notion);
    const outcome = await outboxAttempt(item({ properties: invite }), CLIENT_PAGE);
    assert.deepEqual(outcome, { outcome: 'rejected', reason: 'Notion is missing property "Portal Access".' });
  });

  it('leaves Notion alone and keeps the row for retry when write-back is off', async () => {
    useNotion({ ...DEFAULT_MEMORY_ENV, writebackFlag: undefined });
    const outcome = await outboxAttempt(item({ properties: invite }), CLIENT_PAGE);
    assert.equal(outcome.outcome, 'retry');
    assert.ok(outcome.outcome === 'retry' && outcome.lastError === WRITEBACK_OFF_ERROR);
    assert.equal(notion.calls.filter((call) => call.op === 'create' && !call.skipped).length, 0);
  });

  it('creates a project once, and reuses it for the same client on the next attempt', async () => {
    const properties: ProjectCreateProperties = {
      Name: 'Spring menu',
      Client: [CLIENT_PAGE],
      'Publish to Warehaus': true,
      Archive: false,
      Source: 'portal',
      'External ID': 'wh_prj_menu',
    };
    const attempt = () =>
      runProjectCreateAttempt({
        item: item({ kind: 'project-create', database: 'projects', properties }),
        nowMs: 1_000,
        writebackEnabled: true,
        owned: true,
        search: (externalId) => searchProjectCreateHits(externalId),
        create: async () => createNotionProjectPage(properties),
      });
    const first = await attempt();
    assert.ok(first.outcome === 'confirmed' && !first.reused);
    const second = await attempt();
    assert.ok(second.outcome === 'confirmed' && second.reused);
    assert.equal(second.outcome === 'confirmed' && second.write.notionPageId, first.write.notionPageId);
  });

  it('reuses a client page found by slug and does not post a new one', async () => {
    notion.seedPage({ id: 'existing-client', dataSourceId: CLIENTS, properties: { Slug: text('north-wind'), 'External ID': text('') } });
    const properties = {
      'Company Name': 'North Wind',
      Slug: 'north-wind',
      Status: 'Prospect',
      'External ID': 'wh_cli_north-wind',
      Source: 'portal',
      'Portal access': 'Disabled',
      'Publish to Warehaus': false,
    } as const;
    const outcome = await runClientCreateAttempt({
      item: item({ kind: 'client-create', database: 'clients', properties }),
      nowMs: 1_000,
      writebackEnabled: true,
      owned: true,
      search: async () => (await searchClientCreateHits(properties['External ID'], properties.Slug)).map(clientCreateHitFromNotion),
      create: createNotionClientPage,
    });
    assert.ok(outcome.outcome === 'confirmed' && outcome.reused && outcome.reuseKind === 'slug');
    assert.equal(notion.calls.filter((call) => call.op === 'create').length, 0);
  });

  it('archives a task, and the next pull finds it in the archived partition', async () => {
    notion.seedPage({ id: 'task', dataSourceId: TASKS });
    const archived = await archiveNotionPage('task');
    assert.equal(archived.ok, true);
    assert.deepEqual((await queryAllDataSourcePages(TASKS)).map((row) => row.id), []);
    assert.deepEqual((await queryAllDataSourcePages(TASKS, { archived: true })).map((row) => row.id), ['task']);
  });
});
