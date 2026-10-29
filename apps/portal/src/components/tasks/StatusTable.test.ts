import assert from 'node:assert/strict';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it } from 'node:test';
import type { PortalTask } from '@/lib/data/view-models';

Object.assign(globalThis, { React });
const { StatusTable } = await import('./StatusKanban');

const task: PortalTask = {
  id: 't-long',
  name: 'Quarterly seasonal menu photography, packaging and in-store signage rollout for all twelve Northwind Foods locations',
  status: 'In Progress',
  isDone: false,
  date: '2026-10-20',
  stage: 'Building',
  projectId: 'p-site',
  projectName: 'Northwind site',
  projectStatus: 'In Progress',
  projectEndDate: null,
};

describe('StatusTable task names', () => {
  it('wraps a long title in the name cell', () => {
    const html = renderToStaticMarkup(
      createElement(StatusTable, {
        tasks: [task],
        loading: false,
        staff: true,
        onOpen: () => {},
      }),
    );
    assert.match(html, new RegExp(task.name));
    assert.match(html, /overflow-wrap:anywhere/);
    assert.equal(html.includes('No items match these filters'), false);
  });
});
