import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it } from 'node:test';

Object.assign(globalThis, { React });
const {
  ITEM_CLIENT_EMPTY,
  ITEM_CLIENT_SUBTITLE,
  ITEM_FILTERED_EMPTY,
  ITEM_LONG_NAME,
  ITEM_SAVE_TITLE,
  ITEM_STALE,
  ITEM_STAFF_SUBTITLE,
  ITEM_TRUE_EMPTY,
  NEW_TASK_HINT,
  ItemListCard,
  ItemLongRow,
  ItemSaveBanner,
  ItemStaleBanner,
  ItemState,
  NewTaskButton,
  readItemScreen,
  readTaskFilter,
  resolveItemRegion,
  stageQueueBody,
  taskMatchesListFilter,
} = await import('./itemStates');

const noop = () => {};
const live = { fixtures: false, screen: 'ready' as const, loading: false, error: false, count: 0, matched: 0, filterActive: false };

describe('item list states', () => {
  it('keeps a live session off the fixture screen and includes staff in the load error', () => {
    assert.equal(readItemScreen('error', false), 'ready');
    assert.equal(readItemScreen('empty', false), 'ready');
    assert.equal(readItemScreen('error', true), 'error');
    assert.equal(readItemScreen('nope', true), 'ready');
    assert.deepEqual(
      resolveItemRegion({ ...live, screen: 'error', count: 4, matched: 4 }),
      { region: 'board', stale: false },
    );
    assert.deepEqual(
      resolveItemRegion({ ...live, fixtures: true, screen: 'error', count: 4, matched: 4 }),
      { region: 'error', stale: false },
    );
    assert.deepEqual(
      resolveItemRegion({ ...live, error: true, count: 0 }),
      { region: 'error', stale: false },
    );
    assert.deepEqual(
      resolveItemRegion({ ...live, error: true, count: 3, matched: 3 }),
      { region: 'board', stale: true },
    );
    assert.deepEqual(
      resolveItemRegion({ ...live, loading: true, count: 0 }),
      { region: 'loading', stale: false },
    );
    assert.deepEqual(resolveItemRegion(live), { region: 'empty', stale: false });
    assert.deepEqual(
      resolveItemRegion({ ...live, count: 4, matched: 0, filterActive: true }),
      { region: 'filtered', stale: false },
    );
    assert.deepEqual(
      resolveItemRegion({ ...live, count: 0, matched: 0, filterActive: true }),
      { region: 'empty', stale: false },
    );
  });

  it('splits true empty from a real filter and keeps the client shared empty', () => {
    const staff = renderToStaticMarkup(createElement(ItemState, { screen: 'empty', staff: true, onClear: noop }));
    assert.match(staff, new RegExp(ITEM_TRUE_EMPTY.title));
    assert.match(staff, /Tasks synced from Notion will show here\./);
    assert.match(staff, /currentColor/);
    assert.equal(staff.includes('Clear filters'), false);
    assert.equal(staff.includes('item-clear-filters'), false);

    const filtered = renderToStaticMarkup(createElement(ItemState, { screen: 'filtered', staff: true, onClear: noop }));
    assert.match(filtered, new RegExp(ITEM_FILTERED_EMPTY.title));
    assert.match(filtered, /Clear a filter, or create a new item\./);
    assert.match(filtered, /data-testid="item-clear-filters"/);

    const client = renderToStaticMarkup(createElement(ItemState, { screen: 'empty', staff: false }));
    assert.match(client, new RegExp(ITEM_CLIENT_EMPTY.title));
    assert.match(client, /Warehaus will publish tasks here when they(?:'|&#x27;)re ready for you\./);
    assert.equal(client.includes('Clear filters'), false);
  });

  it('shows a load failure for staff and clients, with Try again inside the card', () => {
    const staff = renderToStaticMarkup(createElement(ItemState, { screen: 'error', staff: true, onRetry: noop }));
    assert.match(staff, /We couldn(?:'|&#x27;)t load your tasks/);
    assert.match(staff, /Try again in a moment\./);
    assert.match(staff, /data-testid="item-try-again"/);
    assert.match(staff, />Try again</);
    assert.equal(staff.includes('Retry now'), false);
    assert.equal(staff.includes('14:05'), false);
    assert.equal(staff.includes('Source: portal'), false);
    assert.equal(staff.includes(ITEM_SAVE_TITLE.replace("'", '&#x27;')), false);

    const client = renderToStaticMarkup(createElement(ItemState, { screen: 'error', staff: false, onRetry: noop }));
    assert.match(client, /data-testid="item-try-again"/);
    assert.match(client, />Try again</);
  });

  it('puts the stale notice and the save retry inside their cards', () => {
    const stale = renderToStaticMarkup(createElement(ItemStaleBanner, { onRetry: noop }));
    assert.match(stale, new RegExp(ITEM_STALE.title));
    assert.match(stale, /Showing the last tasks we could load\./);
    assert.match(stale, /data-testid="item-try-again"/);

    const retryAt = Date.parse('2026-10-29T18:05:00Z');
    const clock = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(retryAt));
    const saved = renderToStaticMarkup(createElement(ItemSaveBanner, { retryAt, onRetry: noop }));
    assert.match(saved, /Couldn(?:'|&#x27;)t save to Notion/);
    assert.match(saved, new RegExp(`The stage change is queued and will retry at ${clock.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.`));
    assert.match(saved, /data-testid="item-retry-now"/);
    assert.equal(saved.includes('Source: portal'), false);
    assert.equal(stageQueueBody(null), 'The stage change is queued and will retry.');
    assert.equal(stageQueueBody(null).includes('14:05'), false);
    const open = renderToStaticMarkup(createElement(ItemSaveBanner, { retryAt: null, onRetry: noop }));
    assert.match(open, /will retry\./);
    assert.equal(open.includes(' at '), false);
  });

  it('announces loading inside the shared list card', () => {
    const card = renderToStaticMarkup(createElement(ItemListCard, {}, 'tasks'));
    const html = `${card}${renderToStaticMarkup(createElement(ItemState, { screen: 'loading', staff: true }))}`;
    assert.match(html, /data-testid="item-list-card"/);
    assert.match(html, /role="status"/);
    assert.match(html, /Loading tasks/);
    assert.equal(html.includes('aria-busy'), false);
    assert.equal((html.match(/data-testid="item-skeleton-row"/g) ?? []).length, 3);
  });

  it('wraps the long item title and keeps client rows free of the publish mark', () => {
    const staff = renderToStaticMarkup(createElement(ItemLongRow, { staff: true }));
    assert.match(staff, new RegExp(ITEM_LONG_NAME));
    assert.match(staff, /overflow-wrap:anywhere/);
    assert.equal(staff.includes('truncate'), false);
    assert.match(staff, /Northwind Foods · Spring menu launch · Due Oct 6/);
    assert.match(staff, />Planning</);
    assert.match(staff, />In progress</);
    assert.match(staff, />Published</);
    assert.match(staff, /currentColor/);
    assert.match(staff, /data-testid="item-chev"/);
    assert.match(staff, /width="16"/);
    assert.match(staff, /height="16"/);

    const client = renderToStaticMarkup(createElement(ItemLongRow, { staff: false }));
    assert.match(client, /Spring menu launch · Due Oct 6/);
    assert.equal(client.includes('Northwind Foods ·'), false);
    assert.match(client, />Being scoped</);
    assert.match(client, />In progress</);
    assert.equal(client.includes('Published'), false);
  });

  it('keeps New task off while write-back is required', () => {
    const html = renderToStaticMarkup(createElement(NewTaskButton));
    assert.match(html, /data-testid="new-task"/);
    assert.match(html, /disabled=""/);
    assert.match(html, /tabindex="-1"/);
    assert.match(html, /tabindex="0"/);
    assert.match(html, /opacity:0\.4/);
    assert.match(html, /pointer-events:none/);
    assert.match(html, new RegExp(NEW_TASK_HINT));
    assert.equal(html.includes('role="group"'), false);
  });

  it('matches awaiting-go and unpublished filters', () => {
    assert.equal(readTaskFilter('unpublished'), 'unpublished');
    assert.equal(readTaskFilter('nope'), 'all');
    assert.equal(taskMatchesListFilter({ stage: 'Awaiting Go', publishToWarehaus: true }, 'awaiting', true), true);
    assert.equal(taskMatchesListFilter({ stage: 'Building', publishToWarehaus: true }, 'awaiting', true), false);
    assert.equal(taskMatchesListFilter({ stage: 'Building', publishToWarehaus: false }, 'unpublished', true), true);
    assert.equal(taskMatchesListFilter({ stage: 'Building', publishToWarehaus: false }, 'unpublished', false), false);
    assert.equal(taskMatchesListFilter({ stage: null, publishToWarehaus: true }, 'all', true), true);
  });

  it('does not call Convex from the state preview', () => {
    const source = readFileSync(new URL('./itemStates.tsx', import.meta.url), 'utf8');
    assert.equal(source.includes('useMutation'), false);
    assert.equal(source.includes('convex'), false);
    assert.equal(source.includes('14:05'), false);
    assert.match(source, /if \(!fixtures\) return;/);
    const icons = ['item-empty.svg', 'item-chev.svg', 'item-stage.svg'].map((file) =>
      readFileSync(new URL(`../../../public/icons/${file}`, import.meta.url), 'utf8'),
    );
    for (const svg of icons) {
      assert.match(svg, /currentColor/);
      assert.equal(svg.includes('#636363') || svg.includes('#A4A4A4') || svg.includes('#FDFDFE'), false);
    }
    assert.equal(ITEM_STAFF_SUBTITLE, 'Synced from Notion · clients see published only');
    assert.equal(ITEM_CLIENT_SUBTITLE.includes('Board by Status'), false);
  });
});
