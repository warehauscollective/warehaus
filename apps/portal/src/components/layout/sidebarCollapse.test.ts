import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React, { createElement, useState } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it } from 'node:test';
import { installTestDom, type DomNode, type EventLike } from '@/components/auth/testDom';
import { SidebarCollapseToggle } from './PortalSidebar';
import { SidebarUserHarness } from './sidebarUser';
import {
  SIDEBAR_CHIP_H_PX,
  SIDEBAR_CHIP_PX,
  SIDEBAR_EXPANDED_PX,
  SIDEBAR_USER_KEY,
  readBootSidebarMode,
  readSidebarMode,
  settleSidebarUser,
  sidebarBootScript,
  sidebarCollapseApplies,
  sidebarCollapseKey,
  sidebarRailWidth,
  writeSidebarMode,
  type SidebarStore,
} from './sidebarCollapse';

Object.assign(globalThis, { React });

function memoryStore(seed: Record<string, string> = {}): SidebarStore & { data: Record<string, string> } {
  const data = { ...seed };
  return {
    data,
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    setItem(key, value) {
      data[key] = value;
    },
  };
}

function stillInsideMedia(source: string, index: number): boolean {
  const media = source.lastIndexOf('@media (min-width: 1024px)', index);
  if (media === -1 || media > index) return false;
  const between = source.slice(media, index);
  const opens = (between.match(/\{/g) ?? []).length;
  const closes = (between.match(/\}/g) ?? []).length;
  return opens > closes;
}

const sidebarSource = readFileSync(new URL('./PortalSidebar.tsx', import.meta.url), 'utf8');
const userSource = readFileSync(new URL('./sidebarUser.tsx', import.meta.url), 'utf8');
const shellSource = readFileSync(new URL('./tabPanelShellLayout.ts', import.meta.url), 'utf8');
const chromeSource = readFileSync(new URL('./PortalShell.tsx', import.meta.url), 'utf8');
const dockSource = readFileSync(new URL('./PortalDock.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../../styles/global.css', import.meta.url), 'utf8');
const layoutSource = readFileSync(new URL('../../../app/layout.tsx', import.meta.url), 'utf8');

