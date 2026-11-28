import assert from 'node:assert/strict';
import React, { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it } from 'node:test';
import {
  emptyMilestoneListView,
  milestoneListViewOptions,
  pruneMilestoneListView,
  type MilestoneFilterRow,
  type MilestoneListView,
} from '@/lib/data/milestoneFilters';

Object.assign(globalThis, { React });
const { MilestoneFilterBar, MilestoneFiltersEmpty } = await import('./MilestoneFilterBar');

describe('MilestoneFiltersEmpty', () => {
  it('draws the no-match line and Clear filters, as designed', () => {
    const html = renderToStaticMarkup(createElement(MilestoneFiltersEmpty, { onClear: () => {} }));
    assert.match(html, /data-testid="milestone-filters-empty"/);
    assert.match(html, />No milestones match these filters\.</);
    assert.match(html, /data-testid="milestone-filters-empty-clear"[^>]*>Clear filters</);
    assert.match(html, /filter-funnel\.svg/);
  });
});

/** What staff load: four statuses, three types, three approvals, one open Ask on the viewer. */
const STAFF: MilestoneFilterRow[] = [
  { status: 'Building', workType: 'design', approval: 'unreviewed' },
  { status: 'Ready to Ship', workType: 'both', approval: 'unreviewed', needsYou: true },
  { status: 'Shipped', workType: 'build', approval: 'approved' },
  { status: 'Building', workType: 'build', approval: 'changes_requested' },
  { status: 'Planning', approval: 'unreviewed' },
];
/** What a client loads: no approval, no Ask, and no Planning milestone. */
const CLIENT: MilestoneFilterRow[] = STAFF.filter((row) => row.status !== 'Planning').map(({ status, workType }) => ({
  status,
  ...(workType ? { workType } : {}),
}));

const noop = () => {};

function view(patch: Partial<MilestoneListView> = {}): MilestoneListView {
  return { ...emptyMilestoneListView(), ...patch };
}

function markup(props: Record<string, unknown> = {}, rows: readonly MilestoneFilterRow[] = STAFF) {
  const staff = props.staff !== false;
  return renderToStaticMarkup(
    createElement(MilestoneFilterBar, {
      view: view(),
      options: milestoneListViewOptions(rows, staff),
      staff,
      onChange: noop,
      onClear: noop,
      ...props,
    }),
  );
}

function optionLabels(html: string): string[] {
  return [...html.matchAll(/data-testid="milestone-filter-option"[^>]*>.*?<span class="min-w-0 flex-1"[^>]*>(.*?)<\/span>/g)].map(
    (match) => match[1] ?? '',
  );
}

function sectionLabels(html: string): string[] {
  return [...html.matchAll(/data-testid="milestone-filter-section" data-filter="([^"]+)"/g)].map((match) => match[1] ?? '');
}

