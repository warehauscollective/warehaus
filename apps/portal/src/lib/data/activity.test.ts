import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  buildActivityFeed,
  type FeedActivity,
  type FeedAudit,
  type FeedOutbox,
  type FeedProject,
  type FeedTask,
} from '../../../convex/_lib/activityFeed';
import { buildActivityView, activityFiltersFor } from './activity';

const NOW = Date.parse('2026-10-29T16:00:00Z');
const HOUR = 60 * 60 * 1000;

const publicProject: FeedProject = {
  _id: 'proj-public',
  name: 'Northwind site',
  type: [],
  publishToWarehaus: true,
  archive: false,
};

const internalProject: FeedProject = {
  _id: 'proj-internal',
  name: 'warehaus.studio',
  type: ['Internal'],
  publishToWarehaus: true,
  archive: false,
};

const tasks: FeedTask[] = [
  {
    _id: 'task-public',
    name: 'Homepage',
    projectId: 'proj-public',
    notionPageId: 'task-public-notion',
    publishToWarehaus: true,
  },
  {
    _id: 'task-draft',
    name: 'Secret draft',
    projectId: 'proj-public',
    notionPageId: 'task-draft-notion',
    publishToWarehaus: false,
  },
];

const activity: FeedActivity[] = [
  {
    _id: 'act-project',
    name: 'Homepage wireframes moved to Awaiting Go',
    summary: 'Shared with the client',
    type: 'project',
    timestamp: NOW - 2 * HOUR,
    projectId: 'proj-public',
  },
  {
    _id: 'act-task',
    name: 'Task moved',
    summary: 'Staff task row',
    type: 'task',
    timestamp: NOW - 3 * HOUR,
    projectId: 'proj-public',
  },
  {
    _id: 'act-resource',
    name: 'Recap drafted: Kickoff call',
    summary: 'Meeting notes',
    type: 'resource',
    timestamp: NOW - 5 * HOUR,
    projectId: 'proj-public',
  },
  {
    _id: 'act-sync',
    name: 'Sync retry queued',
    summary: '1 write failed',
    type: 'sync',
    timestamp: NOW - 6 * HOUR,
    projectId: 'proj-public',
  },
  {
    _id: 'act-internal',
    name: 'Internal checklist',
    summary: 'warehaus.studio planning',
    type: 'project',
    timestamp: NOW - 26 * HOUR,
    projectId: 'proj-internal',
  },
];

const audits: FeedAudit[] = [
  {
    _id: 'audit-public',
    action: 'task.updated',
    notionPageId: 'task-public-notion',
    after: JSON.stringify({ properties: { Status: 'To Do', Name: 'Homepage' } }),
    actorKind: 'sync',
    createdAt: NOW - 28 * HOUR,
  },
  {
    _id: 'audit-draft',
    action: 'task.updated',
    notionPageId: 'task-draft-notion',
    after: JSON.stringify({ properties: { Status: 'Inbox', Name: 'Secret draft' } }),
    actorKind: 'sync',
    createdAt: NOW - 30 * HOUR,
  },
];

const outbox: FeedOutbox[] = [
  {
    _id: 'out-1',
    kind: 'task-status',
    status: 'conflict',
    database: 'tasks',
    notionPageId: 'task-public-notion',
    lastError: 'write conflict',
    createdAt: NOW - 4 * HOUR,
  },
];

const shared = {
  orgVisible: true,
  activity,
  audits,
  outbox,
  projects: [publicProject, internalProject],
  tasks,
};

