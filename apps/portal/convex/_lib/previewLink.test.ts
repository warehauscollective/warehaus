import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { isPeterEmail } from './milestoneReview';
import { assertReviewConvexUrl, PRODUCTION_DEPLOYMENT } from './reviewPreview';
import {
  PREVIEW_LINK_ALLOWLIST,
  PREVIEW_LINK_HOST,
  PREVIEW_LINK_HTTPS,
  PREVIEW_LINK_LOCAL,
  PREVIEW_LINK_PRODUCTION,
  assertStaffPreviewLink,
  peterMayApproveDeploy,
  planAttachPreviewLink,
  planClearPreviewLink,
  reviewRetryAvailable,
  reviewRetryLiveOnClient,
  staffMayAttachPreviewLink,
} from './previewLink';

const PREVIEW = 'https://warehaus-portal-git-order-ahead-warehaus-collective.vercel.app';
const NOW = 1_700_000_000_000;

describe('staff preview link url', () => {
  const reason = (url: string) => {
    const checked = assertStaffPreviewLink(url);
    assert.equal(checked.ok, false);
    if (checked.ok) return '';
    return checked.reason;
  };

  it('accepts an https team preview and drops the query', () => {
    const checked = assertStaffPreviewLink(`${PREVIEW}/review?token=secret`);
    assert.deepEqual(checked, { ok: true, href: `${PREVIEW}/review` });
  });

  it('rejects http, localhost, the production alias, and anything else', () => {
    assert.equal(reason('http://warehaus-portal-git-order-ahead-warehaus-collective.vercel.app'), PREVIEW_LINK_HTTPS);
    assert.equal(reason('https://localhost:3100/p/demo'), PREVIEW_LINK_LOCAL);
    assert.equal(reason('https://127.0.0.1/p/demo'), PREVIEW_LINK_LOCAL);
    assert.equal(reason('https://warehaus-portal.vercel.app'), PREVIEW_LINK_PRODUCTION);
    assert.equal(reason('https://unique-turtle-383.convex.cloud'), PREVIEW_LINK_PRODUCTION);
    assert.equal(reason('https://example.com'), PREVIEW_LINK_HOST);
    assert.equal(reason('https://warehaus-portal-warehaus-collective.vercel.app'), PREVIEW_LINK_HOST);
    assert.equal(reason('not a url'), PREVIEW_LINK_HOST);
  });

  it('rejects a suffix on the preview host', () => {
    assert.equal(reason(`${PREVIEW}.evil.com`), PREVIEW_LINK_HOST);
    assert.equal(reason(`${PREVIEW}.`), PREVIEW_LINK_HOST);
    assert.equal(reason(`${PREVIEW}%2Eevil.com`), PREVIEW_LINK_HOST);
  });

  it('rejects userinfo', () => {
    const host = new URL(PREVIEW).host;
    assert.equal(reason(`https://staff@${host}/review`), PREVIEW_LINK_HOST);
    assert.equal(reason(`https://staff:secret@${host}/review`), PREVIEW_LINK_HOST);
  });

  it('rejects a non-443 port', () => {
    assert.equal(reason(`${PREVIEW}:8443/review`), PREVIEW_LINK_HOST);
    assert.equal(reason(`${PREVIEW}:80`), PREVIEW_LINK_HOST);
    assert.deepEqual(assertStaffPreviewLink(`${PREVIEW}:443/review`), { ok: true, href: `${PREVIEW}/review` });
  });

  it('rejects uppercase', () => {
    assert.equal(reason('https://Warehaus-Portal-git-order-ahead-warehaus-collective.vercel.app'), PREVIEW_LINK_HOST);
    assert.equal(reason(PREVIEW.replace('vercel.app', 'VERCEL.APP')), PREVIEW_LINK_HOST);
    const listed = assertStaffPreviewLink('https://Preview.warehaus.studio/m', ['preview.warehaus.studio']);
    assert.equal(listed.ok, false);
    if (!listed.ok) assert.equal(listed.reason, PREVIEW_LINK_HOST);
  });

  it('rejects IDN', () => {
    assert.equal(reason(PREVIEW.replace('a', '\uFF41')), PREVIEW_LINK_HOST);
    assert.equal(reason(PREVIEW.replace('a', '\u0430')), PREVIEW_LINK_HOST);
  });

  it('accepts an explicit allowlist host and still rejects production', () => {
    assert.deepEqual(PREVIEW_LINK_ALLOWLIST, []);
    const listed = assertStaffPreviewLink('https://preview.warehaus.studio/m', ['preview.warehaus.studio']);
    assert.deepEqual(listed, { ok: true, href: 'https://preview.warehaus.studio/m' });
    const production = assertStaffPreviewLink('https://warehaus-portal.vercel.app', ['warehaus-portal.vercel.app']);
    assert.equal(production.ok, false);
    if (!production.ok) assert.equal(production.reason, PREVIEW_LINK_PRODUCTION);
  });
});

