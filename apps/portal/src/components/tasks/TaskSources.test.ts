import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it } from 'node:test';
import { TASK_LINK_READ_CAP } from '@warehaus/portal-sync';
import { readSourceScreen, SOURCE_PANEL_LINKS } from './sourcePanelFixtures';

Object.assign(globalThis, { React });
const { TaskSourcesPanel } = await import('./TaskSources');
const { SourcesReview } = await import('./SourcesReview');

describe('task sources panel', () => {
  it('shows full kind labels, plain states, and a status pill on every row', () => {
    const html = renderToStaticMarkup(
      createElement(TaskSourcesPanel, { links: SOURCE_PANEL_LINKS, loading: false, truncated: true }),
    );
    assert.match(html, /data-testid="task-sources"/);
    assert.match(html, /SOURCES/);
    assert.match(html, /staff only/);
    assert.match(html, /class="ds-pill"/);
    assert.match(html, />Chat request</);
    assert.match(html, />Cursor PR</);
    assert.match(html, />Deploy</);
    assert.match(html, />Agent run</);
    assert.match(html, />Figma frame</);
    assert.match(html, />Doc</);
    assert.match(html, />Branch</);
    assert.match(html, />Open</);
    assert.match(html, />Merged</);
    assert.match(html, />Deployed</);
    assert.match(html, />No status</);
    assert.match(html, />Failed</);
    assert.match(html, />In progress</);
    assert.equal(html.includes('>In Progress<'), false);
    assert.match(html, /Added by Staff/);
    assert.match(html, /Added by GitHub/);
    assert.match(html, /Added by Vercel/);
    assert.match(html, /Added by Cursor/);
    assert.match(html, /Added by Notion/);
    assert.equal(html.includes('>Ready<'), false);
    assert.equal(html.includes('>Notion<'), false);
    assert.equal(html.includes('>Claude Bot<'), false);
    assert.equal(html.includes('Added by Claude Bot'), false);
    assert.match(html, /Added by Claude/);
    const names = [...html.matchAll(/<a\b[^>]*aria-label="([^"]*)"/g)].map((match) => match[1] ?? '');
    assert.equal(names.length, SOURCE_PANEL_LINKS.length - 1);
    for (const name of names) assert.match(name, / \(opens in a new tab\)$/);
    assert.ok(names.includes('Portal API (opens in a new tab)'));
    assert.ok(names.includes('Homepage copy questions (opens in a new tab)'));
    assert.equal(html.includes('aria-label="cursor/sources-panel-punch-list'), false);
    assert.match(html, /task-source-link/);
    assert.match(html, /lucide-external-link/);
    assert.match(html, /Quarterly seasonal menu photography/);
    assert.match(html, /Showing the first 50/);
    assert.match(html, /cursor\/sources-panel-punch-list/);
    assert.equal(html.includes('href="cursor/sources-panel-punch-list"'), false);
    assert.equal(html.includes('>github-webhook<'), false);
    assert.equal(html.includes('>in_progress<'), false);
    assert.equal(html.includes('<button'), false);
    assert.equal(html.includes('javascript:'), false);
    assert.equal((html.match(/data-testid="task-source-row"/g) ?? []).length, SOURCE_PANEL_LINKS.length);
    assert.equal((html.match(/class="ds-pill(?: task-source-warn)?"/g) ?? []).length, SOURCE_PANEL_LINKS.length * 2);
    assert.equal((html.match(/task-source-warn/g) ?? []).length, 2);
  });

  it('keeps an empty list read-only', () => {
    const html = renderToStaticMarkup(
      createElement(TaskSourcesPanel, { links: [], loading: false, truncated: true }),
    );
    assert.match(html, /No sources yet/);
    assert.match(html, /Showing the first 50/);
    assert.equal(TASK_LINK_READ_CAP, 50);
  });

  it('shows an error instead of an empty list when the query fails', () => {
    const html = renderToStaticMarkup(
      createElement(TaskSourcesPanel, { links: [], loading: false, truncated: false, error: 'unavailable' }),
    );
    assert.match(html, /We could not load sources/);
    assert.equal(html.includes('No sources yet'), false);
  });

  it('shows the loading line without an empty or error message', () => {
    const html = renderToStaticMarkup(
      createElement(TaskSourcesPanel, { links: [], loading: true, truncated: false }),
    );
    assert.match(html, /Loading sources/);
    assert.equal(html.includes('No sources yet'), false);
    assert.equal(html.includes('We could not load sources'), false);
  });

  it('is mounted only for staff, with a section gap before the heading', () => {
    const modal = readFileSync(new URL('./TaskDetailModal.tsx', import.meta.url), 'utf8');
    assert.equal(modal.match(/<TaskSources/g)?.length, 1);
    assert.match(modal, /\{staff \? \([\s\S]*className="task-sources-section"[\s\S]*<TaskSources/);
    assert.match(modal, /marginTop: phone \? 'calc\(var\(--s-6\) - 24px\)'/);
    const css = readFileSync(new URL('../../styles/global.css', import.meta.url), 'utf8');
    assert.match(css, /\.task-sources-section\s*\{\s*margin-top:\s*var\(--s-6\);/);
    assert.match(css, /\.ds-scope a\.task-source-link\s*\{[^}]*color:\s*var\(--fg\)/);
    assert.match(css, /\.ds-scope a\.task-source-link\s*\{[^}]*text-decoration:\s*underline/);
    assert.equal(/\.ds-scope a\.task-source-link\s*\{[^}]*var\(--accent\)/.test(css), false);
    assert.equal(/\.ds-scope a\.task-source-link\s*\{[^}]*var\(--info\)/.test(css), false);
    assert.match(css, /\.ds-scope a\.task-source-link:hover[\s\S]*text-decoration:\s*underline/);
    assert.match(css, /\.ds-scope \.task-source-warn\s*\{[^}]*color:\s*var\(--warn\)/);
    assert.match(css, /:root\.light \.ds-scope \.task-source-warn\s*\{[^}]*color:\s*var\(--warning\)/);
    const tasks = readFileSync(new URL('../../../convex/tasks.ts', import.meta.url), 'utf8');
    const start = tasks.indexOf('export const linksForStaff');
    const body = tasks.slice(start, tasks.indexOf('export const setResources'));
    assert.match(body, /adminQuery/);
    assert.match(body, /withIndex\('by_taskId'/);
    assert.match(body, /\.take\(TASK_LINK_READ_CAP \+ 1\)/);
    assert.equal(body.includes('.collect('), false);
    assert.equal(tasks.split("query('taskLinks')").length - 1, 1);
  });

  it('reads fixture screens without treating a live session as fixture data', () => {
    assert.equal(readSourceScreen(null, true), null);
    assert.equal(readSourceScreen('links', false), null);
    assert.equal(readSourceScreen('links', true), 'links');
    assert.equal(readSourceScreen('nope', true), null);
  });

  it('keeps the client review free of the sources panel', () => {
    const client = renderToStaticMarkup(
      createElement(SourcesReview, { audience: 'client', screen: 'links' }),
    );
    assert.equal(client.includes('SOURCES'), false);
    assert.equal(client.includes('task-sources'), false);
    assert.match(client, /data-audience="client"/);
    assert.match(client, /In Progress/);
    const staff = renderToStaticMarkup(
      createElement(SourcesReview, { audience: 'staff', screen: 'links' }),
    );
    assert.match(staff, /task-sources-section/);
    assert.match(staff, />Source</);
    assert.match(staff, /SOURCES/);
    assert.match(staff, /No status/);
  });
});
