import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React, { createElement } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it } from 'node:test';
import {
  TEAM_ERROR_COPY,
  TEAM_SEND_HINT,
  TEAM_STAFF_EMPTY,
  TEAM_STALE_COPY,
  TeamEmpty,
  TeamPersonIdentity,
  TeamSkeletonRows,
  TeamStateNotice,
  clientTeamEmptyBody,
  peopleForTeamScreen,
  readTeamScreen,
  teamView,
  useTeamScreen,
} from './teamStates';

Object.assign(globalThis, { React });

const base = { screen: 'ready' as const, fixtures: false, loading: false, missing: false, failed: false, hasCache: false, count: 0 };

describe('account team states', () => {
  it('derives empty, loading, error, and a cached roster from the live query', () => {
    assert.equal(teamView({ ...base, loading: true, count: -1 }), 'loading');
    assert.equal(teamView({ ...base, failed: true, count: -1 }), 'error');
    assert.equal(teamView({ ...base, missing: true, failed: true, count: -1 }), 'ready');
    assert.equal(teamView({ ...base, count: 0 }), 'empty');
    assert.equal(teamView({ ...base, fixtures: true, count: 2 }), 'ready');
    assert.equal(teamView({ ...base, screen: 'long', fixtures: true, count: 2 }), 'long');
    assert.equal(teamView({ ...base, screen: 'empty', fixtures: true, loading: true, count: 2 }), 'empty');
    assert.equal(teamView({ ...base, failed: true, hasCache: true, count: 2 }), 'stale');
    assert.equal(teamView({ ...base, loading: true, hasCache: true, count: 2 }), 'ready');
  });

  it('a live session with ?teamState=error still renders the live roster', async () => {
    assert.equal(readTeamScreen('error', false), 'ready');
    assert.equal(readTeamScreen('error', true), 'error');
    assert.equal(teamView({ ...base, screen: 'error', fixtures: false, count: 2 }), 'ready');
    assert.deepEqual(peopleForTeamScreen('ready', ['Ada North']), ['Ada North']);
    assert.deepEqual(peopleForTeamScreen('error', ['Ada North']), []);

    const document = installTestDom();
    (globalThis as { window: { location: { search: string } } }).window.location = { search: '?teamState=error' };
    const people = [{ id: 'ada', name: 'Ada North' }];
    const live = await renderProbe(document, false, people);
    assert.match(live, /Ada North/);
    assert.equal(live.includes("We couldn't load your team"), false);
    const fixture = await renderProbe(document, true, people);
    assert.match(fixture, /We couldn't load your team/);
    assert.equal(fixture.includes('Ada North'), false);

    const invites = readFileSync(new URL('../pages/TeamInvites.tsx', import.meta.url), 'utf8');
    assert.equal(invites.includes('useMutation'), false);
    assert.equal(invites.includes('getElementById'), false);
    assert.equal(invites.includes('Invite someone'), false);
    assert.match(invites, /TEAM_SEND_HINT/);
    assert.match(invites, /TEAM_REMOVE_HINT/);
    assert.match(invites, /TEAM_REVOKE_HINT/);
  });

  it('renders the staff empty card, skeletons, error notice, and a person row', () => {
    const empty = renderToStaticMarkup(
      createElement(TeamEmpty, {
        title: TEAM_STAFF_EMPTY.title,
        body: TEAM_STAFF_EMPTY.body,
      }),
    );
    assert.match(empty, /No people yet/);
    assert.match(empty, /People you invite will show here/);
    assert.match(empty, /src="\/icons\/team-empty.svg"/);
    assert.match(empty, /width="28"/);
    assert.match(empty, /height="28"/);
    assert.equal(empty.includes('Invite someone'), false);
    assert.equal(empty.includes('team-invite-someone'), false);

    const loading = renderToStaticMarkup(createElement(TeamSkeletonRows, null));
    assert.equal(loading.match(/data-testid="team-skeleton-row"/g)?.length, 3);
    assert.match(loading, /role="status"/);
    assert.match(loading, /Loading team/);
    assert.equal(loading.includes('aria-busy'), false);
    assert.equal(loading.includes('aria-hidden'), false);
    assert.match(loading, /width:32px/);
    assert.match(loading, /border-radius:999px/);
    assert.match(loading, /width:64px/);

    const error = renderToStaticMarkup(
      createElement(TeamStateNotice, {
        title: TEAM_ERROR_COPY.title,
        body: TEAM_ERROR_COPY.body,
        action: createElement('button', { type: 'button', 'data-testid': 'team-try-again' }, 'Try again'),
      }),
    );
    assert.match(error, /We couldn(?:'|&#x27;)t load your team/);
    assert.match(error, /Try again in a moment/);
    assert.match(error, /data-testid="team-try-again"/);
    assert.match(error, /Try again/);
    assert.match(TEAM_STALE_COPY.title, /Team list is out of date/);
    assert.equal(clientTeamEmptyBody('Client Admin'), 'Teammates you invite will show here.');
    assert.equal(clientTeamEmptyBody('Client Member'), 'Your Client Admin can invite teammates.');
    assert.equal(clientTeamEmptyBody(null), 'Your Client Admin can invite teammates.');
    assert.match(TEAM_SEND_HINT, /Invites are coming soon/);

    const row = renderToStaticMarkup(
      createElement(TeamPersonIdentity, {
        name: 'Alexandria Montgomery-Featherstonehaugh',
        email: 'alexandria.montgomery-featherstonehaugh@northwind.example',
        role: 'Client Member',
        status: 'Active',
      }),
    );
    assert.match(row, /overflow-wrap:anywhere/);
    assert.match(row, /Alexandria Montgomery-Featherstonehaugh/);
    assert.match(row, /alexandria\.montgomery-featherstonehaugh@northwind\.example/);
    assert.equal(row.includes('· Client Member'), false);
    assert.match(row, /data-testid="team-person-role"[^>]*>Client Member</);
    assert.match(row, /data-testid="team-person-role"[^>]*style="[^"]*width:140px/);
    assert.match(row, /data-testid="team-person-status"[^>]*style="[^"]*width:120px/);
    assert.match(row, /data-testid="team-person-actions"[^>]*style="[^"]*width:220px/);
    assert.match(row, /text-align:left/);
    assert.match(row, />AM</);
    assert.match(row, />Active</);

    const pending = renderToStaticMarkup(
      createElement(TeamPersonIdentity, {
        name: 'Sam North',
        email: 'sam@northwind.example',
        role: 'Client Member',
        status: 'Invite pending',
        pending: true,
      }),
    );
    assert.match(pending, /color:var\(--warning\)/);
    assert.match(pending, /Invite pending/);
  });
});