describe('activity view model', () => {
  const staffFeed = buildActivityFeed({ audience: 'staff', ...shared });
  const clientFeed = buildActivityFeed({ audience: 'client', ...shared });

  it('reads staff publish marks from buildActivityFeed and keeps the client list', () => {
    const staff = buildActivityView({
      audience: 'staff',
      items: staffFeed,
      filter: 'all',
      now: NOW,
    });
    const client = buildActivityView({
      audience: 'client',
      items: clientFeed,
      filter: 'all',
      now: NOW,
      clientName: 'Northwind',
    });
    const clientIds = new Set(clientFeed.map((item) => item.id));

    assert.deepEqual(
      client.rows.map((row) => row.id),
      clientFeed.map((item) => item.id),
    );
    assert.equal(client.rows.some((row) => 'published' in row), false);
    assert.equal(JSON.stringify(client).includes('Published'), false);
    assert.equal(JSON.stringify(client).includes('warehaus.studio'), false);
    assert.equal(JSON.stringify(client).includes('Secret draft'), false);
    assert.equal(JSON.stringify(client).includes('write conflict'), false);
    assert.equal(client.title, 'Updates for you');
    assert.match(client.subtitle, /Northwind/);

    for (const row of staff.rows) {
      const source = staffFeed.find((item) => item.id === row.id);
      assert.ok(source);
      assert.equal(row.published, source.clientVisible === true);
      assert.equal(row.published, clientIds.has(row.id));
    }
    assert.equal(staff.rows.find((row) => row.id === 'act-project')?.published, true);
    assert.equal(staff.rows.find((row) => row.id === 'act-sync')?.published, false);
    assert.equal(staff.rows.find((row) => row.id === 'out-1')?.published, false);
    assert.equal(staff.title, 'All activity');
  });

  it('filters by type and by the staff publish flag without a second visibility pass', () => {
    const staffTasks = buildActivityView({
      audience: 'staff',
      items: staffFeed,
      filter: 'tasks',
      now: NOW,
    });
    const resources = buildActivityView({
      audience: 'staff',
      items: staffFeed,
      filter: 'resources',
      now: NOW,
    });
    const sync = buildActivityView({
      audience: 'staff',
      items: staffFeed,
      filter: 'sync',
      now: NOW,
    });
    const hidden = buildActivityView({
      audience: 'staff',
      items: staffFeed,
      filter: 'unpublished',
      now: NOW,
    });
    assert.equal(staffTasks.rows.every((row) => row.type === 'task' || row.type === 'project'), true);
    assert.deepEqual(
      resources.rows.map((row) => row.id),
      ['act-resource'],
    );
    assert.equal(sync.rows.some((row) => row.id === 'act-sync'), true);
    assert.equal(sync.rows.some((row) => row.id === 'out-1'), true);
    assert.equal(hidden.rows.every((row) => row.published === false), true);
    assert.equal(hidden.rows.some((row) => row.id === 'act-project'), false);

    const client = buildActivityView({
      audience: 'client',
      items: clientFeed,
      filter: 'unpublished',
      now: NOW,
    });
    assert.deepEqual(
      client.rows.map((row) => row.id),
      clientFeed.map((item) => item.id),
    );
    assert.deepEqual(
      activityFiltersFor('client'),
      ['all', 'tasks', 'resources'],
    );
    assert.equal(client.filters.some((chip) => chip.key === 'sync' || chip.key === 'unpublished'), false);
  });

  it('groups today, yesterday, and earlier this week', () => {
    const view = buildActivityView({
      audience: 'staff',
      items: staffFeed,
      filter: 'all',
      now: NOW,
    });
    const today = view.groups.find((group) => group.key === 'today');
    const yesterday = view.groups.find((group) => group.key === 'yesterday');
    assert.ok(today);
    assert.ok(yesterday);
    assert.match(today.countLabel, /events/);
    assert.equal(today.rows[0]?.when.endsWith('ago') || today.rows[0]?.when === 'now', true);
    assert.match(yesterday.rows[0]?.when ?? '', /^[A-Z][a-z]{2} \d{1,2}$/);
  });

  it('does not collect an unbounded activity table', () => {
    const portalData = readFileSync(new URL('../../../convex/portalData.ts', import.meta.url), 'utf8');
    const clientStart = portalData.indexOf('export const listActivityForClient');
    const staffStart = portalData.indexOf('export const listActivityForStaff');
    const staffEnd = portalData.indexOf('const OUTBOX_STATUSES');
    const clientBody = portalData.slice(clientStart, staffStart);
    const staffBody = portalData.slice(staffStart, staffEnd);
    assert.equal(clientBody.includes('.collect('), false);
    assert.equal(staffBody.includes('.collect('), false);
    assert.equal(clientBody.includes('.take('), true);
    assert.equal(staffBody.includes('.take('), true);
    const view = readFileSync(new URL('./activity.ts', import.meta.url), 'utf8');
    assert.equal(view.includes('isClientVisibleFeedItem'), false);
    assert.equal(view.includes('clientMaySee'), false);
  });
});
