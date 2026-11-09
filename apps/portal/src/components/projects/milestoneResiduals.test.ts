import assert from 'node:assert/strict';
import React, { createElement, useState } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it } from 'node:test';
import type { MilestoneRoadmapView } from '@convex/_lib/milestones';
import { boardColumnTemplate } from '@/components/tasks/TaskBoard';
import {
  focusShouldReturnToDialog,
  isolateOutsideDialog,
  MENU_ERROR_ID,
  milestoneQueryAvailability,
  tasksMenuFailure,
} from './milestoneGuards';
import { MenuActionError, MissingMilestoneApi } from './milestoneChrome';
import { MoreMenu } from './ProjectRoadmap';

Object.assign(globalThis, { React });

const milestone = {
  workStatus: 'active',
  publishToWarehaus: false,
  rows: [{ id: 't1', name: 'Write brief' }],
} as MilestoneRoadmapView;

function missingMilestoneApi(onBack: () => void) {
  const View = MissingMilestoneApi as (props: { projectName: string; onBack?: () => void }) => ReturnType<
    typeof MissingMilestoneApi
  >;
  return createElement(View, { projectName: 'Site', onBack }, 'Task board');
}

function tasksFailure(error: string) {
  const failure = tasksMenuFailure({ tab: 'tasks', error, reviewOpen: false, editing: false });
  return createElement(
    'div',
    null,
    failure.show ? createElement(MenuActionError, { error, onDismiss: () => undefined }) : null,
    createElement(MoreMenu, {
      milestone,
      busy: false,
      attachable: [{ id: 't2', name: 'Loose task' }],
      describedBy: failure.describedBy,
      onWorkStatus: () => undefined,
      onPublish: () => undefined,
      onAttach: () => undefined,
      onDetach: () => undefined,
    }),
  );
}

