import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it } from 'node:test';

Object.assign(globalThis, { React });
const {
  ITEM_CLIENT_EMPTY,
  ITEM_CLIENT_ERROR,
  ITEM_LONG_NAME,
  ITEM_STAFF_EMPTY,
  ITEM_STAFF_ERROR,
  ItemLongRow,
  ItemState,
  readItemScreen,
  resolveItemRegion,
} = await import('./itemStates');

const noop = () => {};

describe('item list states', () => {
  it('keeps a live session off the fixture screen', () => {
    assert.equal(readItemScreen('error', false), 'ready');
    assert.equal(readItemScreen('empty', false), 'ready');
    assert.equal(readItemScreen('error', true), 'error');
    assert.equal(readItemScreen('nope', true), 'ready');
    assert.equal(
      resolveItemRegion({ fixtures: false, screen: 'error', staff: true, loading: false, error: false, count: 4 }),
      'board',
    );
    assert.equal(
      resolveItemRegion({ fixtures: true, screen: 'error', staff: true, loading: false, error: false, count: 4 }),
      'error',
    );
    assert.equal(
      resolveItemRegion({ fixtures: false, screen: 'ready', staff: false, loading: false, error: true, count: 0 }),
      'error',
    );
    assert.equal(
      resolveItemRegion({ fixtures: false, screen: 'ready', staff: true, loading: false, error: true, count: 0 }),
      'board',
    );
    assert.equal(
      resolveItemRegion({ fixtures: false, screen: 'ready', staff: true, loading: true, error: false, count: 0 }),
      'loading',
    );
    assert.equal(
      resolveItemRegion({ fixtures: false, screen: 'ready', staff: false, loading: false, error: false, count: 0 }),
      'empty',
    );
  });

  it('shows the staff filtered empty card and the client shared empty card', () => {
    const staff = renderToStaticMarkup(createElement(ItemState, { screen: 'empty', staff: true, onClear: noop }));
    assert.match(staff, new RegExp(ITEM_STAFF_EMPTY.title));
    assert.match(staff, /Clear a filter, or create a new item\./);
    assert.match(staff, /item-empty\.svg/);
    assert.match(staff, /data-testid="item-clear-filters"/);
    assert.match(staff, /Clear filters/);
    assert.equal(staff.includes('disabled'), false);

    const client = renderToStaticMarkup(createElement(ItemState, { screen: 'empty', staff: false }));
    assert.match(client, new RegExp(ITEM_CLIENT_EMPTY.title));
    assert.match(client, /Warehaus will publish items here when they are ready for you\./);
    assert.equal(client.includes('Clear filters'), false);
    assert.equal(client.includes('item-clear-filters'), false);
  });

  it('shows the queued stage notice for staff and the load notice for clients', () => {
    const staff = renderToStaticMarkup(createElement(ItemState, { screen: 'error', staff: true }));
    assert.match(staff, new RegExp(ITEM_STAFF_ERROR.title));
    assert.match(staff, /The Stage change is queued \(Source: portal\)\. It will retry at 14:05\./);
    assert.match(staff, /data-testid="item-retry-now"/);
    assert.match(staff, />Retry now</);
    assert.equal(staff.includes('disabled'), false);
    assert.equal(staff.includes('item-retry-note'), false);

    const client = renderToStaticMarkup(createElement(ItemState, { screen: 'error', staff: false }));
    assert.match(client, new RegExp(ITEM_CLIENT_ERROR.title));
    assert.match(client, /Try again in a moment\./);
    assert.equal(client.includes('Retry now'), false);
    assert.equal(client.includes('Could not save to Notion'), false);
  });

  it('announces loading without marking the skeleton busy', () => {
    const html = renderToStaticMarkup(createElement(ItemState, { screen: 'loading', staff: true }));
    assert.match(html, /role="status"/);
    assert.match(html, /Loading items/);
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
    assert.match(staff, /item-stage\.svg/);
    assert.match(staff, /item-chev\.svg/);
    assert.match(staff, /width="16"/);
    assert.match(staff, /height="16"/);

    const client = renderToStaticMarkup(createElement(ItemLongRow, { staff: false }));
    assert.match(client, /Spring menu launch · Due Oct 6/);
    assert.equal(client.includes('Northwind Foods ·'), false);
    assert.match(client, />Being scoped</);
    assert.match(client, />In progress</);
    assert.equal(client.includes('Published'), false);
  });

  it('does not call Convex from the state preview', () => {
    const source = readFileSync(new URL('./itemStates.tsx', import.meta.url), 'utf8');
    assert.equal(source.includes('useMutation'), false);
    assert.equal(source.includes('convex'), false);
    assert.match(source, /if \(!fixtures\) return;/);
  });
});
