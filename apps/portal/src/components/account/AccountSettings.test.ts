import assert from 'node:assert/strict';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ConvexProvider, ConvexReactClient } from 'convex/react';
import { describe, it } from 'node:test';

// tsx compiles JSX with the classic runtime. The portal build uses the automatic runtime.
Object.assign(globalThis, { React });

const { AccountSettings } = await import('./AccountSettings');

const convex = new ConvexReactClient('https://placeholder.convex.cloud');

function markup(staff: boolean) {
  return renderToStaticMarkup(
    createElement(
      ConvexProvider,
      { client: convex },
      createElement(AccountSettings, {
        staff,
        name: staff ? 'Alex Staff' : 'Ada North',
        email: staff ? 'alex@warehaus.co' : 'ada@northwind.example',
        orgLabel: staff ? 'Warehaus' : 'Northwind',
        role: staff ? 'Warehaus Staff' : 'Client Admin',
        focus: 'profile',
        live: false,
        onSignOut: () => {},
      }),
    ),
  );
}

describe('AccountSettings change password', () => {
  it('shows Change password to staff and never to a client', () => {
    const staff = markup(true);
    assert.match(staff, /data-testid="account-change-password"/);
    assert.match(staff, /Change password/);
    assert.match(staff, /Warehaus · Owner/);
    assert.match(staff, /Owner/);
    assert.equal(staff.includes('Northwind · Client Admin'), false);
    assert.match(staff, /Client Admin · Active/);

    const client = markup(false);
    assert.equal(client.includes('account-change-password'), false);
    assert.equal(client.includes('Change password'), false);
    assert.match(client, /data-testid="account-sign-out"/);
    assert.match(client, /Northwind · Client Admin/);
  });
});