describe('attach and clear plans', () => {
  it('stores the link, the staff contact, and the time, and skips a repeat', () => {
    const first = planAttachPreviewLink({
      url: PREVIEW,
      contactId: 'contact-staff',
      now: NOW,
      current: {},
    });
    assert.equal(first.ok, true);
    if (!first.ok || !first.wrote) throw new Error('expected a write');
    assert.equal(first.patch.previewUrl, PREVIEW);
    assert.equal(first.patch.previewAttachedBy, 'contact-staff');
    assert.equal(first.patch.previewAttachedAt, NOW);
    const again = planAttachPreviewLink({
      url: `${PREVIEW}/`,
      contactId: 'contact-staff',
      now: NOW + 10,
      current: first.patch,
    });
    assert.deepEqual(again, { ok: true, wrote: false });
  });

  it('clears a failed build when a link is attached, and clears the link without a second write', () => {
    const attached = planAttachPreviewLink({
      url: PREVIEW,
      contactId: 'contact-staff',
      now: NOW,
      current: { previewBuild: 'failed', previewBuildAttempt: 2, previewBuildAt: 9 },
    });
    assert.equal(attached.ok && attached.wrote, true);
    if (!attached.ok || !attached.wrote) return;
    assert.equal(attached.patch.previewBuild, undefined);
    assert.equal(attached.patch.previewBuildAttempt, undefined);
    const cleared = planClearPreviewLink(attached.patch);
    assert.equal(cleared.wrote, true);
    if (!cleared.wrote) return;
    assert.deepEqual(cleared.patch, {
      previewUrl: undefined,
      previewAttachedBy: undefined,
      previewAttachedAt: undefined,
    });
    assert.deepEqual(planClearPreviewLink({}), { wrote: false });
  });

  it('clears leftover previewBuild fields when the link is removed', () => {
    const cleared = planClearPreviewLink({
      previewUrl: PREVIEW,
      previewAttachedBy: 'contact-staff',
      previewAttachedAt: NOW,
      previewBuild: 'failed',
      previewBuildAttempt: 2,
      previewBuildAt: 9,
    });
    assert.equal(cleared.wrote, true);
    if (!cleared.wrote) return;
    assert.equal(cleared.patch.previewUrl, undefined);
    assert.equal(cleared.patch.previewAttachedBy, undefined);
    assert.equal(cleared.patch.previewAttachedAt, undefined);
    assert.equal(cleared.patch.previewBuild, undefined);
    assert.equal(cleared.patch.previewBuildAttempt, undefined);
    assert.equal(cleared.patch.previewBuildAt, undefined);
    assert.equal('previewBuild' in cleared.patch, true);
    assert.equal('previewBuildAttempt' in cleared.patch, true);
    assert.equal('previewBuildAt' in cleared.patch, true);
    const leftover = planClearPreviewLink({ previewBuild: 'building', previewBuildAt: 4 });
    assert.equal(leftover.wrote, true);
    if (!leftover.wrote) return;
    assert.equal(leftover.patch.previewBuild, undefined);
    assert.equal(leftover.patch.previewBuildAt, undefined);
    assert.equal('previewBuildAttempt' in leftover.patch, false);
    assert.equal(leftover.patch.previewUrl, undefined);
  });
});

