import assert from 'node:assert/strict';
import React, { createElement, useEffect } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ConvexProvider, useQuery_experimental, type ConvexReactClient } from 'convex/react';
import { describe, it } from 'node:test';
import { api } from '@convex/_generated/api';

Object.assign(globalThis, { React });
const { PortalDataRetryProvider, useRetryPortalData } = await import('@/components/providers/PortalDataRetry');

type Node = {
  nodeType: number;
  nodeName: string;
  tagName?: string;
  childNodes: Node[];
  children: Node[];
  style: Record<string, string>;
  attributes: Record<string, string>;
  parentNode: Node | null;
  ownerDocument: DocumentNode | null;
  textContent: string;
  namespaceURI: string;
  nextSibling: Node | null;
  setAttribute: (name: string, value: string) => void;
  getAttribute: (name: string) => string | null;
  removeAttribute: (name: string) => void;
  appendChild: (child: Node) => Node;
  removeChild: (child: Node) => Node;
  insertBefore: (child: Node, before: Node | null) => Node;
  addEventListener: () => void;
  removeEventListener: () => void;
};

type DocumentNode = Node & {
  createElement: (tag: string) => Node;
  createElementNS: (ns: string, tag: string) => Node;
  createTextNode: (text: string) => Node;
  documentElement: Node;
  body: Node;
  head: Node;
  defaultView: unknown;
  activeElement: null;
};

function installTestDom(): DocumentNode {
  const existing = (globalThis as unknown as { document?: DocumentNode }).document;
  if (existing?.createElement) return existing;

  function linkSiblings(parent: Node) {
    parent.childNodes.forEach((child, index) => {
      child.nextSibling = parent.childNodes[index + 1] ?? null;
    });
  }

  function createNode(tag: string): Node {
    const node: Node = {
      nodeType: tag === '#text' ? 3 : 1,
      nodeName: tag.toUpperCase(),
      tagName: tag === '#text' ? undefined : tag.toUpperCase(),
      childNodes: [],
      children: [],
      style: {},
      attributes: {},
      parentNode: null,
      ownerDocument: null,
      textContent: '',
      namespaceURI: 'http://www.w3.org/1999/xhtml',
      nextSibling: null,
      setAttribute(name, value) {
        this.attributes[name] = String(value);
      },
      getAttribute(name) {
        return this.attributes[name] ?? null;
      },
      removeAttribute(name) {
        delete this.attributes[name];
      },
      appendChild(child) {
        child.parentNode = this;
        this.childNodes.push(child);
        if (child.nodeType === 1) this.children.push(child);
        linkSiblings(this);
        return child;
      },
      removeChild(child) {
        this.childNodes = this.childNodes.filter((item) => item !== child);
        this.children = this.children.filter((item) => item !== child);
        child.parentNode = null;
        linkSiblings(this);
        return child;
      },
      insertBefore(child, before) {
        child.parentNode = this;
        const index = before ? this.childNodes.indexOf(before) : -1;
        if (index < 0) this.childNodes.push(child);
        else this.childNodes.splice(index, 0, child);
        if (child.nodeType === 1) this.children.push(child);
        linkSiblings(this);
        return child;
      },
      addEventListener() {},
      removeEventListener() {},
    };
    return node;
  }

  const document = createNode('#document') as DocumentNode;
  document.nodeType = 9;
  document.createElement = (tag) => {
    const node = createNode(tag);
    node.ownerDocument = document;
    return node;
  };
  document.createElementNS = (_ns, tag) => document.createElement(tag);
  document.createTextNode = (text) => {
    const node = createNode('#text');
    node.nodeType = 3;
    node.textContent = text;
    node.ownerDocument = document;
    return node;
  };
  document.documentElement = document.createElement('html');
  document.body = document.createElement('body');
  document.head = document.createElement('head');
  document.activeElement = null;
  document.documentElement.appendChild(document.body);

  const view = {
    document,
    HTMLElement: function HTMLElement() {},
    HTMLIFrameElement: function HTMLIFrameElement() {},
    Element: function Element() {},
    Node: function Node() {},
    getSelection: () => null,
    addEventListener() {},
    removeEventListener() {},
    requestAnimationFrame: (callback: () => void) => setTimeout(callback, 0),
    cancelAnimationFrame: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
  };
  document.defaultView = view;
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

function SnapshotConsumer() {
  useQuery_experimental({
    query: api.portalData.getSnapshot,
    args: { hostSlug: 'acme' },
    throwOnError: false,
  });
  return null;
}

function RetryHandle({ onReady }: { onReady: (retry: () => void) => void }) {
  const retry = useRetryPortalData();
  useEffect(() => {
    onReady(retry);
  }, [onReady, retry]);
  return null;
}

describe('snapshot retry', () => {
  it('unsubscribes every getSnapshot caller and subscribes again on Try again', async () => {
    const events: string[] = [];
    const client = {
      watchQuery() {
        return {
          onUpdate() {
            events.push('subscribe');
            return () => {
              events.push('unsubscribe');
            };
          },
          localQueryResult() {
            return undefined;
          },
          localQueryLogs() {
            return [];
          },
          journal() {
            return undefined;
          },
        };
      },
    };
    const document = installTestDom();
    const container = document.createElement('div');
    document.body.appendChild(container);
    let retry: (() => void) | null = null;
    let root: Root | null = null;
    await act(async () => {
      root = createRoot(container as unknown as Element);
      root.render(
        createElement(
          ConvexProvider,
          { client: client as unknown as ConvexReactClient },
          createElement(
            PortalDataRetryProvider,
            null,
            createElement(SnapshotConsumer),
            createElement(SnapshotConsumer),
            createElement(RetryHandle, { onReady: (next) => { retry = next; } }),
          ),
        ),
      );
    });

    assert.deepEqual(events, ['subscribe', 'subscribe']);
    assert.equal(typeof retry, 'function');
    await act(async () => {
      retry?.();
    });
    assert.deepEqual(events, [
      'subscribe',
      'subscribe',
      'unsubscribe',
      'unsubscribe',
      'subscribe',
      'subscribe',
    ]);
    await act(async () => {
      root?.unmount();
    });
  });
});
