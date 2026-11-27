import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FieldError } from '@/components/projects/milestoneDetailsEdit';
import {
  FIELD_SAVE_ERROR,
  beginFieldSave,
  finishFieldSave,
  idleField,
  retryFieldSave,
} from './taskFieldSave';

Object.assign(globalThis, { React });

describe('task field save', () => {
  const fields = [
    { name: 'assignee', pending: { id: 'ct-maya', name: 'Maya Chen' } },
    { name: 'due', pending: '2026-11-02' },
    { name: 'project', pending: { id: 'p-brand', name: 'Northwind brand' } },
  ] as const;

  for (const field of fields) {
    it(`reverts ${field.name}, shows the error, and retries the same value`, () => {
      const started = beginFieldSave(field.pending);
      assert.deepEqual(started.draft, field.pending);
      assert.equal(started.error, null);
      const failed = finishFieldSave(started, false);
      assert.equal(failed.draft, undefined);
      assert.equal(failed.error, FIELD_SAVE_ERROR);
      assert.equal(FIELD_SAVE_ERROR, "Couldn't save.");
      const sent: Array<typeof field.pending> = [];
      assert.equal(
        retryFieldSave(failed, (pending) => {
          sent.push(pending);
        }),
        true,
      );
      assert.deepEqual(sent, [field.pending]);
      const again = beginFieldSave(field.pending);
      const saved = finishFieldSave(again, true);
      assert.equal(saved.error, null);
      assert.deepEqual(saved.draft, field.pending);
      assert.equal(saved.pending, undefined);
      let idleCalls = 0;
      assert.equal(
        retryFieldSave(idleField<typeof field.pending>(), () => {
          idleCalls += 1;
        }),
        false,
      );
      assert.equal(idleCalls, 0);
      assert.equal(sent.length, 1);
    });
  }

  it('renders the milestone error with Retry under each field', () => {
    for (const testId of ['task-assignee-retry', 'task-due-retry', 'task-project-retry']) {
      const html = renderToStaticMarkup(
        createElement(FieldError, { text: FIELD_SAVE_ERROR, testId, onRetry: () => undefined }),
      );
      assert.match(html, /role="alert"/);
      assert.match(html, /Couldn(&#x27;|')t save\./);
      assert.match(html, /var\(--danger-text\)/);
      assert.match(html, new RegExp(`data-testid="${testId}"`));
      assert.match(html, />Retry</);
    }
    const source = readFileSync(new URL('./TaskDetailModal.tsx', import.meta.url), 'utf8');
    assert.match(source, /testId="task-assignee-retry"/);
    assert.match(source, /testId="task-due-retry"/);
    assert.match(source, /testId="task-project-retry"/);
    assert.match(source, /retryFieldSave\(assigneeSlot, saveAssignee\)/);
    assert.match(source, /retryFieldSave\(dueSlot, saveDue\)/);
    assert.match(source, /retryFieldSave\(projectSlot, saveProject\)/);
    assert.match(source, /<Icon name="ArrowDown2"/);
    assert.match(source, /outline-\[var\(--info\)\]/);
    assert.equal(source.includes("?? 'Could not save'"), false);
    assert.equal(source.includes("userFacingErrorMessage(err, 'Could not save')"), false);
  });
});
