import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatPortalDate, noticeDisplayMessage, taskBoardColumnKey, type PortalTask } from './view-models';

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

describe('formatPortalDate', () => {
  it('formats a calendar date the same way on the server and the client', () => {
    assert.equal(formatPortalDate('2026-11-20'), 'Nov 20');
    assert.equal(formatPortalDate('2026-11-20T00:00:00.000Z'), 'Nov 20');
    assert.equal(formatPortalDate(null), '—');
  });
});

describe('noticeDisplayMessage', () => {
  const tasks = [{ name: 'Build the project page', notionPageId: 'notion-t-doing' }];
  const key = 'task-stage:notion-t-doing:Building::2026-10-28T00:00:00.000Z';

  it('replaces a stored idempotency key with the task name and keeps the rest', () => {
    assert.equal(
      noticeDisplayMessage(key, tasks),
      'Build the project page:Building::2026-10-28T00:00:00.000Z',
    );
    assert.equal(
      noticeDisplayMessage('task-status:notion-t-doing:In Progress:2026-10-28T00:00:00.000Z', tasks),
      'Build the project page:In Progress:2026-10-28T00:00:00.000Z',
    );
  });

  it('rewrites the three stored Notion write sentences', () => {
    assert.equal(
      noticeDisplayMessage(`Notion write ${key} was marked dead after 24h`, tasks),
      'Notion write Build the project page:Building::2026-10-28T00:00:00.000Z was marked dead after 24h',
    );
    assert.equal(
      noticeDisplayMessage(`Notion write ${key} needs staff attention`, tasks),
      'Notion write Build the project page:Building::2026-10-28T00:00:00.000Z needs staff attention',
    );
    assert.equal(
      noticeDisplayMessage(`Notion write ${key} conflicted with a newer edit`, tasks),
      'Notion write Build the project page:Building::2026-10-28T00:00:00.000Z conflicted with a newer edit',
    );
  });

  it('leaves a written notice alone and uses a neutral label when the task is missing', () => {
    assert.equal(noticeDisplayMessage('Homepage conflicted with a newer edit', tasks), 'Homepage conflicted with a newer edit');
    assert.equal(
      noticeDisplayMessage('Notion write task-stage:missing:Idea::2026-10-28T00:00:00.000Z needs staff attention', tasks),
      'Notion write a task:Idea::2026-10-28T00:00:00.000Z needs staff attention',
    );
  });
});

describe('taskBoardColumnKey', () => {
  it('maps Notion statuses to board columns', () => {
    assert.equal(taskBoardColumnKey(task({ status: 'Inbox', isDone: false })), 'inbox');
    assert.equal(taskBoardColumnKey(task({ status: 'To Do', isDone: false })), 'todo');
    assert.equal(taskBoardColumnKey(task({ status: 'Blocked', isDone: false })), 'blocked');
    assert.equal(taskBoardColumnKey(task({ status: 'In Progress', isDone: false })), 'in_progress');
    assert.equal(taskBoardColumnKey(task({ status: 'Done', isDone: false })), 'done');
    assert.equal(taskBoardColumnKey(task({ status: 'To Do', isDone: true })), 'done');
  });

  it('does not file a missing status under Inbox', () => {
    assert.equal(taskBoardColumnKey(task({ status: 'Planning', isDone: false })), null);
    assert.equal(taskBoardColumnKey(task({ status: 'In review', isDone: false })), null);
    assert.equal(taskBoardColumnKey(task({ status: 'Planned', isDone: false })), null);
  });
});
