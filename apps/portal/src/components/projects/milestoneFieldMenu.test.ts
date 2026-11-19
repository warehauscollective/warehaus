import assert from 'node:assert/strict';
import React, { createElement, useRef, useState } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it } from 'node:test';
import { PortalModal } from '@/components/ui/PortalModal';
import { FieldMenu } from './ProjectRoadmap';
import { OwnerMenu } from './milestoneDetailsEdit';

Object.assign(globalThis, { React });

describe('milestone field menu focus', () => {
  it('keeps ds-scope on a transparent portal, focuses the current option, and leaves the modal open', async () => {
    const document = installDom();
    function Harness() {
      const ownerRef = useRef<HTMLButtonElement>(null);
      const [open, setOpen] = useState(true);
      const [alive, setAlive] = useState(true);
      if (!alive) return createElement('p', { 'data-testid': 'modal-closed' }, 'closed');
      // createElement's extra-child overload rejects a component whose props require children.
      // eslint-disable-next-line react/no-children-prop
      return createElement(PortalModal, {
        label: 'New milestone',
        testId: 'milestone-create-dialog',
        onClose: () => setAlive(false),
        footer: createElement('button', { type: 'button', 'data-testid': 'create-milestone' }, 'Create milestone'),
        children: [
          createElement(
            'button',
            {
              key: 'owner',
              ref: ownerRef,
              type: 'button',
              'data-testid': 'milestone-create-owner',
              onClick: () => setOpen(true),
            },
            'Choose a person',
          ),
          createElement('button', { key: 'due', type: 'button', 'data-testid': 'milestone-create-due' }, 'Choose a date'),
          open
            ? // eslint-disable-next-line react/no-children-prop
              createElement(FieldMenu, {
                key: 'menu',
                anchorRef: ownerRef,
                onClose: () => setOpen(false),
                children: createElement(OwnerMenu, {
                  people: [{ id: 'ct-maya', name: 'Maya Chen' }],
                  currentId: null,
                  onPick: () => setOpen(false),
                  onClose: () => setOpen(false),
                  foot: 'Saved when you create the milestone.',
                }),
              })
            : null,
        ],
      });
    }

    const container = document.createElement('div');
    document.body.appendChild(container);
    let root: Root | null = null;
    await act(async () => {
      root = createRoot(container as unknown as Element);
      root.render(createElement(Harness));
    });

    const menu = findByTestId(document.body, 'milestone-field-menu');
    assert.ok(menu, 'menu is portaled');
    assert.match(String(menu.className ?? menu.getAttribute('class')), /ds-scope/);
    assert.equal(menu.style.background, 'transparent');
    assert.equal(textOf(document.activeElement), 'Unassigned');
    assert.ok(findByTestId(document.body, 'milestone-create-dialog'));

    await act(async () => {
      document.activeElement?.dispatchEvent(key('Escape'));
    });
    await flush();
    assert.equal(findByTestId(document.body, 'milestone-field-menu'), null);
    assert.ok(findByTestId(document.body, 'milestone-create-dialog'));
    assert.equal(findByTestId(document.body, 'modal-closed'), null);
    assert.equal(document.activeElement?.getAttribute('data-testid'), 'milestone-create-owner');

    await act(async () => {
      findByTestId(document.body, 'milestone-create-owner')?.dispatchEvent(click());
    });
    assert.ok(findByTestId(document.body, 'milestone-field-menu'));
    await act(async () => {
      document.activeElement?.dispatchEvent(key('Tab'));
    });
    await flush();
    assert.equal(findByTestId(document.body, 'milestone-field-menu'), null);
    assert.ok(findByTestId(document.body, 'milestone-create-dialog'));
    assert.equal(document.activeElement?.getAttribute('data-testid'), 'milestone-create-due');

    await act(async () => {
      root?.unmount();
    });
  });
});

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

type Listener = (event: KeyLike) => void;

