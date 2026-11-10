import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { sidebarItemStyle } from './sidebarItemChrome';

const css = readFileSync(new URL('../../styles/global.css', import.meta.url), 'utf8');

describe('activity sidebar selection', () => {
  it('fills only the selected filter and does not outline it', () => {
    const tasks = sidebarItemStyle(true);
    const all = sidebarItemStyle(false);
    assert.equal(tasks.background, 'var(--sidebar-active-fill, var(--surface-2))');
    assert.equal(tasks.border, '1px solid transparent');
    assert.equal(tasks.outline, undefined);
    assert.equal(tasks.boxShadow, undefined);
    assert.match(
      css,
      /\[data-testid='portal-sidebar'\] button:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--fg\);\s*outline-offset:\s*2px;/,
    );
    assert.equal(css.includes("[data-testid='portal-sidebar'] button:hover"), false);
    assert.equal(all.background, 'transparent');
    assert.equal(all.border, '1px solid transparent');
    assert.notEqual(all.background, tasks.background);
  });
});