describe('MilestoneFilterBar markup', () => {
  it('draws a closed Filters button with no count and no chips when nothing is set', () => {
    const html = markup();
    assert.match(
      html,
      /<button type="button"[^>]*data-testid="milestone-filters-trigger"[^>]*aria-haspopup="dialog"[^>]*aria-expanded="false"/,
    );
    assert.match(html, />Filters</);
    assert.equal(html.includes('milestone-filters-count'), false);
    assert.equal(html.includes('role="dialog"'), false);
    assert.equal(html.includes('milestone-applied-filters'), false);
    assert.equal(html.includes('milestone-filters-clear'), false);
  });

  it('counts filters, not values', () => {
    const html = markup({ view: view({ statuses: ['Building', 'Shipped'], types: ['both'] }) });
    assert.match(html, /data-testid="milestone-filters-count"[^>]*>.*?<\/span>2<\/span>/);
  });

  it('gives staff Status, Type, Approval and Needs you, with the copy as drawn', () => {
    const html = markup({ initialOpen: true });
    assert.match(html, /role="dialog" aria-label="Filters"/);
    assert.match(html, /data-testid="milestone-filters-trigger"[^>]*aria-expanded="true"/);
    assert.deepEqual(sectionLabels(html), ['status', 'type', 'approval', 'needsYou']);
    for (const label of ['Status', 'Type', 'Approval', 'Needs you']) assert.match(html, new RegExp(`>${label}<`));
    assert.deepEqual(optionLabels(html), [
      'Planning',
      'Building',
      'Ready to Ship',
      'Shipped',
      'Design',
      'Dev',
      'Design and dev',
      'Unreviewed',
      'Approved',
      'Changes requested',
      'Open Ask on you',
    ]);
    assert.equal(html.match(/data-testid="milestone-filter-summary"[^>]*>Any</g)?.length, 4);
    assert.match(html, />Filters apply as you pick\.</);
    assert.equal(html.includes('Saved to your account'), false);
    assert.equal(html.includes('milestone-filters-clear-menu'), false);
  });

  it('gives a client Status and Type only, with only the statuses in their list', () => {
    const html = markup({ staff: false, initialOpen: true }, CLIENT);
    assert.deepEqual(sectionLabels(html), ['status', 'type']);
    assert.deepEqual(optionLabels(html), ['Building', 'Ready to Ship', 'Shipped', 'Design', 'Dev', 'Design and dev']);
    for (const absent of ['Approval', 'Needs you', 'Open Ask on you', 'Unreviewed', 'Planning']) {
      assert.equal(html.includes(absent), false, absent);
    }
    assert.match(html, /data-role="client"/);
  });

  it('ignores staff-only values a client view carries', () => {
    const html = markup(
      { staff: false, initialOpen: true, view: view({ approval: ['approved'], needsYou: true, types: ['design'] }) },
      CLIENT,
    );
    assert.match(html, /data-testid="milestone-filters-count"[^>]*>.*?<\/span>1<\/span>/);
    assert.equal(html.match(/data-testid="milestone-filter-value"/g)?.length, 1);
    assert.match(html, />Type:<.*>Design</);
    assert.equal(html.includes('Approval:'), false);
    assert.equal(html.includes('Needs you:'), false);
  });

  it('marks picked options as checked checkboxes and summarises each filter', () => {
    const html = markup({ initialOpen: true, view: view({ statuses: ['Building', 'Shipped'], types: ['both'] }) });
    assert.equal(html.match(/role="checkbox"/g)?.length, 11);
    assert.equal(html.includes('role="radio"'), false);
    assert.match(html, /role="checkbox" aria-checked="true"[^>]*>(?:(?!role="checkbox").)*Building/);
    assert.match(html, /role="checkbox" aria-checked="false"[^>]*>(?:(?!role="checkbox").)*Planning/);
    assert.equal(html.match(/aria-checked="true"/g)?.length, 3);
    assert.match(html, /data-testid="milestone-filter-summary"[^>]*>2 selected</);
    assert.match(html, /data-testid="milestone-filter-summary"[^>]*>Design and dev</);
    assert.match(html, /role="group" aria-label="Status"/);
    assert.match(html, /data-testid="milestone-filters-clear-menu"[^>]*>Clear filters</);
  });

  it('shows one chip per value with a labelled remove, then Clear filters', () => {
    const html = markup({
      view: view({ statuses: ['Building', 'Shipped'], types: ['both'], approval: ['unreviewed'], needsYou: true }),
    });
    assert.match(html, /data-testid="milestone-applied-filters"/);
    assert.equal(html.match(/data-testid="milestone-filter-value"/g)?.length, 5);
    const text = html.replace(/<[^>]+>/g, '|').replace(/\|+/g, '|');
    for (const chip of [
      'Status:|Building',
      'Status:|Shipped',
      'Type:|Design and dev',
      'Approval:|Unreviewed',
      'Needs you:|Open Ask on you',
    ]) {
      assert.ok(text.includes(chip), chip);
    }
    assert.match(html, /aria-label="Remove Status: Building"/);
    assert.match(html, /data-testid="milestone-filters-clear"[^>]*>Clear filters</);
  });

  it('leaves out a filter that cannot narrow the list, and the control when none can', () => {
    const sameType: MilestoneFilterRow[] = [
      { status: 'Building', workType: 'build', approval: 'unreviewed' },
      { status: 'Shipped', workType: 'build', approval: 'unreviewed' },
    ];
    assert.deepEqual(sectionLabels(markup({ initialOpen: true }, sameType)), ['status']);
    const one: MilestoneFilterRow[] = [{ status: 'Building', workType: 'build', approval: 'unreviewed' }];
    assert.equal(markup({}, one), '');
    const withChip = markup({ children: createElement('button', { 'data-testid': 'archived-filter' }, 'Archived') }, one);
    assert.match(withChip, /data-testid="archived-filter"/);
    assert.equal(withChip.includes('milestone-filters-trigger'), false);
  });

  it('puts what it is given beside the Filters control', () => {
    const html = markup({ children: createElement('button', { 'data-testid': 'archived-filter' }, 'Archived') });
    assert.match(html, /milestone-filters-trigger.*archived-filter/);
  });

  it('starts a filter collapsed when asked', () => {
    const html = markup({ initialOpen: true, initialCollapsed: ['status'] });
    assert.deepEqual(optionLabels(html).slice(0, 1), ['Design']);
    assert.match(html, /data-filter="status"><button[^>]*aria-expanded="false"/);
  });
});

