import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getPortalTabForPath } from '@warehaus/logic';
import { PROJECT_UNAVAILABLE, TASK_UNAVAILABLE } from '@warehaus/portal-sync';
import { resolveBoardRoute } from './boardRoute';

const tasks = [
  { id: 'task-public', projectId: 'proj-public' },
  { id: 'task-internal', projectId: 'proj-internal' },
];

describe('board deep links', () => {
  it('opens a task modal over its project board', () => {
    assert.deepEqual(
      resolveBoardRoute({
        pathname: '/tasks/task-public',
        tasks,
        visibleProjectIds: ['proj-public'],
      }),
      { view: 'board', projectId: 'proj-public', taskId: 'task-public' },
    );
    assert.equal(getPortalTabForPath('/tasks/task-public'), 'projects');
    assert.equal(getPortalTabForPath('/projects/proj-public'), 'projects');
  });

  it('opens /projects/:id on that board', () => {
    assert.deepEqual(
      resolveBoardRoute({
        pathname: '/projects/proj-public',
        tasks,
        visibleProjectIds: ['proj-public'],
      }),
      { view: 'board', projectId: 'proj-public', taskId: null },
    );
  });

  it('uses one message when the row is missing or not visible', () => {
    const hidden = resolveBoardRoute({
      pathname: '/projects/proj-internal',
      tasks,
      visibleProjectIds: ['proj-public'],
    });
    const missing = resolveBoardRoute({
      pathname: '/projects/missing',
      tasks,
      visibleProjectIds: ['proj-public'],
    });
    assert.deepEqual(hidden, { view: 'unavailable', message: PROJECT_UNAVAILABLE });
    assert.deepEqual(missing, hidden);

    const hiddenTask = resolveBoardRoute({
      pathname: '/tasks/task-internal',
      tasks,
      visibleProjectIds: ['proj-public'],
    });
    const missingTask = resolveBoardRoute({
      pathname: '/tasks/missing',
      tasks,
      visibleProjectIds: ['proj-public'],
    });
    assert.deepEqual(hiddenTask, { view: 'unavailable', message: TASK_UNAVAILABLE });
    assert.deepEqual(missingTask, hiddenTask);
  });

  it('leaves the project list on /projects', () => {
    assert.deepEqual(
      resolveBoardRoute({ pathname: '/projects', tasks, visibleProjectIds: ['proj-public'] }),
      { view: 'list' },
    );
  });
});
