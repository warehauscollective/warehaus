import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { isClientVisibleActivityType } from '@warehaus/portal-sync';
import {
  PROTECTED_PREVIEW_LINE,
  REMOVED_AFTER_APPROVAL_LINE,
  assertPreviewAppUrl,
  assertPreviewNotionFlags,
  assertReviewConvexUrl,
  authorizeReviewPreview,
  blankPreviewNotionEnv,
  builtFromLine,
  clearPreviewOnApprove,
  deleteVercelDeployment,
  deleteVercelResult,
  ignoreBuildExitCode,
  isPeterEmail,
  previewDeleteAfterFailure,
  previewDeletedActivity,
  previewProtectionCoversPreviews,
  removalAfterDelete,
  retryActorAllowed,
  retryPreviewPatch,
  reviewDeploymentBody,
  reviewPreviewForAudience,
  reviewPreviewSetPatch,
  reviewReadyChatMessage,
  shortSha,
} from './reviewPreview';

const READY_URL = 'https://warehaus-portal-git-review-warehaus-collective.vercel.app';
const SHA = 'aacb3e7deadbeef';

describe('fail closed convex check', () => {
  it('refuses unique-turtle-383 and any other host', () => {
    assert.equal(assertReviewConvexUrl(undefined).ok, false);
    assert.equal(assertReviewConvexUrl('').ok, false);
    const production = assertReviewConvexUrl('https://unique-turtle-383.convex.cloud');
    const other = assertReviewConvexUrl('https://other-name.convex.cloud');
    const app = assertReviewConvexUrl('https://warehaus-portal.vercel.app');
    assert.equal(production.ok, false);
    assert.equal(other.ok, false);
    assert.equal(app.ok, false);
    if (!production.ok) assert.match(production.reason, /unique-turtle-383/);
    if (!other.ok) assert.match(other.reason, /graceful-mastiff-960/);
    if (!app.ok) assert.match(app.reason, /graceful-mastiff-960/);
    assert.equal(assertReviewConvexUrl('http://graceful-mastiff-960.convex.cloud').ok, false);
  });

  it('accepts only the shared dev cloud host', () => {
    const ok = assertReviewConvexUrl('https://graceful-mastiff-960.convex.cloud');
    assert.equal(ok.ok, true);
    if (ok.ok) assert.equal(ok.site, 'https://graceful-mastiff-960.convex.site');
  });

  it('refuses a production preview host and notion write flags', () => {
    const productionApp = assertPreviewAppUrl('https://warehaus-portal.vercel.app');
    const turtle = assertPreviewAppUrl('https://unique-turtle-383.convex.cloud');
    assert.equal(productionApp.ok, false);
    assert.equal(turtle.ok, false);
    if (!productionApp.ok) assert.match(productionApp.reason, /production host/);
    if (!turtle.ok) assert.match(turtle.reason, /unique-turtle-383/);
    assert.equal(assertPreviewAppUrl(READY_URL).ok, true);
    assert.equal(assertPreviewNotionFlags({ NOTION_WRITEBACK_ENABLED: 'true' }).ok, false);
    assert.equal(assertPreviewNotionFlags({ INVITE_EMAIL_ENABLED: 'true' }).ok, false);
    assert.equal(assertPreviewNotionFlags({}).ok, false);
    const blank = blankPreviewNotionEnv();
    assert.equal(assertPreviewNotionFlags(blank).ok, true);
    assert.equal(assertPreviewNotionFlags({ ...blank, NOTION_WAREHAUS_TOKEN: 'secret' }).ok, false);
    assert.equal(assertPreviewNotionFlags({ ...blank, NOTION_WEBHOOK_SECRET: 'secret' }).ok, false);
  });
});

