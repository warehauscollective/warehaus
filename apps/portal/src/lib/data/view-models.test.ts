import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { taskBoardColumnKey, type PortalTask } from './view-models';

function task(partial: Partial<PortalTask> & Pick<PortalTask, 'status' | 'isDone'>): PortalTask {
  return {
    id: 't1',
    name: 'Test',
    date: null,
    projectId: null,
    projectName: null,
    projectStatus: null,
    projectEndDate: null,
    ...partial,
  };
}

describe('taskBoardColumnKey', () => {
  it('maps Notion statuses to board columns', () => {
    assert.equal(taskBoardColumnKey(task({ status: 'Inbox', isDone: false })), 'inbox');
    assert.equal(taskBoardColumnKey(task({ status: 'To Do', isDone: false })), 'todo');
    assert.equal(taskBoardColumnKey(task({ status: 'In Progress', isDone: false })), 'in_progress');
    assert.equal(taskBoardColumnKey(task({ status: 'Done', isDone: false })), 'done');
    assert.equal(taskBoardColumnKey(task({ status: 'To Do', isDone: true })), 'done');
  });
});
