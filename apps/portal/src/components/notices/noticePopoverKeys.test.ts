import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import React, { act, createElement, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { installTestDom, type DomNode } from '../auth/testDom';
import { handleNoticePopoverKey, useNoticePopoverKeys } from './noticePopoverKeys';

Object.assign(globalThis, { React });

describe('notice popover keys', () => {
  it('uses the info focus ring on the popover buttons', () => {
    const source = readFileSync(new URL('./NoticeBell.tsx', import.meta.url), 'utf8');
    assert.match(source, /data-focus-ring="info"/);
    assert.match(source, /className="milestone-field"/);
    assert.match(source, /milestone-field w-full text-left/);
  });

  it('stops Escape at the popover and keeps Tab inside', () => {
    const first = control('first');
    const last = control('last');
    const panel = {
      querySelector: () => first,
      querySelectorAll: () => [first, last],
    } as unknown as ParentNode;
    let closed = 0;
    let reachedParent = false;
    const escape = key('Escape');
    handleNoticePopoverKey(escape, panel, first, () => {
      closed += 1;
    });
    if (!escape.cancelBubble) reachedParent = true;
    assert.equal(escape.defaultPrevented, true);
    assert.equal(escape.cancelBubble, true);
    assert.equal(closed, 1);
    assert.equal(reachedParent, false);

    last.focus();
    const tab = key('Tab');
    handleNoticePopoverKey(tab, panel, last, () => {
      closed += 1;
    });
    assert.equal(tab.cancelBubble, true);
    assert.equal(tab.defaultPrevented, true);
    assert.equal(focused, first);
    assert.equal(closed, 1);

    first.focus();
    const shift = key('Tab', true);
    handleNoticePopoverKey(shift, panel, first, () => undefined);
    assert.equal(focused, last);
    assert.equal(shift.cancelBubble, true);

    const middle = key('Tab');
    handleNoticePopoverKey(middle, panel, control('middle'), () => undefined);
    assert.equal(middle.cancelBubble, false);
    assert.equal(focused, last);
  });

  it('returns focus to the bell when the popover closes', async () => {
    const document = installPopoverDom();
    let root: Root | null = null;
    const container = document.createElement('div');
    document.body.appendChild(container);
    await act(async () => {
      root = createRoot(container as unknown as Element);
      root.render(createElement(Harness, { open: false }));
    });
    const bell = findId(container, 'notice-bell');
    assert.ok(bell);
    bell.focus();
    assert.equal(document.activeElement, bell);

    await act(async () => {
      root?.render(createElement(Harness, { open: true }));
    });
    const mark = findId(document.body, 'notice-mark');
    const row = findId(document.body, 'notice-row');
    assert.ok(mark);
    assert.ok(row);
    assert.equal(document.activeElement, mark);

    row.focus();
    const tab = key('Tab');
    document.dispatchEvent(tab);
    assert.equal(document.activeElement, mark);
    assert.equal(tab.cancelBubble, true);
    assert.equal(tab.defaultPrevented, true);

    mark.focus();
    const shift = key('Tab', true);
    document.dispatchEvent(shift);
    assert.equal(document.activeElement, row);
    assert.equal(shift.cancelBubble, true);

    const escape = key('Escape');
    await act(async () => {
      document.dispatchEvent(escape);
    });
    assert.equal(escape.cancelBubble, true);
    assert.equal(escape.defaultPrevented, true);
    assert.equal(findId(document.body, 'notice-popover'), null);
    assert.equal(document.activeElement, bell);
    assert.equal(bell.preventScroll, true);
    await act(async () => {
      root?.unmount();
    });
  });
});

function Harness({ open }: { open: boolean }) {
  const panelRef = useRef<HTMLElement | null>(null);
  const [closed, setClosed] = useState(false);
  const shown = open && !closed;
  useNoticePopoverKeys(shown, panelRef, () => setClosed(true));
  return createElement(
    'div',
    null,
    createElement('button', { type: 'button', id: 'notice-bell' }, 'Notices'),
    shown
      ? createElement(
          'div',
          { ref: panelRef, id: 'notice-popover', role: 'dialog', 'aria-label': 'Notices' },
          createElement('button', { type: 'button', id: 'notice-mark' }, 'Mark all read'),
          createElement('button', { type: 'button', id: 'notice-row' }, 'Conflict'),
        )
      : null,
  );
}

type Control = {
  id: string;
  hasAttribute: (name: string) => boolean;
  focus: (options?: { preventScroll?: boolean }) => void;
};

let focused: Control | null = null;

function control(id: string): Control {
  const item: Control = {
    id,
    hasAttribute: () => false,
    focus() {
      focused = item;
    },
  };
  return item;
}

function key(name: string, shiftKey = false) {
  return {
    type: 'keydown' as const,
    key: name,
    shiftKey,
    bubbles: true,
    cancelBubble: false,
    defaultPrevented: false,
    target: null,
    currentTarget: null,
    preventDefault() {
      this.defaultPrevented = true;
    },
    stopPropagation() {
      this.cancelBubble = true;
    },
  };
}

type PopNode = DomNode & {
  id?: string;
  focus: (options?: { preventScroll?: boolean }) => void;
  preventScroll?: boolean;
  querySelector: (selector: string) => PopNode | null;
  querySelectorAll: (selector: string) => PopNode[];
  contains: (other: PopNode) => boolean;
  hasAttribute: (name: string) => boolean;
};

function installPopoverDom() {
  const document = installTestDom() as ReturnType<typeof installTestDom> & {
    activeElement: PopNode | null;
  };
  class HTMLElement {
    focus(options?: { preventScroll?: boolean }) {
      (this as unknown as PopNode).preventScroll = options?.preventScroll;
      document.activeElement = this as unknown as PopNode;
    }
  }
  const view = globalThis as Record<string, unknown>;
  view.HTMLElement = HTMLElement;
  view.Element = HTMLElement;
  view.Node = HTMLElement;
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const windowRecord = view.window as { requestAnimationFrame: (callback: () => void) => number };
  windowRecord.requestAnimationFrame = (callback) => {
    callback();
    return 1;
  };
  const decorate = (raw: DomNode): PopNode => {
    const node = raw as PopNode;
    Object.setPrototypeOf(node, HTMLElement.prototype);
    node.focus = HTMLElement.prototype.focus;
    const setAttribute = node.setAttribute.bind(node);
    node.setAttribute = (name: string, value: string) => {
      setAttribute(name, value);
      if (name === 'id') node.id = value;
    };
    node.hasAttribute = (name: string) => node.getAttribute(name) != null;
    node.querySelector = (selector: string) => findMatch(node, selector);
    node.querySelectorAll = (selector: string) => collect(node, selector);
    node.contains = (other: PopNode) => other === node || collect(node, '*').includes(other);
    return node;
  };
  const create = document.createElement.bind(document);
  document.createElement = (tag: string) => decorate(create(tag));
  document.createElementNS = (_ns: string, tag: string) => document.createElement(tag);
  document.activeElement = null;
  return document;
}

function findMatch(node: PopNode, selector: string): PopNode | null {
  return collect(node, selector)[0] ?? null;
}

function collect(node: PopNode, selector: string): PopNode[] {
  const found: PopNode[] = [];
  for (const child of node.childNodes as PopNode[]) {
    if (selector === '*' || (selector.includes('button') && child.nodeName === 'BUTTON')) found.push(child);
    found.push(...collect(child, selector));
  }
  return found;
}

function findId(node: { childNodes?: DomNode[]; getAttribute?: (name: string) => string | null; id?: string }, id: string): PopNode | null {
  if (node.id === id || node.getAttribute?.('id') === id) return node as PopNode;
  for (const child of node.childNodes ?? []) {
    const found = findId(child, id);
    if (found) return found;
  }
  return null;
}
