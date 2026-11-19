import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

Object.assign(globalThis, { React });
const { PortalToast } = await import('./PortalToast');
const { PortalModal } = await import('./PortalModal');

describe('PortalToast', () => {
  it('renders the four approved kinds', () => {
    const success = renderToStaticMarkup(createElement(PortalToast, { kind: 'success', placement: 'flow', autoHideMs: 0 }));
    assert.match(success, /Project created/);
    assert.match(success, /docs-check\.svg/);
    assert.match(success, /data-kind="success"/);
    assert.equal(success.includes('Retry'), false);

    const error = renderToStaticMarkup(createElement(PortalToast, {
      kind: 'error',
      placement: 'flow',
      autoHideMs: 0,
      onRetry: () => undefined,
    }));
    assert.match(error, /Couldn’t save the change\. Nothing moved\./);
    assert.match(error, /docs-alert\.svg/);
    assert.match(error, />Retry</);
    assert.match(error, /1px solid var\(--danger\)/);

    const moved = renderToStaticMarkup(createElement(PortalToast, {
      kind: 'moved',
      placement: 'flow',
      autoHideMs: 0,
      onUndo: () => undefined,
    }));
    assert.match(moved, /Moved to In Progress/);
    assert.match(moved, />Undo</);
    assert.match(moved, /var\(--muted\)/);

    const invite = renderToStaticMarkup(createElement(PortalToast, { kind: 'invite-sent', placement: 'flow', autoHideMs: 0 }));
    assert.match(invite, /Invite sent/);
    assert.match(invite, /docs-check\.svg/);
  });

  it('pins a board toast above the dock and keeps a flowing one in the board', () => {
    const pinned = renderToStaticMarkup(createElement(PortalToast, {
      kind: 'error',
      message: 'Not saved.',
      placement: 'above-dock',
      autoHideMs: 0,
    }));
    assert.match(pinned, /data-placement="above-dock"/);
    assert.match(pinned, /position:fixed/);
    assert.match(pinned, /z-index:60/);
    assert.match(pinned, /bottom:calc\(1\.25rem \+ 3\.5rem \+ 16px\)/);
    const flowing = renderToStaticMarkup(createElement(PortalToast, {
      kind: 'moved',
      message: 'Moved “Homepage” to Planning',
      placement: 'below-board',
      autoHideMs: 0,
      onUndo: () => undefined,
    }));
    assert.match(flowing, /data-placement="below-board"/);
    assert.match(flowing, /position:relative/);
  });
});

describe('leftover dialogs on PortalModal', () => {
  it('puts search and the task-board sheet on PortalModal', () => {
    const search = readFileSync(new URL('../search/PortalSearch.tsx', import.meta.url), 'utf8');
    assert.match(search, /<PortalModal/);
    assert.match(search, /align="start"/);
    assert.match(search, /data-testid="portal-search"|testId="portal-search"/);
    const board = readFileSync(new URL('../tasks/TaskBoard.tsx', import.meta.url), 'utf8');
    const sheet = board.slice(board.indexOf('function Sheet'), board.indexOf('function Modal'));
    assert.match(sheet, /<PortalModal/);
    assert.match(sheet, /sheet="bottom"/);
    assert.equal(sheet.includes('portalNode'), false);
    const needs = board.slice(board.indexOf('function Modal'), board.indexOf('function BoardScroller'));
    assert.match(needs, /<PortalModal/);
    assert.match(needs, /testId="task-needs-dialog"/);
  });

  it('opens a top-aligned dialog under the header without a grabber', () => {
    const html = renderToStaticMarkup(createElement(PortalModal, {
      label: 'Search',
      onClose: () => undefined,
      align: 'start',
      narrow: false,
      width: 640,
      children: createElement('p', null, 'Results'),
    }));
    assert.match(html, /align-items:flex-start/);
    assert.match(html, /padding:72px 20px 24px/);
    assert.equal(html.includes('data-testid="modal-grabber"'), false);
    assert.match(html, /min\(780px, calc\(100dvh - 96px\)\)/);
  });
});
