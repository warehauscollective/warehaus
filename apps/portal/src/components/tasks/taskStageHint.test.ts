import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { TASK_STAGE_HINT, displayedTaskStatus } from '../../lib/data/taskStatus';

const HINT = 'Shipped when Peter approves and it deploys, or when staff use Mark complete.';

describe('Ready to Ship task status', () => {
  it('maps In progress at Ready to Ship to In review', () => {
    assert.equal(displayedTaskStatus('In progress', 'Ready to Ship'), 'In review');
    assert.equal(displayedTaskStatus('In Progress', 'Ready to Ship'), 'In review');
    assert.equal(displayedTaskStatus('in-progress', 'Ready to Ship'), 'In review');
    assert.equal(displayedTaskStatus('Done', 'Ready to Ship'), 'Done');
    assert.equal(displayedTaskStatus('In progress', 'Building'), 'In progress');
  });

  it('keeps the Portal stage hint for the approvals preview, not the task screen', () => {
    assert.equal(TASK_STAGE_HINT, HINT);
    const source = readFileSync(new URL('./TaskDetailModal.tsx', import.meta.url), 'utf8');
    assert.equal(source.includes('TASK_STAGE_HINT'), false);
    assert.equal(source.includes('ON MERGE'), false);
    assert.equal(/set on merge/i.test(source), false);
    assert.equal(source.includes('name="Lock"'), false);
    assert.equal(source.includes('commitShipped'), false);
    assert.equal(source.includes('set in Notion'), false);
    assert.match(source, /displayedTaskStatus/);
  });
});
