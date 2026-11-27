import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it } from 'node:test';
import { tokens } from '@warehaus/tokens';

Object.assign(globalThis, { React });
const { Icon, ICON_NAMES, ICON_SIZES, ICON_COLORS, BOLD_ICON_NAMES } = await import('./Icon');

const render = (props: Parameters<typeof Icon>[0]) => renderToStaticMarkup(createElement(Icon, props));

/** The 57 Linear names in Figma `Atom/Icon` (281:7631), from docs/design/iconsax-icon-map.md. */
const FIGMA_SET = [
  'Activity', 'Add', 'ArrowDown2', 'ArrowLeft2', 'ArrowRight2', 'ArrowUp2', 'BookSaved', 'Brush2', 'Building',
  'Buildings2', 'Calendar', 'Category', 'Check', 'Clock', 'CloseCircle', 'Cloud', 'Code', 'Data', 'DocumentText',
  'Edit2', 'Element3', 'ExportSquare', 'Eye', 'EyeSlash', 'Figma', 'Filter', 'Global', 'Gps', 'HamburgerMenu',
  'InfoCircle', 'Kanban', 'Layer', 'Link', 'Lock', 'Logout', 'Microphone', 'Monitor', 'Moon', 'More', 'Notification',
  'People', 'Play', 'Profile', 'Profile2User', 'RecordCircle', 'Refresh', 'SearchNormal', 'Setting2', 'Shield',
  'ShieldTick', 'Sms', 'Sun1', 'Task', 'TickCircle', 'UserAdd', 'Warning2', 'X',
];

describe('Icon', () => {
  it('holds exactly the Figma Atom/Icon set', () => {
    assert.equal(FIGMA_SET.length, 57);
    assert.deepEqual([...ICON_NAMES], [...FIGMA_SET].sort());
  });

  it('draws every name as one svg on the 24 grid', () => {
    for (const name of ICON_NAMES) {
      const html = render({ name });
      assert.match(html, /^<svg[^>]* viewBox="0 0 24 24"/, name);
      assert.match(html, new RegExp(`data-icon="${name}"`), name);
      assert.match(html, /<(path|circle|rect|line|polyline)/, `${name} has a drawing`);
      assert.equal(html.match(/<svg/g)?.length, 1, name);
    }
  });

  it('takes its size from the icon tokens, 16 by default', () => {
    assert.deepEqual(ICON_SIZES, { '2xs': 10, xs: 12, sm: 14, md: 16, lg: 20, xl: 28 });
    for (const [size, px] of Object.entries(ICON_SIZES)) {
      assert.equal(tokens.icon[size as keyof typeof ICON_SIZES], `${px}px`);
      for (const name of ['Lock', 'Check'] as const) {
        const html = render({ name, size: size as keyof typeof ICON_SIZES });
        assert.match(html, new RegExp(`width="${px}"`), `${name} ${size}`);
        assert.match(html, new RegExp(`height="${px}"`), `${name} ${size}`);
      }
    }
    assert.match(render({ name: 'Lock' }), /width="16"[^>]*height="16"|height="16"[^>]*width="16"/);
  });

  it('takes its colour from a theme token, the text colour by default', () => {
    assert.match(render({ name: 'Lock' }), /stroke="currentColor"/);
    assert.match(render({ name: 'Check' }), /stroke="currentColor"/);
    for (const [color, value] of Object.entries(ICON_COLORS)) {
      for (const name of ['Lock', 'X'] as const) {
        const html = render({ name, color: color as keyof typeof ICON_COLORS });
        assert.ok(html.includes(`stroke="${value}"`), `${name} ${color}`);
        assert.equal(/#[0-9a-f]{3,8}\b/i.test(html), false, `${name} ${color} has no fixed colour`);
      }
    }
    assert.equal(ICON_COLORS.muted, 'var(--muted)');
    assert.equal(ICON_COLORS.warning, 'var(--portal-warning)');
  });

  it('draws Linear as a 1.5 stroke with no fill, and the Lucide tick and X to match', () => {
    const lock = render({ name: 'Lock' });
    assert.match(lock, /stroke-width="1.5"/);
    assert.match(lock, /^<svg[^>]* fill="none"/);
    assert.equal(/<path[^>]* fill="/.test(lock), false);
    for (const name of ['Check', 'X'] as const) {
      const html = render({ name });
      assert.match(html, /stroke-width="1.5"/, name);
      assert.match(html, /stroke-linecap="round"/, name);
    }
  });

  it('draws the five nav icons filled when Bold', () => {
    assert.deepEqual([...BOLD_ICON_NAMES].sort(), ['Activity', 'BookSaved', 'Element3', 'Kanban', 'Profile']);
    for (const name of BOLD_ICON_NAMES) {
      const bold = render({ name, variant: 'Bold', color: 'fg' });
      assert.ok(bold.includes('fill="var(--fg)"'), name);
      assert.equal(bold.includes('stroke-width'), false, name);
      assert.notEqual(bold, render({ name, color: 'fg' }), name);
    }
    // @ts-expect-error Bold is not offered for any other icon.
    const notNav: Parameters<typeof Icon>[0] = { name: 'Lock', variant: 'Bold' };
    assert.equal(notNav.name, 'Lock');
  });

  it('is hidden from screen readers unless it has a label', () => {
    for (const name of ['Lock', 'Check'] as const) {
      const hidden = render({ name });
      assert.match(hidden, /aria-hidden="true"/, name);
      assert.equal(hidden.includes('role='), false, name);

      const named = render({ name, label: 'Staff only' });
      assert.match(named, /role="img"/, name);
      assert.match(named, /aria-label="Staff only"/, name);
      assert.equal(named.includes('aria-hidden'), false, name);
    }
  });

  it('passes class, style and data attributes to the svg', () => {
    for (const name of ['Lock', 'Check'] as const) {
      const html = render({ name, className: 'dock-tab-icon', style: { flexShrink: 0 }, 'data-testid': 'x' } as never);
      assert.match(html, /class="[^"]*dock-tab-icon/, name);
      assert.match(html, /flex-shrink:0/, name);
      assert.match(html, /data-testid="x"/, name);
    }
  });

  it('is the only file that imports an icon package', () => {
    const portal = fileURLToPath(new URL('../../..', import.meta.url));
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) return [];
        const path = join(dir, entry.name);
        if (entry.isDirectory()) return walk(path);
        return /\.(ts|tsx|mjs)$/.test(entry.name) ? [path] : [];
      });
    const sources = ['src', 'app'].flatMap((dir) => walk(join(portal, dir)));
    for (const pkg of ['iconsax-reactjs', 'lucide-react']) {
      const importers = sources
        .filter((path) => new RegExp(`from\\s+['"]${pkg}`).test(readFileSync(path, 'utf8')))
        .map((path) => relative(portal, path));
      assert.deepEqual(importers, ['src/components/ui/Icon.tsx'], pkg);
    }
  });

  it('leaves only state marks and the logo as files in public/icons', () => {
    const icons = fileURLToPath(new URL('../../../public/icons', import.meta.url));
    assert.deepEqual(readdirSync(icons).sort(), [
      'activity-published-dot.svg',
      'docs-dot-off.svg',
      'docs-dot-on.svg',
      'item-stage.svg',
      'task-check-open.svg',
      'task-check.svg',
      'task-stage-shipped.svg',
      'task-stage.svg',
      'wordmark-ink.png',
      'wordmark.svg',
    ]);
  });
});
