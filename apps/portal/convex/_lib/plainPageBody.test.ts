import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { fetchPlainPageBody } from '../sync/docBody';

const originalFetch = globalThis.fetch;
const originalToken = process.env.NOTION_WAREHAUS_TOKEN;

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalToken == null) delete process.env.NOTION_WAREHAUS_TOKEN;
  else process.env.NOTION_WAREHAUS_TOKEN = originalToken;
});

describe('task page body fetch', () => {
  it('follows the block cursor past the first 100 blocks', async () => {
    process.env.NOTION_WAREHAUS_TOKEN = 'test-token';
    const cursors: Array<string | null> = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      const cursor = url.searchParams.get('start_cursor');
      cursors.push(cursor);
      const page = cursor == null ? 'one' : 'two';
      return new Response(
        JSON.stringify({
          results: [
            {
              type: 'paragraph',
              paragraph: { rich_text: [{ plain_text: page }] },
            },
          ],
          has_more: cursor == null,
          next_cursor: cursor == null ? 'cursor-2' : null,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }) as typeof fetch;

    const text = await fetchPlainPageBody('page-1');
    assert.equal(text, 'one\ntwo');
    assert.deepEqual(cursors, [null, 'cursor-2']);
  });
});
