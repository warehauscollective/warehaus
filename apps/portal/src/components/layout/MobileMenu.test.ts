import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { menuFocusIds, projectMenuChips, SEARCH_RESULTS_HINT } from './MobileMenu';

describe('mobile menu', () => {
  it('keeps search and the project filters, and drops Shipped', () => {
    const chips = projectMenuChips([
      { key: 'all', label: 'All projects' },
      { key: 'active', label: 'Active' },
      { key: 'shipped', label: 'Shipped' },
    ]);
    assert.deepEqual(chips.map((chip) => chip.key), ['all', 'active']);
  });

  it('focuses Close, search, chips, then staff notifications', () => {
    const chips = [{ key: 'all' }, { key: 'active' }];
    assert.deepEqual(menuFocusIds(true, chips), [
      'menu-close',
      'menu-search',
      'menu-chip-all',
      'menu-chip-active',
      'menu-notifications',
    ]);
    assert.deepEqual(menuFocusIds(false, chips), ['menu-close', 'menu-search', 'menu-chip-all', 'menu-chip-active']);
  });

  it('uses the focused-search hint and leaves Account and the helper line out', () => {
    const source = readFileSync(new URL('./MobileMenu.tsx', import.meta.url), 'utf8');
    assert.equal(SEARCH_RESULTS_HINT, 'Enter opens the existing search results.');
    assert.equal(source.includes(SEARCH_RESULTS_HINT), true);
    assert.equal(source.includes('>Account<'), false);
    assert.equal(source.includes('Shipped'), false);
    assert.equal(source.includes('helper'), false);
  });
});
