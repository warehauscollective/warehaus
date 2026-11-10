import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PHONE_SCROLL_INSET, phoneInsetDoubled, tabPanelShellLayout } from './tabPanelShellLayout';

describe('phone shell inset', () => {
  it('does not apply a phone gap and the 24px inset together', () => {
    for (const project of [false, true]) {
      const layout = tabPanelShellLayout(project);
      assert.equal(phoneInsetDoubled(layout), false);
      assert.equal(layout.contentClassName.includes('pt-6'), false);
      const phoneShell = layout.shellClassName.replace(/lg:[^\s]+/g, ' ').replace(/\s+/g, ' ');
      assert.match(phoneShell, /(?:^|\s)gap-0(?:\s|$)/);
      assert.doesNotMatch(phoneShell, /(?:^|\s)gap-(?!0(?:\s|$))\S+/);
    }
    assert.equal(PHONE_SCROLL_INSET, 'max-lg:pt-6');
  });

  it('keeps the desktop gap on the shell and leaves the phone inset off the wrapper', () => {
    const project = tabPanelShellLayout(true);
    const other = tabPanelShellLayout(false);
    assert.match(project.shellClassName, /lg:gap-6/);
    assert.match(other.shellClassName, /lg:gap-\[var\(--portal-panel-gap,1\.25rem\)\]/);
    assert.equal(project.contentClassName.includes('pt-'), false);
    assert.equal(other.contentClassName.includes('pt-'), false);
  });
});
