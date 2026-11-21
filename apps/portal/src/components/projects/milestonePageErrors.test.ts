import assert from 'node:assert/strict';
import React, { createElement } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it } from 'node:test';
import type { MilestoneRoadmapView } from '@convex/_lib/milestones';
import { MilestoneDetailView } from './ProjectRoadmap';

Object.assign(globalThis, { React });

const milestone = {
  id: 'm-launch',
  name: 'Launch the homepage',
  objective: 'Ship the homepage.',
  goals: ['The homepage is live'],
  status: 'Building',
  approval: 'unreviewed',
  note: null,
  approverName: null,
  decidedAt: null,
  publishToWarehaus: false,
  resources: [],
  openCount: 0,
  doneCount: 0,
  countIsDecision: false,
  rows: [],
  attachableTasks: [{ id: 't-loose', name: 'Loose task' }],
} as MilestoneRoadmapView;

describe('milestone page mutation errors', () => {
  it('shows publish and attach failures from the thrown mutations and keeps the tasks tab usable', async () => {
    const document = installDom();
    const calls: string[] = [];
    let publishAttempts = 0;
    const mutations = {
      save: async () => undefined,
      setPublish: async () => {
        publishAttempts += 1;
        calls.push('publish');
        if (publishAttempts === 1) throw new Error('Could not change who can see this milestone.');
      },
      attachTask: async () => {
        calls.push('attach');
        throw new Error('Could not attach the task.');
      },
      detachTask: async () => undefined,
    };
    const container = document.createElement('div');
    document.body.appendChild(container);
    let root: Root | null = null;
    await act(async () => {
      root = createRoot(container as unknown as Element);
      root.render(
        createElement(MilestoneDetailView, {
          milestone,
          project: { id: 'p-site', name: 'Northwind site' },
          tasks: [],
          staff: true,
          fixtures: false,
          hostSlug: 'northwind',
          activity: [],
          resourceChoices: [],
          onBack: () => undefined,
          onFixture: () => undefined,
          mutations,
        }),
      );
    });

    await click(findButton(container, 'Tasks · 0'));
    assert.match(textOf(container), /TASKS · 0/);
    await click(findButton(container, 'Assign existing task'));

    await click(findButton(container, 'Publish'));
    assert.equal(publishAttempts, 0);
    assert.ok(findByTestId(container, 'milestone-details-modal'));
    await click(findByTestId(container, 'milestone-confirm-submit'));
    assert.match(alertText(container), /Couldn’t save/);
    assert.match(alertText(container), /Nothing changed/);
    assert.equal(findButton(container, 'Publish')?.disabled, undefined);
    await click(findButton(container, 'Cancel'));
    assert.equal(findByTestId(container, 'milestone-details-modal'), null);
    assert.match(textOf(container), /TASKS · 0/);

    assert.equal(findByTestId(container, 'milestone-work-select'), null);

    const attach = findByTestId(container, 'milestone-attach');
    assert.ok(attach);
    assert.notEqual(attach.disabled, true);
    attach.value = 't-loose';
    await act(async () => {
      attach.dispatchEvent(changeEvent(attach));
    });
    assert.match(alertText(container), /Could not attach the task/);
    await click(findButton(container, 'Dismiss'));

    await click(findButton(container, 'Publish'));
    await click(findByTestId(container, 'milestone-confirm-submit'));
    assert.equal(alertText(container), '');
    assert.deepEqual(calls, ['publish', 'attach', 'publish']);
    assert.equal(publishAttempts, 2);
    assert.match(textOf(container), /Assign existing task/);

    await act(async () => {
      root?.unmount();
    });
  });

  it('saves a status on pick, skips the current value, and confirms a project move before writing', async () => {
    const document = installDom();
    const calls: string[] = [];
    const container = document.createElement('div');
    document.body.appendChild(container);
    let root: Root | null = null;
    await act(async () => {
      root = createRoot(container as unknown as Element);
      root.render(
        createElement(MilestoneDetailView, {
          milestone,
          project: { id: 'p-site', name: 'Northwind site' },
          tasks: [],
          staff: true,
          fixtures: false,
          viewerEmail: 'alex@warehaus.co',
          moveTargets: [{ id: 'p-shipped', name: 'Northwind brand' }],
          resourceChoices: [],
          onBack: () => undefined,
          onFixture: () => undefined,
          mutations: {
            save: async () => undefined,
            setPublish: async () => {
              calls.push('publish');
            },
            setStatus: async (args) => {
              calls.push(`status:${args.status}:from:${args.expectedStatus}`);
            },
            advance: async (args) => {
              calls.push(`advance:${args.expectedStatus}`);
            },
            moveProject: async (args) => {
              calls.push(`move:${args.projectId}`);
            },
            attachTask: async () => undefined,
            detachTask: async () => undefined,
          },
        }),
      );
    });

    assert.equal(findByTestId(container, 'milestone-stage-edit'), null);
    await click(findByTestId(container, 'milestone-status-edit'));
    await click(findOption(container, 'Building'));
    assert.deepEqual(calls, []);

    await click(findByTestId(container, 'milestone-status-edit'));
    const awaiting = findOption(container, 'Awaiting Go');
    assert.notEqual(awaiting?.getAttribute('aria-disabled'), 'true');
    const shipped = findOption(container, 'Shipped');
    assert.equal(shipped?.getAttribute('aria-disabled'), 'true');
    assert.equal(findOption(container, 'In review'), null);
    await click(findOption(container, 'Parked'));
    assert.deepEqual(calls, ['status:Parked:from:Building']);
    // A menu pick has no Undo toast. Play does.
    assert.equal(findByTestId(document.body, 'milestone-status-toast'), null);

    await click(findByTestId(container, 'milestone-project-edit'));
    await click(findButton(container, 'Northwind brand'));
    assert.deepEqual(calls, ['status:Parked:from:Building']);
    assert.match(textOf(document.body), /Move to Northwind brand\?/);
    const dialog = findByTestId(container, 'milestone-details-scrim');
    await act(async () => {
      dialog?.dispatchEvent({ ...clickEvent(), type: 'keydown', key: 'Escape' } as EventLike & { key: string });
    });
    assert.equal(findByTestId(container, 'milestone-details-modal'), null);
    assert.deepEqual(calls, ['status:Parked:from:Building']);

    await click(findByTestId(container, 'milestone-project-edit'));
    await click(findButton(container, 'Northwind brand'));
    await click(findByTestId(container, 'milestone-confirm-submit'));
    assert.deepEqual(calls, ['status:Parked:from:Building', 'move:p-shipped']);

    await act(async () => {
      root?.unmount();
    });
  });

  it('retries the status and project the person picked', async () => {
    const document = installDom();
    const calls: string[] = [];
    const container = document.createElement('div');
    document.body.appendChild(container);
    let root: Root | null = null;
    const times = (prefix: string) => calls.filter((call) => call.startsWith(prefix)).length;
    await act(async () => {
      root = createRoot(container as unknown as Element);
      root.render(
        createElement(MilestoneDetailView, {
          milestone,
          project: { id: 'p-site', name: 'Northwind site' },
          tasks: [],
          staff: true,
          fixtures: false,
          viewerEmail: 'alex@warehaus.co',
          moveTargets: [
            { id: 'p-other', name: 'Other project' },
            { id: 'p-shipped', name: 'Northwind brand' },
          ],
          resourceChoices: [],
          onBack: () => undefined,
          onFixture: () => undefined,
          mutations: {
            save: async () => undefined,
            setPublish: async () => undefined,
            setStatus: async (args) => {
              calls.push(`status:${args.status}`);
              if (times('status:') === 1) throw new Error('save');
            },
            advance: async () => undefined,
            moveProject: async (args) => {
              calls.push(`move:${args.projectId}`);
              if (times('move:') === 1) throw new Error('move');
            },
            attachTask: async () => undefined,
            detachTask: async () => undefined,
          },
        }),
      );
    });

    await click(findByTestId(container, 'milestone-status-edit'));
    await click(findOption(container, 'Parked'));
    assert.deepEqual(calls, ['status:Parked']);
    // The failed pick rolled back to the stored status.
    assert.equal(textOf(findByTestId(container, 'milestone-status')!), 'Building');
    await click(findByTestId(container, 'milestone-status-retry'));
    assert.deepEqual(calls, ['status:Parked', 'status:Parked']);

    await click(findByTestId(container, 'milestone-project-edit'));
    await click(findButton(container, 'Northwind brand'));
    await click(findByTestId(container, 'milestone-confirm-submit'));
    assert.deepEqual(calls.filter((call) => call.startsWith('move:')), ['move:p-shipped']);
    await click(findByTestId(container, 'milestone-project-retry'));
    assert.deepEqual(calls.filter((call) => call.startsWith('move:')), ['move:p-shipped', 'move:p-shipped']);

    await act(async () => {
      root?.unmount();
    });
  });

  it('play advances one step, shows the new status at once, and offers Undo', async () => {
    const document = installDom();
    const calls: string[] = [];
    const container = document.createElement('div');
    document.body.appendChild(container);
    let root: Root | null = null;
    let release: (() => void) | null = null;
    const render = (status: MilestoneRoadmapView['status']) =>
      createElement(MilestoneDetailView, {
        milestone: { ...milestone, status },
        project: { id: 'p-site', name: 'Northwind site' },
        tasks: [],
        staff: true,
        fixtures: false,
        viewerEmail: 'alex@warehaus.co',
        resourceChoices: [],
        onBack: () => undefined,
        onFixture: () => undefined,
        mutations: {
          save: async () => undefined,
          setPublish: async () => undefined,
          setStatus: async (args) => {
            calls.push(`status:${args.status}:from:${args.expectedStatus}`);
          },
          advance: (args) => {
            calls.push(`advance:${args.expectedStatus}`);
            return new Promise<void>((resolve) => {
              release = resolve;
            });
          },
          attachTask: async () => undefined,
          detachTask: async () => undefined,
        },
      });
    await act(async () => {
      root = createRoot(container as unknown as Element);
      root.render(render('Awaiting Go'));
    });

    const play = findByTestId(container, 'milestone-status-play');
    assert.equal(play?.getAttribute('aria-label'), 'Move to Building');
    assert.equal(textOf(findByTestId(container, 'milestone-status-play-tip')!), 'Next: Building');
    await click(play);
    // No confirm dialog. One write, with the status the person saw.
    assert.deepEqual(calls, ['advance:Awaiting Go']);
    assert.equal(findByTestId(container, 'milestone-details-modal'), null);
    // The new status shows while the write is in flight, and play hides.
    assert.equal(textOf(findByTestId(container, 'milestone-status')!), 'Building…');
    assert.equal(findByTestId(container, 'milestone-status-play'), null);
    assert.equal(findByTestId(document.body, 'milestone-status-toast'), null);

    await act(async () => {
      root?.render(render('Building'));
      release?.();
    });
    assert.equal(textOf(findByTestId(container, 'milestone-status')!), 'Building');
    const toast = findByTestId(document.body, 'milestone-status-toast');
    assert.match(textOf(toast!), /Moved to Building/);
    assert.equal(findByTestId(container, 'milestone-status-play')?.getAttribute('aria-label'), 'Move to Ready to Ship');

    await click(findByTestIdIn(toast!, 'portal-toast-undo'));
    assert.deepEqual(calls, ['advance:Awaiting Go', 'status:Awaiting Go:from:Building']);
    assert.equal(findByTestId(document.body, 'milestone-status-toast'), null);

    await act(async () => {
      root?.unmount();
    });
  });

  it('rolls a failed play back and says nothing changed', async () => {
    const document = installDom();
    const calls: string[] = [];
    const container = document.createElement('div');
    document.body.appendChild(container);
    let root: Root | null = null;
    await act(async () => {
      root = createRoot(container as unknown as Element);
      root.render(
        createElement(MilestoneDetailView, {
          milestone: { ...milestone, status: 'Planning' },
          project: { id: 'p-site', name: 'Northwind site' },
          tasks: [],
          staff: true,
          fixtures: false,
          viewerEmail: 'alex@warehaus.co',
          resourceChoices: [],
          onBack: () => undefined,
          onFixture: () => undefined,
          mutations: {
            save: async () => undefined,
            setPublish: async () => undefined,
            setStatus: async () => undefined,
            advance: async (args) => {
              calls.push(`advance:${args.expectedStatus}`);
              throw new Error('The status changed. Refresh and try again.');
            },
            attachTask: async () => undefined,
            detachTask: async () => undefined,
          },
        }),
      );
    });

    await click(findByTestId(container, 'milestone-status-play'));
    assert.deepEqual(calls, ['advance:Planning']);
    assert.equal(textOf(findByTestId(container, 'milestone-status')!), 'Planning');
    assert.equal(textOf(findByTestId(container, 'milestone-status-error')!), 'Couldn’t save. Nothing changed.');
    assert.equal(findByTestId(document.body, 'milestone-status-toast'), null);
    assert.equal(findByTestId(container, 'milestone-status-play')?.getAttribute('aria-label'), 'Move to Awaiting Go');

    await act(async () => {
      root?.unmount();
    });
  });
});