describe('sidebar collapse persistence', () => {
  it('keeps collapsed and expanded per user across a reload', () => {
    const store = memoryStore();
    assert.equal(readSidebarMode(store, 'user-a'), 'expanded');
    writeSidebarMode(store, 'user-a', 'collapsed');
    assert.equal(readSidebarMode(store, 'user-a'), 'collapsed');
    assert.equal(store.data[sidebarCollapseKey('user-a')], 'collapsed');
    assert.equal(readSidebarMode(store, 'user-b'), 'expanded');
    writeSidebarMode(store, 'user-b', 'expanded');
    assert.equal(readSidebarMode(store, 'user-a'), 'collapsed');
    assert.equal(readBootSidebarMode(store), 'expanded');
    writeSidebarMode(store, 'user-a', 'collapsed');
    assert.equal(readBootSidebarMode(memoryStore(store.data)), 'collapsed');
  });

  it('ignores a blank user and an unknown stored value', () => {
    const store = memoryStore({ [sidebarCollapseKey('user-a')]: 'wide' });
    assert.equal(readSidebarMode(store, 'user-a'), 'expanded');
    assert.equal(readSidebarMode(store, ''), 'expanded');
    assert.equal(readSidebarMode(store, null), 'expanded');
  });

  it('boots from the same localStorage keys before hydration', () => {
    assert.match(sidebarBootScript, new RegExp(SIDEBAR_USER_KEY));
    assert.match(sidebarBootScript, /dataset\.sidebar='collapsed'/);
    assert.match(sidebarBootScript, /--portal-rail-w/);
    assert.match(sidebarBootScript, /244px/);
    assert.match(sidebarBootScript, /0px/);
    assert.match(layoutSource, /sidebarBootScript/);
    assert.match(layoutSource, /<head>/);
    assert.match(sidebarSource, /addEventListener\('storage'/);
  });

  it('does not clear the selected section when the rail collapses', () => {
    const start = sidebarSource.indexOf('function toggle');
    const toggle = sidebarSource.slice(start, sidebarSource.indexOf('return (', start));
    assert.match(toggle, /commitMode/);
    assert.equal(toggle.includes('setSectionFor'), false);
    assert.match(sidebarSource, /activeSection === s\.key/);
    assert.equal((sidebarSource.match(/aria-current=/g) ?? []).length, 1);
  });

  it('keeps a pre-auth choice and does not boot the previous account', () => {
    const store = memoryStore({
      [SIDEBAR_USER_KEY]: 'user-a',
      [sidebarCollapseKey('user-a')]: 'collapsed',
    });
    assert.deepEqual(settleSidebarUser(store, null, true, null), { mode: null, persist: false, held: null });
    assert.deepEqual(settleSidebarUser(store, null, true, 'collapsed'), {
      mode: null,
      persist: false,
      held: 'collapsed',
    });
    assert.deepEqual(settleSidebarUser(store, 'user-b', false, 'collapsed'), {
      mode: 'collapsed',
      persist: true,
      held: null,
    });
    assert.deepEqual(settleSidebarUser(store, 'user-b', false, null), {
      mode: 'expanded',
      persist: true,
      held: null,
    });
    writeSidebarMode(store, 'user-a', 'collapsed');
    assert.deepEqual(settleSidebarUser(store, 'user-a', false, null).persist, false);
    assert.equal(settleSidebarUser(store, null, false, null).mode, 'expanded');
  });
});

describe('sidebar collapse reflow', () => {
  it('reserves 244 when expanded and nothing when collapsed, from 1024px up', () => {
    assert.equal(sidebarCollapseApplies(1023), false);
    assert.equal(sidebarCollapseApplies(390), false);
    assert.equal(sidebarCollapseApplies(1024), true);
    assert.equal(sidebarCollapseApplies(1440), true);
    assert.equal(sidebarRailWidth('collapsed', 1440), 0);
    assert.equal(sidebarRailWidth('expanded', 1440), SIDEBAR_EXPANDED_PX);
    assert.equal(sidebarRailWidth('collapsed', 1024), 0);
    assert.equal(sidebarRailWidth('expanded', 1024), 244);
    assert.equal(sidebarRailWidth('collapsed', 1023), 0);
    assert.equal(sidebarRailWidth('collapsed', 390), 0);
    assert.equal(sidebarRailWidth('expanded', 390), 0);
    assert.equal(SIDEBAR_CHIP_PX, 244);
    assert.equal(SIDEBAR_CHIP_H_PX, 58);
  });

  it('floats a 244px chip and lets the page fill in', () => {
    assert.match(shellSource, /lg:flex-row/);
    assert.match(sidebarSource, /data-testid="portal-sidebar"/);
    assert.match(sidebarSource, /shrink-0/);
    assert.match(sidebarSource, /lg:flex/);
    assert.equal(sidebarSource.includes('drawer'), false);
    assert.match(chromeSource, /dataset\.sidebar/);
    assert.match(chromeSource, /sidebarRailWidth/);
    assert.equal(chromeSource.includes("setProperty('--portal-rail-w', '0px')"), false);
    assert.match(
      css,
      /html\[data-sidebar='collapsed'\] \[data-testid='portal-sidebar'\] \{\s*position: fixed;\s*top: calc\(24px \+ var\(--shell-inset-top, 0px\)\);\s*left: 24px;/,
    );
    assert.match(css, /width: 244px;\s*min-width: 244px;\s*max-width: 244px;\s*height: 58px;/);
    assert.equal(css.includes('width: 72px'), false);
    assert.match(css, /z-index:\s*30;/);
    assert.match(
      css,
      /html\[data-sidebar='collapsed'\] \.portal-tab-shell \{\s*padding-top: 96px;\s*padding-left: 96px;\s*padding-right: 96px;/,
    );
  });

  it('does not change the dock or the page inset below 1024', () => {
    assert.match(sidebarSource, /hidden[\s\S]*lg:flex/);
    assert.equal(dockSource.includes('data-sidebar'), false);
    assert.equal(dockSource.includes('sidebarCollapse'), false);
    assert.match(dockSource, /left-1\/2/);
    assert.match(css, /\.portal-tab-shell\s*\{[^}]*padding-left:\s*16px;/);
    assert.match(css, /min-width:\s*768px\)\s*\{[^}]*\.portal-tab-shell\s*\{[^}]*padding-left:\s*24px;/);
    const collapsedRule = css.indexOf("html[data-sidebar='collapsed'] [data-testid='portal-sidebar']");
    const media = css.lastIndexOf('@media (min-width: 1024px)', collapsedRule);
    assert.ok(media !== -1 && media < collapsedRule);
    const between = css.slice(media, collapsedRule);
    assert.equal(between.includes('@media'), true);
    assert.equal(between.includes('}'), false);
    const pad = css.indexOf("html[data-sidebar='collapsed'] .portal-tab-shell");
    assert.ok(stillInsideMedia(css, pad));
  });
});

describe('sidebar toggle labels', () => {
  it('names the control Collapse sidebar and Expand sidebar', () => {
    assert.match(sidebarSource, /const COLLAPSE_LABEL = 'Collapse sidebar'/);
    assert.match(sidebarSource, /const EXPAND_LABEL = 'Expand sidebar'/);
    assert.match(sidebarSource, /aria-label=\{COLLAPSE_LABEL\}/);
    assert.match(sidebarSource, /aria-label=\{EXPAND_LABEL\}/);
    assert.match(sidebarSource, /role="tooltip"/);
    assert.match(sidebarSource, />\s*Expand sidebar\s*</);
    assert.match(sidebarSource, /aria-describedby=\{tipId\}/);
    assert.match(sidebarSource, /aria-expanded=\{true\}/);
    assert.match(sidebarSource, /aria-expanded=\{false\}/);
    assert.match(sidebarSource, /id=\{tipId\}/);
    assert.equal(sidebarSource.includes('usePortalAuth'), false);
    assert.match(userSource, /authClient\.useSession/);
    assert.equal(userSource.includes('usePortalAuth'), false);
    assert.match(chromeSource, /SidebarUserProvider/);
  });

  it('shows the expand tooltip on hover and focus, with the toggle ring', () => {
    assert.match(css, /\.sidebar-toggle\s*\{[^}]*width:\s*32px;\s*height:\s*32px;/);
    assert.match(css, /\.sidebar-toggle:hover\s*\{[^}]*border-color:\s*var\(--border\);/);
    assert.match(
      css,
      /\[data-testid='portal-sidebar'\] \.sidebar-toggle:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--info\);\s*outline-offset:\s*2px;/,
    );
    assert.match(css, /\.sidebar-chev\s*\{[^}]*transform:\s*rotate\(90deg\)/);
    assert.match(
      css,
      /\.sidebar-expand-tip\s*\{[^}]*top:\s*50%;\s*right:\s*auto;\s*left:\s*calc\(100% \+ 8px\);\s*transform:\s*translateY\(-50%\);/,
    );
    assert.match(css, /html\[data-sidebar='collapsed'\] \[data-testid='portal-sidebar'\] \.sidebar-header \{[^}]*padding:\s*0 12px;/);
    assert.match(css, /html\[data-sidebar='collapsed'\] \[data-testid='workspace-title'\] \{\s*padding-top:\s*0;/);
    assert.match(css, /\.sidebar-expand-tip\s*\{[^}]*border:\s*1px solid var\(--border\);[^}]*border-radius:\s*12px;/);
    assert.match(css, /\.sidebar-expand-tip\s*\{[^}]*background:\s*var\(--surface\);[^}]*font-size:\s*13px;/);
    assert.match(css, /:has\(\.sidebar-expand:hover\) \.sidebar-expand-tip/);
    assert.match(css, /:has\(\.sidebar-expand:focus-visible\) \.sidebar-expand-tip/);
    const hover = css.indexOf(':has(.sidebar-expand:hover) .sidebar-expand-tip');
    assert.ok(stillInsideMedia(css, hover));
    assert.match(
      css,
      /\[data-testid='portal-sidebar'\] button:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--fg\);\s*outline-offset:\s*2px;/,
    );
  });

  it('click flips the control from Collapse sidebar to Expand sidebar and writes localStorage', async () => {
    const document = installTestDom();
    const html = (document as DomNode & { documentElement?: DomNode }).documentElement ?? document.body;
    (html as DomNode & { dataset: Record<string, string> }).dataset = {};
    Object.assign(html.style, {
      setProperty: () => undefined,
      removeProperty: () => undefined,
    });
    const data: Record<string, string> = {};
    const localStorage = {
      getItem: (key: string) => (Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null),
      setItem: (key: string, value: string) => {
        data[key] = value;
      },
    };
    Object.assign(globalThis, { localStorage });
    Object.assign(globalThis.window as object, { localStorage });

    function Harness() {
      const [userId, setUserId] = useState<string | null>(null);
      return createElement(
        'div',
        null,
        // createElement's extra-child overload rejects a component whose props require children.
        // eslint-disable-next-line react/no-children-prop
        createElement(SidebarUserHarness, {
          userId,
          pending: userId === null,
          children: createElement(SidebarCollapseToggle, { tipId: 'sidebar-expand-tip-projects' }),
        }),
        createElement(
          'button',
          { type: 'button', 'aria-label': 'Resolve user', onClick: () => setUserId('user-a') },
          'Resolve user',
        ),
      );
    }

    const container = document.createElement('div');
    document.body.appendChild(container);
    let root: Root | null = null;
    await act(async () => {
      root = createRoot(container as unknown as Element);
      root.render(createElement(Harness));
    });

    const collapse = findButton(container, 'Collapse sidebar');
    const expand = findButton(container, 'Expand sidebar');
    assert.ok(collapse);
    assert.equal(collapse.getAttribute('aria-label'), 'Collapse sidebar');
    assert.equal(expand?.getAttribute('aria-label'), 'Expand sidebar');
    assert.equal(collapse.getAttribute('aria-expanded'), 'true');
    assert.equal(expand?.getAttribute('aria-expanded'), 'false');
    assert.equal(expand?.getAttribute('aria-describedby'), 'sidebar-expand-tip-projects');
    assert.equal(findById(container, 'sidebar-expand-tip-projects')?.getAttribute('role'), 'tooltip');

    await act(async () => {
      collapse.dispatchEvent(clickEvent());
    });
    assert.equal((html as DomNode & { dataset: Record<string, string> }).dataset.sidebar, 'collapsed');
    assert.equal(data[sidebarCollapseKey('user-a')], undefined);

    await act(async () => {
      findButton(container, 'Resolve user')?.dispatchEvent(clickEvent());
    });
    assert.equal(data[sidebarCollapseKey('user-a')], 'collapsed');
    assert.equal(data[SIDEBAR_USER_KEY], 'user-a');

    await act(async () => {
      findButton(container, 'Expand sidebar')?.dispatchEvent(clickEvent());
    });
    assert.equal(findButton(container, 'Expand sidebar')?.getAttribute('aria-label'), 'Expand sidebar');
    assert.equal(findButton(container, 'Collapse sidebar')?.getAttribute('aria-label'), 'Collapse sidebar');
    assert.equal(data[sidebarCollapseKey('user-a')], 'expanded');
    assert.equal((html as DomNode & { dataset: Record<string, string> }).dataset.sidebar, undefined);

    await act(async () => {
      root?.unmount();
    });
  });
});

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

function findButton(node: DomNode, label: string): (DomNode & { dispatchEvent: (event: EventLike) => boolean }) | null {
  if (node.nodeName === 'BUTTON' && node.getAttribute('aria-label') === label) {
    return node as DomNode & { dispatchEvent: (event: EventLike) => boolean };
  }
  for (const child of node.childNodes) {
    const found = findButton(child, label);
    if (found) return found;
  }
  return null;
}

function findById(node: DomNode, id: string): DomNode | null {
  if (node.getAttribute('id') === id) return node;
  for (const child of node.childNodes) {
    const found = findById(child, id);
    if (found) return found;
  }
  return null;
}