describe('set preview', () => {
  it('stores a ready preview and skips a no-op write', () => {
    const first = reviewPreviewSetPatch({
      current: {},
      next: { state: 'ready', url: READY_URL, sha: SHA, deploymentId: 'dpl_1', prNumber: 108, iteration: 2, branch: 'feat/client-project-create' },
    });
    assert.equal(first.ok, true);
    if (!first.ok || !first.patch) return;
    assert.equal(first.patch.previewUrl, READY_URL);
    assert.equal(first.patch.previewCommit, SHA);
    assert.equal(first.patch.previewDeploymentId, 'dpl_1');
    assert.equal(first.patch.previewBuild, undefined);
    assert.match(first.chat ?? '', /PR #108 · Iteration 2 is ready\. Open preview:/);
    const again = reviewPreviewSetPatch({
      current: {
        state: 'ready',
        url: READY_URL,
        sha: SHA,
        deploymentId: 'dpl_1',
        prNumber: 108,
        iteration: 2,
        branch: 'feat/client-project-create',
      },
      next: { state: 'ready', url: READY_URL, sha: SHA, deploymentId: 'dpl_1', prNumber: 108, iteration: 2, branch: 'feat/client-project-create' },
    });
    assert.equal(again.ok && again.patch, null);
  });

  it('hides the preview from clients', () => {
    const record = { state: 'ready' as const, url: READY_URL, sha: SHA, prNumber: 108, iteration: 2 };
    assert.equal(reviewPreviewForAudience('client', record), null);
    const staff = reviewPreviewForAudience('staff', record);
    assert.equal(staff?.url, READY_URL);
    assert.equal(staff?.deploymentId, null);
  });
});

describe('clear on approve', () => {
  it('clears the stored url when Peter approves and leaves other decisions alone', () => {
    const approved = clearPreviewOnApprove({
      decision: 'approved',
      record: { state: 'ready', url: READY_URL, deploymentId: 'dpl_1', sha: SHA },
    });
    assert.ok(approved.patch);
    assert.equal(approved.deploymentId, 'dpl_1');
    const changes = clearPreviewOnApprove({
      decision: 'changes_requested',
      record: { state: 'ready', url: READY_URL, deploymentId: 'dpl_1' },
    });
    assert.equal(changes.patch, null);
    const empty = clearPreviewOnApprove({ decision: 'approved', record: {} });
    assert.equal(empty.patch, null);
  });

  it('marks the preview removed only after the deployment delete succeeds', () => {
    const gone = removalAfterDelete({ outcome: 'deleted', record: { state: 'ready', url: READY_URL, deploymentId: 'dpl_1' }, removedAt: 50 });
    assert.equal(gone.patch && 'previewDelete' in gone.patch ? gone.patch.previewDelete : null, 'removed');
    assert.equal(gone.patch && 'previewDeleteAt' in gone.patch ? gone.patch.previewDeleteAt : null, 50);
    const already = removalAfterDelete({ outcome: 'already-gone', record: { state: 'ready', deploymentId: 'dpl_1' }, removedAt: 60 });
    assert.equal(already.patch && 'previewDeleteAt' in already.patch ? already.patch.previewDeleteAt : null, 60);
    const failed = removalAfterDelete({ outcome: 'failed', record: { state: 'ready', deploymentId: 'dpl_1' }, removedAt: 70 });
    assert.equal(failed.patch, null);
    const untimed = removalAfterDelete({ outcome: 'deleted', record: { state: 'ready', deploymentId: 'dpl_1' }, removedAt: Number.NaN });
    assert.equal(untimed.patch, null);
    const second = removalAfterDelete({ outcome: 'deleted', record: { state: 'removed' }, removedAt: 80 });
    assert.equal(second.patch, null);
  });

  it('retries a failed build once and skips a second retry while building', () => {
    const retry = retryPreviewPatch({ state: 'failed', prNumber: 108, iteration: 2 });
    assert.equal(retry.patch && 'previewBuild' in retry.patch ? retry.patch.previewBuild : null, 'building');
    assert.equal(retryPreviewPatch({ state: 'building' }).patch, null);
    assert.equal(retryPreviewPatch({ state: 'ready', url: READY_URL }).patch, null);
  });
});

describe('preview copy and delete', () => {
  it('uses the chat line and the card lines', () => {
    assert.equal(
      reviewReadyChatMessage({ prNumber: 108, iteration: 2, url: READY_URL }),
      `PR #108 · Iteration 2 is ready. Open preview: ${READY_URL} (test data, sign in). Reply approve, or request changes with your notes.`,
    );
    assert.equal(builtFromLine(SHA, 2), 'Built from aacb3e7 · Iteration 2');
    assert.equal(shortSha('nope'), null);
    assert.equal(PROTECTED_PREVIEW_LINE, 'Protected Vercel preview · test data · sign in');
    assert.equal(REMOVED_AFTER_APPROVAL_LINE, 'Preview removed after approval · Vercel build deleted');
  });

  it('treats a missing deployment as already gone and logs every delete outcome', async () => {
    assert.equal(deleteVercelResult(200), 'deleted');
    assert.equal(deleteVercelResult(404), 'already-gone');
    assert.equal(deleteVercelResult(500), 'failed');
    const calls: string[] = [];
    const missing = await deleteVercelDeployment({
      token: undefined,
      teamId: 'team_gk8AwUegrHijeRwyTvHBsWhO',
      deploymentId: 'dpl_1',
      fetchImpl: async () => {
        calls.push('fetch');
        return new Response(null, { status: 200 });
      },
    });
    assert.equal(missing.status, 'unconfigured');
    assert.deepEqual(calls, []);
    const gone = await deleteVercelDeployment({
      token: 'token-value',
      teamId: 'team_gk8AwUegrHijeRwyTvHBsWhO',
      deploymentId: 'dpl_1',
      fetchImpl: async () => new Response(null, { status: 404 }),
    });
    assert.equal(gone.status, 'already-gone');
    const logged = previewDeletedActivity({
      orgId: 'org',
      projectId: 'project',
      milestoneId: 'm',
      name: 'Launch',
      sha: SHA,
      outcome: 'already-gone',
      timestamp: 1,
    });
    assert.equal(logged.summary, 'Preview aacb3e7 already deleted');
    assert.equal(logged.type, 'milestone.preview_deleted');
  });

  it('builds a preview deployment that is not production', () => {
    const body = reviewDeploymentBody({
      projectId: 'prj_5QsXPIEeRT2NCFovhsV3wqMt3bW5',
      org: 'warehauscollective',
      repo: 'warehaus',
      ref: 'cursor/review-preview-8d3d',
      sha: SHA,
      prNumber: 120,
      milestoneId: 'm-launch',
      convexUrl: 'https://graceful-mastiff-960.convex.cloud',
      convexSite: 'https://graceful-mastiff-960.convex.site',
    });
    assert.equal(body.ok, true);
    if (!body.ok) return;
    assert.equal('target' in body.body, false);
    const env = body.body.env as Record<string, string>;
    const buildEnv = (body.body.build as { env: Record<string, string> }).env;
    assert.equal(env.NEXT_PUBLIC_CONVEX_URL, 'https://graceful-mastiff-960.convex.cloud');
    for (const key of ['NOTION_WAREHAUS_TOKEN', 'NOTION_WEBHOOK_SECRET'] as const) {
      assert.equal(env[key], '');
      assert.equal(buildEnv[key], '');
    }
    for (const key of ['NOTION_WRITEBACK_ENABLED', 'INVITE_EMAIL_ENABLED'] as const) {
      assert.equal(env[key], 'false');
      assert.equal(buildEnv[key], 'false');
    }
    assert.equal(assertPreviewNotionFlags(env).ok, true);
    const refused = reviewDeploymentBody({
      projectId: 'prj_5QsXPIEeRT2NCFovhsV3wqMt3bW5',
      org: 'warehauscollective',
      repo: 'warehaus',
      ref: 'main',
      sha: SHA,
      prNumber: 1,
      milestoneId: 'm',
      convexUrl: 'https://unique-turtle-383.convex.cloud',
      convexSite: 'https://unique-turtle-383.convex.site',
    });
    assert.equal(refused.ok, false);
  });

  it('requires Vercel Authentication and a bearer secret', () => {
    assert.equal(previewProtectionCoversPreviews({ ssoProtection: null }), false);
    assert.equal(previewProtectionCoversPreviews({ ssoProtection: { deploymentType: 'preview' } }), true);
    assert.equal(authorizeReviewPreview({ configuredSecret: undefined, authorizationHeader: 'Bearer x' }), 'unconfigured');
    assert.equal(authorizeReviewPreview({ configuredSecret: 's3cret', authorizationHeader: 'Bearer no' }), 'unauthorized');
    assert.equal(authorizeReviewPreview({ configuredSecret: 's3cret', authorizationHeader: 'Bearer s3cret' }), 'ok');
    assert.equal(ignoreBuildExitCode({}), 0);
    assert.equal(ignoreBuildExitCode({ REVIEW_PREVIEW: '1' }), 1);
    const ignoreScript = fileURLToPath(new URL('../../scripts/vercel-ignore-build.mjs', import.meta.url));
    const skipped = spawnSync(process.execPath, [ignoreScript], { encoding: 'utf8' });
    const built = spawnSync(process.execPath, [ignoreScript], {
      encoding: 'utf8',
      env: { ...process.env, REVIEW_PREVIEW: '1' },
    });
    assert.equal(skipped.status, 0);
    assert.equal(built.status, 1);
    assert.equal(isClientVisibleActivityType('milestone.preview_ready'), false);
    assert.equal(isClientVisibleActivityType('milestone.preview_deleted'), false);
  });
});

describe('peter and delete retry', () => {
  it('blocks Peter and lets other staff retry', () => {
    assert.equal(isPeterEmail(' Peter@Warehaus.studio '), true);
    assert.equal(isPeterEmail('peter@warehaus.co'), true);
    assert.equal(isPeterEmail('alex@warehaus.co'), false);
    assert.equal(isPeterEmail(null), false);
    assert.equal(retryActorAllowed('peter@warehaus.studio').ok, false);
    assert.equal(retryActorAllowed('alex@warehaus.co').ok, true);
  });

  it('retries a failed delete with backoff and stops at the attempt limit', () => {
    const first = previewDeleteAfterFailure({ attempts: 1, now: 10 });
    assert.equal(first.state, 'removing');
    assert.equal(first.delayMs, 30_000);
    const second = previewDeleteAfterFailure({ attempts: 2, now: 20 });
    assert.equal(second.state, 'removing');
    assert.equal(second.delayMs, 120_000);
    const third = previewDeleteAfterFailure({ attempts: 3, now: 30 });
    assert.equal(third.state, 'failed');
    assert.equal(third.delayMs, null);
    assert.equal(previewDeleteAfterFailure({ attempts: 1, now: 1, terminal: true }).state, 'failed');
  });

  it('omits review for a client on the roadmap query path', () => {
    const milestones = readFileSync(new URL('../milestones.ts', import.meta.url), 'utf8');
    const query = milestones.slice(milestones.indexOf('async function toRoadmap'), milestones.indexOf('async function listOnProject'));
    assert.match(query, /reviewForAudience\(audience/);
    assert.match(query, /if \(review\) view\.review = review/);
    assert.match(milestones, /if \(audience !== 'staff'\) return null/);
    assert.match(milestones, /listOnProject\(ctx, project, 'client'/);
    assert.match(milestones, /withIndex\('by_previewPrNumber'/);
    assert.doesNotMatch(milestones, /reviewPreview(State|Url|Sha|DeploymentId|Pr|Iteration|Branch|BuiltAt|Delete)/);
    const retry = milestones.slice(milestones.indexOf('export const retryReviewPreview'), milestones.indexOf('export const reviewPreviewHttp'));
    assert.match(retry, /retryActorAllowed\(ctx\.identity\.email\)/);
    assert.ok(retry.indexOf('retryActorAllowed') < retry.indexOf('ctx.db.patch'));
  });

  it('re-checks the shared dev host before a retry dispatch', () => {
    const milestones = readFileSync(new URL('../milestones.ts', import.meta.url), 'utf8');
    const dispatch = milestones.slice(
      milestones.indexOf('export const dispatchReviewPreview'),
      milestones.indexOf('export const retryReviewPreview'),
    );
    const preview = readFileSync(new URL('./reviewPreview.ts', import.meta.url), 'utf8');
    assert.match(dispatch, /assertReviewConvexUrl\(process\.env\.CONVEX_CLOUD_URL\)/);
    assert.ok(dispatch.indexOf('assertReviewConvexUrl') < dispatch.indexOf('fetch('));
    assert.equal(preview.includes('reviewPreviewOnRoadmap'), false);
  });

  it('checks the workflow out from the default branch and skips when secrets are unset', () => {
    const workflow = readFileSync(new URL('../../../../.github/workflows/portal-review-preview.yml', import.meta.url), 'utf8');
    const pins = workflow.match(/ref: \$\{\{ github\.event\.repository\.default_branch \}\}/g) ?? [];
    assert.equal(pins.length, 2);
    assert.equal((workflow.match(/uses: actions\/checkout@v4/g) ?? []).length, 2);
    assert.match(workflow, /untrusted code/);
    assert.match(workflow, /workflow_dispatch/);
    assert.equal((workflow.match(/secrets are unset/g) ?? []).length, 2);
    assert.match(workflow, /steps\.gate\.outputs\.skip != 'true'/);
  });
});
