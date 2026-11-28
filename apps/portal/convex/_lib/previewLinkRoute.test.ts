/**
 * The `/review-preview` route on shared dev and on production, through the
 * real handlers on the in-memory ctx. Production stores the preview link only
 * (ADR-0009 decision 2).
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { dispatchReviewPreview, reviewPreviewHttp, setReviewPreview, startReviewPreview } from '../milestones';
import { memoryCtx, type MemoryCtx } from './memoryCtx.testkit';
import {
  PREVIEW_ROUTE_LINK_ONLY,
  PREVIEW_ROUTE_WRONG_DEPLOYMENT,
  isPreviewLinkWrite,
  postReviewPreview,
  previewDispatchStore,
  previewIterationDecision,
  reviewDeploymentBody,
  reviewPreviewRouteScope,
  reviewPreviewStore,
  reviewPreviewStoreUrl,
  VERCEL_PROJECT_ID,
} from './reviewPreview';
import { seedMilestoneWorld } from './seedRows.testkit';

const PRODUCTION = 'https://unique-turtle-383.convex.cloud';
const SHARED_DEV = 'https://graceful-mastiff-960.convex.cloud';
const SECRET = 'test-preview-secret';
const SHA = 'a'.repeat(40);
const URL_READY = 'https://warehaus-portal-git-milestone-x-warehaus.vercel.app';

function post(body: unknown, secret: string | null = SECRET): Request {
  return new Request('https://example.test/review-preview', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: secret ? { Authorization: `Bearer ${secret}` } : {},
  });
}

const send = (t: MemoryCtx, body: unknown, secret?: string | null) =>
  t.callHttp(reviewPreviewHttp, post(body, secret), { respond: () => ({ ok: true, changed: true, previousDeploymentId: null }) });

describe('review preview route scope', () => {
  it('takes every write on shared dev, the link on production, nothing elsewhere', () => {
    assert.equal(reviewPreviewRouteScope(SHARED_DEV), 'all');
    assert.equal(reviewPreviewRouteScope(PRODUCTION), 'link');
    assert.equal(reviewPreviewRouteScope('http://unique-turtle-383.convex.cloud'), null);
    assert.equal(reviewPreviewRouteScope('https://unique-turtle-383.convex.cloud.example.test'), null);
    assert.equal(reviewPreviewRouteScope('https://other-animal-1.convex.cloud'), null);
    assert.equal(reviewPreviewRouteScope(undefined), null);
    assert.equal(reviewPreviewRouteScope('not a url'), null);
  });

  it('a link write is a build state with no op', () => {
    assert.equal(isPreviewLinkWrite({ state: 'building' }), true);
    assert.equal(isPreviewLinkWrite({ state: 'ready' }), true);
    assert.equal(isPreviewLinkWrite({ state: 'failed' }), true);
    assert.equal(isPreviewLinkWrite({ state: 'removed' }), false);
    assert.equal(isPreviewLinkWrite({ op: 'local', state: 'ready' }), false);
    assert.equal(isPreviewLinkWrite({ op: 'close' }), false);
    assert.equal(isPreviewLinkWrite({}), false);
  });

  it('refuses a preview built for another iteration', () => {
    assert.deepEqual(previewIterationDecision({ given: undefined, current: 2 }), { ok: true });
    assert.deepEqual(previewIterationDecision({ given: 2, current: 2 }), { ok: true });
    assert.equal(previewIterationDecision({ given: 1, current: 2 }).ok, false);
  });
});

describe('review preview route', () => {
  const before = { cloud: process.env.CONVEX_CLOUD_URL, secret: process.env.REVIEW_PREVIEW_SECRET };

  beforeEach(() => {
    process.env.CONVEX_CLOUD_URL = PRODUCTION;
    process.env.REVIEW_PREVIEW_SECRET = SECRET;
  });

  afterEach(() => {
    if (before.cloud === undefined) delete process.env.CONVEX_CLOUD_URL;
    else process.env.CONVEX_CLOUD_URL = before.cloud;
    if (before.secret === undefined) delete process.env.REVIEW_PREVIEW_SECRET;
    else process.env.REVIEW_PREVIEW_SECRET = before.secret;
  });

  it('production passes a signed link write to the mutation', async () => {
    const t = memoryCtx();
    const { milestoneId } = seedMilestoneWorld(t, { status: 'Ready to Ship' });
    const response = await send(t, {
      milestoneId,
      state: 'ready',
      url: URL_READY,
      sha: SHA,
      deploymentId: 'dpl_1',
      prNumber: 231,
      iteration: 1,
      branch: 'milestone/x',
      builtAt: 5,
    });
    assert.equal(response.status, 200);
    assert.deepEqual(
      t.runs.map((run) => [run.name, run.args]),
      [
        [
          'milestones:setReviewPreview',
          {
            milestoneId,
            state: 'ready',
            url: URL_READY,
            sha: SHA,
            deploymentId: 'dpl_1',
            prNumber: 231,
            iteration: 1,
            branch: 'milestone/x',
            builtAt: 5,
          },
        ],
      ],
    );
  });

  it('production refuses a caller without the secret, and is closed while the secret is unset', async () => {
    const t = memoryCtx();
    const { milestoneId } = seedMilestoneWorld(t, { status: 'Ready to Ship' });
    const body = { milestoneId, state: 'ready', url: URL_READY, sha: SHA, prNumber: 231 };
    assert.equal((await send(t, body, null)).status, 401);
    assert.equal((await send(t, body, 'nope')).status, 401);
    delete process.env.REVIEW_PREVIEW_SECRET;
    assert.equal((await send(t, body)).status, 503);
    assert.equal(t.runs.length, 0);
  });

  it('production refuses everything that is not the link', async () => {
    const t = memoryCtx();
    const { milestoneId } = seedMilestoneWorld(t, { status: 'Ready to Ship' });
    for (const body of [
      { op: 'local', milestoneId, url: 'http://localhost:3100' },
      { op: 'close', prNumber: 231, outcome: 'deleted' },
      { milestoneId, state: 'removed' },
      { milestoneId },
      null,
    ]) {
      const response = await send(t, body);
      assert.equal(response.status, body === null ? 400 : 403);
      if (body !== null) assert.equal(await response.text(), PREVIEW_ROUTE_LINK_ONLY);
    }
    assert.equal(t.runs.length, 0);
  });

  it('shared dev still takes the local preview and the close', async () => {
    process.env.CONVEX_CLOUD_URL = SHARED_DEV;
    const t = memoryCtx();
    const { milestoneId } = seedMilestoneWorld(t, { status: 'Ready to Ship' });
    assert.equal((await send(t, { op: 'local', milestoneId, url: 'http://localhost:3100' })).status, 200);
    assert.equal((await send(t, { op: 'close', prNumber: 231, outcome: 'deleted' })).status, 200);
    assert.deepEqual(
      t.runs.map((run) => run.name),
      ['milestones:setLocalPreview', 'milestones:applyPreviewClose'],
    );
  });

  it('any other deployment is refused before the secret is read', async () => {
    process.env.CONVEX_CLOUD_URL = 'https://other-animal-1.convex.cloud';
    const t = memoryCtx();
    const response = await send(t, { state: 'ready' });
    assert.equal(response.status, 403);
    assert.equal(await response.text(), PREVIEW_ROUTE_WRONG_DEPLOYMENT);
    assert.equal(t.runs.length, 0);
  });
});

describe('storing the preview link', () => {
  it('writes previewUrl on the milestone for its current iteration', async () => {
    const t = memoryCtx();
    const { milestoneId } = seedMilestoneWorld(t, { status: 'Ready to Ship', iteration: 2, previewBuild: 'building' });
    const result = await t.call<{ ok: boolean; changed?: boolean }>(setReviewPreview, {
      milestoneId,
      state: 'ready',
      url: `${URL_READY}/?x=1`,
      sha: SHA,
      deploymentId: 'dpl_2',
      prNumber: 231,
      iteration: 2,
      branch: 'milestone/x',
    });
    assert.deepEqual(result, { ok: true, changed: true, previousDeploymentId: null });
    const row = t.row(milestoneId) as Record<string, unknown>;
    assert.equal(row.previewUrl, URL_READY);
    assert.equal(row.previewCommit, SHA);
    assert.equal(row.previewDeploymentId, 'dpl_2');
    assert.equal(row.previewBuild, undefined);
    assert.equal(row.iteration, 2);
  });

  it('refuses a link built for an earlier iteration and writes nothing', async () => {
    const t = memoryCtx();
    const { milestoneId } = seedMilestoneWorld(t, { status: 'Ready to Ship', iteration: 2 });
    const result = await t.call<{ ok: boolean; reason?: string }>(setReviewPreview, {
      milestoneId,
      state: 'ready',
      url: URL_READY,
      sha: SHA,
      prNumber: 231,
      iteration: 1,
    });
    assert.deepEqual(result, { ok: false, reason: 'Preview is for iteration 1; the milestone is on iteration 2' });
    assert.equal((t.row(milestoneId) as Record<string, unknown>).previewUrl, undefined);
    assert.equal(t.rows('activity').length, 0);
  });

  it('refuses a link that is not a Vercel preview host', async () => {
    const t = memoryCtx();
    const { milestoneId } = seedMilestoneWorld(t, { status: 'Ready to Ship' });
    const result = await t.call<{ ok: boolean }>(setReviewPreview, {
      milestoneId,
      state: 'ready',
      url: 'https://warehaus-portal.vercel.app',
      sha: SHA,
      prNumber: 231,
    });
    assert.equal(result.ok, false);
    assert.equal((t.row(milestoneId) as Record<string, unknown>).previewUrl, undefined);
  });
});

describe('where the workflow stores the link', () => {
  const PRODUCTION_ROUTE = 'https://unique-turtle-383.convex.site/review-preview';
  const SHARED_DEV_ROUTE = 'https://graceful-mastiff-960.convex.site/review-preview';

  function recorder(answer: () => Response) {
    const requests: Array<{ url: string; authorization: string | null; body: unknown }> = [];
    const fetchImpl = (async (url: unknown, init?: RequestInit) => {
      requests.push({
        url: String(url),
        authorization: new Headers(init?.headers).get('authorization'),
        body: JSON.parse(String(init?.body)),
      });
      return answer();
    }) as typeof fetch;
    return { requests, fetchImpl };
  }

  it('stores on production unless shared dev started the run', () => {
    assert.deepEqual(reviewPreviewStore(undefined), { ok: true, store: 'production' });
    assert.deepEqual(reviewPreviewStore(''), { ok: true, store: 'production' });
    assert.deepEqual(reviewPreviewStore(' production '), { ok: true, store: 'production' });
    assert.deepEqual(reviewPreviewStore('dev'), { ok: true, store: 'dev' });
    assert.equal(reviewPreviewStore('https://other-animal-1.convex.site').ok, false);
    assert.equal(reviewPreviewStore('prod').ok, false);
    assert.deepEqual(previewDispatchStore(SHARED_DEV), { store: 'dev' });
    assert.deepEqual(previewDispatchStore(PRODUCTION), {});
    assert.deepEqual(previewDispatchStore(undefined), {});
  });

  it('sends the link to the production route and every other write to shared dev', () => {
    for (const state of ['building', 'ready', 'failed']) {
      assert.equal(reviewPreviewStoreUrl('production', { state }), PRODUCTION_ROUTE);
      assert.equal(reviewPreviewStoreUrl('dev', { state }), SHARED_DEV_ROUTE);
    }
    assert.equal(reviewPreviewStoreUrl('production', { op: 'close' }), SHARED_DEV_ROUTE);
    assert.equal(reviewPreviewStoreUrl('production', { op: 'local', state: 'ready' }), SHARED_DEV_ROUTE);
    assert.equal(reviewPreviewStoreUrl('production', { state: 'removed' }), SHARED_DEV_ROUTE);
  });

  it('posts the finished link, signed, to production', async () => {
    const { requests, fetchImpl } = recorder(() => Response.json({ ok: true, changed: true, previousDeploymentId: 'dpl_old' }));
    const payload = { milestoneId: 'm1', state: 'ready', url: URL_READY, sha: SHA, deploymentId: 'dpl_new', prNumber: 231 };
    const stored = await postReviewPreview({ store: 'production', secret: SECRET, payload, fetchImpl });
    assert.deepEqual(stored, { ok: true, changed: true, previousDeploymentId: 'dpl_old' });
    assert.deepEqual(requests, [{ url: PRODUCTION_ROUTE, authorization: `Bearer ${SECRET}`, body: payload }]);
  });

  it('returns a refused write so the caller can delete the build, and throws on anything else', async () => {
    const refused = recorder(() => Response.json({ ok: false, reason: 'Preview is for iteration 1; the milestone is on iteration 2' }, { status: 400 }));
    assert.deepEqual(
      await postReviewPreview({ store: 'production', secret: SECRET, payload: { state: 'ready' }, fetchImpl: refused.fetchImpl }),
      { ok: false, reason: 'Preview is for iteration 1; the milestone is on iteration 2' },
    );
    for (const answer of [
      () => new Response('Review preview is not configured', { status: 503 }),
      () => new Response('Unauthorized', { status: 401 }),
      () => new Response('Preview payload is incomplete', { status: 400 }),
      () => new Response('not json', { status: 200 }),
    ]) {
      const { fetchImpl } = recorder(answer);
      await assert.rejects(
        postReviewPreview({ store: 'production', secret: SECRET, payload: { state: 'ready' }, fetchImpl }),
        (error: Error) => /^Review preview store returned \d{3}: /.test(error.message) && !error.message.includes(SECRET),
      );
    }
    const unsent = recorder(() => Response.json({ ok: true }));
    await assert.rejects(
      postReviewPreview({ store: 'production', secret: ' ', payload: { state: 'ready' }, fetchImpl: unsent.fetchImpl }),
      /REVIEW_PREVIEW_SECRET is not set/,
    );
    assert.equal(unsent.requests.length, 0);
  });

  it('refuses a production Convex URL for the build, and the script names none', () => {
    const body = (convexUrl: string) =>
      reviewDeploymentBody({
        projectId: VERCEL_PROJECT_ID,
        org: 'warehauscollective',
        repo: 'warehaus',
        ref: 'milestone/x',
        sha: SHA,
        prNumber: 231,
        milestoneId: 'm1',
        convexUrl,
        convexSite: 'https://graceful-mastiff-960.convex.site',
      });
    assert.deepEqual(body(PRODUCTION), { ok: false, reason: 'Convex URL points at unique-turtle-383' });
    assert.equal(body(SHARED_DEV).ok, true);
    const script = readFileSync(new URL('../../scripts/review-preview.ts', import.meta.url), 'utf8');
    assert.equal(script.includes('unique-turtle-383'), false);
    assert.equal(/PRODUCTION_(DEPLOYMENT|SITE_HOST|APP_HOST)/.test(script), false);
    assert.equal(/process\.env\.(NEXT_PUBLIC_)?CONVEX_(CLOUD_|SITE_)?URL/.test(script), false);
  });
});

describe('shared-dev guard on the dispatch', () => {
  const before = { cloud: process.env.CONVEX_CLOUD_URL, token: process.env.REVIEW_PREVIEW_GITHUB_TOKEN };
  const realFetch = globalThis.fetch;
  let requests: Array<{ url: string; body: { ref?: string; inputs?: Record<string, string> } }> = [];

  beforeEach(() => {
    requests = [];
    process.env.REVIEW_PREVIEW_GITHUB_TOKEN = 'test-token';
    globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
      requests.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return new Response(null, { status: 204 });
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    if (before.cloud === undefined) delete process.env.CONVEX_CLOUD_URL;
    else process.env.CONVEX_CLOUD_URL = before.cloud;
    if (before.token === undefined) delete process.env.REVIEW_PREVIEW_GITHUB_TOKEN;
    else process.env.REVIEW_PREVIEW_GITHUB_TOKEN = before.token;
  });

  it('a retry dispatch runs on shared dev only and asks GitHub for nothing anywhere else', async () => {
    const t = memoryCtx();
    const { milestoneId } = seedMilestoneWorld(t, { status: 'Ready to Ship' });
    const args = { milestoneId, prNumber: 231 };
    for (const cloud of [PRODUCTION, 'https://other-animal-1.convex.cloud', undefined]) {
      if (cloud === undefined) delete process.env.CONVEX_CLOUD_URL;
      else process.env.CONVEX_CLOUD_URL = cloud;
      const refused = await t.call<{ ok: boolean; reason?: string }>(dispatchReviewPreview, args);
      assert.equal(refused.ok, false, String(cloud));
    }
    assert.equal(requests.length, 0);
    assert.equal(t.runs.length, 0);

    process.env.CONVEX_CLOUD_URL = SHARED_DEV;
    assert.deepEqual(await t.call(dispatchReviewPreview, args), { ok: true });
    assert.deepEqual(requests[0]?.body, { ref: 'main', inputs: { pr_number: '231', milestone_id: milestoneId, store: 'dev' } });
  });

  it('the start from production sends only the pull request and the milestone, never a Convex URL', async () => {
    process.env.CONVEX_CLOUD_URL = PRODUCTION;
    const t = memoryCtx();
    const { milestoneId } = seedMilestoneWorld(t, { status: 'Ready to Ship' });
    assert.deepEqual(await t.call(startReviewPreview, { milestoneId, prNumber: 231 }), { ok: true });
    assert.equal(requests.length, 1);
    assert.match(requests[0]!.url, /^https:\/\/api\.github\.com\/repos\/warehauscollective\/warehaus\/actions\/workflows\/portal-review-preview\.yml\/dispatches$/);
    // The workflow file and script come from main, and the build target is not an input: it is fixed to shared dev in the script.
    assert.deepEqual(requests[0]!.body, { ref: 'main', inputs: { pr_number: '231', milestone_id: milestoneId } });
    assert.equal(JSON.stringify(requests[0]!.body).includes('unique-turtle-383'), false);
  });

  it('the workflow takes no Convex URL as an input', () => {
    const workflow = readFileSync(new URL('../../../../.github/workflows/portal-review-preview.yml', import.meta.url), 'utf8');
    assert.equal(/convex[_-]?(url|site|deployment)/i.test(workflow), false);
    assert.equal(workflow.includes('unique-turtle-383'), false);
  });
});
