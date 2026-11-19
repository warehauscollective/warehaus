import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { getPortalTabForPath } from '@warehaus/logic';
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

  it('opens /resources and /account as pages, not a side panel', () => {
    assert.equal(getPortalTabForPath('/resources'), 'resources');
    assert.equal(getPortalTabForPath('/resources/res-1'), 'resources');
    assert.equal(getPortalTabForPath('/account'), 'account');
    assert.equal(taskCloseLabel('/resources'), 'Back to resources');
    assert.equal(taskCloseLabel('/account'), 'Back to account');
    for (const file of ['../../components/pages/ResourcesContent.tsx', '../../components/pages/AccountContent.tsx']) {
      const source = readFileSync(new URL(file, import.meta.url), 'utf8');
      assert.equal(source.includes('Close details'), false);
      assert.equal(source.includes('aria-label="Details"'), false);
    }
  });
});
