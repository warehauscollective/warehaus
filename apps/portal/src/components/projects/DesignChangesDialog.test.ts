import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DESIGN_CHANGE_TASK_LIMIT } from '@convex/_lib/designApproval';
import { designChangeLines } from './DesignChangesDialog';

describe('designChangeLines', () => {
  it('keeps one task per non-empty line, trimmed and capped like the server', () => {
    assert.deepEqual(designChangeLines(' Rework the tile \n\n  \nTighten 390\n'), ['Rework the tile', 'Tighten 390']);
    const many = Array.from({ length: DESIGN_CHANGE_TASK_LIMIT + 3 }, (_, i) => `Task ${i}`).join('\n');
    assert.equal(designChangeLines(many).length, DESIGN_CHANGE_TASK_LIMIT);
  });
});
