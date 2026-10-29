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
import { buildActivityView, activityFiltersFor, withActivityLongPreview } from './activity';
import { FIXTURE_CLIENT_ACTIVITY_PAGE, FIXTURE_STAFF_ACTIVITY_PAGE } from './fixtures';

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
    assert.deepEqual(activityFiltersFor('client'), ['all', 'tasks', 'resources', 'people']);
    assert.deepEqual(activityFiltersFor('staff'), [
      'all',
      'tasks',
      'resources',
      'people',
      'sync',
      'unpublished',
    ]);
    assert.equal(client.filters.some((chip) => chip.key === 'sync' || chip.key === 'unpublished'), false);
  });

  it('groups today, yesterday, and earlier this week', () => {
    const view = buildActivityView({
      audience: 'staff',
      items: staffFeed,
      filter: 'all',
      now: NOW,
      timeZone: 'UTC',
    });
    const today = view.groups.find((group) => group.key === 'today');
    const yesterday = view.groups.find((group) => group.key === 'yesterday');
    assert.ok(today);
    assert.ok(yesterday);
    assert.match(today.countLabel, /events/);
    assert.equal(today.rows[0]?.when.endsWith('ago') || today.rows[0]?.when === 'now', true);
    assert.match(yesterday.rows[0]?.when ?? '', /^[A-Z][a-z]{2} \d{1,2}$/);
  });

  it('keeps 8:30pm America/New_York on that local calendar day', () => {
    const zone = 'America/New_York';
    // 00:30Z on Oct 30 is 8:30pm EDT on Oct 29. UTC would already be the next day.
    const now = Date.parse('2026-10-30T00:30:00.000Z');
    const afternoon = Date.parse('2026-10-29T19:00:00.000Z');
    const items = [
      {
        id: 'afternoon',
        name: 'Homepage wireframes are ready for your review',
        summary: 'Maya Chen',
        type: 'project',
        timestamp: new Date(afternoon).toISOString(),
        clientVisible: true,
      },
      {
        id: 'evening',
        name: 'Brand guidelines v2 shared',
        summary: 'Sam Lee',
        type: 'project',
        timestamp: new Date(now).toISOString(),
        clientVisible: true,
      },
    ];
    const local = buildActivityView({
      audience: 'client',
      items,
      filter: 'all',
      now,
      timeZone: zone,
    });
    assert.deepEqual(
      local.groups.map((group) => group.key),
      ['today'],
    );
    assert.equal(local.groups[0]?.rows.every((row) => row.when.endsWith('ago') || row.when === 'now'), true);
    const utc = buildActivityView({
      audience: 'client',
      items,
      filter: 'all',
      now,
      timeZone: 'UTC',
    });
    assert.equal(utc.groups.some((group) => group.key === 'today' && group.rows.some((row) => row.id === 'afternoon')), false);
    assert.equal(utc.groups.some((group) => group.key === 'yesterday' && group.rows.some((row) => row.id === 'afternoon')), true);
  });

  it('counts chips from the same lanes as the rows', () => {
    const items = [
      { id: 'task', name: 'Homepage', summary: 'Maya Chen', type: 'project', lane: 'tasks' as const, timestamp: new Date(NOW).toISOString(), clientVisible: true },
      { id: 'brand', name: 'Brand guidelines v2 shipped', summary: 'Sam Lee', type: 'project', lane: 'resources' as const, timestamp: new Date(NOW - HOUR).toISOString(), clientVisible: true },
      { id: 'invite', name: 'Jordan Rivera joined your team', summary: 'Dana Okafor', type: 'project', lane: 'people' as const, timestamp: new Date(NOW - 2 * HOUR).toISOString(), clientVisible: true },
      { id: 'sync', name: 'Sync retry queued', summary: 'System', type: 'sync', lane: 'sync' as const, timestamp: new Date(NOW - 3 * HOUR).toISOString(), clientVisible: false },
    ];
    const all = buildActivityView({ audience: 'staff', items, filter: 'all', now: NOW, timeZone: 'UTC' });
    const tasks = buildActivityView({ audience: 'staff', items, filter: 'tasks', now: NOW, timeZone: 'UTC' });
    const resources = buildActivityView({ audience: 'staff', items, filter: 'resources', now: NOW, timeZone: 'UTC' });
    const chip = (view: typeof all, key: string) => view.filters.find((item) => item.key === key)?.count;
    assert.equal(chip(all, 'all'), all.rows.length);
    assert.equal(chip(tasks, 'tasks'), tasks.rows.length);
    assert.equal(chip(resources, 'resources'), resources.rows.length);
    assert.deepEqual(tasks.rows.map((row) => row.id), ['task']);
    assert.deepEqual(resources.rows.map((row) => row.id), ['brand']);
    assert.equal(tasks.rows.some((row) => row.id === 'invite'), false);
    assert.equal(chip(all, 'resources'), 1);
    const people = buildActivityView({ audience: 'staff', items, filter: 'people', now: NOW, timeZone: 'UTC' });
    assert.equal(chip(people, 'people'), people.rows.length);
    assert.deepEqual(
      people.rows.map((row) => row.id),
      ['invite'],
    );
    const laneSum = (view: typeof all) =>
      ['tasks', 'resources', 'people', 'sync'].reduce((sum, key) => sum + (chip(view, key) ?? 0), 0);
    assert.equal(chip(all, 'all'), laneSum(all));
    assert.equal(chip(all, 'all'), all.rows.length);
    const long = withActivityLongPreview(all, 'all');
    assert.equal(long.filters.find((item) => item.key === 'all')?.count, long.rows.length);
    assert.equal(long.filters.find((item) => item.key === 'all')?.count, laneSum(long));
    assert.equal(long.filters.find((item) => item.key === 'people')?.count, chip(all, 'people'));
    assert.equal(
      long.groups.reduce((sum, group) => sum + group.rows.length, 0),
      long.rows.length,
    );
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
    assert.match(clientBody, /query\('contacts'\)/);
    assert.equal(clientBody.includes('email'), false);
    assert.equal(clientBody.includes('.take('), true);
    assert.equal(staffBody.includes('.take('), true);
    const view = readFileSync(new URL('./activity.ts', import.meta.url), 'utf8');
    assert.equal(view.includes('isClientVisibleFeedItem'), false);
    assert.equal(view.includes('clientMaySee'), false);
  });

  it('fixture All equals the lane chips and People equals its rows', () => {
    const now = Date.now();
    const staff = buildActivityView({
      audience: 'staff',
      items: FIXTURE_STAFF_ACTIVITY_PAGE,
      filter: 'all',
      now,
      timeZone: 'UTC',
    });
    const client = buildActivityView({
      audience: 'client',
      items: FIXTURE_CLIENT_ACTIVITY_PAGE,
      filter: 'all',
      now,
      timeZone: 'UTC',
    });
    const chip = (view: typeof staff, key: string) => view.filters.find((item) => item.key === key)?.count ?? 0;
    const laneSum = (view: typeof staff) =>
      chip(view, 'tasks') + chip(view, 'resources') + chip(view, 'people') + chip(view, 'sync');
    assert.equal(chip(staff, 'all'), 8);
    assert.equal(chip(staff, 'all'), laneSum(staff));
    assert.equal(chip(staff, 'all'), staff.rows.length);
    assert.equal(chip(staff, 'people'), staff.rows.filter((row) => row.lane === 'people').length);
    assert.equal(staff.filters.some((item) => item.label === 'People'), true);
    assert.equal(chip(client, 'all'), 3);
    assert.equal(chip(client, 'all'), laneSum(client));
    assert.equal(chip(client, 'all'), client.rows.length);
    assert.equal(chip(client, 'people'), client.rows.filter((row) => row.lane === 'people').length);
    assert.equal(client.filters.some((item) => item.label === 'People'), true);
    assert.equal(client.filters.some((item) => item.key === 'sync' || item.key === 'unpublished'), false);
    const clientPeople = buildActivityView({
      audience: 'client',
      items: FIXTURE_CLIENT_ACTIVITY_PAGE,
      filter: 'people',
      now,
      timeZone: 'UTC',
    });
    assert.equal(clientPeople.rows.length, chip(client, 'people'));
    assert.equal(clientPeople.rows.every((row) => row.lane === 'people'), true);
  });
});
