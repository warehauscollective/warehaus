import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  acrossProjectsLabel,
  progressPercent,
  projectFilterCounts,
  projectInitials,
  projectListEmptyCopy,
  projectListKpis,
  projectListMeta,
  projectMatchesFilter,
  projectProgress,
  projectProgressCopy,
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
  it('uses task math when the project has tasks and Notion progress otherwise', () => {
    const fromTasks = projectProgress({
      projectId: 'p1',
      progress: 0.4,
      tasks: [
        { projectId: 'p1', isDone: true, stage: null },
        { projectId: 'p1', isDone: false, stage: 'Building' },
      ],
    });
    assert.equal(fromTasks.percent, 50);
    assert.equal(fromTasks.fromTasks, true);

    const fromNotion = projectProgress({
      projectId: 'p1',
      progress: 0.4,
      tasks: [],
    });
    assert.equal(fromNotion.percent, 40);
    assert.equal(fromNotion.fromTasks, false);

    const unknown = projectProgress({ projectId: 'p1', progress: null, tasks: [] });
    assert.equal(unknown.percent, null);
    assert.equal(unknown.fromTasks, false);
  });
});

describe('projectProgressCopy', () => {
  it('uses the desktop and phone sentences, including unknown progress', () => {
    assert.deepEqual(projectProgressCopy(50, 2), {
      desktop: '50% of tasks shipped',
      phone: '50% shipped · 2 tasks',
    });
    assert.equal(projectProgressCopy(40, 1).phone, '40% shipped · 1 task');
    assert.deepEqual(projectProgressCopy(null, 0), {
      desktop: '— of tasks shipped',
      phone: '— shipped · 0 tasks',
    });
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

describe('project list KPIs', () => {
  const projects = [
    { id: 'site', status: 'In Progress', internal: false },
    { id: 'brand', status: 'Shipped', internal: false },
    { id: 'ops', status: 'In Progress', internal: true },
    { id: 'old', status: 'Shipped', internal: true },
  ];
  const tasks = [
    { projectId: 'site', stage: 'Awaiting Go', isDone: false, publishToWarehaus: true },
    { projectId: 'brand', stage: 'Awaiting Go', isDone: false, publishToWarehaus: true },
    { projectId: 'site', stage: 'Awaiting Go', isDone: true, publishToWarehaus: true },
    { projectId: 'ops', stage: 'Awaiting Go', isDone: false, publishToWarehaus: true },
    { projectId: 'site', stage: 'Awaiting Go', isDone: false, publishToWarehaus: false },
    { projectId: 'site', stage: 'Awaiting Go', isDone: false, publishToWarehaus: true, syncHidden: true },
    { projectId: 'missing', stage: 'Awaiting Go', isDone: false, publishToWarehaus: true },
  ];

  it('counts only projects and tasks the viewer can see', () => {
    assert.deepEqual(projectListKpis(projects, tasks, true), {
      active: 1,
      shipped: 1,
      awaitingGo: 5,
      awaitingProjects: 3,
    });
    assert.deepEqual(projectListKpis(projects, tasks, false), {
      active: 1,
      shipped: 1,
      awaitingGo: 2,
      awaitingProjects: 2,
    });
    assert.equal(acrossProjectsLabel(1), 'Across 1 project');
    assert.equal(acrossProjectsLabel(3), 'Across 3 projects');
  });
});

describe('project list empty copy', () => {
  it('uses the zero-project lines and keeps the filter line for a filtered list', () => {
    assert.deepEqual(projectListEmptyCopy(0, true), {
      title: 'No projects yet',
      detail: 'Create one with New project or in Notion.',
    });
    assert.deepEqual(projectListEmptyCopy(0, false), {
      title: 'No projects yet',
      detail: 'Projects Warehaus shares with you will show here.',
    });
    assert.deepEqual(projectListEmptyCopy(4, true), {
      title: 'No projects match these filters.',
      detail: null,
    });
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
