import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { WRITEBACK_OFF_ERROR } from '@warehaus/portal-sync';
import { createHttpNotionClient } from '../sync/notion/http';
import {
  authMirrorAllowedHere,
  decideWrite,
  readNotionEnv,
  writebackAllowed,
  type NotionEnv,
} from '../sync/notion/policy';
import { NotionError } from '../sync/notion/types';

const PROD = 'https://unique-turtle-383.convex.cloud';
const DEV = 'https://graceful-mastiff-960.convex.cloud';

const live: NotionEnv = { token: 't', writebackFlag: 'true', cloudUrl: DEV, blobToken: 'b' };

describe('Notion write policy', () => {
  it('allows write-back only when the flag is exactly true', () => {
    assert.deepEqual(decideWrite('writeback', live), { allowed: true });
    for (const flag of [undefined, '', 'TRUE', '1', 'false']) {
      assert.deepEqual(decideWrite('writeback', { ...live, writebackFlag: flag }), {
        allowed: false,
        reason: 'writeback-off',
      });
    }
  });

  it('keeps the auth mirror on production only, whatever the flags say', () => {
    assert.deepEqual(decideWrite('auth-mirror', { ...live, cloudUrl: DEV }), {
      allowed: false,
      reason: 'not-production',
    });
    assert.deepEqual(decideWrite('auth-mirror', { token: 't', cloudUrl: PROD }), { allowed: true });
    assert.equal(authMirrorAllowedHere({ cloudUrl: PROD }), true);
    assert.equal(authMirrorAllowedHere({ cloudUrl: DEV }), false);
  });

  it('never writes a resource URL unless write-back is on and a Blob token is set', () => {
    assert.deepEqual(decideWrite('resource-url', live), { allowed: true });
    assert.deepEqual(decideWrite('resource-url', { ...live, writebackFlag: undefined }), {
      allowed: false,
      reason: 'writeback-off',
    });
    assert.deepEqual(decideWrite('resource-url', { ...live, blobToken: undefined }), {
      allowed: false,
      reason: 'not-configured',
    });
  });

  it('skips every kind as not-configured without a token', () => {
    assert.deepEqual(decideWrite('writeback', { ...live, token: undefined }), {
      allowed: false,
      reason: 'not-configured',
    });
    assert.deepEqual(decideWrite('auth-mirror', { cloudUrl: PROD }), {
      allowed: false,
      reason: 'not-configured',
    });
  });

  it('lets enqueue follow the flag alone', () => {
    assert.equal(writebackAllowed({ writebackFlag: 'true' }), true);
    assert.equal(writebackAllowed({ writebackFlag: 'yes' }), false);
  });

  it('reads blank env values as unset', () => {
    assert.deepEqual(
      readNotionEnv({ NOTION_WAREHAUS_TOKEN: '  ', BLOB_READ_WRITE_TOKEN: '', NOTION_WRITEBACK_ENABLED: 'true' }),
      { token: undefined, writebackFlag: 'true', cloudUrl: undefined, blobToken: undefined },
    );
  });
});

type Call = { url: string; method: string; body: unknown; headers: Record<string, string> };

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

function stubFetch(respond: (call: Call) => Response): Call[] {
  const calls: Call[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const call: Call = {
      url: String(input),
      method: init?.method ?? 'GET',
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      headers: (init?.headers ?? {}) as Record<string, string>,
    };
    calls.push(call);
    return respond(call);
  }) as typeof fetch;
  return calls;
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

describe('Notion client over HTTP', () => {
  it('sends nothing when the write policy refuses, and returns a typed skip', async () => {
    const calls = stubFetch(() => json({ id: 'p' }));
    const notion = createHttpNotionClient({ ...live, writebackFlag: undefined });
    const result = await notion.patchProperties('writeback', 'page-1', { Stage: { select: { name: 'Done' } } });
    assert.equal(result.ok, false);
    assert.equal(result.skipped, 'writeback-off');
    assert.equal(result.error, WRITEBACK_OFF_ERROR);
    assert.equal(calls.length, 0);
  });

  it('skips an auth-mirror write on shared dev even with write-back on', async () => {
    const calls = stubFetch(() => json({ id: 'p' }));
    const result = await createHttpNotionClient(live).patchProperties('auth-mirror', 'page-1', {});
    assert.equal(result.skipped, 'not-production');
    assert.equal(calls.length, 0);
  });

  it('patches with one API version and returns the page on success', async () => {
    const calls = stubFetch(() => json({ id: 'page-1', last_edited_time: '2026-11-23T10:00:00.000Z' }));
    const result = await createHttpNotionClient(live).patchProperties('writeback', 'page-1', { A: 1 });
    assert.deepEqual(
      { ok: result.ok, id: result.notionPageId, edited: result.lastEditedTime },
      { ok: true, id: 'page-1', edited: '2026-11-23T10:00:00.000Z' },
    );
    assert.equal(calls[0].method, 'PATCH');
    assert.equal(calls[0].url, 'https://api.notion.com/v1/pages/page-1');
    assert.equal(calls[0].headers['Notion-Version'], '2025-09-03');
    assert.deepEqual(calls[0].body, { properties: { A: 1 } });
  });

  it('returns status and Retry-After on a refused write instead of throwing', async () => {
    stubFetch(() => json({ message: 'slow down' }, 429, { 'retry-after': '2' }));
    const result = await createHttpNotionClient(live).archivePage('writeback', 'page-1');
    assert.equal(result.ok, false);
    assert.equal(result.status, 429);
    assert.equal(result.retryAfterMs, 2000);
  });

  it('throws a NotionError with status and Retry-After on a failed read', async () => {
    stubFetch(() => json({ message: 'slow down' }, 429, { 'retry-after': '3' }));
    await assert.rejects(createHttpNotionClient(live).getPage('page-1'), (err: unknown) => {
      assert.ok(err instanceof NotionError);
      assert.equal(err.code, 'http');
      assert.equal(err.status, 429);
      assert.equal(err.retryAfterMs, 3000);
      return true;
    });
  });

  it('throws not-configured on a read without a token, and sends nothing', async () => {
    const calls = stubFetch(() => json({}));
    await assert.rejects(createHttpNotionClient({ ...live, token: undefined }).getPage('page-1'), (err: unknown) => {
      assert.ok(err instanceof NotionError);
      assert.equal(err.code, 'not-configured');
      assert.match(err.message, /NOTION_WAREHAUS_TOKEN/);
      return true;
    });
    assert.equal(calls.length, 0);
  });

  it('pages a data source query with the cursor and edited-since filter', async () => {
    const calls = stubFetch((call) => {
      if (call.url.includes('/databases/')) return json({}, 404);
      const cursor = (call.body as { start_cursor?: string }).start_cursor;
      return json({ results: [{ id: cursor ?? 'first', properties: {} }], has_more: !cursor, next_cursor: 'c2' });
    });
    const notion = createHttpNotionClient(live);
    const first = await notion.queryDataSource('ds-query-test', { editedSinceIso: '2026-11-01T00:00:00Z' });
    assert.deepEqual(first, { results: [{ id: 'first', properties: {} }], nextCursor: 'c2' });
    const second = await notion.queryDataSource('ds-query-test', { cursor: first.nextCursor });
    assert.equal(second.nextCursor, null);
    const queries = calls.filter((call) => call.url.endsWith('/query'));
    assert.deepEqual((queries[0].body as { filter: unknown }).filter, {
      timestamp: 'last_edited_time',
      last_edited_time: { after: '2026-11-01T00:00:00Z' },
    });
    assert.equal((queries[1].body as { start_cursor: string }).start_cursor, 'c2');
  });
});
