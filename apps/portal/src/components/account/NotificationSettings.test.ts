import assert from 'node:assert/strict';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it } from 'node:test';
import { ConvexProvider, ConvexReactClient } from 'convex/react';

Object.assign(globalThis, { React });
const { NotificationSettings } = await import('./NotificationSettings');

const client = new ConvexReactClient('https://example.convex.cloud');

function render(staff: boolean) {
  return renderToStaticMarkup(
    createElement(ConvexProvider, { client }, createElement(NotificationSettings, { staff, live: false })),
  );
}

describe('notification settings', () => {
  it('shows staff toggles only to staff', () => {
    const html = render(true);
    for (const key of ['awaitingGo', 'syncProblems', 'draftRecaps', 'inviteNotices']) {
      assert.match(html, new RegExp(`data-testid="notify-${key}"`));
    }
    for (const key of ['needsAttention', 'sharedRecaps', 'weeklySummary']) {
      assert.equal(html.includes(`notify-${key}`), false);
    }
    assert.match(html, /Email and in-portal/);
  });

  it('shows client toggles only to clients', () => {
    const html = render(false);
    for (const key of ['needsAttention', 'sharedRecaps', 'weeklySummary']) {
      assert.match(html, new RegExp(`data-testid="notify-${key}"`));
    }
    for (const key of ['awaitingGo', 'syncProblems', 'draftRecaps', 'inviteNotices']) {
      assert.equal(html.includes(`notify-${key}`), false);
    }
    assert.equal(html.includes('Notion'), false);
    assert.equal(html.includes('Granola'), false);
  });

  it('starts from the defaults as accessible switches with a save button', () => {
    const html = render(false);
    assert.match(html, /role="switch" aria-checked="true" aria-label="Needs your attention"/);
    assert.match(html, /role="switch" aria-checked="false" aria-label="Weekly summary"/);
    assert.match(html, /data-testid="account-save-notifications"[^>]*>Save changes</);
    assert.equal(html.includes('type="checkbox"'), false);
  });
});