function RosterProbe({
  fixtures,
  people,
}: {
  fixtures: boolean;
  people: Array<{ id: string; name: string }>;
}) {
  const [screen] = useTeamScreen(fixtures);
  const shown = peopleForTeamScreen(screen, people);
  if (screen === 'error') return createElement('p', null, "We couldn't load your team");
  return createElement(
    'ul',
    { 'data-testid': 'live-roster' },
    shown.map((person) => createElement('li', { key: person.id }, person.name)),
  );
}

type DomNode = {
  nodeType: number;
  nodeName: string;
  tagName?: string;
  childNodes: DomNode[];
  children: DomNode[];
  style: Record<string, string>;
  attributes: Record<string, string>;
  parentNode: DomNode | null;
  ownerDocument: DomDocument | null;
  textContent: string;
  namespaceURI: string;
  nextSibling: DomNode | null;
  setAttribute: (name: string, value: string) => void;
  getAttribute: (name: string) => string | null;
  removeAttribute: (name: string) => void;
  appendChild: (child: DomNode) => DomNode;
  removeChild: (child: DomNode) => DomNode;
  insertBefore: (child: DomNode, before: DomNode | null) => DomNode;
  addEventListener: () => void;
  removeEventListener: () => void;
};

type DomDocument = DomNode & {
  createElement: (tag: string) => DomNode;
  createElementNS: (ns: string, tag: string) => DomNode;
  createTextNode: (text: string) => DomNode;
  body: DomNode;
};

function textOf(node: { childNodes?: DomNode[]; textContent?: string }): string {
  if (node.childNodes && node.childNodes.length > 0) return node.childNodes.map((child) => textOf(child)).join('');
  return node.textContent ?? '';
}

function installTestDom(): DomDocument {
  const existing = (globalThis as unknown as { document?: DomDocument }).document;
  if (existing?.createElement) return existing;

  function linkSiblings(parent: DomNode) {
    parent.childNodes.forEach((child, index) => {
      child.nextSibling = parent.childNodes[index + 1] ?? null;
    });
  }

  function createNode(tag: string): DomNode {
    const node: DomNode = {
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

  const document = createNode('#document') as DomDocument;
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
  document.body = document.createElement('body');
  const html = document.createElement('html');
  html.appendChild(document.body);
  const view = {
    document,
    location: { search: '' },
    HTMLElement: function HTMLElement() {},
    HTMLIFrameElement: function HTMLIFrameElement() {},
    Element: function Element() {},
    Node: function Node() {},
    addEventListener() {},
    removeEventListener() {},
    requestAnimationFrame: (callback: () => void) => setTimeout(callback, 0),
    cancelAnimationFrame: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
  };
  (document as DomDocument & { defaultView: typeof view; documentElement: DomNode }).defaultView = view;
  (document as DomDocument & { documentElement: DomNode }).documentElement = html;
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

async function renderProbe(
  document: DomDocument,
  fixtures: boolean,
  people: Array<{ id: string; name: string }>,
): Promise<string> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  let root: Root | null = null;
  await act(async () => {
    root = createRoot(container as unknown as Element);
    root.render(createElement(RosterProbe, { fixtures, people }));
  });
  const text = textOf(container);
  await act(async () => {
    root?.unmount();
  });
  container.parentNode?.removeChild(container);
  return text;
}

