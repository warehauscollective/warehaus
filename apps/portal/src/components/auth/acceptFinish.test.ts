import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React, { createElement, useEffect, useRef, type ReactNode } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it } from 'node:test';
import { AuthGateScreen } from './AuthGateScreen';
import { StaffLinkFinish } from './StaffLinkFinish';
import { authGateAction, type AuthGateInput } from './authGateAction';
import { DashboardHome } from '@/components/pages/DashboardHome';
import { installTestDom, textOf, type DomDocument, type DomNode, type EventLike } from './testDom';
import { useStaffLinkWait } from '@/lib/staffLinkWait';
import { readStaffJoined } from '@/lib/staffJoined';
import { STAFF_ACCESS_CONFLICT_MESSAGE } from './authGateAction';
import { staffLinkPhase } from '@/lib/staffLinkWait';

Object.assign(globalThis, { React });

function installStorage() {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'sessionStorage', {
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    },
    configurable: true,
  });
}

function gateElement(
  snapshot: AuthGateInput,
  replaced: string[],
  signedOut: string[],
  linked: string[],
  options?: { timeoutMs?: number; retrySignal?: number },
) {
  return createElement(
    AuthGateScreen,
    {
      snapshot,
      replace: (href: string) => {
        replaced.push(href);
      },
      signOut: async () => {
        signedOut.push('out');
      },
      onLink: () => {
        linked.push('link');
      },
      timeoutMs: options?.timeoutMs,
      retrySignal: options?.retrySignal,
    },
    createElement('p', null, 'dashboard'),
  );
}

function FinishProbe({
  step,
  link,
  retryTick,
  redirects,
}: {
  step: 'form' | 'accepted';
  link: { state: string; isStaff?: boolean } | null;
  retryTick: number;
  redirects: string[];
}) {
  const wait = useStaffLinkWait({
    token: 'tok-1',
    link,
    replace: (path) => {
      redirects.push(path);
    },
    timeoutMs: 30,
  });
  const began = useRef(false);
  const retries = useRef(0);
  useEffect(() => {
    if (step === 'accepted' && !began.current) {
      began.current = true;
      void wait.begin({ name: 'Jordan', passwordSet: true });
    }
  }, [step, wait]);
  useEffect(() => {
    if (retryTick > retries.current) {
      retries.current = retryTick;
      wait.retry();
    }
  }, [retryTick, wait]);
  if (!wait.waiting) return createElement('p', null, 'form');
  return createElement(StaffLinkFinish, { slow: wait.slow, onRetry: wait.retry });
}

function walk(node: DomNode, visit: (node: DomNode) => void) {
  visit(node);
  for (const child of node.childNodes) walk(child, visit);
}

function clickButton(root: DomNode, label: string) {
  const found: DomNode[] = [];
  walk(root, (node) => {
    if (node.tagName === 'BUTTON' && textOf(node).includes(label)) found.push(node);
  });
  const button = found[0];
  assert.ok(button);
  const event: EventLike = {
    type: 'click',
    bubbles: true,
    cancelable: true,
    defaultPrevented: false,
    target: button,
    currentTarget: null,
    timeStamp: Date.now(),
    preventDefault() {
      this.defaultPrevented = true;
    },
    stopPropagation() {
      this.cancelBubble = true;
    },
  };
  button.dispatchEvent(event);
}

async function renderAt(document: DomDocument, node: ReactNode): Promise<{ root: Root; container: DomDocument['body']; text: () => string }> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  let root: Root | null = null;
  await act(async () => {
    root = createRoot(container as unknown as Element);
    root.render(node);
  });
  return {
    root: root as unknown as Root,
    container,
    text: () => textOf(container),
  };
}

const gateBase: AuthGateInput = {
  configured: true,
  sessionPending: false,
  hasUser: true,
  joinError: "This email can't register here. Contact your Warehaus team.",
  linkStatus: 'unlinked',
  joining: false,
  linking: false,
  staffInviteInProgress: true,
  staffInviteCheckPending: false,
  staffInviteConflicted: false,
  hasPortalSession: false,
  linkQueryError: false,
  pathname: '/',
};

