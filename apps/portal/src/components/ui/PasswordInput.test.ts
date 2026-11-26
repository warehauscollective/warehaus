import assert from 'node:assert/strict';
import React, { createElement } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it } from 'node:test';
import { PasswordInput } from './PasswordInput';
import { installTestDom, type DomNode, type EventLike } from '../auth/testDom';

Object.assign(globalThis, { React });

function find(node: DomNode, tag: string): DomNode {
  if (node.tagName === tag.toUpperCase()) return node;
  for (const child of node.childNodes) {
    try {
      return find(child, tag);
    } catch {
      // keep looking
    }
  }
  throw new Error(`no ${tag}`);
}

const typeOf = (node: DomNode) => node.getAttribute('type') ?? node.type;

function click(node: DomNode) {
  const event: EventLike = {
    type: 'click',
    bubbles: true,
    cancelable: true,
    defaultPrevented: false,
    target: node,
    currentTarget: null,
    timeStamp: Date.now(),
    preventDefault() {
      this.defaultPrevented = true;
    },
    stopPropagation() {
      this.cancelBubble = true;
    },
  };
  node.dispatchEvent(event);
}

async function render() {
  const document = installTestDom();
  const container = document.createElement('div');
  document.body.appendChild(container);
  let root: Root | null = null;
  await act(async () => {
    root = createRoot(container as unknown as Element);
    root.render(createElement(PasswordInput, { autoComplete: 'current-password', value: 'secret', onChange: () => {} }));
  });
  return {
    container,
    unmount: async () => {
      await act(async () => root?.unmount());
    },
  };
}

describe('PasswordInput', () => {
  it('starts hidden and toggles between password and text', async () => {
    const view = await render();
    const input = find(view.container, 'input');
    const button = find(view.container, 'button');

    assert.equal(typeOf(input), 'password');
    assert.equal(input.getAttribute('autocomplete') ?? input.getAttribute('autoComplete'), 'current-password');
    assert.equal(typeOf(button), 'button');
    assert.equal(button.getAttribute('aria-label'), 'Show password');
    assert.equal(button.getAttribute('aria-pressed'), 'false');

    await act(async () => click(button));
    assert.equal(typeOf(input), 'text');
    assert.equal(button.getAttribute('aria-label'), 'Hide password');
    assert.equal(button.getAttribute('aria-pressed'), 'true');

    await act(async () => click(button));
    assert.equal(typeOf(input), 'password');
    assert.equal(button.getAttribute('aria-label'), 'Show password');

    await view.unmount();
  });
});