describe('staff and peter gates', () => {
  const ready = {
    staff: true,
    workStatus: 'ready',
    approval: 'unreviewed',
    previewUrl: PREVIEW,
  };

  it('lets staff attach and only Peter deploy', () => {
    assert.equal(staffMayAttachPreviewLink({ staff: true }), true);
    assert.equal(staffMayAttachPreviewLink({ staff: false }), false);
    assert.equal(isPeterEmail('peter@warehaus.studio'), true);
    assert.equal(isPeterEmail('alex@warehaus.co'), false);
    assert.equal(peterMayApproveDeploy({ ...ready, isPeter: isPeterEmail('peter@warehaus.co') }), true);
    assert.equal(peterMayApproveDeploy({ ...ready, isPeter: isPeterEmail('alex@warehaus.co') }), false);
    assert.equal(peterMayApproveDeploy({ ...ready, staff: false, isPeter: true }), false);
    assert.equal(peterMayApproveDeploy({ ...ready, isPeter: true, previewUrl: null }), false);
    assert.equal(peterMayApproveDeploy({ ...ready, isPeter: true, workStatus: 'active' }), false);
    assert.equal(peterMayApproveDeploy({ ...ready, isPeter: true, approval: 'approved' }), false);
  });

  it('keeps retry off production and off when the tokens are missing', () => {
    assert.equal(reviewRetryLiveOnClient('https://unique-turtle-383.convex.cloud'), false);
    assert.equal(reviewRetryLiveOnClient('https://graceful-mastiff-960.convex.cloud'), true);
    assert.equal(reviewRetryLiveOnClient(null), false);
    assert.equal(
      reviewRetryAvailable({
        convexUrl: `https://${PRODUCTION_DEPLOYMENT}.convex.cloud`,
        vercelToken: 'vc',
        githubToken: 'gh',
      }),
      false,
    );
    assert.equal(
      reviewRetryAvailable({
        convexUrl: 'https://graceful-mastiff-960.convex.cloud',
        vercelToken: '',
        githubToken: 'gh',
      }),
      false,
    );
    assert.equal(
      reviewRetryAvailable({
        convexUrl: 'https://graceful-mastiff-960.convex.cloud',
        vercelToken: 'vc',
        githubToken: 'gh',
      }),
      true,
    );
    assert.equal(assertReviewConvexUrl('https://unique-turtle-383.convex.cloud').ok, false);
  });

  it('wires the mutations as staff-only and refuses production before a retry write', () => {
    const milestones = readFileSync(new URL('../milestones.ts', import.meta.url), 'utf8');
    const attach = milestones.slice(milestones.indexOf('export const attachPreviewLink'), milestones.indexOf('export const clearPreviewLink'));
    const clear = milestones.slice(milestones.indexOf('export const clearPreviewLink'), milestones.indexOf('export const deleteReviewPreview'));
    assert.match(attach, /adminMutation/);
    assert.match(attach, /planAttachPreviewLink/);
    assert.ok(attach.indexOf('planAttachPreviewLink') < attach.indexOf('ctx.db.patch'));
    assert.match(clear, /adminMutation/);
    assert.match(clear, /planClearPreviewLink/);
    assert.match(clear, /previewBuild: milestone\.previewBuild/);
    assert.match(clear, /previewBuildAttempt: milestone\.previewBuildAttempt/);
    assert.match(clear, /previewBuildAt: milestone\.previewBuildAt/);
    assert.ok(clear.indexOf('planClearPreviewLink') < clear.indexOf('ctx.db.patch'));
    assert.equal(attach.includes('VERCEL_TOKEN'), false);
    assert.equal(clear.includes('REVIEW_PREVIEW_SECRET'), false);
    const retry = milestones.slice(milestones.indexOf('export const retryReviewPreview'), milestones.indexOf('export const reviewPreviewHttp'));
    assert.match(retry, /reviewRetryLiveOnClient\(process\.env\.CONVEX_CLOUD_URL\)/);
    assert.ok(retry.indexOf('reviewRetryLiveOnClient') < retry.indexOf('ctx.db.patch'));
  });
});