type TestNode = {
  nodeType: number;
  nodeName: string;
  tagName?: string;
  childNodes: TestNode[];
  children: TestNode[];
  style: Record<string, string>;
  attributes: Record<string, string>;
  parentNode: TestNode | null;
  parentElement: TestNode | null;
  ownerDocument: TestDoc | null;
  textContent: string;
  className?: string;
  tabIndex: number;
  offsetHeight: number;
  listeners: Record<string, Listener[]>;
  setAttribute: (name: string, value: string) => void;
  getAttribute: (name: string) => string | null;
  removeAttribute: (name: string) => void;
  hasAttribute: (name: string) => boolean;
  appendChild: (child: TestNode) => TestNode;
  removeChild: (child: TestNode) => TestNode;
  insertBefore: (child: TestNode, before: TestNode | null) => TestNode;
  addEventListener: (type: string, fn: Listener) => void;
  removeEventListener: (type: string, fn: Listener) => void;
  dispatchEvent: (event: KeyLike) => boolean;
  contains: (node: TestNode) => boolean;
  focus: (opts?: { preventScroll?: boolean }) => void;
  querySelector: (selector: string) => TestNode | null;
  querySelectorAll: (selector: string) => TestNode[];
  closest: (selector: string) => TestNode | null;
  getBoundingClientRect: () => { top: number; right: number; bottom: number; left: number; width: number; height: number };
};

type TestDoc = TestNode & {
  createElement: (tag: string) => TestNode;
  createElementNS: (ns: string, tag: string) => TestNode;
  createTextNode: (text: string) => TestNode;
  body: TestNode;
  activeElement: TestNode | null;
};

type KeyLike = {
  type: string;
  key: string;
  shiftKey: boolean;
  bubbles: boolean;
  defaultPrevented: boolean;
  target: TestNode | null;
  currentTarget: TestNode | null;
  preventDefault: () => void;
  stopPropagation: () => void;
  stopped?: boolean;
};

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
  document.appendChild(document.body);
  document.activeElement = null;
  const view = {
    document,
    HTMLElement: function HTMLElement() {},
    HTMLIFrameElement: function HTMLIFrameElement() {},
    Element: function Element() {},
    Node: function Node() {},
    innerWidth: 1440,
    innerHeight: 900,
    scrollY: 0,
    scrollTo() {},
    addEventListener() {},
    removeEventListener() {},
    requestAnimationFrame: (callback: () => void) => setTimeout(callback, 0),
    cancelAnimationFrame: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
    getSelection: () => null,
    getComputedStyle: () => ({ visibility: 'visible' }),
  };
  class ResizeObserver {
    observe() {}
    disconnect() {}
  }
  const target = globalThis as Record<string, unknown>;
  target.window = view;
  target.document = document;
  target.HTMLElement = view.HTMLElement;
  target.HTMLIFrameElement = view.HTMLIFrameElement;
  target.Element = view.Element;
  target.Node = view.Node;
  target.ResizeObserver = ResizeObserver;
  target.IS_REACT_ACT_ENVIRONMENT = true;
  return document;
}