describe('staff accept waits for the link', () => {
  it('stays on the invite page while unlinked, then redirects once staff access links', async () => {
    installStorage();
    const document = installTestDom();
    const redirects: string[] = [];
    const signOuts: string[] = [];
    const view = await renderAt(
      document,
      createElement(FinishProbe, { step: 'form', link: { state: 'unlinked' }, retryTick: 0, redirects }),
    );
    assert.equal(view.text(), 'form');
    assert.deepEqual(redirects, []);

    await act(async () => {
      view.root.render(createElement(FinishProbe, { step: 'accepted', link: { state: 'unlinked' }, retryTick: 0, redirects }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    assert.match(view.text(), /Finishing setup/);
    const savedFinish = sessionStorage.getItem('warehaus-staff-finish') ?? '';
    assert.equal(savedFinish.includes('tok-1'), false);
    assert.match(savedFinish, /"tokenHash":"[0-9a-f]{64}"/);
    assert.match(view.text(), /linking your staff access/);
    assert.equal(view.text().includes('Sign out'), false);
    assert.equal(view.text().includes('Access denied'), false);
    assert.deepEqual(redirects, []);
    assert.deepEqual(signOuts, []);
    assert.equal(readStaffJoined(), null);

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 40));
    });
    assert.match(view.text(), /taking longer than usual/);
    assert.match(view.text(), /Try again/);
    assert.deepEqual(redirects, []);

    await act(async () => {
      view.root.render(createElement(FinishProbe, { step: 'accepted', link: { state: 'unlinked' }, retryTick: 1, redirects }));
    });
    assert.equal(view.text().includes('taking longer than usual'), false);
    assert.deepEqual(redirects, []);

    await act(async () => {
      view.root.render(
        createElement(FinishProbe, {
          step: 'accepted',
          link: { state: 'linked', isStaff: true },
          retryTick: 1,
          redirects,
        }),
      );
    });
    assert.deepEqual(redirects, ['/']);
    assert.deepEqual(readStaffJoined(), { name: 'Jordan', passwordSet: true });
    assert.deepEqual(signOuts, []);
    await act(async () => {
      view.root.unmount();
    });
  });

  it('does not sign out a session whose staff invite is still linking', async () => {
    const document = installTestDom();
    const replaced: string[] = [];
    const signedOut: string[] = [];
    const linked: string[] = [];
    const waiting = {
      ...gateBase,
      staffInviteInProgress: true,
    };
    assert.equal(authGateAction(waiting).type, 'wait');
    const view = await renderAt(document, gateElement(waiting, replaced, signedOut, linked));
    assert.match(view.text(), /Finishing setup/);
    assert.equal(view.text().includes('Access denied'), false);
    assert.deepEqual(replaced, []);
    assert.deepEqual(signedOut, []);
    assert.deepEqual(linked, []);

    await act(async () => {
      view.root.render(
        gateElement(
          {
            ...waiting,
            linkStatus: 'linked',
            hasPortalSession: true,
            staffInviteInProgress: false,
            joinError: waiting.joinError,
          },
          replaced,
          signedOut,
          linked,
        ),
      );
    });
    assert.equal(view.text(), 'dashboard');
    assert.deepEqual(signedOut, []);
    assert.deepEqual(replaced, []);

    const denied = { ...gateBase, staffInviteInProgress: false };
    assert.equal(authGateAction(denied).type, 'sign-out');
    await act(async () => {
      view.root.render(gateElement(denied, replaced, signedOut, linked));
    });
    await act(async () => {
      await Promise.resolve();
    });
    assert.deepEqual(signedOut, ['out']);
    assert.equal(replaced.join('').startsWith('/login?error='), true);
    assert.equal(linked.length, 0);
    await act(async () => {
      view.root.unmount();
    });
  });

  it('offers try again on the access gate when staff linking takes longer than a minute', async () => {
    const document = installTestDom();
    const replaced: string[] = [];
    const signedOut: string[] = [];
    const linked: string[] = [];
    const waiting = { ...gateBase, staffInviteInProgress: true };
    const view = await renderAt(document, gateElement(waiting, replaced, signedOut, linked, { timeoutMs: 20 }));
    assert.equal(view.text().includes('taking longer than usual'), false);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 40));
    });
    assert.match(view.text(), /taking longer than usual/);
    assert.match(view.text(), /Try again/);
    assert.deepEqual(signedOut, []);
    assert.deepEqual(replaced, []);
    await act(async () => {
      view.root.render(gateElement(waiting, replaced, signedOut, linked, { timeoutMs: 20, retrySignal: 1 }));
    });
    assert.equal(view.text().includes('taking longer than usual'), false);
    assert.deepEqual(signedOut, []);
    await act(async () => {
      view.root.unmount();
    });
  });

  it('shows the resend copy when the staff accept conflicted, and signs out only when asked', async () => {
    const document = installTestDom();
    const replaced: string[] = [];
    const signedOut: string[] = [];
    const linked: string[] = [];
    const conflicted = {
      ...gateBase,
      staffInviteInProgress: false,
      staffInviteConflicted: true,
      joinError: "This email can't register here. Contact your Warehaus team.",
    };
    assert.equal(authGateAction(conflicted).type, 'conflict');
    const view = await renderAt(document, gateElement(conflicted, replaced, signedOut, linked));
    assert.equal(view.text().includes(STAFF_ACCESS_CONFLICT_MESSAGE), true);
    assert.match(view.text(), /Sign out/);
    assert.equal(view.text().includes('Access denied'), false);
    assert.deepEqual(signedOut, []);
    assert.deepEqual(replaced, []);
    await act(async () => {
      clickButton(view.container, 'Sign out');
      await Promise.resolve();
    });
    assert.deepEqual(signedOut, ['out']);
    assert.deepEqual(replaced, ['/login']);
    assert.equal(view.text().includes('Access denied'), false);
    await act(async () => {
      view.root.unmount();
    });
  });

  it('lands on the joined dashboard instead of a bare checking screen', async () => {
    const justJoined: AuthGateInput = {
      ...gateBase,
      staffInviteInProgress: false,
      staffInviteCheckPending: true,
      linkStatus: 'loading',
      hasPortalSession: false,
      staffJustJoined: true,
      hasUser: true,
      sessionPending: false,
      joinError: null,
    };
    assert.equal(authGateAction(justJoined).type, 'ready');
    const linkedWhileChecking: AuthGateInput = {
      ...gateBase,
      staffInviteInProgress: false,
      staffInviteCheckPending: true,
      linkStatus: 'linked',
      hasPortalSession: true,
      hasUser: true,
      sessionPending: false,
    };
    assert.equal(authGateAction(linkedWhileChecking).type, 'ready');

    const document = installTestDom();
    const view = await renderAt(
      document,
      gateElement(justJoined, [], [], []),
    );
    assert.equal(view.text(), 'dashboard');
    assert.equal(view.text().includes('Checking access'), false);

    await act(async () => {
      view.root.render(
        createElement(DashboardHome, {
          model: { audience: 'staff' } as never,
          focus: 'all',
          loading: false,
          preview: null,
          showLoadError: false,
          onOpenTask: () => undefined,
          onOpenProject: () => undefined,
          joined: { name: 'Jordan', passwordSet: true },
        }),
      );
    });
    assert.match(view.text(), /You’ve joined Warehaus as staff/);
    assert.match(view.text(), /Projects/);
    assert.match(view.text(), /Your profile/);
    assert.match(view.text(), /Notifications/);
    assert.match(view.text(), /Go to projects/);
    await act(async () => {
      view.root.unmount();
    });
  });

  it('stays in finishing when the staff-link hash cannot be saved', async () => {
    installStorage();
    const document = installTestDom();
    const redirects: string[] = [];
    const subtle = crypto.subtle;
    const original = subtle.digest.bind(subtle);
    Object.defineProperty(subtle, 'digest', {
      configurable: true,
      value: async () => {
        throw new Error('digest unavailable');
      },
    });
    try {
      const view = await renderAt(
        document,
        createElement(FinishProbe, { step: 'accepted', link: { state: 'unlinked' }, retryTick: 0, redirects }),
      );
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      assert.match(view.text(), /Finishing setup/);
      assert.equal(view.text().includes('Access denied'), false);
      assert.deepEqual(redirects, []);
      await act(async () => {
        view.root.unmount();
      });
    } finally {
      Object.defineProperty(subtle, 'digest', { configurable: true, value: original });
    }
  });

  it('keeps the sixty second fallback and drops the dashboard finishing state', () => {
    const started = 1_000;
    const waiting = staffLinkPhase({
      waiting: true,
      link: { state: 'unlinked' },
      startedAt: started,
      now: started + 59_000,
    });
    assert.deepEqual(waiting, { finishing: true, slow: false, redirect: false, signOut: false });
    const slow = staffLinkPhase({
      waiting: true,
      link: { state: 'anonymous' },
      startedAt: started,
      now: started + 60_000,
    });
    assert.equal(slow.slow, true);
    assert.equal(slow.redirect, false);
    assert.equal(slow.signOut, false);
    const linked = staffLinkPhase({
      waiting: true,
      link: { state: 'linked', isStaff: true },
      startedAt: started,
      now: started + 1_000,
    });
    assert.equal(linked.redirect, true);
    const home = readFileSync(new URL('../pages/DashboardHome.tsx', import.meta.url), 'utf8');
    const portal = readFileSync(new URL('../pages/PortalHomeContent.tsx', import.meta.url), 'utf8');
    assert.equal(home.includes('finishing-setup'), false);
    assert.equal(home.includes('setup=finishing'), false);
    assert.equal(portal.includes('finishing'), false);
  });
});
