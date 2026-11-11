import assert from 'node:assert/strict';
import React, { createElement } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it } from 'node:test';
import {
  hashStaffFinishToken,
  readStaffFinish,
  readStaffJoined,
  rememberStaffFinish,
  rememberStaffJoined,
  useStaffJoinedWelcome,
  useStaffJustJoined,
} from './staffJoined';
import { renderToStaticMarkup } from 'react-dom/server';
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

  it('stores a hash of the invite token and drops a row that saved the raw token', async () => {
    const storage = installStorage();
    storage.setItem(
      'warehaus-staff-finish',
      JSON.stringify({ name: 'Jordan', passwordSet: true, startedAt: 1, token: 'raw-token' }),
    );
    assert.equal(readStaffFinish(), null);
    assert.equal(storage.getItem('warehaus-staff-finish'), null);

    const tokenHash = await hashStaffFinishToken('raw-token');
    rememberStaffFinish({ name: 'Jordan', passwordSet: true, startedAt: 1, tokenHash });
    const saved = storage.getItem('warehaus-staff-finish') ?? '';
    assert.equal(saved.includes('raw-token'), false);
    assert.equal(readStaffFinish()?.tokenHash, tokenHash);
  });
});

function JustJoinedProbe() {
  const joined = useStaffJustJoined();
  return createElement('p', { 'data-joined': joined ? 'true' : 'false' }, joined ? 'yes' : 'no');
}

describe('staff just joined gate', () => {
  it('matches the server render, then reads the flag before paint', async () => {
    installStorage();
    rememberStaffJoined({ name: 'Jordan Blake', passwordSet: true, inviterName: 'Peter Roquemore' });
    const html = renderToStaticMarkup(createElement(JustJoinedProbe));
    assert.match(html, /data-joined="false"/);
    assert.match(html, />no</);

    const document = installTestDom();
    const container = document.createElement('div');
    document.body.appendChild(container);
    let root: Root | null = null;
    await act(async () => {
      root = createRoot(container as unknown as Element);
      root.render(createElement(JustJoinedProbe));
    });
    assert.equal(textOf(container), 'yes');
    await act(async () => {
      root?.unmount();
    });
  });

  it('stays false when the tab has no joined flag', async () => {
    installStorage();
    const document = installTestDom();
    const container = document.createElement('div');
    document.body.appendChild(container);
    let root: Root | null = null;
    await act(async () => {
      root = createRoot(container as unknown as Element);
      root.render(createElement(JustJoinedProbe));
    });
    assert.equal(textOf(container), 'no');
    await act(async () => {
      root?.unmount();
    });
  });
});
