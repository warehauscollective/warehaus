import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  SHIPPED_NEEDS_LINK,
  SHIPPED_NOT_MERGED,
  SHIPPED_UNVERIFIED,
  parsePullRequestRef,
  readMergedPull,
  resolveShipLink,
  verifyPullMerged,
} from './githubPull';

describe('staff shipped pull request check', () => {
  it('reads a pull request link and ignores anything else', () => {
    assert.deepEqual(parsePullRequestRef('github.com/warehauscollective/warehaus/pull/38'), {
      owner: 'warehauscollective',
      repo: 'warehaus',
      number: 38,
      url: 'https://github.com/warehauscollective/warehaus/pull/38',
    });
    assert.equal(parsePullRequestRef('https://github.com/acme/site/issues/12'), null);
    assert.equal(parsePullRequestRef('https://github.com/acme/site/pull/12/files'), null);
    assert.equal(
      parsePullRequestRef('https://github.com/acme/site/pull/12/')?.url,
      'https://github.com/acme/site/pull/12',
    );
  });

  it('uses the link on the write, then the stored link, then a PR row', () => {
    const explicit = resolveShipLink({
      explicit: 'https://github.com/acme/site/pull/4',
      stored: 'https://github.com/acme/site/pull/9',
    });
    assert.deepEqual(explicit, { ok: true, link: 'https://github.com/acme/site/pull/4' });
    const stored = resolveShipLink({ stored: 'github.com/acme/site/pull/9' });
    assert.deepEqual(stored, { ok: true, link: 'https://github.com/acme/site/pull/9' });
    const linked = resolveShipLink({ links: ['https://example.com/nope', 'https://github.com/acme/site/pull/3'] });
    assert.deepEqual(linked, { ok: true, link: 'https://github.com/acme/site/pull/3' });
    assert.deepEqual(resolveShipLink({ explicit: 'https://example.com/pr' }), { ok: false, error: SHIPPED_NEEDS_LINK });
    assert.deepEqual(resolveShipLink({}), { ok: false, error: SHIPPED_NEEDS_LINK });
  });

  it('accepts a pull request merged into main and rejects the rest', () => {
    assert.deepEqual(readMergedPull({ merged: true, base: { ref: 'main' } }), { ok: true });
    assert.deepEqual(readMergedPull({ merged: true, base: { ref: 'develop' } }), { ok: false, error: SHIPPED_NOT_MERGED });
    assert.deepEqual(readMergedPull({ merged: false, state: 'closed', base: { ref: 'main' } }), {
      ok: false,
      error: SHIPPED_NOT_MERGED,
    });
    assert.deepEqual(readMergedPull({ merged: false, state: 'open', base: { ref: 'main' } }), {
      ok: false,
      error: SHIPPED_NOT_MERGED,
    });
    assert.deepEqual(readMergedPull({ message: 'Not Found' }), { ok: false, error: SHIPPED_UNVERIFIED });
  });

  it('calls GitHub once on the write and does not follow a bad response', async () => {
    const calls: string[] = [];
    const merged = await verifyPullMerged({
      link: 'https://github.com/acme/site/pull/4',
      token: 'gh-test',
      fetchImpl: async (url) => {
        calls.push(String(url));
        return new Response(JSON.stringify({ merged: true, base: { ref: 'main' } }), { status: 200 });
      },
    });
    assert.deepEqual(merged, { ok: true, link: 'https://github.com/acme/site/pull/4' });
    assert.deepEqual(calls, ['https://api.github.com/repos/acme/site/pulls/4']);
    const missing = await verifyPullMerged({ link: 'https://github.com/acme/site/pull/4', token: '  ' });
    assert.deepEqual(missing, { ok: false, error: SHIPPED_UNVERIFIED });
    const denied = await verifyPullMerged({
      link: 'https://github.com/acme/site/pull/4',
      token: 'gh-test',
      fetchImpl: async () => new Response('no', { status: 404 }),
    });
    assert.deepEqual(denied, { ok: false, error: SHIPPED_UNVERIFIED });
  });
});
