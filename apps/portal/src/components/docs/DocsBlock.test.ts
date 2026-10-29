import assert from 'node:assert/strict';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it } from 'node:test';
import type { DocRow } from './DocsBlock';

Object.assign(globalThis, { React });
const { DocsBlock, sortDocRows } = await import('./DocsBlock');

function doc(partial: Partial<DocRow> & Pick<DocRow, 'id' | 'title'>): DocRow {
  return {
    summary: 'A short summary.',
    docType: 'Brief',
    ...partial,
  };
}

function publishedCount(html: string): number {
  return html.match(/Published/g)?.length ?? 0;
}

describe('sortDocRows', () => {
  it('sorts by Order, then title, and puts a missing Order last', () => {
    const rows = sortDocRows([
      doc({ id: 'c', title: 'Zebra', order: 1 }),
      doc({ id: 'a', title: 'Alpha', order: null }),
      doc({ id: 'b', title: 'Middle', order: 1 }),
      doc({ id: 'd', title: 'Beta' }),
    ]);
    assert.deepEqual(rows.map((row) => row.title), ['Middle', 'Zebra', 'Alpha', 'Beta']);
  });
});

describe('DocsBlock audience', () => {
  const staffDoc = doc({
    id: 'd1',
    title: 'Project brief',
    summary: 'Goals for the site.',
    docType: 'Brief',
    order: 1,
    publishToWarehaus: true,
    notionPageId: 'notion-doc-brief',
    syncState: 'synced',
    updatedAt: Date.parse('2026-10-12T00:00:00Z'),
  });

  it('shows Published once on a staff row and never shows Order', () => {
    const html = renderToStaticMarkup(createElement(DocsBlock, { docs: [staffDoc], staff: true }));
    assert.equal(publishedCount(html), 1);
    assert.match(html, /In sync/);
    assert.match(html, /Add doc/);
    assert.equal(html.includes('text-transform:uppercase'), false);
    assert.match(html, />Brief</);
    assert.equal(html.includes('>BRIEF<'), false);
    assert.match(html, /\.docs-badges \{ order: 3; flex: 1 0 100%; flex-wrap: wrap;/);
    assert.match(html, /padding-left: 48px/);
    assert.match(html, /padding: 20px 16px/);
    assert.equal(html.includes('padding: 20px 0'), false);
    assert.equal(html.includes('padding-left: 52px'), false);
    assert.equal(html.includes('Order'), false);
  });

  it('hides publish, sync, Add doc, and Order from a client row', () => {
    const html = renderToStaticMarkup(createElement(DocsBlock, { docs: [staffDoc], staff: false }));
    assert.equal(publishedCount(html), 0);
    assert.equal(html.includes('Not published'), false);
    assert.equal(html.includes('In sync'), false);
    assert.equal(html.includes('Add doc'), false);
    assert.equal(html.includes('Order'), false);
    assert.match(html, /Project brief/);
    assert.match(html, /Brief/);
  });

  it('hides an empty summary and a blank Doc Type', () => {
    const html = renderToStaticMarkup(createElement(DocsBlock, {
      docs: [doc({ id: 'blank', title: 'Untitled note', summary: '   ', docType: '  ', order: 2 })],
      staff: false,
    }));
    assert.equal(html.includes('Untitled note'), true);
    assert.equal(html.includes('text-transform:uppercase'), false);
  });

  it('shows a staff sync problem with Retry sync', () => {
    const html = renderToStaticMarkup(createElement(DocsBlock, {
      docs: [doc({
        id: 'bad',
        title: 'Services agreement',
        publishToWarehaus: false,
        notionPageId: 'notion-doc-problem',
        syncState: 'failed',
        lastSyncedAt: Date.parse('2026-10-26T16:12:00Z'),
      })],
      staff: true,
    }));
    assert.match(html, /Sync problem/);
    assert.match(html, /Retry sync/);
    assert.match(html, /Not published/);
    assert.equal(publishedCount(html), 0);
  });
});
