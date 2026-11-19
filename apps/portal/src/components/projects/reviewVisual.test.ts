import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RETRY_WAITS_ON_TOKENS } from '@convex/_lib/milestoneReview';
import {
  APPROVE_CONFIRM_COPY,
  APPROVED_AWAITING,
  DEPLOY_FOOTER,
  MilestoneReviewSurface,
  PREVIEW_REMOVED,
  RETRY_DISABLED_OPACITY,
  RETRY_FAILED,
  WAITING_COPY,
  deriveReviewVisual,
  previewRemovalRecorded,
  reviewVisualForViewer,
  type ReviewSurfaceModel,
} from './MilestoneReview';

Object.assign(globalThis, { React });

const base: ReviewSurfaceModel = {
  milestoneId: 'm',
  iteration: 2,
  workStatus: 'ready',
  approval: 'unreviewed',
  previewUrl: 'localhost:3100/p/demo',
  prNumber: 108,
  prTitle: 'Inline client create',
  branch: 'feat/client-project-create',
  commit: 'aacb3e7',
  builtAt: 1,
  designCheck: 'pass',
  designCheckNote: null,
  history: [],
  tasks: [],
};

describe('review card state from milestone data', () => {
  it('derives building, preview-failed, delete-failed, and couldnt-remove without a fixture override', () => {
    assert.equal(deriveReviewVisual({ ...base, previewUrl: null, previewBuild: 'building' }), 'building');
    assert.equal(deriveReviewVisual({ ...base, previewUrl: null, previewBuild: 'failed' }), 'preview-failed');
    assert.equal(
      deriveReviewVisual({ ...base, approval: 'approved', previewDelete: 'removing' }),
      'delete-failed',
    );
    assert.equal(
      deriveReviewVisual({ ...base, approval: 'approved', previewDelete: 'failed' }),
      'couldnt-remove',
    );
  });

  it('keeps an approved milestone waiting on deploy until a deploy finishes', () => {
    assert.equal(deriveReviewVisual({ ...base, approval: 'approved', deployFinishedAt: null }), 'approved');
    assert.equal(deriveReviewVisual({ ...base, approval: 'approved', previewDelete: 'removed' }), 'approved');
    assert.equal(deriveReviewVisual({ ...base, previewUrl: null }), 'waiting');
    assert.equal(
      deriveReviewVisual({
        ...base,
        workStatus: 'ready',
        previewUrl: 'https://warehaus-portal-git-order-ahead-warehaus-collective.vercel.app',
        previewAttachedAt: 1,
        designCheck: 'fixes',
      }),
      'ready',
    );
    assert.equal(
      deriveReviewVisual({
        ...base,
        previewUrl: 'https://warehaus-portal-git-order-ahead-warehaus-collective.vercel.app',
        previewAttachedAt: 1,
        previewBuild: 'failed',
      }),
      'preview-failed',
    );
    assert.equal(deriveReviewVisual({ ...base, designCheck: 'fixes' }), 'fixes');
    assert.equal(deriveReviewVisual({ ...base, approval: 'changes_requested' }), 'changes');
  });

  it('disables Request changes while a preview is building or failed', () => {
    const source = readFileSync(new URL('./MilestoneReview.tsx', import.meta.url), 'utf8');
    assert.match(source, /const changesHeld = visual === 'building' \|\| visual === 'preview-failed'/);
    assert.match(source, /disabled=\{changesHeld \|\|/);
    assert.match(source, /disabledOpacity=\{changesHeld \? 0\.4/);
    assert.equal(source.includes('The team has been told'), false);
  });
});

function card(model: ReviewSurfaceModel, extra: Record<string, unknown> = {}) {
  return renderToStaticMarkup(
    createElement(MilestoneReviewSurface, {
      model,
      layout: 'card',
      ...extra,
    }),
  );
}

describe('peter and staff preview visibility', () => {
  const removing: ReviewSurfaceModel = {
    ...base,
    approval: 'approved',
    previewDelete: 'removing',
    previewDeleteAttempt: 2,
    previewDeleteAt: 1,
    history: [{ iteration: 2, decision: 'approve', notes: '', decidedByName: 'Peter', decidedAt: 1, source: 'portal', taskCount: 0 }],
  };
  const failedDelete: ReviewSurfaceModel = { ...removing, previewDelete: 'failed', previewDeleteAttempt: 3 };
  const removed: ReviewSurfaceModel = { ...removing, previewDelete: 'removed', previewDeleteAttempt: null, previewDeleteAt: 9 };
  const approved: ReviewSurfaceModel = { ...removing, previewDelete: null, previewDeleteAt: null };

  it('keeps Peter on the plain approved card while a delete is failing', () => {
    assert.equal(reviewVisualForViewer('delete-failed', true), 'approved');
    assert.equal(reviewVisualForViewer('couldnt-remove', true), 'approved');
    assert.equal(reviewVisualForViewer('delete-failed', false), 'delete-failed');
    assert.equal(reviewVisualForViewer('couldnt-remove', false), 'couldnt-remove');
    for (const model of [removing, failedDelete]) {
      const peter = card(model, { isPeter: true });
      const staff = card(model, { isPeter: false });
      assert.match(peter, /data-review-state="approved"/);
      assert.match(peter, new RegExp(APPROVED_AWAITING.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      assert.equal(peter.includes('Removing preview'), false);
      assert.equal(peter.includes('remove preview'), false);
      assert.equal(peter.includes('data-testid="review-retry"'), false);
      assert.equal(peter.includes(PREVIEW_REMOVED), false);
      if (model.previewDelete === 'removing') {
        assert.match(staff, /data-review-state="delete-failed"/);
        assert.match(staff, /Removing preview/);
        assert.equal(staff.includes('data-testid="review-retry"'), false);
      } else {
        assert.match(staff, /data-review-state="couldnt-remove"/);
        assert.match(staff, /remove preview/);
        assert.match(staff, /data-testid="review-retry"/);
      }
    }
  });

  it('mutes a disabled Retry the same way as a held Request changes', () => {
    const html = card({ ...base, previewUrl: null, previewBuild: 'failed' }, { isPeter: false });
    assert.match(html, /isn(?:'|&#x27;)t available yet\. Review previews are still being set up\./);
    assert.equal(RETRY_WAITS_ON_TOKENS, "Retry isn't available yet. Review previews are still being set up.");
    assert.equal(html.includes('Retry waits on the GitHub and Vercel tokens.'), false);
    assert.match(html, /data-testid="review-retry"[^>]*style="[^"]*opacity:0\.4/);
    assert.match(html, /data-testid="request-changes"[^>]*style="[^"]*opacity:0\.4/);
    assert.equal(RETRY_DISABLED_OPACITY, 0.4);
  });

  it('shows a live Retry as pending, then an inline error', () => {
    const failed = { ...base, previewUrl: null, previewBuild: 'failed' } satisfies ReviewSurfaceModel;
    const pending = card(failed, { isPeter: false, retrying: true, onRetry: () => undefined });
    assert.match(pending, /aria-busy="true"/);
    assert.match(pending, /Retrying…/);
    assert.equal(pending.includes('data-testid="review-retry-unavailable"'), false);
    const errored = card(failed, { isPeter: false, onRetry: () => undefined, retryError: RETRY_FAILED });
    assert.match(errored, /role="alert"/);
    assert.match(errored, /data-testid="review-retry-error"/);
    assert.match(errored, /Retry didn’t start/);
    assert.equal(errored.includes('aria-busy'), false);
  });

  it('shows the removal line only after a recorded delete', () => {
    assert.equal(previewRemovalRecorded(approved), false);
    assert.equal(previewRemovalRecorded(removing), false);
    assert.equal(previewRemovalRecorded({ ...removed, previewDeleteAt: null }), false);
    assert.equal(previewRemovalRecorded(removed), true);
    assert.equal(card(approved, { isPeter: true }).includes(PREVIEW_REMOVED), false);
    assert.match(card(removed, { isPeter: true }), new RegExp(PREVIEW_REMOVED.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    const waitingAttach: ReviewSurfaceModel = { ...base, previewUrl: null };
    assert.equal(card(waitingAttach, { isPeter: false, staffAttach: true }).includes('data-testid="approve-deploy"'), false);
    assert.match(card(waitingAttach, { isPeter: false, staffAttach: true }), /Attach preview link/);
    assert.equal(card(waitingAttach, { isPeter: true, staffAttach: false }).includes('Attach preview link'), false);
    assert.equal(card(waitingAttach, { isPeter: true, staffAttach: false }).includes('Remove link'), false);
    const attached = card(
      {
        ...base,
        workStatus: 'ready',
        previewUrl: 'https://warehaus-portal-git-order-ahead-warehaus-collective.vercel.app',
        previewAttachedAt: 1,
      },
      { isPeter: true, staffAttach: true },
    );
    assert.match(attached, /data-review-state="ready"/);
    assert.match(attached, /data-testid="approve-deploy"/);
    assert.match(attached, /Remove link/);
    const page = readFileSync(new URL('../../../app/preview/approvals/page.tsx', import.meta.url), 'utf8');
    for (const view of ['retry-unavailable', 'retry-pending', 'retry-error', 'peter-delete-removing', 'peter-delete-failed', 'preview-removed', 'approved', 'attach', 'attached', 'remove-confirm', 'preview-link-invalid']) {
      assert.match(page, new RegExp(`'${view}'`));
    }
  });

  it('describes a manual preview link on the waiting card', () => {
    assert.equal(APPROVE_CONFIRM_COPY, 'This records the approval. Engineering then merges to main and deploys.');
    assert.equal(WAITING_COPY, 'Staff attach a preview link when this is ready for review. The link shows here and in Grok Bot chat.');
    assert.equal(DEPLOY_FOOTER, 'Approve records the decision, then engineering merges to main and deploys · Peter only');
    const html = card({ ...base, previewUrl: null });
    assert.match(html, /Waiting for a preview link/);
    assert.match(html, /Staff attach a preview link when this is ready for review/);
    assert.match(html, /then engineering merges to main and deploys · Peter only/);
    assert.equal(html.includes('Waiting for review build'), false);
    assert.equal(html.includes('protected preview builds'), false);
    assert.equal(html.includes('ships to production'), false);
    const changes = card({
      ...base,
      approval: 'changes_requested',
      history: [{ iteration: 2, decision: 'request_changes', notes: 'Tighten the type.', decidedByName: 'Peter', decidedAt: 1, source: 'portal', taskCount: 1 }],
    });
    assert.equal(changes.includes('The next preview builds'), false);
    assert.equal(changes.includes('building preview'), false);
    const building = card({ ...base, previewUrl: null, previewBuild: 'building' });
    assert.equal(building.includes('building preview'), false);
    assert.equal(building.includes('The next preview builds'), false);
    const approve = card({ ...base, previewUrl: null }, { isPeter: true, initialDialog: 'approve' });
    assert.match(approve, /data-focus-ring="info"/);
    const request = card({ ...base, previewUrl: null }, { initialDialog: 'changes' });
    assert.match(request, /data-focus-ring="info"/);
    assert.match(request, />Cancel</);
  });

  it('puts the info ring on attach and remove, and keeps the danger border when invalid', () => {
    const waiting = { ...base, previewUrl: null } satisfies ReviewSurfaceModel;
    const attach = card(waiting, { staffAttach: true, initialLink: 'attach' });
    assert.match(attach, /data-focus-ring="info"/);
    assert.match(attach, /class="needs-field block"/);
    assert.match(attach, /outline:none/);
    const remove = card(waiting, { staffAttach: true, initialLink: 'remove' });
    assert.match(remove, /data-focus-ring="info"/);
    assert.match(remove, />Cancel</);
    assert.equal(remove.includes('preview-link-input'), false);
    const invalid = card(waiting, {
      staffAttach: true,
      initialLink: 'attach',
      initialLinkUrl: 'http://localhost:3100',
      initialLinkError: 'Localhost links can’t be attached.',
    });
    assert.match(invalid, /data-focus-ring="info"/);
    assert.match(invalid, /border:1px solid var\(--danger\)/);
    assert.match(invalid, /outline:none/);
  });
});