describe('milestone residuals', () => {
  it('shows an attach, publish, or work-status failure on the tasks tab and leaves the controls usable', () => {
    for (const error of ['Could not attach the task.', 'Could not publish.', 'Could not set the work status.']) {
      const html = renderToStaticMarkup(tasksFailure(error));
      assert.match(html, new RegExp(error.replace(/[.]/g, '\\.')));
      assert.match(html, new RegExp(`id="${MENU_ERROR_ID}"`));
      assert.match(html, /role="alert"/);
      assert.match(html, />Dismiss</);
      assert.equal((html.match(/aria-describedby="milestone-menu-error"/g) ?? []).length >= 3, true);
      assert.equal(html.includes('disabled=""'), false);
      const failure = tasksMenuFailure({ tab: 'tasks', error, reviewOpen: false, editing: false });
      assert.equal(failure.show, true);
      assert.equal(failure.describedBy, MENU_ERROR_ID);
    }
    assert.equal(
      tasksMenuFailure({ tab: 'overview', error: 'Could not publish.', reviewOpen: false, editing: false }).show,
      false,
    );
    assert.equal(
      tasksMenuFailure({ tab: 'tasks', error: 'Could not publish.', reviewOpen: true, editing: false }).show,
      false,
    );
  });

  it('dismisses a tasks-tab failure without leaving the tab', async () => {
    const document = installDom();
    const seen: string[] = [];
    function Pane() {
      const [error, setError] = useState<string | null>('Could not publish.');
      const [tab] = useState<'tasks' | 'overview'>('tasks');
      const failure = tasksMenuFailure({ tab, error, reviewOpen: false, editing: false });
      return createElement(
        'div',
        null,
        failure.show && error
          ? createElement(MenuActionError, {
              error,
              onDismiss: () => {
                seen.push(tab);
                setError(null);
              },
            })
          : null,
        createElement(
          'button',
          {
            type: 'button',
            disabled: false,
            'aria-describedby': failure.describedBy,
            onClick: () => setError('Could not publish.'),
          },
          'Publish',
        ),
      );
    }
    const container = document.createElement('div');
    document.body.appendChild(container);
    let root: Root | null = null;
    await act(async () => {
      root = createRoot(container as unknown as Element);
      root.render(createElement(Pane));
    });
    assert.match(textOf(container), /Could not publish/);
    const dismiss = findButton(container, 'Dismiss');
    assert.ok(dismiss);
    await act(async () => {
      dismiss.dispatchEvent(clickEvent());
    });
    assert.deepEqual(seen, ['tasks']);
    assert.equal(textOf(container).includes('Could not publish'), false);
    assert.match(textOf(container), /Publish/);
    await act(async () => {
      root?.unmount();
    });
  });

  it('keeps the pre-PR lane width on boards that are not the milestone frame', () => {
    assert.equal(boardColumnTemplate(5, false), 'repeat(5, minmax(12.75rem, 1fr))');
    assert.equal(boardColumnTemplate(5, false, true), 'repeat(5, minmax(12rem, 1fr))');
    assert.equal(boardColumnTemplate(5, true, true), 'minmax(0, 1fr)');
    assert.equal(boardColumnTemplate(4, false), boardColumnTemplate(5, false).replace('5', '4'));
  });

  it('leaves the milestone shell when the milestone API is missing and keeps a normal load error', () => {
    const missing = 'Could not find public function for api.milestones.listForProject';
    const loaded = renderToStaticMarkup(
      milestoneQueryAvailability({ fixtures: false, error: missing }) === 'fallback'
        ? missingMilestoneApi(() => undefined)
        : createElement('p', { 'data-testid': 'milestone-query-error' }, missing),
    );
    assert.match(loaded, /data-testid="project-body"/);
    assert.match(loaded, /Task board/);
    assert.match(loaded, /Back to Projects/);
    assert.equal(loaded.includes('milestone-query-error'), false);
    assert.equal(loaded.includes('could not load'), false);

    const failed = renderToStaticMarkup(
      milestoneQueryAvailability({ fixtures: false, error: 'Server Error' }) === 'fallback'
        ? missingMilestoneApi(() => undefined)
        : createElement('p', { role: 'alert', 'data-testid': 'milestone-query-error' }, 'The milestones could not load.'),
    );
    assert.match(failed, /data-testid="milestone-query-error"/);
    assert.match(failed, /The milestones could not load/);
    assert.equal(failed.includes('project-body'), false);
    assert.equal(milestoneQueryAvailability({ fixtures: true, error: missing }), 'shell');
  });

  it('returns to the project list from the missing-function body', async () => {
    const document = installDom();
    let backs = 0;
    const container = document.createElement('div');
    document.body.appendChild(container);
    let root: Root | null = null;
    await act(async () => {
      root = createRoot(container as unknown as Element);
      root.render(
        missingMilestoneApi(() => { backs += 1; }),
      );
    });
    const back = findButton(container, 'Back to Projects');
    assert.ok(back);
    await act(async () => {
      back.dispatchEvent(clickEvent());
    });
    assert.equal(backs, 1);
    assert.match(textOf(container), /Task board/);
    await act(async () => {
      root?.unmount();
    });
  });

  it('isolates the page behind a dialog from focus, pointer, and assistive tech', () => {
    const page = element('DIV');
    const pageButton = element('BUTTON');
    pageButton.text = 'Edit project';
    page.children = [pageButton];
    pageButton.parentElement = page;
    const overlay = element('DIV');
    const dialog = element('DIV');
    const close = element('BUTTON');
    close.text = 'Close';
    dialog.children = [close];
    close.parentElement = dialog;
    overlay.children = [dialog];
    dialog.parentElement = overlay;
    const main = element('MAIN');
    main.children = [page, overlay];
    page.parentElement = main;
    overlay.parentElement = main;
    const header = element('HEADER');
    const headerButton = element('BUTTON');
    headerButton.text = 'Account';
    header.children = [headerButton];
    headerButton.parentElement = header;
    const body = element('BODY');
    body.nodeName = 'BODY';
    body.children = [header, main];
    header.parentElement = body;
    main.parentElement = body;

    assert.equal(focusShouldReturnToDialog({ targetInsideDialog: false }), true);
    assert.equal(focusShouldReturnToDialog({ targetInsideDialog: true }), false);

    const release = isolateOutsideDialog(overlay);
    for (const blocked of [page, header]) {
      assert.equal(blocked.inert, true);
      assert.equal(blocked.getAttribute('aria-hidden'), 'true');
      assert.equal(blocked.style.pointerEvents, 'none');
    }
    assert.equal(unreachable(pageButton), true);
    assert.equal(unreachable(headerButton), true);
    assert.equal(unreachable(overlay), false);
    assert.equal(unreachable(dialog), false);
    assert.equal(unreachable(close), false);

    release();
    for (const blocked of [page, pageButton, header, headerButton]) {
      assert.equal(unreachable(blocked), false);
    }
  });
});

function unreachable(node: TestNode | null): boolean {
  let current = node;
  while (current) {
    if (current.inert === true) return true;
    if (current.getAttribute('aria-hidden') === 'true') return true;
    if (current.style.pointerEvents === 'none') return true;
    current = current.parentElement;
  }
  return false;
}

type TestNode = {
  nodeType: number;
  nodeName: string;
  tagName?: string;
  childNodes: TestNode[];
  children: TestNode[];
  style: { pointerEvents?: string };
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
  appendChild: (child: TestNode) => TestNode;
  removeChild: (child: TestNode) => TestNode;
  insertBefore: (child: TestNode, before: TestNode | null) => TestNode;
  addEventListener: (type: string, fn: (event: EventLike) => void) => void;
  removeEventListener: (type: string, fn: (event: EventLike) => void) => void;
  dispatchEvent: (event: EventLike) => boolean;
  contains: (node: TestNode) => boolean;
  focus: () => void;
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
  bubbles: boolean;
  target: TestNode | null;
  currentTarget: TestNode | null;
  preventDefault: () => void;
  stopPropagation: () => void;
};

function element(tag: string): TestNode {
  return createNode(tag);
}

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
      event.currentTarget = this;
      for (const fn of this.listeners[event.type] ?? []) fn(event);
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
    querySelectorAll() {
      return [];
    },
  };
  return node;
}

function installDom(): TestDoc {
  const existing = (globalThis as unknown as { document?: TestDoc }).document;
  if (existing?.createElement && existing.body) return existing;
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
  const labelText = textOf(node);
  if (node.nodeName === 'BUTTON' && (node.getAttribute('aria-label') === label || labelText === label)) return node;
  for (const child of node.childNodes) {
    const found = findButton(child, label);
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
