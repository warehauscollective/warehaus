import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { TASK_STAGE_HINT, displayedTaskStatus } from '../../lib/data/taskStatus';

const HINT =
  'Staff can set any stage except Shipped. Shipped is set when the pull request merges.';

describe('Ready to Ship task status', () => {
  it('maps In progress at Ready to Ship to In review', () => {
    assert.equal(displayedTaskStatus('In progress', 'Ready to Ship'), 'In review');
    assert.equal(displayedTaskStatus('In Progress', 'Ready to Ship'), 'In review');
    assert.equal(displayedTaskStatus('in-progress', 'Ready to Ship'), 'In review');
    assert.equal(displayedTaskStatus('Done', 'Ready to Ship'), 'Done');
    assert.equal(displayedTaskStatus('In progress', 'Building'), 'In progress');
  });

  it('uses the Portal stage hint on the task screen', () => {
    assert.equal(TASK_STAGE_HINT, HINT);
    const source = readFileSync(new URL('./TaskDetailModal.tsx', import.meta.url), 'utf8');
    assert.match(source, /TASK_STAGE_HINT/);
    assert.equal(source.includes('set in Notion'), false);
    assert.match(source, /displayedTaskStatus/);
  });
});
