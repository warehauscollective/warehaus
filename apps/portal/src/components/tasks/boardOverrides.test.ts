import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { boardOverrideHolds, liveBoardValue, pruneBoardOverrides, type BoardOverride } from './boardOverrides';

describe('board card overrides', () => {
  const moved: BoardOverride = { mode: 'status', value: 'In Progress', from: 'To Do' };

  it('holds a move only while the live row is unchanged', () => {
    assert.equal(boardOverrideHolds({ id: 't1', status: 'To Do' }, moved), true);
    // The save arrived.
    assert.equal(boardOverrideHolds({ id: 't1', status: 'In Progress' }, moved), false);
    // The runner, or another window, moved the task on.
    assert.equal(boardOverrideHolds({ id: 't1', status: 'Done' }, moved), false);
    assert.equal(boardOverrideHolds({ id: 't1', status: 'To Do' }, undefined), false);
  });

  it('reads the stage for a stage move, and an unset stage as empty', () => {
    const staged: BoardOverride = { mode: 'stage', value: 'Building', from: '' };
    assert.equal(liveBoardValue({ id: 't1', status: 'To Do', stage: null }, 'stage'), '');
    assert.equal(boardOverrideHolds({ id: 't1', status: 'To Do' }, staged), true);
    assert.equal(boardOverrideHolds({ id: 't1', status: 'To Do', stage: 'Building' }, staged), false);
  });

  it('drops a move for good once the live row changes or leaves the list', () => {
    const overrides = { t1: moved, t2: moved, gone: moved };
    const tasks = [
      { id: 't1', status: 'To Do' },
      { id: 't2', status: 'Done' },
    ];
    const kept = pruneBoardOverrides(tasks, overrides);
    assert.deepEqual(Object.keys(kept), ['t1']);
    // The row going back to its old value does not bring the old move back.
    assert.deepEqual(pruneBoardOverrides([{ id: 't2', status: 'To Do' }], kept), {});
  });

  it('returns the same object when nothing is dropped, so the board does not render again', () => {
    const overrides = { t1: moved };
    assert.equal(pruneBoardOverrides([{ id: 't1', status: 'To Do' }], overrides), overrides);
    const none = {};
    assert.equal(pruneBoardOverrides([], none), none);
  });
});
