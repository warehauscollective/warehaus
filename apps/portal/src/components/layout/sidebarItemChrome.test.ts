import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { sidebarItemStyle } from './sidebarItemChrome';

describe('activity sidebar selection', () => {
  it('fills only the selected filter and does not outline it', () => {
    const tasks = sidebarItemStyle(true);
    const all = sidebarItemStyle(false);
    assert.equal(tasks.background, 'var(--sidebar-active-fill, var(--surface-2))');
    assert.equal(tasks.border, '1px solid transparent');
    assert.equal(tasks.outline, 'none');
    assert.equal(tasks.boxShadow, 'none');
    assert.equal(all.background, 'transparent');
    assert.equal(all.border, '1px solid transparent');
    assert.notEqual(all.background, tasks.background);
  });
});