describe('MilestoneFilterBar in use', () => {
  it('opens, applies each pick at once, removes one value, clears, and closes on Escape with focus back', async () => {
    const dom = installDom({ phone: false });
    let cleared = 0;
    const page = await mount(dom, true, STAFF, () => (cleared += 1));
    const trigger = () => must(find(dom.body, 'milestone-filters-trigger'));

    assert.equal(find(dom.body, 'milestone-filter-menu'), null);
    await press(trigger());
    const menu = must(find(dom.body, 'milestone-filter-menu'));
    assert.equal(menu.getAttribute('role'), 'dialog');
    assert.equal(menu.getAttribute('data-size'), '1440');
    assert.equal(trigger().getAttribute('aria-expanded'), 'true');
    assert.equal(trigger().getAttribute('aria-controls'), menu.getAttribute('id'));
    assert.equal(dom.activeElement?.hasAttribute('data-menu-item'), true, 'focus moves into the menu');

    await press(option(dom, 'Building'));
    assert.deepEqual(page.view().statuses, ['Building']);
    assert.equal(option(dom, 'Building').getAttribute('aria-checked'), 'true');
    assert.equal(textOf(find(dom.body, 'milestone-filters-count')), 'Filters set: 1');

    await press(option(dom, 'Shipped'));
    await press(option(dom, 'Design and dev'));
    await press(option(dom, 'Open Ask on you'));
    assert.deepEqual(page.view(), view({ statuses: ['Building', 'Shipped'], types: ['both'], needsYou: true }));
    assert.equal(textOf(find(dom.body, 'milestone-filters-count')), 'Filters set: 3');
    assert.equal(all(dom.body, 'milestone-filter-value').length, 4);

    await press(option(dom, 'Building'));
    assert.deepEqual(page.view().statuses, ['Shipped']);
    assert.equal(option(dom, 'Building').getAttribute('aria-checked'), 'false');

    const remove = must(
      walk(dom.body).find((node) => node.getAttribute('aria-label') === 'Remove Type: Design and dev'),
    );
    await press(remove);
    assert.deepEqual(page.view().types, []);
    assert.equal(all(dom.body, 'milestone-filter-value').length, 2);

    await act(async () => {
      dom.activeElement?.dispatchEvent(key('Escape'));
    });
    assert.equal(find(dom.body, 'milestone-filter-menu'), null);
    assert.equal(trigger().getAttribute('aria-expanded'), 'false');
    assert.equal(dom.activeElement, trigger(), 'focus returns to the Filters control');

    assert.equal(cleared, 0);
    await press(must(find(dom.body, 'milestone-filters-clear')));
    assert.equal(cleared, 1);
    assert.deepEqual(page.view(), view());
    assert.equal(find(dom.body, 'milestone-applied-filters'), null);
    assert.equal(find(dom.body, 'milestone-filters-count'), null);

    await page.unmount();
  });

  it('clears from inside the menu and collapses a filter', async () => {
    const dom = installDom({ phone: false });
    let cleared = 0;
    const page = await mount(dom, true, STAFF, () => (cleared += 1));
    await press(must(find(dom.body, 'milestone-filters-trigger')));
    assert.equal(find(dom.body, 'milestone-filters-clear-menu'), null);
    await press(option(dom, 'Approved'));
    await press(must(find(dom.body, 'milestone-filters-clear-menu')));
    assert.equal(cleared, 1);
    assert.deepEqual(page.view(), view());
    assert.ok(find(dom.body, 'milestone-filter-menu'), 'the menu stays open');

    const status = must(all(dom.body, 'milestone-filter-section')[0]);
    const head = must(status.querySelector('[aria-expanded]'));
    assert.equal(head.getAttribute('aria-expanded'), 'true');
    await press(head);
    assert.equal(head.getAttribute('aria-expanded'), 'false');
    assert.equal(status.querySelector('[role="checkbox"]'), null);
    await page.unmount();
  });

  it('is a bottom sheet under 768px with Close, the hint, Clear filters and Done', async () => {
    const dom = installDom({ phone: true });
    const page = await mount(dom, false, CLIENT, noop);
    await press(must(find(dom.body, 'milestone-filters-trigger')));
    const sheet = must(find(dom.body, 'milestone-filter-menu'));
    assert.equal(sheet.getAttribute('data-size'), '390');
    assert.equal(sheet.getAttribute('aria-modal'), 'true');
    const buttons = () => sheet.querySelectorAll('button').map((node) => textOf(node));
    assert.ok(buttons().includes('Close'));
    assert.ok(buttons().includes('Done'));
    assert.equal(buttons().includes('Clear filters'), false);
    assert.ok(textOf(sheet).includes('Filters apply as you pick'));
    assert.equal(textOf(sheet).includes('Filters apply as you pick.'), false);
    assert.equal(all(sheet, 'milestone-filter-section').length, 2);

    await press(option(dom, 'Dev'));
    assert.deepEqual(page.view().types, ['build']);
    assert.ok(buttons().includes('Clear filters'));

    await press(must(sheet.querySelectorAll('button').find((node) => textOf(node) === 'Done')));
    assert.equal(find(dom.body, 'milestone-filter-menu'), null);
    assert.equal(dom.activeElement, find(dom.body, 'milestone-filters-trigger'));
    await page.unmount();
  });
});

