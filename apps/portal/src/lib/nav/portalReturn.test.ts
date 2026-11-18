import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { taskCloseLabel } from './portalReturn';

describe('task close label', () => {
  it('reads the path tab, and ?tab= only on fixture preview', () => {
    assert.equal(taskCloseLabel('/'), 'Back to dashboard');
    assert.equal(taskCloseLabel('/activity'), 'Back to activity');
    assert.equal(taskCloseLabel('/projects'), 'Back to board');
    assert.equal(taskCloseLabel('/preview?tab=activity'), 'Back to activity');
    assert.equal(taskCloseLabel('/preview?tab=dashboard'), 'Back to dashboard');
    assert.equal(taskCloseLabel(null), 'Back to board');
  });
});
