import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { readPortalDeepLink } from './nav/portalDeepLink';
import { resolveSavedTheme } from './themePreference';

describe('saved theme and tab deep link', () => {
  it('keeps a saved light or dark theme and follows the system when unset', () => {
    assert.equal(resolveSavedTheme('light', true), 'light');
    assert.equal(resolveSavedTheme('dark', false), 'dark');
    assert.equal(resolveSavedTheme('auto', true), 'dark');
    assert.equal(resolveSavedTheme(null, false), 'light');
  });

  it('opens a sidebar section only when both tab and section are present', () => {
    assert.deepEqual(readPortalDeepLink('?tab=account&section=team'), { tab: 'account', section: 'team' });
    assert.equal(readPortalDeepLink('?tab=account'), null);
    assert.equal(readPortalDeepLink('?section=team'), null);
    assert.equal(readPortalDeepLink('?tab=nope&section=team'), null);
  });

  it('keeps the theme boot script and the view provider on the same rules', () => {
    const layout = readFileSync(new URL('../../app/layout.tsx', import.meta.url), 'utf8');
    const provider = readFileSync(
      new URL('../components/providers/PortalViewProvider.tsx', import.meta.url),
      'utf8',
    );
    assert.match(layout, /warehaus-theme/);
    assert.match(layout, /classList\.add\('light'\)/);
    assert.match(provider, /readPortalDeepLink/);
  });
});
