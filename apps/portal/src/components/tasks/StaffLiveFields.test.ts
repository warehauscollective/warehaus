import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it } from 'node:test';

Object.assign(globalThis, { React });
const { StaffLiveFields, liveFieldText } = await import('./StaffLiveFields');

describe('staff live task fields', () => {
  it('shows estimate, priority, source, and the publish chip', () => {
    const html = renderToStaticMarkup(
      createElement(StaffLiveFields, {
        estimate: '3 days',
        priority: 'High',
        source: 'notion',
        published: true,
        done: false,
      }),
    );
    assert.match(html, /data-testid="task-estimate"[\s\S]*3 days/);
    assert.match(html, /data-testid="task-priority"[\s\S]*High/);
    assert.match(html, /data-testid="task-source"[\s\S]*notion/);
    assert.match(html, /data-testid="task-publish"[\s\S]*Published/);
    assert.equal(html.includes('task-done-mark'), false);
    assert.equal(html.includes('Not published'), false);
  });

  it('keeps an empty property visible and marks an unpublished done task', () => {
    assert.equal(liveFieldText('  '), '—');
    assert.equal(liveFieldText(null), '—');
    const html = renderToStaticMarkup(
      createElement(StaffLiveFields, {
        estimate: ' ',
        priority: null,
        source: undefined,
        published: false,
        done: true,
      }),
    );
    assert.equal(html.match(/—/g)?.length, 3);
    assert.match(html, /Not published/);
    assert.match(html, /data-testid="task-done-mark"[\s\S]*Done/);
  });

  it('omits the publish chip when the flag is missing', () => {
    const html = renderToStaticMarkup(createElement(StaffLiveFields, { estimate: '1d' }));
    assert.equal(html.includes('task-publish'), false);
    assert.equal(html.includes('Published'), false);
  });

  it('is mounted only for staff on the task detail', () => {
    const source = readFileSync(new URL('./TaskDetailModal.tsx', import.meta.url), 'utf8');
    assert.match(source, /\{staff \? \(\s*<StaffLiveFields/);
    assert.equal(source.includes('api.tasks.updateEstimate'), false);
  });
});