function createNode(tag: string): TestNode {
  const node = {
    nodeType: tag === '#text' ? 3 : 1,
    nodeName: tag.toUpperCase(),
    tagName: tag === '#text' ? undefined : tag.toUpperCase(),
    childNodes: [] as TestNode[],
    children: [] as TestNode[],
    style: {},
    attributes: {},
    parentNode: null,
    parentElement: null,
    ownerDocument: null,
    textContent: '',
    className: '',
    dataset: {},
    tabIndex: tag === 'button' || tag === 'input' || tag === 'textarea' || tag === 'select' ? 0 : -1,
    offsetHeight: 48,
    listeners: {},
    setAttribute(name: string, value: string) {
      this.attributes[name] = String(value);
      if (name === 'class') this.className = String(value);
    },
    getAttribute(name: string) {
      if (name === 'class') return this.className || this.attributes.class || null;
      return this.attributes[name] ?? null;
    },
    removeAttribute(name: string) {
      delete this.attributes[name];
    },
    hasAttribute(name: string) {
      return this.getAttribute(name) != null;
    },
    appendChild(child: TestNode) {
      child.parentNode = this;
      child.parentElement = this.nodeType === 1 ? this : child.parentElement;
      this.childNodes.push(child);
      if (child.nodeType === 1) this.children.push(child);
      return child;
    },
    removeChild(child: TestNode) {
      this.childNodes = this.childNodes.filter((item) => item !== child);
      this.children = this.children.filter((item) => item !== child);
      child.parentNode = null;
      return child;
    },
    insertBefore(child: TestNode, before: TestNode | null) {
      child.parentNode = this;
      child.parentElement = this.nodeType === 1 ? this : child.parentElement;
      const index = before ? this.childNodes.indexOf(before) : -1;
      if (index < 0) this.childNodes.push(child);
      else this.childNodes.splice(index, 0, child);
      if (child.nodeType === 1) this.children.push(child);
      return child;
    },
    addEventListener(type: string, fn: Listener) {
      this.listeners[type] = this.listeners[type] ?? [];
      this.listeners[type].push(fn);
    },
    removeEventListener(type: string, fn: Listener) {
      this.listeners[type] = (this.listeners[type] ?? []).filter((item) => item !== fn);
    },
    dispatchEvent(event: KeyLike) {
      event.target = event.target ?? this;
      for (const fn of [...(this.listeners[event.type] ?? [])]) {
        event.currentTarget = this;
        fn(event);
      }
      if (event.bubbles && !event.stopped && this.parentNode) this.parentNode.dispatchEvent(event);
      return true;
    },
    contains(other: TestNode) {
      if (other === this) return true;
      return this.childNodes.some((child) => child.contains(other));
    },
    focus() {
      if (this.ownerDocument) this.ownerDocument.activeElement = this;
    },
    querySelector(selector: string) {
      return walk(this).find((item) => item !== this && matches(item, selector)) ?? null;
    },
    querySelectorAll(selector: string) {
      return walk(this).filter((item) => item !== this && matches(item, selector));
    },
    closest(selector: string) {
      return closestNode(this, selector);
    },
    getBoundingClientRect() {
      return { top: 200, right: 700, bottom: 248, left: 360, width: 340, height: 48 };
    },
  } as TestNode;
  return node;
}

function closestNode(node: TestNode | null, selector: string): TestNode | null {
  let current = node;
  while (current) {
    if (matches(current, selector)) return current;
    current = current.parentElement;
  }
  return null;
}

function walk(node: TestNode): TestNode[] {
  const found: TestNode[] = [node];
  for (const child of node.childNodes) found.push(...walk(child));
  return found;
}

function matches(node: TestNode, selector: string): boolean {
  return selector.split(',').some((part) => matchOne(node, part.trim()));
}

function matchOne(node: TestNode, selector: string): boolean {
  if (!selector || node.nodeType !== 1) return false;
  const tag = selector.match(/^[a-z]+/i)?.[0];
  if (tag && node.nodeName !== tag.toUpperCase()) return false;
  const attrs = [...selector.matchAll(/\[([^\]=]+)(?:=(["'])(.*?)\2)?\]/g)];
  if (!tag && attrs.length === 0) return false;
  return attrs.every((match) => {
    const name = match[1] ?? '';
    const expected = match[3];
    if (name.startsWith('tabindex')) return node.tabIndex >= 0;
    const actual = node.getAttribute(name);
    if (expected == null) return actual != null || (name === 'data-menu-layer' && node.getAttribute('data-menu-layer') != null);
    return actual === expected;
  });
}

function textOf(node: { childNodes?: TestNode[]; textContent?: string } | null): string {
  if (!node) return '';
  const children = node.childNodes ?? [];
  if (children.length > 0) return children.map((child) => textOf(child)).join('');
  return node.textContent ?? '';
}

function findByTestId(node: TestNode, id: string): TestNode | null {
  if (node.getAttribute('data-testid') === id) return node;
  for (const child of node.childNodes) {
    const found = findByTestId(child, id);
    if (found) return found;
  }
  return null;
}

function key(name: string): KeyLike {
  const event: KeyLike = {
    type: 'keydown',
    key: name,
    shiftKey: false,
    bubbles: true,
    defaultPrevented: false,
    target: null,
    currentTarget: null,
    preventDefault() {
      this.defaultPrevented = true;
    },
    stopPropagation() {
      this.stopped = true;
    },
  };
  return event;
}

function click(): KeyLike {
  return { ...key(''), type: 'click' };
}
