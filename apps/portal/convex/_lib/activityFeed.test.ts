import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildActivityFeed, type FeedActivity, type FeedAudit, type FeedProject, type FeedTask } from './activityFeed';

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
