/**
 * The `/review-preview` route on shared dev and on production, through the
 * real handlers on the in-memory ctx. Production stores the preview link only
 * (ADR-0009 decision 2).
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { reviewPreviewHttp, setReviewPreview } from '../milestones';
import { memoryCtx, type MemoryCtx } from './memoryCtx.testkit';
import {
  PREVIEW_ROUTE_LINK_ONLY,
  PREVIEW_ROUTE_WRONG_DEPLOYMENT,
  isPreviewLinkWrite,
  previewIterationDecision,
  reviewPreviewRouteScope,
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
