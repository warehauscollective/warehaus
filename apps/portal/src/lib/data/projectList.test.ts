import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  progressPercent,
  projectFilterCounts,
  projectInitials,
  projectListMeta,
  projectMatchesFilter,
  projectProgress,
  showProjectPublish,
  sortProjectsByLastUpdated,
} from './projectList';

describe('projectInitials', () => {
  it('uses two letters of one word and one letter of each of two words', () => {
    assert.equal(projectInitials('warehaus.studio'), 'WA');
    assert.equal(projectInitials('Northwind site'), 'NS');
  });

  it('uses a middle dot when the name is empty', () => {
    assert.equal(projectInitials('   '), '·');
  });

  it('keeps a leading emoji as one code point', () => {
    const value = projectInitials('🚀 Launch');
    assert.equal(value, '🚀L');
    assert.deepEqual(Array.from(value), ['🚀', 'L']);
    assert.equal(projectInitials('🚀site'), '🚀S');
    assert.deepEqual(Array.from(projectInitials('🚀site')), ['🚀', 'S']);
  });
});

describe('projectListMeta', () => {
  it('uses the internal lines and does not add a brand or the stack', () => {
    assert.equal(
      projectListMeta({ internal: true, clientName: 'Warehaus', description: 'Internal' }, null),
      'Warehaus (internal) · admin-only',
    );
    assert.equal(
      projectListMeta({ internal: true, clientName: 'Warehaus', description: 'Internal' }, null, { phone: true }),
      'Admin only · never shown to clients',
    );
    assert.equal(
      projectListMeta({ internal: false, clientName: 'Northwind', description: 'Marketing site' }, null),
      'Northwind · Marketing site',
    );
    assert.equal(
      projectListMeta({ internal: false, clientName: 'Northwind', description: '  ' }, 'Fallback'),
      'Northwind',
    );
    assert.equal(
      projectListMeta({ internal: false, clientName: null, description: null }, null),
      '—',
    );
  });
});

describe('progressPercent', () => {
  it('clamps fractions and percents and leaves null unknown', () => {
    assert.equal(progressPercent(0.4), 40);
    assert.equal(progressPercent(1), 100);
    assert.equal(progressPercent(150), 100);
    assert.equal(progressPercent(-0.2), 0);
    assert.equal(progressPercent(0), 0);
    assert.equal(progressPercent(null), null);
    assert.equal(progressPercent(undefined), null);
  });
});

describe('projectProgress', () => {
  it('labels task math as tasks and Notion progress as shipped', () => {
    const fromTasks = projectProgress({
      projectId: 'p1',
      progress: 0.4,
      tasks: [
        { projectId: 'p1', isDone: true, stage: null },
        { projectId: 'p1', isDone: false, stage: 'Building' },
      ],
    });
    assert.equal(fromTasks.label, '50% of tasks shipped');
    assert.equal(fromTasks.fromTasks, true);

    const fromNotion = projectProgress({
      projectId: 'p1',
      progress: 0.4,
      tasks: [],
    });
    assert.equal(fromNotion.label, '40% shipped');
    assert.equal(fromNotion.fromTasks, false);

    const unknown = projectProgress({ projectId: 'p1', progress: null, tasks: [] });
    assert.equal(unknown.percent, null);
    assert.equal(unknown.label, '— shipped');
  });
});

describe('project filters', () => {
  const projects = [
    { name: 'Site', status: 'In Progress', internal: false, lastSyncedAt: 30 },
    { name: 'Brand', status: 'Shipped', internal: false, lastSyncedAt: 20 },
    { name: 'Ops', status: 'In Progress', internal: true, lastSyncedAt: 10 },
    { name: 'Old internal ship', status: 'Shipped', internal: true, lastSyncedAt: 5 },
  ];

  it('counts only projects the viewer can see', () => {
    assert.deepEqual(
      projectFilterCounts(projects, true).map((chip) => [chip.key, chip.count]),
      [
        ['all', 4],
        ['active', 1],
        ['shipped', 1],
        ['internal', 2],
      ],
    );
    assert.deepEqual(
      projectFilterCounts(projects, false).map((chip) => [chip.key, chip.count]),
      [
        ['all', 2],
        ['active', 1],
        ['shipped', 1],
      ],
    );
    assert.equal(projectMatchesFilter(projects[2], 'active'), false);
    assert.equal(projectMatchesFilter(projects[2], 'shipped'), false);
  });

  it('sorts by last updated, newest first', () => {
    assert.deepEqual(
      sortProjectsByLastUpdated(projects).map((project) => project.name),
      ['Site', 'Brand', 'Ops', 'Old internal ship'],
    );
  });
});

describe('showProjectPublish', () => {
  const published = { internal: false, publishToWarehaus: true as boolean | null };

  it('never shows the publish state on a client row', () => {
    assert.equal(showProjectPublish(false, published), false);
    assert.equal(showProjectPublish(false, { internal: false, publishToWarehaus: false }), false);
    assert.equal(showProjectPublish(true, published), true);
    assert.equal(showProjectPublish(true, { internal: true, publishToWarehaus: true }), false);
    assert.equal(showProjectPublish(true, { internal: false, publishToWarehaus: null }), false);
  });
});
