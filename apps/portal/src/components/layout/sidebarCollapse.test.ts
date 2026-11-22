import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  SIDEBAR_COLLAPSED_PX,
  SIDEBAR_EXPANDED_PX,
  SIDEBAR_USER_KEY,
  readBootSidebarMode,
  readSidebarMode,
  sidebarBootScript,
  sidebarCollapseApplies,
  sidebarCollapseKey,
  sidebarRailWidth,
  writeSidebarMode,
  type SidebarStore,
} from './sidebarCollapse';

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

const sidebarSource = readFileSync(new URL('./PortalSidebar.tsx', import.meta.url), 'utf8');
const shellSource = readFileSync(new URL('./tabPanelShellLayout.ts', import.meta.url), 'utf8');
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
    assert.match(layoutSource, /sidebarBootScript/);
    assert.match(layoutSource, /<head>/);
  });
});

describe('sidebar collapse reflow', () => {
  it('narrows the in-flow rail from 1024px up and leaves narrower viewports at 244', () => {
    assert.equal(sidebarCollapseApplies(1023), false);
    assert.equal(sidebarCollapseApplies(390), false);
    assert.equal(sidebarCollapseApplies(1024), true);
    assert.equal(sidebarCollapseApplies(1440), true);
    assert.equal(sidebarRailWidth('collapsed', 1440), SIDEBAR_COLLAPSED_PX);
    assert.equal(sidebarRailWidth('expanded', 1440), SIDEBAR_EXPANDED_PX);
    assert.equal(sidebarRailWidth('collapsed', 1024), 72);
    assert.equal(sidebarRailWidth('collapsed', 1023), 244);
    assert.equal(sidebarRailWidth('collapsed', 390), 244);
    assert.equal(sidebarRailWidth('expanded', 390), 244);
  });

  it('changes width in the page flow instead of drawing over the content', () => {
    assert.match(shellSource, /lg:flex-row/);
    assert.match(sidebarSource, /data-testid="portal-sidebar"/);
    assert.match(sidebarSource, /shrink-0/);
    assert.match(sidebarSource, /lg:flex/);
    assert.equal(sidebarSource.includes('fixed'), false);
    assert.equal(sidebarSource.includes('absolute'), false);
    assert.equal(sidebarSource.includes('drawer'), false);
    assert.match(
      css,
      new RegExp(
        `@media \\(min-width: 1024px\\) \\{[\\s\\S]*?html\\[data-sidebar='collapsed'\\] \\[data-testid='portal-sidebar'\\] \\{\\s*width: ${SIDEBAR_COLLAPSED_PX}px;`,
      ),
    );
  });

  it('does not change the dock or the rail below 1024', () => {
    assert.match(sidebarSource, /hidden[\s\S]*lg:flex/);
    assert.equal(dockSource.includes('data-sidebar'), false);
    assert.equal(dockSource.includes('sidebarCollapse'), false);
    const collapsedRule = css.indexOf("html[data-sidebar='collapsed'] [data-testid='portal-sidebar']");
    const media = css.lastIndexOf('@media (min-width: 1024px)', collapsedRule);
    assert.ok(media !== -1 && media < collapsedRule);
    const between = css.slice(media, collapsedRule);
    assert.equal(between.includes('@media'), true);
    assert.equal(between.includes('}'), false);
  });
});

describe('sidebar toggle labels', () => {
  it('names the control Collapse sidebar and Expand sidebar', () => {
    assert.match(sidebarSource, /const COLLAPSE_LABEL = 'Collapse sidebar'/);
    assert.match(sidebarSource, /const EXPAND_LABEL = 'Expand sidebar'/);
    assert.match(sidebarSource, /aria-label=\{COLLAPSE_LABEL\}/);
    assert.match(sidebarSource, /aria-label=\{EXPAND_LABEL\}/);
    assert.equal((sidebarSource.match(/aria-current=/g) ?? []).length, 1);
    assert.match(sidebarSource, /activeSection === s\.key/);
  });

  it('keeps the sidebar keyboard ring on those buttons', () => {
    assert.match(
      css,
      /\[data-testid='portal-sidebar'\] button:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--fg\);\s*outline-offset:\s*2px;/,
    );
  });
});
