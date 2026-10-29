import assert from 'node:assert/strict';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it } from 'node:test';

Object.assign(globalThis, { React });
const { TaskBoard } = await import('./TaskBoard');

const rules = { actor: 'staff' as const, statuses: [], stages: [] };

function board(staff: boolean): string {
  return renderToStaticMarkup(
    createElement(TaskBoard, {
      tasks: [],
      staff,
      loading: false,
      rules: staff ? rules : { actor: 'client', statuses: [], stages: [] },
      onOpen: () => {},
      onMove: async () => ({ ok: true }),
      onQuickAdd: async () => ({ ok: true }),
    }),
  );
}

describe('empty task board', () => {
  it('renders no board footer line and keeps the per-column copy', () => {
    const staff = board(true);
    const client = board(false);
    assert.equal(staff.includes('No tasks yet. Add one from a column.'), false);
    assert.equal(client.includes('No tasks yet. Add one from a column.'), false);
    assert.match(staff, /No tasks/);
    assert.match(client, /Nothing here yet\./);
    const clientLines = client.match(/Nothing here yet\./g) ?? [];
    assert.ok(clientLines.length > 0);
    assert.equal(clientLines.length, (client.match(/data-testid="task-column"/g) ?? []).length);
  });
});
