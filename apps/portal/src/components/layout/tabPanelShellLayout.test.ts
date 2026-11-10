import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { PHONE_SCROLL_INSET, tabPanelShellLayout } from './tabPanelShellLayout';

const srcRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function source(path: string): string {
  return readFileSync(join(srcRoot, path), 'utf8');
}

function phoneShell(className: string): string {
  return className.replace(/lg:[^\s]+/g, ' ').replace(/\s+/g, ' ');
}

function near(text: string, marker: string, span = 280): string {
  const at = text.indexOf(marker);
  assert.notEqual(at, -1, marker);
  return text.slice(Math.max(0, at - span), at + span);
}

describe('phone shell inset', () => {
  it('keeps the phone shell gap at 0 and puts the inset on every tab scroller', () => {
    for (const project of [false, true]) {
      const layout = tabPanelShellLayout(project);
      const shell = phoneShell(layout.shellClassName);
      assert.match(shell, /(?:^|\s)gap-0(?:\s|$)/);
      assert.doesNotMatch(shell, /(?:^|\s)gap-(?!0(?:\s|$))\S+/);
      assert.equal(layout.contentClassName.includes('pt-6'), false);
    }
    assert.equal(PHONE_SCROLL_INSET, 'max-lg:pt-6');

    const tile = source('layout/PortalWorkspace.tsx');
    assert.match(tile, /data-page-scroll=""/);
    assert.match(tile, /inset \? PHONE_SCROLL_INSET/);
    assert.equal(PHONE_SCROLL_INSET, 'max-lg:pt-6');

    const home = source('pages/PortalHomeContent.tsx');
    const activity = source('pages/ActivityContent.tsx');
    const account = source('pages/AccountContent.tsx');
    assert.match(home, /<PortalTilePane>/);
    assert.equal(home.includes('inset={false}'), false);
    assert.match(activity, /<PortalTilePane>/);
    assert.equal(activity.includes('inset={false}'), false);
    assert.match(account, /<PortalTilePane>/);

    const projects = source('pages/ProjectsContent.tsx');
    assert.match(near(projects, 'data-testid="projects-list"'), /PHONE_SCROLL_INSET/);
    assert.match(near(projects, 'data-testid="project-detail" data-page-scroll'), /PHONE_SCROLL_INSET/);
    assert.match(projects, /project-open-pane" inset=\{false\}/);
    assert.match(near(projects, 'data-testid="project-unavailable"'), /<PortalTilePane>/);
    assert.equal(near(projects, 'data-testid="project-unavailable"').includes('inset={false}'), false);

    const resources = source('pages/ResourcesContent.tsx');
    assert.match(near(resources, 'data-testid="resources-list"'), /PHONE_SCROLL_INSET/);
  });
});
