import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildActivityFeed } from '../../../convex/_lib/activityFeed';
import {
  buildDashboard,
  EMPTY_OUTBOX,
  OUTBOX_HEALTH_LIMIT,
  summarizeSyncHealth,
  SYNC_PULL_STALE_MS,
  type DashboardInput,
  type DashboardProject,
  type DashboardTask,
  type OutboxHealth,
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
    outbox: EMPTY_OUTBOX,
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
        outbox: {
          counts: { queued: 0, inflight: 0, failed: 1, dead: 0, conflict: 0 },
          oldestCreatedAt: NOW - 1000,
        },
        notices: [{ id: 'n1', message: 'outbox write failed', createdAt: NOW, edgeCase: 'sync' }],
        activity: [
          {
            id: 'pub',
            name: 'Homepage wireframes are ready',
            summary: 'Maya Chen',
            timestamp: '2026-10-29T10:00:00Z',
            type: 'project',
            projectId: 'p-site',
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

  it('gives client rows no published or publish state', () => {
    const client = buildDashboard(
      input({
        audience: 'client',
        projects: [project({ id: 'p-site', name: 'Website refresh' })],
        tasks: [
          task({
            id: 'go',
            name: 'Homepage wireframes',
            status: 'In review',
            stage: 'Awaiting Go',
            publishToWarehaus: true,
          }),
        ],
        activity: [
          {
            id: 'pub',
            name: 'Homepage wireframes are ready',
            summary: 'Maya Chen',
            timestamp: '2026-10-29T10:00:00Z',
            type: 'project',
            projectId: 'p-site',
          },
        ],
      }),
    );
    assert.equal(client.audience, 'client');
    if (client.audience !== 'client') return;
    assert.equal('published' in client.awaiting[0]!, false);
    assert.equal('published' in client.activity[0]!, false);
    const encoded = JSON.stringify(client);
    assert.equal(encoded.includes('Published'), false);
    assert.equal(encoded.includes('publishState'), false);
    assert.equal(encoded.includes('"published"'), false);
  });

  it('drops an internal Warehaus project or task even when the server sends one', () => {
    const client = buildDashboard(
      input({
        audience: 'client',
        projects: [
          project({ id: 'p-site', name: 'Website refresh' }),
          project({ id: 'p-internal', name: 'warehaus.studio', clientName: 'Warehaus', orgId: 'c-warehaus' }),
        ],
        tasks: [
          task({ id: 'go', name: 'Homepage wireframes', status: 'In review', stage: 'Awaiting Go' }),
          task({
            id: 'ops',
            name: 'Internal ops task',
            status: 'To Do',
            stage: 'Awaiting Go',
            projectId: 'p-internal',
            projectName: 'warehaus.studio',
            clientName: 'Warehaus',
            orgId: 'c-warehaus',
          }),
          task({
            id: 'flagged',
            name: 'Staff-only checklist',
            status: 'To Do',
            stage: 'Awaiting Go',
            internal: true,
          }),
        ],
      }),
    );
    const encoded = JSON.stringify(client);
    assert.equal(encoded.includes('warehaus.studio'), false);
    assert.equal(encoded.includes('Internal ops'), false);
    assert.equal(encoded.includes('Staff-only'), false);
    if (client.audience !== 'client') return;
    assert.deepEqual(
      client.projects.map((row) => row.name),
      ['Website refresh'],
    );
    assert.deepEqual(
      client.awaiting.map((row) => row.name),
      ['Homepage wireframes'],
    );
  });

  it('renders no billing, sync, or outbox fields for a client', () => {
    const client = buildDashboard(
      input({
        audience: 'client',
        projects: [project({ id: 'p-site', name: 'Website refresh' })],
        outbox: {
          counts: { queued: 2, inflight: 1, failed: 1, dead: 0, conflict: 0 },
          oldestCreatedAt: NOW - 1000,
        },
        notices: [{ id: 'n1', message: 'outbox write failed', createdAt: NOW, edgeCase: 'sync' }],
      }),
    );
    const encoded = JSON.stringify(client);
    assert.equal('sync' in client, false);
    assert.equal(encoded.includes('syncHealth'), false);
    assert.equal(encoded.includes('outbox'), false);
    assert.equal(encoded.includes('billing'), false);
    assert.equal(encoded.includes('hasBilling'), false);
    assert.equal(encoded.includes('invoice'), false);
    assert.equal(
      client.stats.some((stat) => /sync|billing/i.test(stat.label)),
      false,
    );
  });
});

function counts(partial: Partial<OutboxHealth['counts']> = {}): OutboxHealth {
  return {
    counts: { queued: 0, inflight: 0, failed: 0, dead: 0, conflict: 0, ...partial },
    oldestCreatedAt: NOW - 1000,
  };
}

describe('sync health', () => {
  it('shows the write queue as off while write-back is off', () => {
    const health = summarizeSyncHealth({
      pull: { lastSyncedAt: '2026-10-29T11:58:00Z', lastError: null },
      outbox: counts({ queued: 1 }),
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
      outbox: counts({ failed: 1 }),
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
      outbox: EMPTY_OUTBOX,
      writebackEnabled: false,
      notices: [],
      tasks: [],
      now: NOW,
    });
    assert.equal(pull.rows[0]?.value, 'Failed');
    assert.equal(pull.rows[1]?.value, 'Off');
    assert.equal(pull.notice?.title, 'Sync problem');
    assert.equal(pull.notice?.body, 'Notion sync is behind by 14 minutes');
    assert.equal(pull.cardNote, 'Notion sync is behind by 14 minutes');
  });

  it('does not read OK when the last successful pull is more than a day old', () => {
    const stale = summarizeSyncHealth({
      pull: {
        lastSyncedAt: new Date(NOW - SYNC_PULL_STALE_MS - 60_000).toISOString(),
        lastError: null,
      },
      outbox: EMPTY_OUTBOX,
      writebackEnabled: false,
      notices: [],
      tasks: [],
      now: NOW,
    });
    assert.equal(stale.cardValue, 'Stale');
    assert.notEqual(stale.cardValue, 'OK');
    assert.equal(stale.rows[0]?.tone, 'warning');
    assert.match(stale.rows[0]?.value ?? '', /^Stale/);
    assert.equal(stale.rows[0]?.value.includes('In sync'), false);
    const staleDash = buildDashboard(
      input({
        audience: 'staff',
        pull: {
          lastSyncedAt: new Date(NOW - SYNC_PULL_STALE_MS - 60_000).toISOString(),
          lastError: null,
        },
      }),
    );
    assert.equal(staleDash.audience, 'staff');
    if (staleDash.audience === 'staff') {
      const stat = staleDash.stats.find((row) => row.label === 'Sync health');
      assert.equal(stat?.value, 'Stale');
      assert.equal(stat?.tone, 'warning');
    }

    const issue = buildDashboard(
      input({
        audience: 'staff',
        pull: { lastSyncedAt: null, lastError: 'Notion sync is behind by 14 minutes' },
      }),
    );
    assert.equal(issue.audience, 'staff');
    if (issue.audience === 'staff') {
      const stat = issue.stats.find((row) => row.label === 'Sync health');
      assert.equal(stat?.value, 'Issue');
      assert.equal(stat?.tone, 'danger');
      assert.equal(issue.sync.rows[0]?.tone, 'danger');
    }

    const fresh = summarizeSyncHealth({
      pull: { lastSyncedAt: new Date(NOW - 60_000).toISOString(), lastError: null },
      outbox: EMPTY_OUTBOX,
      writebackEnabled: false,
      notices: [],
      tasks: [],
      now: NOW,
    });
    assert.equal(fresh.cardValue, 'OK');
    assert.match(fresh.rows[0]?.value ?? '', /^In sync · /);
  });

  it('prints 100+ when one status count reaches the health cap', () => {
    const pull = { lastSyncedAt: '2026-10-29T11:58:00Z', lastError: null };
    const cappedQueue = summarizeSyncHealth({
      pull,
      outbox: counts({ queued: OUTBOX_HEALTH_LIMIT, inflight: 3 }),
      writebackEnabled: true,
      notices: [],
      tasks: [],
      now: NOW,
    });
    assert.equal(cappedQueue.rows.find((row) => row.key === 'queue')?.value, '100+ waiting');

    const under = summarizeSyncHealth({
      pull,
      outbox: counts({ queued: OUTBOX_HEALTH_LIMIT - 1 }),
      writebackEnabled: true,
      notices: [],
      tasks: [],
      now: NOW,
    });
    assert.equal(under.rows.find((row) => row.key === 'queue')?.value, '99 waiting');

    const summed = summarizeSyncHealth({
      pull,
      outbox: counts({ queued: 60, inflight: 60 }),
      writebackEnabled: true,
      notices: [],
      tasks: [],
      now: NOW,
    });
    assert.equal(summed.rows.find((row) => row.key === 'queue')?.value, '120 waiting');

    const off = summarizeSyncHealth({
      pull,
      outbox: counts({ queued: OUTBOX_HEALTH_LIMIT }),
      writebackEnabled: false,
      notices: [],
      tasks: [],
      now: NOW,
    });
    assert.equal(off.rows.find((row) => row.key === 'queue')?.value, 'Off');

    const cappedFailed = summarizeSyncHealth({
      pull,
      outbox: counts({ failed: OUTBOX_HEALTH_LIMIT, dead: 5 }),
      writebackEnabled: true,
      notices: [],
      tasks: [],
      now: NOW,
    });
    assert.equal(cappedFailed.rows.find((row) => row.key === 'failed')?.value, '100+ need a retry');
    assert.equal(cappedFailed.notice?.title, '100+ writes to Notion failed');
  });
});

describe('staff activity publish marks', () => {
  const projects = [
    project({ id: 'p-site', name: 'Website refresh' }),
    project({ id: 'p-internal', name: 'warehaus.studio', internal: true, clientName: 'Warehaus' }),
  ];
  const tasks = [
    task({ id: 't-doing', name: 'Build the project page', status: 'In Progress', projectId: 'p-site', publishToWarehaus: true }),
    task({ id: 't-draft', name: 'Draft estimate', status: 'To Do', projectId: 'p-site', publishToWarehaus: false }),
  ];
  const activity = [
    {
      id: 'moved',
      name: 'Task moved',
      summary: 'Build the project page is in progress',
      timestamp: '2026-10-29T10:00:00Z',
      type: 'task',
      projectId: 'p-site',
      taskId: 't-doing',
    },
    {
      id: 'draft',
      name: 'Draft estimate updated',
      summary: 'Draft estimate held back',
      timestamp: '2026-10-29T09:00:00Z',
      type: 'task',
      projectId: 'p-site',
      taskId: 't-draft',
    },
    {
      id: 'pull',
      name: 'Pull finished',
      summary: 'Notion pull completed',
      timestamp: '2026-10-29T08:00:00Z',
      type: 'sync',
      projectId: null,
    },
    {
      id: 'site',
      name: 'Site update',
      summary: 'Shared with the client',
      timestamp: '2026-10-29T07:00:00Z',
      type: 'project',
      projectId: 'p-site',
    },
  ];

  it('reads the staff publish mark from clientVisible', () => {
    const marked = activity.map((item) => ({
      ...item,
      clientVisible: item.id === 'site',
    }));
    const staff = buildDashboard(input({ audience: 'staff', projects, tasks, activity: marked }));
    assert.equal(staff.audience, 'staff');
    if (staff.audience !== 'staff') return;
    assert.equal(staff.activity.find((row) => row.id === 'moved')?.published, false);
    assert.equal(staff.activity.find((row) => row.id === 'site')?.published, true);
    assert.equal(staff.activity.find((row) => row.id === 'draft')?.published, false);
    assert.equal(staff.activity.find((row) => row.id === 'pull')?.published, false);
  });

  it('keeps server-filtered client activity that carries no clientVisible flag', () => {
    const feed = buildActivityFeed({
      audience: 'client',
      orgVisible: true,
      activity: [
        {
          _id: 'act-task',
          name: 'Task moved',
          summary: 'Build the project page is in progress',
          type: 'task',
          timestamp: Date.parse('2026-10-29T11:00:00Z'),
          projectId: 'proj-public',
        },
        {
          _id: 'act-project',
          name: 'Site update',
          summary: 'Shared with the client',
          type: 'project',
          timestamp: Date.parse('2026-10-29T10:00:00Z'),
          projectId: 'proj-public',
        },
      ],
      audits: [
        {
          _id: 'audit-public',
          action: 'task.updated',
          notionPageId: 'task-public-notion',
          after: JSON.stringify({ properties: { Status: 'To Do' } }),
          actorKind: 'sync',
          createdAt: Date.parse('2026-10-29T09:00:00Z'),
        },
      ],
      outbox: [],
      projects: [
        {
          _id: 'proj-public',
          name: 'Northwind site',
          type: [],
          publishToWarehaus: true,
          archive: false,
        },
      ],
      tasks: [
        {
          _id: 'task-public',
          name: 'Build the project page',
          projectId: 'proj-public',
          notionPageId: 'task-public-notion',
          publishToWarehaus: true,
        },
      ],
    });
    assert.equal(feed.some((item) => 'clientVisible' in item), false);
    assert.deepEqual(
      feed.map((item) => item.id),
      ['act-project', 'audit-public'],
    );
    const fromFeed = buildDashboard(
      input({
        audience: 'client',
        projects: [project({ id: 'proj-public', name: 'Northwind site' })],
        activity: feed.map((item) => ({
          id: item.id,
          name: item.name,
          summary: item.summary,
          timestamp: item.timestamp,
          type: item.type,
          projectId: item.projectId,
        })),
      }),
    );
    assert.equal(fromFeed.audience, 'client');
    if (fromFeed.audience !== 'client') return;
    assert.deepEqual(
      fromFeed.activity.map((row) => row.id),
      ['act-project', 'audit-public'],
    );
    assert.equal(fromFeed.activity.some((row) => 'published' in row), false);

    const snapshotActivity = [
      {
        id: 'snap-1',
        name: 'Public note',
        type: 'project',
        summary: 'Northwind site update',
        timestamp: '2026-10-29T08:00:00Z',
        tone: 'muted',
        projectId: 'p-site',
      },
    ];
    const fromSnapshot = buildDashboard(
      input({
        audience: 'client',
        projects: [project({ id: 'p-site', name: 'Website refresh' })],
        activity: snapshotActivity,
      }),
    );
    assert.equal(fromSnapshot.audience, 'client');
    if (fromSnapshot.audience !== 'client') return;
    assert.deepEqual(
      fromSnapshot.activity.map((row) => row.name),
      ['Public note'],
    );
    assert.equal(fromSnapshot.stats.find((stat) => stat.label === 'Updates this week')?.value, '1');
  });
});
