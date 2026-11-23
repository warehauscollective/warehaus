import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createMemoryNotionClient, DEFAULT_MEMORY_ENV } from '../sync/notion/memory.testkit';
import { NotionError } from '../sync/notion/types';

const TASKS = 'ds-tasks';

function notion(pageSize = 100) {
  return createMemoryNotionClient({
    databases: { 'db-tasks': TASKS },
    dataSources: { [TASKS]: ['Name', 'Status', 'External ID', 'Email'] },
    pageSize,
  });
}

describe('in-memory Notion adapter', () => {
  it('pages a query with cursors and keeps archived pages in their own partition', async () => {
    const client = notion(2);
    for (const id of ['a', 'b', 'c']) client.seedPage({ id, dataSourceId: TASKS });
    client.seedPage({ id: 'gone', dataSourceId: TASKS, archived: true });

    const first = await client.queryDataSource('db-tasks');
    assert.deepEqual(first.results.map((page) => page.id), ['a', 'b']);
    assert.ok(first.nextCursor);
    const second = await client.queryDataSource('db-tasks', { cursor: first.nextCursor });
    assert.deepEqual(second.results.map((page) => page.id), ['c']);
    assert.equal(second.nextCursor, null);

    const archived = await client.queryDataSource(TASKS, { archived: true });
    assert.deepEqual(archived.results.map((page) => page.id), ['gone']);
  });

  it('filters by last edited time, rich text, email and an or of those', async () => {
    const client = notion();
    client.seedPage({
      id: 'old',
      dataSourceId: TASKS,
      lastEditedTime: '2026-11-01T00:00:00.000Z',
      properties: { 'External ID': { rich_text: [{ type: 'text', text: { content: 'wh_1' } }] } },
    });
    client.seedPage({
      id: 'new',
      dataSourceId: TASKS,
      lastEditedTime: '2026-11-20T00:00:00.000Z',
      properties: { Email: { email: 'ada@example.com' } },
    });

    const since = await client.queryDataSource(TASKS, { editedSinceIso: '2026-11-10T00:00:00.000Z' });
    assert.deepEqual(since.results.map((page) => page.id), ['new']);

    const byText = await client.queryDataSource(TASKS, {
      filter: { property: 'External ID', rich_text: { equals: 'wh_1' } },
    });
    assert.deepEqual(byText.results.map((page) => page.id), ['old']);
    assert.deepEqual(
      (byText.results[0].properties?.['External ID'] as { rich_text: Array<{ plain_text: string }> }).rich_text[0]
        .plain_text,
      'wh_1',
    );

    const either = await client.queryDataSource(TASKS, {
      filter: {
        or: [
          { property: 'External ID', rich_text: { equals: 'nope' } },
          { property: 'Email', email: { equals: 'ada@example.com' } },
        ],
      },
    });
    assert.deepEqual(either.results.map((page) => page.id), ['new']);
  });

  it('throws a plain Error on a filter no caller sends today', async () => {
    const client = notion();
    await assert.rejects(
      client.queryDataSource(TASKS, { filter: { property: 'Status', select: { equals: 'Done' } } }),
      (err: unknown) => err instanceof Error && !(err instanceof NotionError) && /does not support/.test(err.message),
    );
    await assert.rejects(
      client.queryDataSource(TASKS, { filter: { property: 'Name', rich_text: { contains: 'x' } } }),
      /does not support/,
    );
  });

  it('throws a NotionError 404 on a missing page, blocks or data source', async () => {
    const client = notion();
    for (const read of [
      () => client.getPage('missing'),
      () => client.listBlocks('missing'),
      () => client.queryDataSource('ds-unknown'),
      () => client.listPropertyNames('ds-unknown'),
    ]) {
      await assert.rejects(read(), (err: unknown) => err instanceof NotionError && err.status === 404);
    }
  });

  it('rejects a write that names a property the data source lacks, as Notion does', async () => {
    const client = notion();
    client.seedPage({ id: 'p', dataSourceId: TASKS });
    const result = await client.patchProperties('writeback', 'p', { Colour: { select: { name: 'Red' } } });
    assert.equal(result.ok, false);
    assert.equal(result.status, 400);
    assert.equal(result.error, 'Colour is not a property that exists.');
  });

  it('moves last edited time on each write and returns the stored page', async () => {
    const client = notion();
    const seeded = client.seedPage({ id: 'p', dataSourceId: TASKS });
    const patched = await client.patchProperties('writeback', 'p', { Status: { status: { name: 'Done' } } });
    assert.equal(patched.ok, true);
    assert.ok(Date.parse(patched.lastEditedTime!) > Date.parse(seeded.lastEditedTime));
    assert.deepEqual(client.page('p')?.properties.Status, { type: 'status', status: { name: 'Done' } });

    const archived = await client.archivePage('writeback', 'p');
    assert.equal(archived.ok, true);
    assert.equal(client.page('p')?.archived, true);
  });

  it('applies the write policy and records the skip without touching the page', async () => {
    const client = createMemoryNotionClient({
      env: { ...DEFAULT_MEMORY_ENV, writebackFlag: undefined },
      dataSources: { [TASKS]: ['Status'] },
    });
    client.seedPage({ id: 'p', dataSourceId: TASKS });
    const result = await client.patchProperties('writeback', 'p', { Status: { status: { name: 'Done' } } });
    assert.equal(result.skipped, 'writeback-off');
    assert.equal(client.page('p')?.properties.Status, undefined);
    assert.deepEqual(client.calls[client.calls.length - 1], { op: 'patch', kind: 'writeback', id: 'p', skipped: true });

    const mirror = await client.patchProperties('auth-mirror', 'p', {});
    assert.equal(mirror.skipped, 'not-production');
  });

  it('fails the next call on demand: reads throw, writes return the status', async () => {
    const client = notion();
    client.seedPage({ id: 'p', dataSourceId: TASKS });
    client.failNext('getPage', 429, { retryAfterMs: 2000 });
    await assert.rejects(client.getPage('p'), (err: unknown) => {
      assert.ok(err instanceof NotionError);
      assert.equal(err.status, 429);
      assert.equal(err.retryAfterMs, 2000);
      return true;
    });
    assert.equal((await client.getPage('p')).id, 'p');

    client.failNext('patch', 503);
    const failed = await client.patchProperties('writeback', 'p', {});
    assert.deepEqual({ ok: failed.ok, status: failed.status }, { ok: false, status: 503 });
  });
});
