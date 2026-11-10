import assert from 'node:assert/strict';
import React, { createElement } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it } from 'node:test';
import { readStaffJoined, rememberStaffJoined, useStaffJoinedWelcome } from './staffJoined';
import { installTestDom, textOf, type DomDocument } from '../components/auth/testDom';

Object.assign(globalThis, { React });

function installStorage() {
  const store = new Map<string, string>();
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  };
  Object.defineProperty(globalThis, 'sessionStorage', { value: storage, configurable: true });
  return storage;
}

function WelcomeProbe() {
  const joined = useStaffJoinedWelcome();
  return createElement('p', null, joined?.name ?? '');
}

async function mountWelcome(document: DomDocument): Promise<{ text: string; unmount: () => Promise<void> }> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  let root: Root | null = null;
  await act(async () => {
    root = createRoot(container as unknown as Element);
    root.render(createElement(React.StrictMode, null, createElement(WelcomeProbe)));
  });
  return {
    text: textOf(container),
    unmount: async () => {
      await act(async () => {
        root?.unmount();
      });
      container.parentNode?.removeChild(container);
    },
  };
}

describe('staff joined flag', () => {
  it('keeps the welcome through a strict-mode replay, then clears it', async () => {
    const storage = installStorage();
    const document = installTestDom();
    rememberStaffJoined({ name: 'Jordan', passwordSet: true });
    assert.deepEqual(readStaffJoined(), { name: 'Jordan', passwordSet: true });
    assert.equal(storage.getItem('warehaus-staff-joined')?.includes('Jordan'), true);

    const shown = await mountWelcome(document);
    assert.equal(shown.text, 'Jordan');
    assert.equal(storage.getItem('warehaus-staff-joined'), null);
    assert.equal(readStaffJoined(), null);
    await shown.unmount();

    const later = await mountWelcome(document);
    assert.equal(later.text, '');
    await later.unmount();

    rememberStaffJoined({ name: 'Sam', passwordSet: false });
    assert.deepEqual(readStaffJoined(), { name: 'Sam', passwordSet: false });
  });
});