async function click(node: TestNode | null) {
  assert.ok(node);
  await act(async () => {
    node.dispatchEvent(clickEvent());
  });
}

function alertText(node: TestNode): string {
  const alert = findByRole(node, 'alert')
    ?? (node.ownerDocument?.body && node.ownerDocument.body !== node ? findByRole(node.ownerDocument.body, 'alert') : null);
  return alert ? textOf(alert) : '';
}

type TestNode = {
  nodeType: number;
  nodeName: string;
  tagName?: string;
  value?: string;
  disabled?: boolean;
  childNodes: TestNode[];
  children: TestNode[];
  style: Record<string, string>;
  attributes: Record<string, string>;
  parentNode: TestNode | null;
  parentElement: TestNode | null;
  ownerDocument: TestDoc | null;
  textContent: string;
  text: string;
  namespaceURI: string;
  nextSibling: TestNode | null;
  options: TestNode[];
  listeners: Record<string, Array<(event: EventLike) => void>>;
  setAttribute: (name: string, value: string) => void;
  getAttribute: (name: string) => string | null;
  removeAttribute: (name: string) => void;
  appendChild: (child: TestNode) => TestNode;
  removeChild: (child: TestNode) => TestNode;
  insertBefore: (child: TestNode, before: TestNode | null) => TestNode;
  addEventListener: (type: string, fn: (event: EventLike) => void) => void;
  removeEventListener: (type: string, fn: (event: EventLike) => void) => void;
  dispatchEvent: (event: EventLike) => boolean;
  contains: (node: TestNode) => boolean;
  focus: () => void;
  querySelector: (selector: string) => TestNode | null;
  querySelectorAll: () => TestNode[];
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
    options: [] as TestNode[],
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
      child.parentElement = this.nodeType === 1 ? this : child.parentElement;
      this.childNodes.push(child);
      if (child.nodeType === 1) this.children.push(child);
      if (child.nodeName === 'OPTION') this.options.push(child);
      return child;
    },
    removeChild(child) {
      this.childNodes = this.childNodes.filter((item) => item !== child);
      this.children = this.children.filter((item) => item !== child);
      child.parentNode = null;
      return child;
    },
    insertBefore(child, before) {
      child.parentNode = this;
      child.parentElement = this;
      const index = before ? this.childNodes.indexOf(before) : -1;
      if (index < 0) this.childNodes.push(child);
      else this.childNodes.splice(index, 0, child);
      if (child.nodeType === 1) this.children.push(child);
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
      if (selector === '[aria-selected="true"]') return null;
      return null;
    },
    querySelectorAll() {
      return [];
    },
  };
  return node;
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

