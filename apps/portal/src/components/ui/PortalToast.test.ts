import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it, mock } from 'node:test';
import React, { act, createElement, type ComponentProps, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { installTestDom, type DomNode } from '../auth/testDom';

Object.assign(globalThis, { React });
const { PortalToast, PortalToastLive } = await import('./PortalToast');
const { PortalModal } = await import('./PortalModal');
const SearchModal = PortalModal as (
  props: Omit<ComponentProps<typeof PortalModal>, 'children'>,
) => ReactElement;

describe('PortalToast', () => {
  it('renders the four approved kinds', () => {
    const success = renderToStaticMarkup(createElement(PortalToast, { kind: 'success', placement: 'flow', autoHideMs: 0 }));
    assert.match(success, /Project created/);
    assert.equal(success.includes('role="status"'), false);
    assert.equal(success.includes('role="alert"'), false);
    assert.match(success, /0 8px 24px/);
    assert.match(success, /docs-check\.svg/);
    assert.match(success, /data-kind="success"/);
    assert.equal(success.includes('Retry'), false);
    const live = renderToStaticMarkup(createElement(PortalToastLive));
    assert.match(live, /role="status"/);
    assert.match(live, /aria-live="polite"/);
    assert.match(live, /data-testid="portal-toast-live"/);

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
    assert.match(error, /role="alert"/);
    assert.match(error, /min-height:44px/);
    assert.match(error, /min-width:44px/);

    const moved = renderToStaticMarkup(createElement(PortalToast, {
      kind: 'moved',
      placement: 'flow',
      autoHideMs: 0,
      onUndo: () => undefined,
    }));
    assert.match(moved, /Moved to In Progress/);
    assert.match(moved, />Undo</);
    assert.match(moved, /var\(--muted\)/);
    assert.match(moved, /min-height:44px/);

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

  it('hides at 3s when the parent passes a new onDismiss', async () => {
    const document = installTestDom();
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    mock.timers.enable({ apis: ['setTimeout', 'Date'] });
    const container = document.createElement('div');
    document.body.appendChild(container);
    let root: Root | null = null;
    let seen = '';
    try {
      await act(async () => {
        root = createRoot(container as unknown as Element);
        root.render(createElement(PortalToast, {
          kind: 'success',
          placement: 'flow',
          onDismiss: () => {
            seen = 'first';
          },
        }));
      });
      await act(async () => {
        mock.timers.tick(1500);
      });
      assert.equal(seen, '');
      await act(async () => {
        root?.render(createElement(PortalToast, {
          kind: 'success',
          placement: 'flow',
          onDismiss: () => {
            seen = 'second';
          },
        }));
      });
      await act(async () => {
        mock.timers.tick(1499);
      });
      assert.equal(seen, '');
      await act(async () => {
        mock.timers.tick(1);
      });
      assert.equal(seen, 'second');
    } finally {
      await act(async () => {
        root?.unmount();
      });
      mock.timers.reset();
      clearTestDom();
    }
  });

  it('pauses the 3s hide while hovered or focused, then finishes the remaining time', async () => {
    const document = installTestDom();
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    mock.timers.enable({ apis: ['setTimeout', 'Date'] });
    const container = document.createElement('div');
    document.body.appendChild(container);
    let root: Root | null = null;
    let seen = 0;
    const dismiss = () => {
      seen += 1;
    };
    try {
      await act(async () => {
        root = createRoot(container as unknown as Element);
        root.render(createElement(PortalToast, {
          kind: 'moved',
          placement: 'flow',
          onUndo: () => undefined,
          onDismiss: dismiss,
        }));
      });
      const toast = findToast(container);
      assert.ok(toast);
      await act(async () => {
        mock.timers.tick(1000);
        toast.dispatchEvent(domEvent('mouseenter'));
      });
      await act(async () => {
        mock.timers.tick(5000);
      });
      assert.equal(seen, 0);
      await act(async () => {
        toast.dispatchEvent(domEvent('mouseleave'));
        mock.timers.tick(1999);
      });
      assert.equal(seen, 0);
      await act(async () => {
        mock.timers.tick(1);
      });
      assert.equal(seen, 1);

      seen = 0;
      await act(async () => {
        root?.render(createElement(PortalToast, {
          kind: 'success',
          placement: 'flow',
          onDismiss: dismiss,
        }));
      });
      const again = findToast(container);
      assert.ok(again);
      await act(async () => {
        mock.timers.tick(1000);
        again.dispatchEvent(domEvent('focusin'));
      });
      await act(async () => {
        mock.timers.tick(4000);
      });
      assert.equal(seen, 0);
      const child = again.childNodes.find((node) => node.nodeName === 'SPAN' || node.nodeName === 'P');
      assert.ok(child);
      const host = again as DomNode & { contains: (other: DomNode) => boolean };
      Object.setPrototypeOf(host, Node.prototype);
      Object.setPrototypeOf(child, Node.prototype);
      host.contains = (other: DomNode) => other === host || other === child;
      await act(async () => {
        host.dispatchEvent(domEvent('focusout', child));
        host.dispatchEvent(domEvent('focusin'));
        mock.timers.tick(5000);
      });
      assert.equal(seen, 0);
      await act(async () => {
        host.dispatchEvent(domEvent('focusout', null));
        mock.timers.tick(2000);
      });
      assert.equal(seen, 1);
    } finally {
      await act(async () => {
        root?.unmount();
      });
      mock.timers.reset();
      clearTestDom();
    }
  });
});

function clearTestDom() {
  const target = globalThis as { document?: unknown; window?: unknown };
  delete target.document;
  delete target.window;
}

function findToast(node: DomNode): DomNode | null {
  if (node.getAttribute('data-testid') === 'portal-toast') return node;
  for (const child of node.childNodes) {
    const found = findToast(child);
    if (found) return found;
  }
  return null;
}

function domEvent(type: string, relatedTarget: DomNode | null = null) {
  return {
    type,
    bubbles: false,
    relatedTarget,
    target: null,
    currentTarget: null,
    preventDefault() {},
    stopPropagation() {},
  };
}

describe('leftover dialogs on PortalModal', () => {
  it('puts search and the task-board sheet on PortalModal', () => {
    const search = readFileSync(new URL('../search/PortalSearch.tsx', import.meta.url), 'utf8');
    assert.match(search, /<PortalModal/);
    assert.match(search, /align="start"/);
    assert.match(search, /blueFocus/);
    assert.match(search, /data-testid="portal-search"|testId="portal-search"/);
    const board = readFileSync(new URL('../tasks/TaskBoard.tsx', import.meta.url), 'utf8');
    const sheet = board.slice(board.indexOf('function Sheet'), board.indexOf('function Modal'));
    assert.match(sheet, /<PortalModal/);
    assert.match(sheet, /sheet="bottom"/);
    assert.match(sheet, /blueFocus/);
    assert.equal(sheet.includes('portalNode'), false);
    const needs = board.slice(board.indexOf('function Modal'), board.indexOf('function BoardScroller'));
    assert.match(needs, /<PortalModal/);
    assert.match(needs, /testId="task-needs-dialog"/);
    assert.match(needs, /blueFocus/);
  });

  it('opens a top-aligned dialog under the header without a grabber', () => {
    const html = renderToStaticMarkup(createElement(SearchModal, {
      label: 'Search',
      onClose: () => undefined,
      align: 'start',
      narrow: false,
      width: 640,
    }, createElement('p', null, 'Results')));
    assert.match(html, /align-items:flex-start/);
    assert.match(html, /padding:72px 20px 24px/);
    assert.equal(html.includes('data-testid="modal-grabber"'), false);
    assert.match(html, /min\(780px, calc\(100dvh - 96px\)\)/);
  });
});
