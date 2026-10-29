import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildActivityFeed,
  type FeedActivity,
  type FeedAudit,
  type FeedOutbox,
  type FeedProject,
  type FeedTask,
} from './activityFeed';

const project: FeedProject = {
  _id: 'proj-public',
  name: 'Northwind site',
  type: [],
  publishToWarehaus: true,
  archive: false,
};

const tasks: FeedTask[] = [
  {
    _id: 'task-public',
    name: 'Build the project page',
    projectId: 'proj-public',
    notionPageId: 'task-public-notion',
    publishToWarehaus: true,
  },
  {
    _id: 'task-draft',
    name: 'Draft estimate',
    projectId: 'proj-public',
    notionPageId: 'task-draft-notion',
    publishToWarehaus: false,
  },
];

const activity: FeedActivity[] = [
  {
    _id: 'act-task',
    name: 'Task moved',
    summary: 'Build the project page is in progress',
    type: 'task',
    timestamp: 30,
    projectId: 'proj-public',
  },
  {
    _id: 'act-project',
    name: 'Site update',
    summary: 'Shared with the client',
    type: 'project',
    timestamp: 20,
    projectId: 'proj-public',
  },
];

const audits: FeedAudit[] = [
  {
    _id: 'audit-draft',
    action: 'task.updated',
    notionPageId: 'task-draft-notion',
    after: JSON.stringify({ properties: { Status: 'Inbox', Name: 'Draft estimate' } }),
    actorKind: 'sync',
    createdAt: 15,
  },
  {
    _id: 'audit-public',
    action: 'task.updated',
    notionPageId: 'task-public-notion',
    after: JSON.stringify({ properties: { Status: 'In Progress' } }),
    actorKind: 'sync',
    createdAt: 10,
  },
];

describe('client activity feed', () => {
  it('drops a task-type row and an unpublished task audit', () => {
    const feed = buildActivityFeed({
      audience: 'client',
      orgVisible: true,
      activity,
      audits,
      outbox: [],
      projects: [project],
      tasks,
    });
    const ids = feed.map((item) => item.id);
    assert.equal(ids.includes('act-task'), false);
    assert.equal(ids.includes('audit-draft'), false);
    assert.equal(JSON.stringify(feed).includes('Draft estimate'), false);
    assert.equal(ids.includes('act-project'), true);
    assert.equal(ids.includes('audit-public'), true);
  });
});

const publicProject: FeedProject = {
  _id: 'proj-public',
  name: 'Northwind site',
  type: [],
  publishToWarehaus: true,
  archive: false,
  notionPageId: 'proj-public-notion',
};

const internalProject: FeedProject = {
  _id: 'proj-internal',
  name: 'warehaus.studio',
  type: [],
  publishToWarehaus: true,
  archive: false,
  notionPageId: 'proj-internal-notion',
};

const staffOnlyProject: FeedProject = {
  _id: 'proj-staff',
  name: 'Ops board',
  type: ['Internal'],
  publishToWarehaus: true,
  archive: false,
  notionPageId: 'proj-staff-notion',
};

const agreementTasks: FeedTask[] = [
  {
    _id: 'task-public',
    name: 'Build the project page',
    projectId: 'proj-public',
    notionPageId: 'task-public-notion',
    publishToWarehaus: true,
  },
  {
    _id: 'task-draft',
    name: 'Draft estimate',
    projectId: 'proj-public',
    notionPageId: 'task-draft-notion',
    publishToWarehaus: false,
  },
  {
    _id: 'task-hidden',
    name: 'Hidden checklist',
    projectId: 'proj-public',
    notionPageId: 'task-hidden-notion',
    publishToWarehaus: true,
    syncHiddenAt: 4,
  },
  {
    _id: 'task-internal',
    name: 'Studio ops',
    projectId: 'proj-internal',
    notionPageId: 'task-internal-notion',
    publishToWarehaus: true,
  },
  {
    _id: 'task-staff',
    name: 'Staff only task',
    projectId: 'proj-staff',
    notionPageId: 'task-staff-notion',
    publishToWarehaus: true,
  },
];

