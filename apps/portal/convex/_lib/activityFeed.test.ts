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

describe('client activity copy', () => {
  it('derives wording and a lane from a raw activity row', () => {
    const raw = {
      _id: 'home',
      orgId: 'org-northwind',
      projectId: 'proj-public',
      name: 'Homepage wireframes moved to Awaiting Go',
      summary:
        'Maya Chen · Northwind · Source: Notion · ada@northwind.example · warehaus.studio · internal · 0123456789abcdef0123456789abcdef · queued · conflict',
      type: 'project',
      tone: 'accent',
      timestamp: 50,
    };
    assert.deepEqual(Object.keys(raw).sort(), [
      '_id',
      'name',
      'orgId',
      'projectId',
      'summary',
      'timestamp',
      'tone',
      'type',
    ]);
    const invite = {
      _id: 'invite',
      orgId: 'org-northwind',
      projectId: 'proj-public',
      name: 'Jordan Rivera invited to Northwind',
      summary: 'Dana Okafor · invite pending · jordan@client.example',
      type: 'project',
      tone: 'people',
      timestamp: 40,
    };
    const brand = {
      _id: 'brand',
      orgId: 'org-northwind',
      projectId: 'proj-public',
      name: 'Brand guidelines v2 shipped',
      summary: 'Sam Lee · Source: Notion · lastError: write failed',
      type: 'project',
      tone: 'resource',
      timestamp: 30,
    };
    const contacts = [
      { name: 'Maya Chen' },
      { name: 'Dana Okafor' },
      { name: 'Sam Lee' },
      { name: 'ada@northwind.example' },
      { name: 'warehaus.studio ops' },
      { name: 'internal' },
    ];
    const feed = buildActivityFeed({
      audience: 'client',
      orgVisible: true,
      activity: [raw, invite, brand],
      audits: [],
      outbox: [
        {
          _id: 'out-secret',
          kind: 'task-status',
          status: 'conflict',
          database: 'tasks',
          lastError: 'write conflict',
          createdAt: 10,
        },
      ],
      projects: [project],
      tasks: [],
      contacts,
    });
    const staff = buildActivityFeed({
      audience: 'staff',
      orgVisible: true,
      activity: [raw],
      audits: [],
      outbox: [],
      projects: [project],
      tasks: [],
      contacts,
    });

    const home = feed.find((item) => item.id === 'home');
    assert.equal(home?.lane, 'tasks');
    assert.equal(home?.name, 'A task in Northwind site is ready for your review');
    assert.equal(home?.summary, 'Maya Chen');
    const person = feed.find((item) => item.id === 'invite');
    assert.equal(person?.lane, 'people');
    assert.equal(person?.name, 'Dana Okafor invited a teammate');
    assert.equal(person?.summary, 'Dana Okafor');
    assert.equal(person?.name.includes('joined'), false);
    const resource = feed.find((item) => item.id === 'brand');
    assert.equal(resource?.lane, 'resources');
    assert.equal(resource?.name, 'New file shared in Northwind site');
    assert.equal(resource?.summary, 'Sam Lee');
    assert.equal(feed.some((item) => item.id === 'out-secret'), false);
    assert.equal(staff.find((item) => item.id === 'home')?.lane, 'tasks');
    assert.equal(staff.find((item) => item.id === 'home')?.summary.includes('Source: Notion'), true);
    assert.equal(staff.find((item) => item.id === 'home')?.name.includes('Awaiting Go'), true);

    const blob = JSON.stringify(feed);
    assert.equal(blob.includes('@'), false);
    assert.equal(blob.toLowerCase().includes('warehaus.studio'), false);
    assert.equal(/\b[0-9a-f]{32}\b/i.test(blob), false);
    assert.equal(/\binternal\b/i.test(blob), false);
    assert.equal(/\b(queued|inflight|dead|conflict|failed|outbox)\b/i.test(blob), false);
    assert.equal(/\bSource\b/.test(blob), false);
    assert.equal(blob.includes('Awaiting Go'), false);
    assert.equal(blob.includes('Jordan Rivera'), false);
    assert.equal(blob.includes('invite pending'), false);
    for (const item of feed) {
      for (const key of Object.keys(item)) {
        assert.equal(/source|invite-status|^error$|lastError/i.test(key), false, key);
      }
    }
  });

  it('uses a fixed people phrase when the actor is not a known contact', () => {
    const feed = buildActivityFeed({
      audience: 'client',
      orgVisible: true,
      activity: [
        {
          _id: 'invite',
          name: 'Jordan Rivera invited to Northwind',
          summary: 'Someone New · invite pending',
          type: 'project',
          tone: 'people',
          timestamp: 40,
          projectId: 'proj-public',
        },
      ],
      audits: [],
      outbox: [],
      projects: [project],
      tasks: [],
      contacts: [{ name: 'Maya Chen' }],
    });
    assert.equal(feed[0]?.name, 'A teammate was invited');
    assert.equal(feed[0]?.summary, '');
    assert.equal(feed[0]?.lane, 'people');
  });

  it('says joined only when the type or tone means the invite was accepted', () => {
    const feed = buildActivityFeed({
      audience: 'client',
      orgVisible: true,
      activity: [
        {
          _id: 'pending',
          name: 'Jordan Rivera invited to Northwind',
          summary: 'Dana Okafor · invite pending',
          type: 'project',
          tone: 'people',
          timestamp: 30,
          projectId: 'proj-public',
        },
        {
          _id: 'accepted',
          name: 'Jordan Rivera joined Northwind',
          summary: 'Dana Okafor',
          type: 'project',
          tone: 'accepted',
          timestamp: 20,
          projectId: 'proj-public',
        },
      ],
      audits: [],
      outbox: [],
      projects: [project],
      tasks: [],
      contacts: [{ name: 'Dana Okafor' }],
    });
    assert.equal(feed.find((item) => item.id === 'pending')?.name, 'Dana Okafor invited a teammate');
    assert.equal(feed.find((item) => item.id === 'accepted')?.name, 'Dana Okafor joined your team');
    assert.equal(JSON.stringify(feed.find((item) => item.id === 'pending')).includes('joined'), false);
  });

  it('uses a linked record title and falls back to the project name', () => {
    const wires = {
      _id: 'task-wires',
      name: 'Homepage wireframes',
      projectId: 'proj-public',
      notionPageId: 'wires-notion',
      publishToWarehaus: true,
      orgId: 'org-northwind',
    };
    const secret = {
      _id: 'task-secret',
      name: 'Secret draft title',
      projectId: 'proj-public',
      notionPageId: 'secret-notion',
      publishToWarehaus: false,
      orgId: 'org-northwind',
    };
    const otherOrg = {
      _id: 'task-other',
      name: 'Other org task',
      projectId: 'proj-public',
      notionPageId: 'other-notion',
      publishToWarehaus: true,
      orgId: 'org-other',
    };
    const brand = {
      _id: 'res-brand',
      title: 'Brand guidelines v2',
      projectId: 'proj-public',
      notionPageId: 'brand-notion',
      publishToWarehaus: true,
      archive: false,
      orgId: 'org-northwind',
    };
    const hiddenBrand = {
      _id: 'res-hidden',
      title: 'Hidden brand book',
      projectId: 'proj-public',
      notionPageId: 'hidden-brand-notion',
      publishToWarehaus: false,
      archive: false,
      orgId: 'org-northwind',
    };
    const linked = (id: string, notionPageId: string, at: number) => ({
      _id: id,
      action: 'task.updated',
      notionPageId,
      after: JSON.stringify({ properties: { Status: 'To Do' } }),
      actorKind: 'sync',
      createdAt: at,
    });
    const feed = buildActivityFeed({
      audience: 'client',
      orgVisible: true,
      orgId: 'org-northwind',
      activity: [
        {
          _id: 'act-home',
          name: 'Homepage wireframes moved to Awaiting Go',
          summary: 'Maya Chen · Source: Notion',
          type: 'project',
          timestamp: 50,
          projectId: 'proj-public',
        },
        {
          _id: 'act-brand',
          name: 'Brand guidelines v2 shipped',
          summary: 'Sam Lee',
          type: 'project',
          tone: 'resource',
          timestamp: 40,
          projectId: 'proj-public',
        },
      ],
      audits: [
        linked('audit-wires', 'wires-notion', 35),
        linked('audit-secret', 'secret-notion', 34),
        linked('audit-other', 'other-notion', 33),
        linked('audit-brand', 'brand-notion', 32),
        linked('audit-hidden', 'hidden-brand-notion', 31),
      ],
      outbox: [],
      projects: [project],
      tasks: [wires, secret, otherOrg],
      resources: [brand, hiddenBrand],
      contacts: [{ name: 'Maya Chen' }, { name: 'Sam Lee' }],
    });
    assert.equal(feed.find((item) => item.id === 'act-home')?.name, 'A task in Northwind site is ready for your review');
    assert.equal(feed.find((item) => item.id === 'act-brand')?.name, 'New file shared in Northwind site');
    assert.equal(feed.find((item) => item.id === 'audit-wires')?.name, 'Homepage wireframes is ready for your review');
    assert.equal(feed.find((item) => item.id === 'audit-brand')?.name, 'Brand guidelines v2 shared');
    assert.equal(feed.some((item) => item.id === 'audit-secret' || item.id === 'audit-other' || item.id === 'audit-hidden'), false);
    const blob = JSON.stringify(feed);
    assert.equal(blob.includes('Secret draft title'), false);
    assert.equal(blob.includes('Other org task'), false);
    assert.equal(blob.includes('Hidden brand book'), false);
    assert.equal(blob.includes('Awaiting Go'), false);
    assert.equal(blob.includes('Brand guidelines v2 shipped'), false);
  });
});

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
