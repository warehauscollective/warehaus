import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { keepProjectWhileLoading, readTaskListView } from './taskListLocation';

describe('task list location', () => {
  it('reads the task view from the URL', () => {
    assert.equal(readTaskListView('table'), 'table');
    assert.equal(readTaskListView('board'), 'board');
    assert.equal(readTaskListView(null), 'board');
    assert.equal(readTaskListView('status'), 'board');
  });

  it('keeps a deep link on the open project while the row reloads', () => {
    const loading = {
      fixtures: false,
      projectsLoading: true,
      projectFound: false,
      pathname: '/projects/p-site',
      openId: null,
    };
    assert.equal(keepProjectWhileLoading(loading), true);
    assert.equal(keepProjectWhileLoading({ ...loading, pathname: '/tasks/task-1' }), true);
    assert.equal(keepProjectWhileLoading({ ...loading, pathname: '/projects', openId: 'p-site' }), true);
    assert.equal(keepProjectWhileLoading({ ...loading, pathname: '/projects' }), false);
    assert.equal(keepProjectWhileLoading({ ...loading, projectFound: true }), false);
    assert.equal(keepProjectWhileLoading({ ...loading, projectsLoading: false }), false);
    assert.equal(keepProjectWhileLoading({ ...loading, fixtures: true }), false);
  });
});