const agreementActivity: FeedActivity[] = [
  {
    _id: 'act-task',
    name: 'Task moved',
    summary: 'Build the project page is in progress',
    type: 'task',
    timestamp: 90,
    projectId: 'proj-public',
  },
  {
    _id: 'act-project',
    name: 'Site update',
    summary: 'Shared with the client',
    type: 'project',
    timestamp: 80,
    projectId: 'proj-public',
  },
  {
    _id: 'act-none',
    name: 'General update',
    summary: 'No project and no task',
    type: 'project',
    timestamp: 70,
  },
  {
    _id: 'act-internal',
    name: 'Internal note',
    summary: 'warehaus.studio planning',
    type: 'project',
    timestamp: 60,
    projectId: 'proj-internal',
  },
];

function audit(id: string, notionPageId: string | undefined, at: number): FeedAudit {
  return {
    _id: id,
    action: 'task.updated',
    notionPageId,
    after: JSON.stringify({ properties: { Status: 'To Do', Name: id } }),
    actorKind: 'sync',
    createdAt: at,
  };
}

const agreementAudits: FeedAudit[] = [
  audit('audit-public', 'task-public-notion', 50),
  audit('audit-draft', 'task-draft-notion', 40),
  audit('audit-hidden', 'task-hidden-notion', 30),
  audit('audit-internal', 'proj-internal-notion', 20),
  audit('audit-staff', 'proj-staff-notion', 15),
  audit('audit-notask', undefined, 12),
];

const agreementOutbox: FeedOutbox[] = [
  {
    _id: 'out-1',
    kind: 'update',
    status: 'failed',
    database: 'tasks',
    notionPageId: 'task-public-notion',
    lastError: 'retry',
    createdAt: 5,
  },
];

describe('staff and client activity agree', () => {
  it('sets clientVisible on every staff row to match the client feed', () => {
    const shared = {
      orgVisible: true,
      activity: agreementActivity,
      audits: agreementAudits,
      outbox: agreementOutbox,
      projects: [publicProject, internalProject, staffOnlyProject],
      tasks: agreementTasks,
      limit: 100,
    };
    const staff = buildActivityFeed({ audience: 'staff', ...shared });
    const client = buildActivityFeed({ audience: 'client', ...shared });
    const clientIds = new Set(client.map((item) => item.id));
    const staffIds = new Set(staff.map((item) => item.id));

    for (const item of staff) {
      assert.equal(typeof item.clientVisible, 'boolean', item.id);
      assert.equal(item.clientVisible, clientIds.has(item.id), item.id);
    }
    for (const item of client) {
      const staffItem = staff.find((row) => row.id === item.id);
      assert.ok(staffItem, item.id);
      assert.equal(staffItem?.clientVisible, true, item.id);
    }

    assert.equal(staff.find((row) => row.id === 'act-task')?.clientVisible, false);
    assert.equal(staff.find((row) => row.id === 'act-project')?.clientVisible, true);
    assert.equal(staff.find((row) => row.id === 'act-none')?.clientVisible, false);
    assert.equal(staff.find((row) => row.id === 'act-internal')?.clientVisible, false);
    assert.equal(staff.find((row) => row.id === 'audit-public')?.clientVisible, true);
    assert.equal(staff.find((row) => row.id === 'audit-draft')?.clientVisible, false);
    assert.equal(staff.find((row) => row.id === 'audit-hidden')?.clientVisible, false);
    assert.equal(staff.find((row) => row.id === 'audit-internal')?.clientVisible, false);
    assert.equal(staff.find((row) => row.id === 'audit-staff')?.clientVisible, false);
    assert.equal(staff.find((row) => row.id === 'audit-notask')?.clientVisible, false);
    assert.equal(staff.find((row) => row.id === 'out-1')?.clientVisible, false);
    assert.equal(clientIds.has('act-task'), false);
    assert.equal(clientIds.has('audit-public'), true);
    assert.equal(staffIds.has('audit-public'), true);
    assert.equal(JSON.stringify(client).includes('Draft estimate'), false);
    assert.equal(JSON.stringify(client).includes('warehaus.studio'), false);
  });
});
