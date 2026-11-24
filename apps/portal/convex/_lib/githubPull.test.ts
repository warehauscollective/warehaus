import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  SHIPPED_NEEDS_LINK,
  SHIPPED_NOT_MERGED,
  SHIPPED_RATE_LIMITED,
  SHIPPED_UNVERIFIED,
  parsePullRequestRef,
  readMergedPull,
  resolveShipLink,
  verifyPullMerged,
} from './githubPull';

const PR = 'https://github.com/warehauscollective/warehaus/pull/38';

describe('staff shipped pull request check', () => {
  it('reads a pull request on this repo and ignores anything else', () => {
    assert.deepEqual(parsePullRequestRef('github.com/warehauscollective/warehaus/pull/38'), {
      owner: 'warehauscollective',
      repo: 'warehaus',
      number: 38,
      url: PR,
    });
    assert.equal(parsePullRequestRef('https://github.com/WarehausCollective/Warehaus/pull/38')?.url, PR);
    assert.equal(parsePullRequestRef('https://github.com/acme/site/pull/12'), null);
    assert.equal(parsePullRequestRef('https://github.com/acme/site/issues/12'), null);
    assert.equal(parsePullRequestRef('https://github.com/warehauscollective/warehaus/pull/12/files'), null);
    assert.equal(parsePullRequestRef('https://github.com/warehauscollective/warehaus/pull/12/')?.url, 'https://github.com/warehauscollective/warehaus/pull/12');
  });

  it('uses the link on the write, then the stored link, then a PR row', () => {
    const explicit = resolveShipLink({
      explicit: 'https://github.com/warehauscollective/warehaus/pull/4',
      stored: 'https://github.com/warehauscollective/warehaus/pull/9',
    });
    assert.deepEqual(explicit, { ok: true, link: 'https://github.com/warehauscollective/warehaus/pull/4' });
    const stored = resolveShipLink({ stored: 'github.com/warehauscollective/warehaus/pull/9' });
    assert.deepEqual(stored, { ok: true, link: 'https://github.com/warehauscollective/warehaus/pull/9' });
    const linked = resolveShipLink({
      links: ['https://example.com/nope', 'https://github.com/warehauscollective/warehaus/pull/3'],
    });
    assert.deepEqual(linked, { ok: true, link: 'https://github.com/warehauscollective/warehaus/pull/3' });
    assert.deepEqual(resolveShipLink({ explicit: 'https://github.com/acme/site/pull/4' }), {
      ok: false,
      error: SHIPPED_NEEDS_LINK,
    });
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

  it('calls the public GitHub API once and does not send a token', async () => {
    const calls: Array<{ url: string; authorization: string | null }> = [];
    const merged = await verifyPullMerged({
      link: PR,
      token: null,
      fetchImpl: async (url, init) => {
        const headers = new Headers(init?.headers);
        calls.push({ url: String(url), authorization: headers.get('authorization') });
        return new Response(JSON.stringify({ merged: true, base: { ref: 'main' } }), { status: 200 });
      },
    });
    assert.deepEqual(merged, { ok: true, link: PR });
    assert.deepEqual(calls, [
      { url: 'https://api.github.com/repos/warehauscollective/warehaus/pulls/38', authorization: null },
    ]);
    const denied = await verifyPullMerged({
      link: PR,
      fetchImpl: async () => new Response('no', { status: 404 }),
    });
    assert.deepEqual(denied, { ok: false, error: SHIPPED_UNVERIFIED });
    const limited = await verifyPullMerged({
      link: PR,
      fetchImpl: async () => new Response('slow down', { status: 429 }),
    });
    assert.deepEqual(limited, { ok: false, error: SHIPPED_RATE_LIMITED });
    const exhausted = await verifyPullMerged({
      link: PR,
      fetchImpl: async () =>
        new Response('limit', { status: 403, headers: { 'x-ratelimit-remaining': '0' } }),
    });
    assert.deepEqual(exhausted, { ok: false, error: SHIPPED_RATE_LIMITED });
    const failed = await verifyPullMerged({
      link: PR,
      fetchImpl: async () => {
        throw new Error('offline');
      },
    });
    assert.deepEqual(failed, { ok: false, error: SHIPPED_UNVERIFIED });
  });

  it('signs the read with the read token when one is set', async () => {
    const seen: Array<string | null> = [];
    const merged = await verifyPullMerged({
      link: PR,
      token: 'read-token',
      fetchImpl: async (_url, init) => {
        seen.push(new Headers(init?.headers).get('authorization'));
        return new Response(JSON.stringify({ merged: true, base: { ref: 'main' } }), { status: 200 });
      },
    });
    assert.deepEqual(merged, { ok: true, link: PR });
    assert.deepEqual(seen, ['Bearer read-token']);
  });

  it('falls back to one unsigned read when GitHub refuses the token', async () => {
    const seen: Array<string | null> = [];
    const merged = await verifyPullMerged({
      link: PR,
      token: 'revoked',
      fetchImpl: async (_url, init) => {
        const authorization = new Headers(init?.headers).get('authorization');
        seen.push(authorization);
        if (authorization) return new Response('bad credentials', { status: 401 });
        return new Response(JSON.stringify({ merged: true, base: { ref: 'main' } }), { status: 200 });
      },
    });
    assert.deepEqual(merged, { ok: true, link: PR });
    assert.deepEqual(seen, ['Bearer revoked', null]);
  });
});
