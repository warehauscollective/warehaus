import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import React, { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PhoneScrollInset, PortalTilePane, PortalWorkspaceFrame } from './PortalWorkspace';
import { tabPanelShellLayout } from './tabPanelShellLayout';

Object.assign(globalThis, { React });

function markup(node: ReactNode): string {
  return renderToStaticMarkup(node);
}

function tag(html: string, testId: string): string {
  const found = html.match(new RegExp(`<[^>]*data-testid="${testId}"[^>]*>`));
  assert.ok(found, testId);
  return found[0];
}

describe('phone shell inset', () => {
  it('puts the 24px on the title header of a titled page and on the scroller when the header is hidden', () => {
    for (const project of [false, true]) {
      const shell = tabPanelShellLayout(project).shellClassName.replace(/lg:[^\s]+/g, ' ');
      assert.match(shell, /(?:^|\s)gap-0(?:\s|$)/);
      assert.equal(tabPanelShellLayout(project).contentClassName.includes('pt-6'), false);
    }

    const titled = markup(
      createElement(
        PortalWorkspaceFrame,
        { header: createElement('h1', null, 'Dashboard') },
        createElement(PortalTilePane, null, 'cards'),
      ),
    );
    const title = tag(titled, 'workspace-title');
    const body = tag(titled, 'workspace-body');
    const scroller = titled.match(/<div[^>]*data-page-scroll=""[^>]*>/)?.[0] ?? '';
    assert.match(title, /max-lg:pt-6/);
    assert.match(title, /lg:pt-\[var\(--s-5\)\]/);
    assert.equal(title.includes('padding-top'), false);
    assert.match(body, /(?:^|\s)pt-4(?:\s|")/);
    assert.equal(body.includes('pt-6'), false);
    assert.equal(scroller.includes('pt-6'), false);
    assert.ok(titled.indexOf('max-lg:pt-6') < titled.indexOf('data-testid="workspace-body"'));

    const openProject = markup(
      createElement(
        PortalWorkspaceFrame,
        { hideHeader: true },
        createElement(
          'div',
          { 'data-page-scroll': '', 'data-testid': 'project-detail' },
          createElement(PhoneScrollInset, null, 'roadmap'),
        ),
      ),
    );
    assert.equal(openProject.includes('workspace-title'), false);
    const openBody = tag(openProject, 'workspace-body');
    assert.equal(openBody.includes('pt-4'), false);
    assert.equal(openBody.includes('pt-6'), false);
    const detail = tag(openProject, 'project-detail');
    assert.equal(detail.includes('pt-6'), false);
    const insetAt = openProject.indexOf('max-lg:pt-6');
    const scrollAt = openProject.indexOf('data-testid="project-detail"');
    assert.ok(scrollAt !== -1 && insetAt > scrollAt);
  });
});
