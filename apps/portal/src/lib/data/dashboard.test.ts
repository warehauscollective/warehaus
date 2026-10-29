import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildDashboard,
  summarizeSyncHealth,
  type DashboardInput,
  type DashboardProject,
  type DashboardTask,
} from './dashboard';

const NOW = Date.parse('2026-10-29T12:00:00Z');

function project(partial: Partial<DashboardProject> & Pick<DashboardProject, 'id' | 'name'>): DashboardProject {
  return {
    status: 'In Progress',
    progress: 0.4,
    publishToWarehaus: true,
    internal: false,
    clientName: 'Northwind',
    orgId: 'c-north',
    ...partial,
  };
}

function task(partial: Partial<DashboardTask> & Pick<DashboardTask, 'id' | 'name' | 'status'>): DashboardTask {
  return {
    isDone: false,
    date: '2026-10-20',
    projectId: 'p-site',
    projectName: 'Website refresh',
    publishToWarehaus: true,
    clientName: 'Northwind',
    orgId: 'c-north',
    ...partial,
  };
}

function input(partial: Partial<DashboardInput> & Pick<DashboardInput, 'audience'>): DashboardInput {
  return {
    projects: [],
    tasks: [],
    activity: [],
    pull: { lastSyncedAt: '2026-10-29T11:58:00Z', lastError: null },
    outbox: [],
    writebackEnabled: false,
    notices: [],
    now: NOW,
    ...partial,
  };
}

describe('stage bars and awaiting go', () => {
  const projects = [
    project({ id: 'p-site', name: 'Website refresh' }),
    project({ id: 'p-internal', name: 'warehaus.studio', internal: true, clientName: 'Warehaus', orgId: 'c-warehaus' }),
  ];
  const tasks = [
    task({ id: 'plan', name: 'Plan the nav', status: 'In Progress', stage: 'Planning' }),
    task({ id: 'status-only', name: 'Status is not a stage', status: 'Awaiting Go', stage: 'Building' }),
    task({ id: 'go', name: 'Homepage wireframes', status: 'In review', stage: 'Awaiting Go', category: 'Design' }),
    task({ id: 'done-status', name: 'Marked done by status', status: 'Done', stage: 'Shipped', isDone: false, date: '2026-10-02' }),
    task({ id: 'shipped-status', name: 'Status says shipped', status: 'Shipped', stage: 'Idea' }),
    task({
      id: 'internal-go',
      name: 'Internal ops task',
      status: 'To Do',
      stage: 'Awaiting Go',
      projectId: 'p-internal',
      projectName: 'warehaus.studio',
      internal: true,
      clientName: 'Warehaus',
      orgId: 'c-warehaus',
    }),
    task({
      id: 'unpublished',
      name: 'Draft estimate',
      status: 'To Do',
      stage: 'Awaiting Go',
      publishToWarehaus: false,
    }),
    task({ id: 'hidden', name: 'Hidden row', status: 'To Do', stage: 'Awaiting Go', syncHidden: true }),
  ];

  it('counts Stage, not Status', () => {
    const staff = buildDashboard(input({ audience: 'staff', projects, tasks }));
    assert.equal(staff.audience, 'staff');
    if (staff.audience !== 'staff') return;
    const count = (stage: string) => staff.stages.find((row) => row.stage === stage)?.count;
    assert.equal(count('Planning'), 1);
    assert.equal(count('Building'), 1);
    assert.equal(count('Awaiting Go'), 3);
    assert.equal(count('Shipped'), 1);
    assert.equal(count('Idea'), 1);
    assert.deepEqual(
      staff.awaiting.map((row) => row.name),
      ['Homepage wireframes', 'Internal ops task', 'Draft estimate'],
    );
    assert.equal(staff.awaiting[0]?.stageLabel, 'Awaiting Go');
    assert.equal(staff.stats[2]?.value, '1');
    assert.equal(staff.stats[1]?.value, '1');
  });

  it('hides sync health, outbox, publish state, and internal projects from clients', () => {
    const client = buildDashboard(
      input({
        audience: 'client',
        projects,
        tasks,
        outbox: [{ status: 'failed', createdAt: NOW - 1000 }],
        notices: [{ id: 'n1', message: 'outbox write failed', createdAt: NOW, edgeCase: 'sync' }],
        activity: [
          {
            id: 'pub',
            name: 'Homepage wireframes are ready',
            summary: 'Maya Chen',
            timestamp: '2026-10-29T10:00:00Z',
            type: 'task',
            projectId: 'p-site',
            published: true,
          },
          {
            id: 'secret',
            name: 'Internal ops task moved',
            summary: 'staff only',
            timestamp: '2026-10-29T09:00:00Z',
            type: 'task',
            projectId: 'p-internal',
            published: false,
          },
          {
            id: 'pull',
            name: 'Pull finished',
            summary: 'outbox idle',
            timestamp: '2026-10-29T08:00:00Z',
            type: 'sync',
            projectId: null,
          },
          {
            id: 'draft',
            name: 'Unpublished recap',
            summary: 'not shared',
            timestamp: '2026-10-29T07:00:00Z',
            type: 'task',
            projectId: 'p-site',
            published: false,
          },
        ],
      }),
    );
    assert.equal(client.audience, 'client');
    const encoded = JSON.stringify(client);
    assert.equal('sync' in client, false);
    assert.equal(encoded.includes('syncHealth'), false);
    assert.equal(encoded.includes('outbox'), false);
    assert.equal(encoded.includes('Published'), false);
    assert.equal(encoded.includes('Not published'), false);
    assert.equal(encoded.includes('Granola'), false);
    assert.equal(encoded.includes('warehaus.studio'), false);
    assert.equal(encoded.includes('Internal ops'), false);
    assert.equal(encoded.includes('Draft estimate'), false);
    assert.equal(encoded.includes('Pull finished'), false);
    assert.equal(encoded.includes('Unpublished recap'), false);
    if (client.audience !== 'client') return;
    assert.deepEqual(
      client.awaiting.map((row) => row.name),
      ['Homepage wireframes'],
    );
    assert.equal(client.awaiting[0]?.stageLabel, 'Pending approval');
    assert.equal('published' in client.awaiting[0]!, false);
    assert.deepEqual(
      client.activity.map((row) => row.name),
      ['Homepage wireframes are ready'],
    );
    assert.equal('published' in client.activity[0]!, false);
    assert.deepEqual(
      client.projects.map((row) => row.name),
      ['Website refresh'],
    );
    assert.equal(
      client.stats.some((stat) => /sync/i.test(stat.label)),
      false,
    );
  });
});

