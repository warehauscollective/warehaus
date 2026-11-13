import assert from 'node:assert/strict';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it } from 'node:test';

Object.assign(globalThis, { React });
const { ApiTokensView } = await import('./ApiTokensPanel');

const row = {
  id: 'tok-1',
  name: 'cursor-portal',
  prefix: 'whp_shownon',
  scope: 'read-write' as const,
  revokedAt: null,
  lastUsedAt: null,
  createdAt: 1,
  rateLimit: 60,
};

describe('API token admin', () => {
  it('shows a new token once and keeps only the prefix on the list', () => {
    const shown = renderToStaticMarkup(
      createElement(ApiTokensView, {
        tokens: [row],
        revealed: 'whp_shownonce_example',
        error: null,
        pending: false,
        onCreate: () => undefined,
        onRevoke: () => undefined,
        onDismiss: () => undefined,
      }),
    );
    assert.match(shown, /data-testid="api-token-secret"[^>]*value="whp_shownonce_example"/);
    assert.match(shown, /whp_shownon…/);
    assert.equal(shown.includes('whp_shownonce_exampleSECRET'), false);

    const dismissed = renderToStaticMarkup(
      createElement(ApiTokensView, {
        tokens: [row],
        revealed: null,
        error: null,
        pending: false,
        onCreate: () => undefined,
        onRevoke: () => undefined,
        onDismiss: () => undefined,
      }),
    );
    assert.equal(dismissed.includes('api-token-secret'), false);
    assert.equal(dismissed.includes('whp_shownonce_example'), false);
    assert.match(dismissed, /whp_shownon…/);
  });
});
