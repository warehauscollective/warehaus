import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it } from 'node:test';
import { TASK_LINK_READ_CAP } from '@warehaus/portal-sync';

Object.assign(globalThis, { React });
const { TaskSourcesPanel } = await import('./TaskSources');

const links = [
  {
    id: 'link-pr',
    kind: 'PR',
    url: 'https://github.com/warehauscollective/warehaus/pull/12',
    title: 'Portal API',
    addedBy: 'github',
    createdAt: 1,
    state: 'merged',
  },
  {
    id: 'link-deploy',
    kind: 'deploy',
    url: 'https://warehaus-portal.vercel.app',
    title: null,
    addedBy: 'vercel',
    createdAt: 2,
    state: 'ready',
  },
  {
    id: 'link-agent',
    kind: 'agent',
    url: 'https://cursor.com/agents/bc-example',
    title: 'Cursor agent',
    addedBy: 'cursor',
    createdAt: 3,
    state: null,
  },
  {
    id: 'link-figma',
    kind: 'Figma frame',
    url: 'https://www.figma.com/design/abc',
    title: 'Task detail',
    addedBy: 'notion',
    createdAt: 4,
    state: null,
  },
];

describe('task sources panel', () => {
  it('shows kind and state chips for staff links', () => {
    const html = renderToStaticMarkup(
      createElement(TaskSourcesPanel, { links, loading: false, truncated: false }),
    );
    assert.match(html, /data-testid="task-sources"/);
    assert.match(html, /SOURCES/);
    assert.match(html, /staff only/);
    assert.match(html, />PR</);
    assert.match(html, />merged</);
    assert.match(html, />Deploy</);
    assert.match(html, />ready</);
    assert.match(html, />Agent</);
    assert.match(html, /https:\/\/cursor.com\/agents\/bc-example/);
    assert.match(html, />Figma</);
    assert.match(html, /Portal API/);
    assert.equal(html.includes('<button'), false);
    assert.equal(html.includes('javascript:'), false);
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

  it('is mounted only for staff on the task detail', () => {
    const modal = readFileSync(new URL('./TaskDetailModal.tsx', import.meta.url), 'utf8');
    assert.equal(modal.match(/<TaskSources/g)?.length, 1);
    assert.match(modal, /\{staff \? \(\s*<div style=\{\{ order: phone \? 4 : undefined \}\}>\s*<TaskSources/);
    const tasks = readFileSync(new URL('../../../convex/tasks.ts', import.meta.url), 'utf8');
    const start = tasks.indexOf('export const linksForStaff');
    const body = tasks.slice(start, tasks.indexOf('export const setResources'));
    assert.match(body, /adminQuery/);
    assert.match(body, /withIndex\('by_taskId'/);
    assert.match(body, /\.take\(TASK_LINK_READ_CAP \+ 1\)/);
    assert.equal(body.includes('.collect('), false);
    assert.equal(tasks.split("query('taskLinks')").length - 1, 1);
  });
});