describe('sync health', () => {
  it('shows the write queue as off while write-back is off', () => {
    const health = summarizeSyncHealth({
      pull: { lastSyncedAt: '2026-10-29T11:58:00Z', lastError: null },
      outbox: [
        { status: 'queued', createdAt: NOW - 1000 },
        { status: 'done', createdAt: NOW - 1000 },
      ],
      writebackEnabled: false,
      notices: [],
      tasks: [],
      now: NOW,
    });
    const queue = health.rows.find((row) => row.key === 'queue');
    assert.equal(queue?.label, 'Portal to Notion queue');
    assert.equal(queue?.value, 'Off');
    assert.equal(JSON.stringify(queue).toLowerCase().includes('sync'), false);
    assert.equal(JSON.stringify(queue).includes('waiting'), false);
    assert.deepEqual(
      health.rows.map((row) => row.label),
      ['Notion to portal', 'Portal to Notion queue', 'Failed writes (24h)'],
    );
    assert.equal(health.rows.some((row) => /granola/i.test(row.label)), false);
    assert.equal(health.cardValue, 'OK');
    assert.match(health.rows[0]?.value ?? '', /^In sync · /);
  });

  it('counts a real failed outbox row and keeps the pull error on the notice', () => {
    const failed = summarizeSyncHealth({
      pull: { lastSyncedAt: '2026-10-29T11:00:00Z', lastError: null },
      outbox: [{ status: 'failed', createdAt: NOW - 60 * 60 * 1000 }],
      writebackEnabled: true,
      notices: [
        {
          id: 'n1',
          message: 'Homepage wireframes needs staff attention',
          createdAt: NOW,
          edgeCase: 'sync',
        },
      ],
      tasks: [task({ id: 'go', name: 'Homepage wireframes', status: 'In review', notionPageId: 'page-1' })],
      now: NOW,
    });
    assert.equal(failed.rows.find((row) => row.key === 'queue')?.value, '0 waiting');
    assert.equal(failed.rows.find((row) => row.key === 'failed')?.value, '1 needs a retry');
    assert.equal(failed.notice?.title, '1 write to Notion failed');
    assert.match(failed.notice?.body ?? '', /Homepage wireframes/);
    assert.equal(failed.cardValue, 'Issue');

    const pull = summarizeSyncHealth({
      pull: { lastSyncedAt: null, lastError: 'Notion sync is behind by 14 minutes' },
      outbox: [],
      writebackEnabled: false,
      notices: [],
      tasks: [],
      now: NOW,
    });
    assert.equal(pull.rows[0]?.value, 'Failed');
    assert.equal(pull.rows[1]?.value, 'Off');
    assert.equal(pull.notice?.title, 'Sync problem');
    assert.equal(pull.notice?.body, 'Notion sync is behind by 14 minutes');
  });
});
