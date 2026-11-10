import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { dockLabelClassName, dockTabClassName, dockTabStyle } from './dockTabChrome';

Object.assign(globalThis, { React });

const css = readFileSync(new URL('../../styles/global.css', import.meta.url), 'utf8');
const dock = readFileSync(new URL('./PortalDock.tsx', import.meta.url), 'utf8');

function labelClass(active: boolean): string {
  return dockLabelClassName(active);
}

describe('dock active label', () => {
  it('shows the label below 1024 only on the active tab', () => {
    const active = labelClass(true);
    const idle = labelClass(false);
    assert.equal(/(?:^|\s)hidden(?:\s|$)/.test(active), false);
    assert.match(active, /text-\[11px\]/);
    assert.match(active, /tracking-\[1\.1px\]/);
    assert.match(active, /lg:text-\[13px\]/);
    assert.match(idle, /(?:^|\s)hidden(?:\s|$)/);
    assert.match(idle, /lg:inline/);
    assert.equal(idle.includes('text-[11px]'), false);

    const activeHtml = renderToStaticMarkup(
      createElement(
        'button',
        { className: dockTabClassName(true), style: dockTabStyle(true) },
        createElement('span', { className: active }, 'Dashboard'),
      ),
    );
    assert.match(activeHtml, />Dashboard</);
    assert.equal(activeHtml.includes('hidden'), false);
    assert.match(activeHtml, /dock-tab-active/);
    assert.equal(dockTabClassName(true).includes('size-8'), false);
    assert.match(dockTabClassName(false), /size-8/);

    assert.match(dockTabClassName(true), /h-\[35px\]/);
    assert.match(dockTabClassName(true), /lg:h-\[46px\]/);
    assert.match(dockTabClassName(false), /lg:h-11/);
    assert.match(dock, /h-\[45px\]/);
    assert.match(dock, /lg:h-14/);
    assert.match(dockLabelClassName(true, 'resources'), /dock-label-resources/);
    assert.match(dockLabelClassName(false, 'account'), /dock-label-account/);
    assert.match(css, /\.dock-label-resources\s*\{[^}]*letter-spacing:\s*0\.97px;/);
    assert.match(css, /\.dock-label-account\s*\{[^}]*letter-spacing:\s*0\.88px;/);
    assert.match(dock, /backgroundColor: 'currentColor'/);
    assert.match(dock, /stroke="currentColor"/);

    assert.match(dock, /dockLabelClassName\(isActive, value\)/);
    assert.match(dock, /dockTabClassName\(isActive\)/);
    assert.match(dock, /dockTabStyle\(isActive\)/);
  });
});

describe('dock light pill', () => {
  it('keeps a paper fill and an ink icon in light mode, and the dark token pair otherwise', () => {
    const active = dockTabStyle(true);
    const idle = dockTabStyle(false);
    assert.equal(active.background, 'var(--paper)');
    assert.equal(active.color, 'var(--ink)');
    assert.equal(active.border, '1px solid var(--paper)');
    assert.equal(idle.background, 'transparent');
    assert.equal(idle.color, 'var(--muted)');

    assert.equal(css.includes('--dock-active-paper'), false);
    assert.equal(css.includes('--dock-active-ink'), false);
    assert.equal(css.includes('.dock-tab-icon-active'), false);
    assert.match(
      css,
      /\[data-testid='portal-dock'\] button:focus-visible[\s\S]*?outline:\s*2px solid var\(--fg\);\s*outline-offset:\s*2px;/,
    );
    assert.equal(css.includes('invert('), false);
  });
});