/* ── Harness: the page's part, holding the view and pruning it for the bar ── */

async function mount(dom: TestDoc, staff: boolean, rows: readonly MilestoneFilterRow[], onCleared: () => void) {
  let current = view();
  function Page() {
    const [held, setHeld] = useState<MilestoneListView>(view());
    current = held;
    const options = milestoneListViewOptions(rows, staff);
    return createElement(MilestoneFilterBar, {
      view: pruneMilestoneListView(held, options),
      options,
      staff,
      onChange: (update) => setHeld((before) => update(before)),
      onClear: () => {
        onCleared();
        setHeld(view());
      },
    });
  }
  const container = dom.createElement('div');
  dom.body.appendChild(container);
  let root: Root | null = null;
  await act(async () => {
    root = createRoot(container as unknown as Element);
    root.render(createElement(Page));
  });
  return {
    view: () => current,
    unmount: async () => {
      await act(async () => {
        root?.unmount();
      });
    },
  };
}

async function press(node: TestNode) {
  await act(async () => {
    node.dispatchEvent(click());
  });
}

function option(dom: TestDoc, label: string): TestNode {
  return must(all(dom.body, 'milestone-filter-option').find((node) => textOf(node) === label));
}

function must<T>(value: T | null | undefined): T {
  assert.ok(value, 'expected an element');
  return value;
}

/* ── A small DOM, enough for React to render, portal and take clicks and keys ── */

type Listener = (event: EventLike) => void;

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
  dispatchEvent: (event: EventLike) => boolean;
  contains: (node: TestNode) => boolean;
  focus: () => void;
  querySelector: (selector: string) => TestNode | null;
  querySelectorAll: (selector: string) => TestNode[];
  getBoundingClientRect: () => { top: number; right: number; bottom: number; left: number; width: number; height: number };
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

