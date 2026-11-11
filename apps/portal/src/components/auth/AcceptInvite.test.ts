import assert from 'node:assert/strict';
import React, { createElement } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it } from 'node:test';
import { AcceptInvite, inviteReference, type AcceptInviteIO } from './AcceptInvite';
import { readStaffJoined } from '@/lib/staffJoined';
import { STAFF_ACCESS_CONFLICT_MESSAGE } from './authGateAction';
import { installTestDom, textOf, type DomNode, type EventLike } from './testDom';

Object.assign(globalThis, { React });

function installStorage() {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    },
  });
}

function walk(node: DomNode, visit: (node: DomNode) => void) {
  visit(node);
  for (const child of node.childNodes) walk(child, visit);
}

function nodes(root: DomNode, tag: string): DomNode[] {
  const found: DomNode[] = [];
  walk(root, (node) => {
    if (node.tagName === tag.toUpperCase()) found.push(node);
  });
  return found;
}

function fire(node: DomNode, type: string) {
  const event: EventLike = {
    type,
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

function typeInto(node: DomNode, value: string) {
  fire(node, 'focusin');
  node.value = value;
  fire(node, 'input');
  fire(node, 'change');
  fire(node, 'keyup');
}

async function render(node: ReturnType<typeof createElement>) {
  const document = installTestDom();
  const container = document.createElement('div');
  document.body.appendChild(container);
  let root: Root | null = null;
  await act(async () => {
    root = createRoot(container as unknown as Element);
    root.render(node);
  });
  return {
    container,
    text: () => textOf(container),
    unmount: async () => {
      await act(async () => {
        root?.unmount();
      });
    },
  };
}

function io(overrides: Partial<AcceptInviteIO> = {}): AcceptInviteIO & { calls: string[] } {
  const calls: string[] = [];
  const base: AcceptInviteIO = {
    token: 'raw-token',
    previewKey: null,
    forced: undefined,
    preview: {
      status: 'create-account',
      invitedEmail: 'jordan@warehaus.studio',
      inviterName: 'Peter Roquemore',
    },
    previewLoading: false,
    configured: true,
    sessionEmail: null,
    readAuthenticated: () => true,
    refreshSession: async () => {
      calls.push('refresh');
    },
    accept: async () => {
      calls.push('accept');
      return { ok: true };
    },
    requestRenew: async () => {
      calls.push('renew');
    },
    signUpEmail: async () => {
      calls.push('sign-up');
      return { error: null };
    },
    signInEmail: async () => {
      calls.push('sign-in');
      return { error: null };
    },
    sendVerification: async () => {
      calls.push('verify');
    },
    replace: () => {
      calls.push('replace');
    },
    refresh: () => {
      calls.push('refresh-page');
    },
    link: { state: 'unlinked' },
    conflicted: false,
  };
  return { calls, ...base, ...overrides, accept: overrides.accept ?? base.accept, signUpEmail: overrides.signUpEmail ?? base.signUpEmail, signInEmail: overrides.signInEmail ?? base.signInEmail };
}

describe('inviteReference', () => {
  it('stays stable for an empty token and a real token', () => {
    assert.equal(inviteReference(''), 'INV-7F3C-0921');
    assert.equal(inviteReference('story-token'), inviteReference('story-token'));
    assert.match(inviteReference('story-token'), /^INV-[0-9A-F]{8}$/);
    assert.notEqual(inviteReference('story-token'), inviteReference('other-token'));
  });
});

describe('AcceptInvite sign-up, sign-in, and confirm', () => {
  it('shows a wrong password under the field', async () => {
    installStorage();
    const preview = {
      status: 'sign-in' as const,
      invitedEmail: 'jordan@warehaus.studio',
      inviteeName: 'Jordan Blake',
      inviterName: 'Peter Roquemore',
    };
    const view = await render(createElement(AcceptInvite, {
      io: io({ previewKey: 'wrong-password', forced: preview, preview }),
    }));
    assert.match(view.text(), /That password doesn't match this email/);
    const input = nodes(view.container, 'input')[0];
    assert.equal(input?.getAttribute('aria-invalid'), 'true');
    await view.unmount();
  });

  it('stores the profile name when a fixture create-account finishes', async () => {
    installStorage();
    const preview = {
      status: 'create-account' as const,
      invitedEmail: 'jordan@warehaus.studio',
      inviteeName: 'Jordan Blake',
      inviterName: 'Peter Roquemore',
    };
    const harness = io({ previewKey: 'new', forced: preview, preview });
    const view = await render(createElement(AcceptInvite, { io: harness }));
    const inputs = nodes(view.container, 'input');
    await act(async () => {
      typeInto(inputs[0]!, 'password1');
      typeInto(inputs[1]!, 'password1');
    });
    const form = nodes(view.container, 'form')[0];
    assert.ok(form);
    await act(async () => {
      fire(form, 'submit');
    });
    assert.deepEqual(readStaffJoined(), {
      name: 'Jordan Blake',
      passwordSet: true,
      inviterName: 'Peter Roquemore',
    });
    await view.unmount();
  });

  it('signs up, signs in, then waits and accepts', async () => {
    installStorage();
    const harness = io();
    const view = await render(createElement(AcceptInvite, { io: harness }));
    assert.match(view.text(), /Join Warehaus as staff/);
    const inputs = nodes(view.container, 'input');
    assert.equal(inputs.length >= 2, true);
    await act(async () => {
      typeInto(inputs[0]!, 'password1');
      typeInto(inputs[1]!, 'password1');
    });
    const form = nodes(view.container, 'form')[0];
    assert.ok(form);
    await act(async () => {
      fire(form, 'submit');
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    assert.deepEqual(harness.calls, ['sign-up', 'sign-in', 'accept']);
    assert.match(view.text(), /Finishing setup/);
    assert.equal(view.text().includes('Access denied'), false);
    await view.unmount();
  });

  it('signs in an existing account and then accepts', async () => {
    installStorage();
    const harness = io({
      preview: {
        status: 'sign-in',
        invitedEmail: 'jordan@warehaus.studio',
        inviterName: 'Peter Roquemore',
      },
    });
    const view = await render(createElement(AcceptInvite, { io: harness }));
    assert.match(view.text(), /Sign in to accept/);
    const input = nodes(view.container, 'input')[0];
    assert.ok(input);
    await act(async () => {
      typeInto(input, 'password1');
    });
    const form = nodes(view.container, 'form')[0];
    assert.ok(form);
    await act(async () => {
      fire(form, 'submit');
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    assert.deepEqual(harness.calls, ['sign-in', 'accept']);
    assert.equal(harness.calls.includes('sign-up'), false);
    assert.match(view.text(), /Finishing setup/);
    await view.unmount();
  });

  it('confirms a signed-in invite without another password', async () => {
    installStorage();
    const harness = io({
      preview: {
        status: 'ready',
        invitedEmail: 'jordan@warehaus.studio',
        inviterName: 'Peter Roquemore',
      },
      sessionEmail: 'jordan@warehaus.studio',
    });
    const view = await render(createElement(AcceptInvite, { io: harness }));
    assert.match(view.text(), /You’re signed in as jordan@warehaus.studio/);
    const button = nodes(view.container, 'button').find((node) => textOf(node).includes('Accept invite'));
    assert.ok(button);
    await act(async () => {
      fire(button, 'click');
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    assert.deepEqual(harness.calls, ['accept']);
    assert.match(view.text(), /Finishing setup/);
    await view.unmount();
  });

  it('stays on finishing with retry when begin fails after accept', async () => {
    installStorage();
    const harness = io({
      begin: async () => {
        throw new Error('could not save the wait');
      },
    });
    const view = await render(createElement(AcceptInvite, { io: harness }));
    const inputs = nodes(view.container, 'input');
    await act(async () => {
      typeInto(inputs[0]!, 'password1');
      typeInto(inputs[1]!, 'password1');
    });
    const form = nodes(view.container, 'form')[0];
    assert.ok(form);
    await act(async () => {
      fire(form, 'submit');
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    assert.deepEqual(harness.calls, ['sign-up', 'sign-in', 'accept']);
    assert.match(view.text(), /Finishing setup/);
    assert.match(view.text(), /Try again/);
    assert.equal(view.text().includes('Access denied'), false);
    await view.unmount();
  });

  it('shows the conflict copy instead of access denied', async () => {
    installStorage();
    const harness = io({ conflicted: true });
    const view = await render(createElement(AcceptInvite, { io: harness }));
    assert.equal(view.text().includes(STAFF_ACCESS_CONFLICT_MESSAGE), true);
    assert.equal(view.text().includes('Access denied'), false);
    assert.deepEqual(harness.calls, []);
    await view.unmount();
  });
});
