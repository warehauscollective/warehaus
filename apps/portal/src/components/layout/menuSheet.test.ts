import assert from 'node:assert/strict';
import React, { createElement, useState } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it } from 'node:test';
import { MenuSheetDialog } from './MobileMenu';

Object.assign(globalThis, { React });

describe('menu sheet', () => {
  it('traps Tab, closes on Escape, and locks page scroll while it is open', async () => {
    const document = installDom();
    let fromPop: boolean | null = null;
    function Harness() {
      const [open, setOpen] = useState(true);
      return createElement(
        'div',
        null,
        createElement('button', { type: 'button' }, 'Projects'),
        open
          ? createElement(MenuSheetDialog, {
              staff: true,
              chips: [
                { key: 'all', label: 'All projects' },
                { key: 'active', label: 'Active only' },
              ],
              tab: 'projects',
              activeSection: 'all',
              unread: 4,
              onDismiss: (pop: boolean) => {
                fromPop = pop;
                setOpen(false);
              },
              onSelect: () => undefined,
              onSearch: () => undefined,
            })
          : createElement('p', null, 'closed'),
      );
    }
    document.body.style.overflow = '';
    const container = document.createElement('div');
    document.body.appendChild(container);
    let root: Root | null = null;
    await act(async () => {
      root = createRoot(container as unknown as Element);
      root.render(createElement(Harness));
    });

    assert.equal(document.body.style.overflow, 'hidden');
    const projects = findButton(container, 'Projects');
    assert.equal(projects?.inert, true);
    assert.equal(projects?.getAttribute('aria-hidden'), 'true');
    assert.equal(idOf(document.activeElement), 'menu-close');

    const notifications = findById(container, 'menu-notifications');
    assert.ok(notifications);
    notifications.focus();
    await act(async () => {
      notifications.dispatchEvent(keyEvent('Tab', false));
    });
    assert.equal(idOf(document.activeElement), 'menu-close');

    const close = findById(container, 'menu-close');
    assert.ok(close);
    close.focus();
    await act(async () => {
      close.dispatchEvent(keyEvent('Tab', true));
    });
    assert.equal(idOf(document.activeElement), 'menu-notifications');

    await act(async () => {
      close.dispatchEvent(keyEvent('Escape', false));
    });
    assert.equal(fromPop, false);
    assert.equal(findById(container, 'menu-sheet'), null);
    assert.match(textOf(container), /closed/);
    assert.equal(document.body.style.overflow, '');
    assert.equal(projects?.inert, false);
    assert.equal(projects?.getAttribute('aria-hidden'), null);
    assert.equal(projects?.style.pointerEvents, '');

    await act(async () => {
      root?.unmount();
    });
  });
});

type TestNode = {
  nodeType: number;
  nodeName: string;
  tagName?: string;
  id?: string;
  childNodes: TestNode[];
  children: TestNode[];
  style: { overflow?: string; pointerEvents?: string };
  attributes: Record<string, string>;
  parentNode: TestNode | null;
  parentElement: TestNode | null;
  ownerDocument: TestDoc | null;
  textContent: string;
  text: string;
  inert?: boolean;
  namespaceURI: string;
  nextSibling: TestNode | null;
  listeners: Record<string, Array<(event: EventLike) => void>>;
  setAttribute: (name: string, value: string) => void;
  getAttribute: (name: string) => string | null;
  removeAttribute: (name: string) => void;
  hasAttribute: (name: string) => boolean;
  appendChild: (child: TestNode) => TestNode;
  removeChild: (child: TestNode) => TestNode;
  insertBefore: (child: TestNode, before: TestNode | null) => TestNode;
  addEventListener: (type: string, fn: (event: EventLike) => void) => void;
  removeEventListener: (type: string, fn: (event: EventLike) => void) => void;
  dispatchEvent: (event: EventLike) => boolean;
  contains: (node: TestNode) => boolean;
  focus: () => void;
  querySelector: (selector: string) => TestNode | null;
  querySelectorAll: (selector: string) => TestNode[];
};

type TestDoc = TestNode & {
  createElement: (tag: string) => TestNode;
  createElementNS: (ns: string, tag: string) => TestNode;
  createTextNode: (text: string) => TestNode;
  body: TestNode;
  activeElement: TestNode | null;
};

type EventLike = {
  type: string;
  key?: string;
  shiftKey?: boolean;
  bubbles: boolean;
  target: TestNode | null;
  currentTarget: TestNode | null;
  preventDefault: () => void;
  stopPropagation: () => void;
};

