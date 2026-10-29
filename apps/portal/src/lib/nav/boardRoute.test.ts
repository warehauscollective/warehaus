import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { getPortalTabForPath } from '@warehaus/logic';
import { PROJECT_UNAVAILABLE, TASK_UNAVAILABLE } from '@warehaus/portal-sync';
import { PROJECT_UNAVAILABLE_HEADING, projectUnavailableCopy, resolveBoardRoute } from './boardRoute';

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
    assert.deepEqual(projectUnavailableCopy(), {
      title: "This project isn't available",
      detail: "It may have been removed or isn't shared with you.",
    });
    assert.equal(PROJECT_UNAVAILABLE_HEADING, 'Project');
    assert.notEqual(PROJECT_UNAVAILABLE_HEADING, projectUnavailableCopy().title);

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

  it('keeps the unavailable page heading as Project and the sentence on the card', () => {
    const source = readFileSync(new URL('../../components/pages/ProjectsContent.tsx', import.meta.url), 'utf8');
    const start = source.indexOf("route.message === PROJECT_UNAVAILABLE");
    const end = source.indexOf("route.view === 'unavailable'", start + 1);
    const branch = source.slice(start, end);
    assert.match(branch, /title=\{PROJECT_UNAVAILABLE_HEADING\}/);
    assert.match(branch, /current=\{PROJECT_UNAVAILABLE_HEADING\}/);
    assert.equal(branch.includes('title={copy.title}'), false);
    assert.equal(branch.includes('current={copy.title}'), false);
    assert.match(branch, /\{copy\.title\}/);
    assert.match(branch, /\{copy\.detail\}/);
  });

  it('leaves the project list on /projects', () => {
    assert.deepEqual(
      resolveBoardRoute({ pathname: '/projects', tasks, visibleProjectIds: ['proj-public'] }),
      { view: 'list' },
    );
  });
});
