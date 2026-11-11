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
    const phoneDock = css.slice(css.indexOf('@media (max-width: 767px)'));
    assert.match(phoneDock, /\[aria-selected='true'\]:has\(\.dock-label-account\)\s*\{[^}]*padding-inline:\s*10px;/);
    assert.equal(css.includes('padding-inline: 14px'), false);
    assert.match(dock, /backgroundColor: 'currentColor'/);
    assert.match(dock, /stroke="currentColor"/);

    assert.match(dock, /dockLabelClassName\(isActive, value\)/);
    assert.match(dock, /dockTabClassName\(isActive\)/);
    assert.match(dock, /dockTabStyle\(isActive\)/);
  });
});

function ruleBodies(source: string, selector: string): string[] {
  const bodies: string[] = [];
  let from = 0;
  while (from < source.length) {
    const at = source.indexOf(selector, from);
    if (at < 0) break;
    const before = source.slice(Math.max(0, at - 24), at);
    const rest = source.slice(at + selector.length);
    const opens = /^[ \t]*\{/.exec(rest);
    const lightPrefix = selector === '.ds-scope' && /:root\.light\s*$/.test(before);
    const nested = /[.#:[\w-]$/.test(before) && !/^\s*$/.test(before);
    if (opens && !lightPrefix && !nested) {
      const start = at + selector.length + opens[0].length;
      let depth = 1;
      let i = start;
      while (i < source.length && depth > 0) {
        if (source[i] === '{') depth += 1;
        else if (source[i] === '}') depth -= 1;
        i += 1;
      }
      bodies.push(source.slice(start, i - 1));
    }
    from = at + selector.length;
  }
  return bodies;
}

function declarations(body: string): Record<string, string> {
  const props: Record<string, string> = {};
  for (const match of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    props[match[1]] = match[2].trim();
  }
  return props;
}

function resolveVar(name: string, vars: Record<string, string>, depth = 0): string {
  const value = vars[name];
  assert.ok(value, name);
  const ref = /^var\((--[\w-]+)\)$/.exec(value);
  if (!ref) return value.toLowerCase();
  assert.ok(depth < 8, name);
  return resolveVar(ref[1], vars, depth + 1);
}

/** WCAG contrast. Light ink on the white track is the ~19.8:1 target. */
function contrast(foreground: string, background: string): number {
  const channel = (hex: string, shift: number) => {
    const s = ((parseInt(hex.slice(1), 16) >> shift) & 255) / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const lum = (hex: string) => 0.2126 * channel(hex, 16) + 0.7152 * channel(hex, 8) + 0.0722 * channel(hex, 0);
  const lighter = Math.max(lum(foreground), lum(background));
  const darker = Math.min(lum(foreground), lum(background));
  return (lighter + 0.05) / (darker + 0.05);
}

describe('dock active pill', () => {
  it('resolves the active pill to ink in light and paper in dark', () => {
    const active = dockTabStyle(true);
    const idle = dockTabStyle(false);
    assert.equal(active.background, 'var(--dock-pill-active-bg)');
    assert.equal(active.color, 'var(--dock-pill-active-fg)');
    assert.equal(active.border, undefined);
    assert.equal(idle.background, 'transparent');
    assert.equal(idle.color, 'var(--muted)');
    assert.equal(JSON.stringify(active).includes('--paper'), false);
    assert.equal(JSON.stringify(active).includes('--ink'), false);

    const brand = readFileSync(
      new URL('../../../../../packages/ui/src/styles/brand.css', import.meta.url),
      'utf8',
    );
    const dark = {
      ...declarations(ruleBodies(brand, '.ds-scope').join('\n')),
      ...declarations(ruleBodies(css, '.ds-scope').join('\n')),
    };
    const light = {
      ...dark,
      ...declarations(ruleBodies(brand, ':root.light .ds-scope').join('\n')),
    };
    assert.equal(dark['--dock-pill-active-bg'], 'var(--portal-fg)');
    assert.equal(dark['--dock-pill-active-fg'], 'var(--portal-bg)');
    assert.equal(dark['--portal-fg'], 'var(--fg)');
    assert.equal(dark['--portal-bg'], 'var(--bg)');

    const darkBg = resolveVar('--dock-pill-active-bg', dark);
    const darkFg = resolveVar('--dock-pill-active-fg', dark);
    const lightBg = resolveVar('--dock-pill-active-bg', light);
    const lightFg = resolveVar('--dock-pill-active-fg', light);
    assert.equal(darkBg, '#fdfdfe');
    assert.equal(darkFg, '#0a0a0b');
    assert.equal(lightBg, '#0a0a0b');
    assert.equal(lightFg, '#fdfdfe');
    assert.ok(contrast(lightBg, '#ffffff') > 19.5);
    assert.ok(contrast('#fdfdfe', '#ffffff') < 1.1);
    assert.equal(resolveVar('--dock-pill-active-bg', light), '#0a0a0b');

    assert.equal(css.includes('--dock-active-paper'), false);
    assert.equal(css.includes('--dock-active-ink'), false);
    assert.equal(css.includes('.dock-tab-icon-active'), false);
    assert.equal(css.includes('--dock-pill-active-bg: var(--paper)'), false);
    assert.match(
      css,
      /\[data-testid='portal-dock'\] button:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--dock-pill-active-bg\);\s*outline-offset:\s*2px;/,
    );
    assert.equal(css.includes('invert('), false);

    assert.match(css, /\.portal-dock-track\s*\{[^}]*gap:\s*4px;/);
    assert.match(
      css,
      /\[data-testid='portal-dock'\] \[role='tab'\]\s*\{[^}]*border:\s*1px solid transparent;/,
    );
    assert.match(
      css,
      /\[data-testid='portal-dock'\] \[role='tab'\]\[aria-selected='true'\]\s*\{[^}]*border-color:\s*var\(--dock-pill-active-bg\);/,
    );
    assert.match(css, /@media \(min-width:\s*1024px\)\s*\{[\s\S]*?\.portal-dock-track\s*\{[^}]*gap:\s*0;/);
    assert.match(
      css,
      /@media \(min-width:\s*1024px\)\s*\{[\s\S]*?\[data-testid='portal-dock'\] \[role='tab'\]\s*\{[^}]*border-width:\s*0;/,
    );
    assert.match(dock, /portal-dock-track/);
    assert.equal(dock.includes('lg:gap-0'), false);
    const track = dock.slice(dock.indexOf('role="tablist"'), dock.indexOf('dockTabs.map'));
    assert.equal(track.includes('gap-1'), false);
  });
});