function createNode(tag: string): TestNode {
  const node: TestNode = {
    nodeType: tag === '#text' ? 3 : 1,
    nodeName: tag.toUpperCase(),
    tagName: tag === '#text' ? undefined : tag.toUpperCase(),
    childNodes: [],
    children: [],
    style: {},
    attributes: {},
    parentNode: null,
    parentElement: null,
    ownerDocument: null,
    textContent: '',
    text: '',
    namespaceURI: 'http://www.w3.org/1999/xhtml',
    nextSibling: null,
    listeners: {},
    setAttribute(name, value) {
      this.attributes[name] = String(value);
      if (name === 'id') this.id = String(value);
    },
    getAttribute(name) {
      if (name === 'id' && this.id) return this.id;
      return this.attributes[name] ?? null;
    },
    removeAttribute(name) {
      delete this.attributes[name];
      if (name === 'id') this.id = undefined;
    },
    hasAttribute(name) {
      return this.getAttribute(name) != null;
    },
    appendChild(child) {
      child.parentNode = this;
      child.parentElement = this.nodeType === 1 ? this : child.parentElement;
      this.childNodes.push(child);
      if (child.nodeType === 1) this.children.push(child);
      return child;
    },
    removeChild(child) {
      this.childNodes = this.childNodes.filter((item) => item !== child);
      this.children = this.children.filter((item) => item !== child);
      child.parentNode = null;
      child.parentElement = null;
      return child;
    },
    insertBefore(child, before) {
      child.parentNode = this;
      child.parentElement = this.nodeType === 1 ? this : child.parentElement;
      const index = before ? this.childNodes.indexOf(before) : -1;
      if (index < 0) this.childNodes.push(child);
      else this.childNodes.splice(index, 0, child);
      if (child.nodeType === 1 && !this.children.includes(child)) this.children.push(child);
      return child;
    },
    addEventListener(type, fn) {
      this.listeners[type] = this.listeners[type] ?? [];
      this.listeners[type].push(fn);
    },
    removeEventListener(type, fn) {
      this.listeners[type] = (this.listeners[type] ?? []).filter((item) => item !== fn);
    },
    dispatchEvent(event) {
      event.target = event.target ?? this;
      const listeners = [...(this.listeners[event.type] ?? [])];
      for (const fn of listeners) {
        event.currentTarget = this;
        fn(event);
      }
      if (event.bubbles && this.parentNode) this.parentNode.dispatchEvent(event);
      return true;
    },
    contains(other) {
      if (other === this) return true;
      return this.childNodes.some((child) => child.contains(other));
    },
    focus() {
      if (this.ownerDocument) this.ownerDocument.activeElement = this;
    },
    querySelector(selector) {
      return findSelector(this, selector);
    },
    querySelectorAll() {
      return [];
    },
  };
  return node;
}

function findSelector(node: TestNode, selector: string): TestNode | null {
  if (selector.startsWith('#')) {
    const id = selector.slice(1);
    if (node.id === id || node.attributes.id === id) return node;
  }
  for (const child of node.childNodes) {
    const found = findSelector(child, selector);
    if (found) return found;
  }
  return null;
}

function installDom(): TestDoc {
  const document = createNode('#document') as TestDoc;
  document.nodeType = 9;
  document.createElement = (tag) => {
    const node = createNode(tag);
    node.ownerDocument = document;
    return node;
  };
  document.createElementNS = (_ns, tag) => document.createElement(tag);
  document.createTextNode = (text) => {
    const node = createNode('#text');
    node.textContent = text;
    node.ownerDocument = document;
    return node;
  };
  document.body = document.createElement('body');
  document.body.nodeName = 'BODY';
  document.activeElement = null;
  const view = {
    document,
    HTMLElement: function HTMLElement() {},
    HTMLIFrameElement: function HTMLIFrameElement() {},
    Element: function Element() {},
    Node: function Node() {},
    scrollY: 0,
    scrollTo() {},
    addEventListener() {},
    removeEventListener() {},
    requestAnimationFrame: (callback: () => void) => setTimeout(callback, 0),
    cancelAnimationFrame: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
    getSelection: () => null,
  };
  (document as TestDoc & { defaultView: typeof view }).defaultView = view;
  const target = globalThis as Record<string, unknown>;
  target.window = view;
  target.document = document;
  target.HTMLElement = view.HTMLElement;
  target.HTMLIFrameElement = view.HTMLIFrameElement;
  target.Element = view.Element;
  target.Node = view.Node;
  target.IS_REACT_ACT_ENVIRONMENT = true;
  return document;
}

function textOf(node: { childNodes?: TestNode[]; textContent?: string; text?: string }): string {
  const children = node.childNodes ?? [];
  if (children.length > 0) return children.map((child) => textOf(child)).join('');
  return node.textContent || node.text || '';
}

function findButton(node: TestNode, label: string): TestNode | null {
  if (node.nodeName === 'BUTTON' && textOf(node) === label) return node;
  for (const child of node.childNodes) {
    const found = findButton(child, label);
    if (found) return found;
  }
  return null;
}

function findById(node: TestNode, id: string): TestNode | null {
  return node.querySelector(`#${id}`);
}

function idOf(node: TestNode | null): string | null {
  return node?.id ?? node?.getAttribute('id') ?? null;
}

function keyEvent(key: string, shiftKey: boolean): EventLike {
  return {
    type: 'keydown',
    key,
    shiftKey,
    bubbles: true,
    target: null,
    currentTarget: null,
    preventDefault() {},
    stopPropagation() {},
  };
}
