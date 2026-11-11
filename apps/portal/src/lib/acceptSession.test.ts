import assert from 'node:assert/strict';
import React, { createElement } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it } from 'node:test';
import { SignedInAcceptCopy } from '@/components/auth/AcceptInvite';
import { installTestDom, textOf, type DomDocument } from '@/components/auth/testDom';
import {
  SESSION_NOT_ATTACHED_MESSAGE,
  acceptFailureCopy,
  acceptOnceAuthenticated,
  knownSessionEmail,
} from './acceptSession';

Object.assign(globalThis, { React });

async function renderAt(document: DomDocument, node: ReturnType<typeof createElement>) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  let root: Root | null = null;
  await act(async () => {
    root = createRoot(container as unknown as Element);
    root.render(node);
  });
  return {
    text: () => textOf(container),
    unmount: async () => {
      await act(async () => {
        root?.unmount();
      });
    },
  };
}

describe('accept waits for the Convex session', () => {
  it('does not call accept until a late token arrives', async () => {
    let reads = 0;
    let acceptedAt = 0;
    const outcome = await acceptOnceAuthenticated({
      readAuthenticated: () => {
        reads += 1;
        return reads >= 4;
      },
      refresh: async () => {
        throw new Error('refresh should wait for the first polls to miss');
      },
      accept: async () => {
        acceptedAt = reads;
        return 'accepted';
      },
      sleep: async () => {},
      polls: 6,
    });
    assert.deepEqual(outcome, { ok: true, result: 'accepted' });
    assert.equal(acceptedAt >= 4, true);
    assert.equal(reads >= acceptedAt, true);
  });

  it('refreshes the token once, then accepts, and never says Unauthenticated', async () => {
    let refreshes = 0;
    let accepts = 0;
    const missed = await acceptOnceAuthenticated({
      readAuthenticated: () => false,
      refresh: async () => {
        refreshes += 1;
      },
      accept: async () => {
        accepts += 1;
        return 'accepted';
      },
      sleep: async () => {},
      polls: 3,
    });
    assert.equal(missed.ok, false);
    if (!missed.ok) {
      assert.equal(missed.refreshed, true);
      assert.equal(missed.message, SESSION_NOT_ATTACHED_MESSAGE);
      assert.equal(/unauthenticated/i.test(missed.message), false);
    }
    assert.equal(refreshes, 1);
    assert.equal(accepts, 0);
    assert.equal(/unauthenticated/i.test(acceptFailureCopy('[CONVEX M(invites:accept)] Unauthenticated')), false);
    assert.equal(acceptFailureCopy('[CONVEX M(invites:accept)] Unauthenticated'), SESSION_NOT_ATTACHED_MESSAGE);

    let ready = false;
    const retried = await acceptOnceAuthenticated({
      readAuthenticated: () => ready,
      refresh: async () => {
        ready = true;
      },
      accept: async () => {
        accepts += 1;
        return 'accepted';
      },
      sleep: async () => {},
      polls: 2,
    });
    assert.deepEqual(retried, { ok: true, result: 'accepted' });
    assert.equal(accepts, 1);
    assert.equal(ready, true);
  });

  it('does not render a signed-in line with an empty email', async () => {
    assert.equal(knownSessionEmail(''), null);
    assert.equal(knownSessionEmail('   '), null);
    assert.equal(knownSessionEmail('ada@example.com'), 'ada@example.com');
    const document = installTestDom();
    const empty = await renderAt(document, createElement(SignedInAcceptCopy, { email: '' }));
    assert.match(empty.text(), /Checking your sign-in/);
    assert.equal(empty.text().includes('You’re signed in as'), false);
    assert.equal(empty.text().includes('You’re signed in as .'), false);
    await empty.unmount();
    const named = await renderAt(document, createElement(SignedInAcceptCopy, { email: 'ada@example.com' }));
    assert.match(named.text(), /You’re signed in as ada@example.com\./);
    await named.unmount();
  });
});