function findOption(node: TestNode, label: string): TestNode | null {
  if (node.nodeName === 'BUTTON' && node.getAttribute('role') === 'option' && textOf(node).startsWith(label)) return node;
  for (const child of node.childNodes) {
    const found = findOption(child, label);
    if (found) return found;
  }
  return null;
}

function findButton(node: TestNode, label: string): TestNode | null {
  const found = findButtonIn(node, label);
  if (found) return found;
  const body = node.ownerDocument?.body;
  if (body && body !== node) return findButtonIn(body, label);
  return null;
}

function findButtonIn(node: TestNode, label: string): TestNode | null {
  if (node.nodeName === 'BUTTON' && textOf(node) === label) return node;
  for (const child of node.childNodes) {
    const found = findButtonIn(child, label);
    if (found) return found;
  }
  return null;
}

function findByTestId(node: TestNode, id: string): TestNode | null {
  const found = findByTestIdIn(node, id);
  if (found) return found;
  const body = node.ownerDocument?.body;
  if (body && body !== node) return findByTestIdIn(body, id);
  return null;
}

function findByTestIdIn(node: TestNode, id: string): TestNode | null {
  if (node.getAttribute('data-testid') === id) return node;
  for (const child of node.childNodes) {
    const found = findByTestIdIn(child, id);
    if (found) return found;
  }
  return null;
}

function findByRole(node: TestNode, role: string): TestNode | null {
  if (node.getAttribute('role') === role) return node;
  for (const child of node.childNodes) {
    const found = findByRole(child, role);
    if (found) return found;
  }
  return null;
}

function clickEvent(): EventLike {
  return {
    type: 'click',
    bubbles: true,
    target: null,
    currentTarget: null,
    preventDefault() {},
    stopPropagation() {},
  };
}

function changeEvent(target: TestNode): EventLike {
  return {
    type: 'change',
    bubbles: true,
    target,
    currentTarget: null,
    preventDefault() {},
    stopPropagation() {},
  };
}
