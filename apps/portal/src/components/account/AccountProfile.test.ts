import assert from 'node:assert/strict';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it } from 'node:test';
import { nextExplicitTheme, resolveTheme } from './ThemeControl';
import { profileRoleLine } from './AccountProfile';

Object.assign(globalThis, { React });
const { AccountProfile } = await import('./AccountProfile');

describe('profile role line', () => {
  it('joins the org and role, and hides an empty owner lane', () => {
    const staff = renderToStaticMarkup(
      createElement(AccountProfile, {
        name: 'Alex Staff',
        email: 'alex@warehaus.co',
        role: 'Warehaus Staff',
        orgName: 'Warehaus',
        ownerLane: 'Dream, Design, Develop',
      }),
    );
    assert.match(staff, /How you appear in the portal/);
    assert.match(staff, /data-testid="account-role"[^>]*>Warehaus · Staff/);
    assert.match(staff, /data-testid="account-avatar"[^>]*style="[^"]*width:56px[^"]*border-radius:999px[^"]*background:var\(--surface-2\)/);
    assert.match(staff, />AS</);
    assert.match(staff, /data-testid="account-display-name"[\s\S]*?Alex Staff/);
    assert.match(staff, /Set by Warehaus\./);
    assert.match(staff, /data-testid="account-email"[\s\S]*?alex@warehaus.co/);
    assert.match(staff, /Contact Warehaus to change it/);
    assert.match(staff, /data-testid="account-owner-lane"[\s\S]*?Dream, Design, Develop/);
    assert.equal(staff.includes('<input'), false);
    assert.equal(staff.includes('outline:none'), false);
    assert.match(staff, /:focus-visible/);
    assert.match(staff, /disabled=""[^>]*data-testid="account-change-password"/);
    assert.match(staff, /opacity:0\.4/);
    assert.match(staff, /Use Forgot password on the sign-in page for now/);
    assert.equal(staff.includes('role="group"'), false);
    assert.equal(staff.includes('mailto:'), false);
    assert.match(staff, /Choose light or dark for this device/);
    assert.equal(staff.includes('Theme for this device'), false);
    assert.equal(staff.includes('Lives only in Account'), false);
    assert.match(staff, /data-testid="account-theme-pending"/);
    assert.equal(staff.includes('role="switch"'), false);
    assert.match(staff, /class="account-sign-out[^"]*"/);
    assert.match(staff, /\.account-sign-out \{\s*width: 100%;/);
    assert.match(staff, /\.account-sign-out \{ width: auto; \}/);
    const cardEnd = staff.indexOf('data-testid="account-theme"');
    const card = staff.slice(0, cardEnd);
    assert.equal(card.includes('Sign out'), false);
    assert.match(staff, /data-testid="account-sign-out"/);
    assert.match(staff, /padding: 25px;/);
    assert.match(staff, /\.account-card \{ padding: 48px; \}/);

    const client = renderToStaticMarkup(
      createElement(AccountProfile, {
        name: 'Ada North',
        email: 'ada@northwind.example',
        role: 'Client Admin',
        orgName: 'Northwind',
        ownerLane: '   ',
      }),
    );
    assert.match(client, /Northwind · Client Admin/);
    assert.equal(client.includes('Owner lane'), false);
    assert.equal(client.includes('account-owner-lane'), false);
    assert.match(client, />AN</);
  });

  it('resolves auto to the system theme and flips the knob to an explicit theme', () => {
    assert.equal(profileRoleLine('Warehaus', 'Warehaus Staff'), 'Warehaus · Staff');
    assert.equal(profileRoleLine('Northwind', 'Client Admin'), 'Northwind · Client Admin');
    assert.equal(profileRoleLine(null, 'Warehaus Staff'), 'Staff');
    assert.equal(resolveTheme('auto', true), 'dark');
    assert.equal(resolveTheme('auto', false), 'light');
    assert.equal(resolveTheme('light', true), 'light');
    assert.equal(nextExplicitTheme('dark'), 'light');
    assert.equal(nextExplicitTheme('light'), 'dark');
  });
});
