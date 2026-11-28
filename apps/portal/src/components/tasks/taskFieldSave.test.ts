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
  releaseFieldDraft,
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
    assert.match(source, /task-chev-down\.svg/);
    assert.match(source, /outline-\[var\(--info\)\]/);
    assert.equal(source.includes("?? 'Could not save'"), false);
    assert.equal(source.includes("userFacingErrorMessage(err, 'Could not save')"), false);
  });

  it('shows a saved pick only until the live task changes, then follows the live task', () => {
    const saved = finishFieldSave(beginFieldSave('2026-11-02', null), true);
    assert.equal(saved.draft, '2026-11-02');
    // The live task still holds the old value: the pick stays on screen.
    assert.equal(releaseFieldDraft(saved, null), saved);
    // The save arrived on the live task.
    assert.equal(releaseFieldDraft(saved, '2026-11-02').draft, undefined);
    // Someone else changed the task in another window.
    const released = releaseFieldDraft(saved, '2026-12-25');
    assert.equal(released.draft, undefined);
    assert.equal(released.error, null);
    // Once dropped it does not come back when the task returns to the old value.
    assert.equal(releaseFieldDraft(released, null).draft, undefined);
  });

  it('keeps a fixture pick, where no live task can change', () => {
    const saved = finishFieldSave(beginFieldSave('2026-11-02'), true);
    assert.equal('from' in saved, false);
    assert.equal(releaseFieldDraft(saved, 'anything'), saved);
    assert.equal(releaseFieldDraft(idleField<string>(), 'anything').draft, undefined);
  });
});
