import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { deriveReviewVisual, type ReviewSurfaceModel } from './MilestoneReview';

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
    assert.equal(deriveReviewVisual({ ...base, designCheck: 'fixes' }), 'fixes');
    assert.equal(deriveReviewVisual({ ...base, approval: 'changes_requested' }), 'changes');
  });
});