function installDom({ phone }: { phone: boolean }): TestDoc {
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
    // React updates a text node through nodeValue.
    Object.defineProperty(node, 'nodeValue', {
      get: () => node.textContent,
      set: (value: string) => {
        node.textContent = value;
      },
    });
    return node;
  };
  document.body = document.createElement('body');
  document.appendChild(document.body);
  document.activeElement = null;
  const view = {
    document,
    HTMLElement: function HTMLElement() {},
    HTMLInputElement: function HTMLInputElement() {},
    HTMLIFrameElement: function HTMLIFrameElement() {},
    Element: function Element() {},
    Node: function Node() {},
    innerWidth: phone ? 390 : 1440,
    innerHeight: 900,
    addEventListener() {},
    removeEventListener() {},
    matchMedia: () => ({ matches: phone, addEventListener() {}, removeEventListener() {} }),
    getSelection: () => null,
  };
  const target = globalThis as Record<string, unknown>;
  target.window = view;
  target.document = document;
  target.HTMLElement = view.HTMLElement;
  target.HTMLInputElement = view.HTMLInputElement;
  target.HTMLIFrameElement = view.HTMLIFrameElement;
  target.Element = view.Element;
  target.Node = view.Node;
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
    tabIndex: tag === 'button' ? 0 : -1,
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
      child.parentElement = this.nodeType === 1 ? this : null;
      this.childNodes.push(child);
      if (child.nodeType === 1) this.children.push(child);
      return child;
    },
    removeChild(child: TestNode) {
      this.childNodes = this.childNodes.filter((item) => item !== child);
      this.children = this.children.filter((item) => item !== child);
      child.parentNode = null;
      child.parentElement = null;
      return child;
    },
    insertBefore(child: TestNode, before: TestNode | null) {
      child.parentNode = this;
      child.parentElement = this.nodeType === 1 ? this : null;
      const index = before ? this.childNodes.indexOf(before) : -1;
      if (index < 0) this.childNodes.push(child);
      else this.childNodes.splice(index, 0, child);
      this.children = this.childNodes.filter((item) => item.nodeType === 1);
      return child;
    },
    addEventListener(type: string, fn: Listener) {
      this.listeners[type] = this.listeners[type] ?? [];
      this.listeners[type].push(fn);
    },
    removeEventListener(type: string, fn: Listener) {
      this.listeners[type] = (this.listeners[type] ?? []).filter((item) => item !== fn);
    },
    dispatchEvent(event: EventLike) {
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
    getBoundingClientRect() {
      return { top: 200, right: 460, bottom: 235, left: 360, width: 100, height: 35 };
    },
  } as TestNode;
  return node;
}

function walk(node: TestNode): TestNode[] {
  const found: TestNode[] = [node];
  for (const child of node.childNodes) found.push(...walk(child));
  return found;
}

/** A tag name, `[name]` or `[name="value"]`. Nothing else is used here. */
function matches(node: TestNode, selector: string): boolean {
  if (node.nodeType !== 1) return false;
  const tag = selector.match(/^[a-z]+/i)?.[0];
  if (tag && node.nodeName !== tag.toUpperCase()) return false;
  const attrs = [...selector.matchAll(/\[([^\]=]+)(?:=(["'])(.*?)\2)?\]/g)];
  if (!tag && attrs.length === 0) return false;
  return attrs.every((match) => {
    const actual = node.getAttribute(match[1] ?? '');
    return match[3] == null ? actual != null : actual === match[3];
  });
}

function textOf(node: TestNode | null): string {
  if (!node) return '';
  if (node.childNodes.length > 0) return node.childNodes.map((child) => textOf(child)).join('');
  return node.textContent ?? '';
}

function all(node: TestNode, id: string): TestNode[] {
  return walk(node).filter((item) => item.nodeType === 1 && item.getAttribute('data-testid') === id);
}

function find(node: TestNode, id: string): TestNode | null {
  return all(node, id)[0] ?? null;
}

function key(name: string): EventLike {
  return {
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
}

function click(): EventLike {
  return { ...key(''), type: 'click' };
}
