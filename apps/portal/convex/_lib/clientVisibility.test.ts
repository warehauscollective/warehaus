import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TASK_UNAVAILABLE } from '@warehaus/portal-sync';
import { getForClient as getDocForClient, listForClient as listDocsForClient } from '../clientDocs';
import { listForClient as listPeopleForClient } from '../contacts';
import { getSnapshot, listActivityForClient, listActivityForStaff } from '../portalData';
import {
  listForClient as listProjectsForClient,
  listForOrgAdmin,
  listForStaff,
  listPublishedForStaff,
} from '../projects';
import {
  getForClient as getResourceForClient,
  listForClient as listResourcesForClient,
  usedInTasks,
  usedInTasksForClient,
} from '../sharedResources';
import {
  activityForClient,
  activityForStaff,
  getForClient,
  listForClient as listTasksForClient,
  listForStaff as listTasksForStaff,
} from '../tasks';
import { PortalAuthError } from './identity';

type Row = Record<string, unknown> & { _id: string };

class EqBuilder {
  private eqs: Array<[string, unknown]> = [];
  eq(field: string, value: unknown): this {
    this.eqs.push([field, value]);
    return this;
  }
  matches(row: Row): boolean {
    return this.eqs.every(([field, value]) => row[field] === value);
  }
}

class MemoryIndex {
  constructor(private readonly rows: Row[]) {}
  order(direction: 'asc' | 'desc') {
    const sorted = [...this.rows].sort((a, b) => {
      const av = (a.timestamp ?? a.createdAt ?? 0) as number | string;
      const bv = (b.timestamp ?? b.createdAt ?? 0) as number | string;
      if (av === bv) return 0;
      const cmp = av < bv ? -1 : 1;
      return direction === 'desc' ? -cmp : cmp;
    });
    return {
      take: async (n: number) => sorted.slice(0, n),
      collect: async () => sorted,
    };
  }
  async take(n: number) {
    return this.rows.slice(0, n);
  }
  async collect() {
    return this.rows;
  }
  async unique() {
    if (this.rows.length > 1) throw new Error('Expected a unique row');
    return this.rows[0] ?? null;
  }
}

function memoryDb(tables: Record<string, Row[]>) {
  return {
    async get(id: string) {
      for (const rows of Object.values(tables)) {
        const found = rows.find((row) => row._id === id);
        if (found) return found;
      }
      return null;
    },
    query(table: string) {
      const rows = tables[table] ?? [];
      return {
        withIndex(_name: string, build?: (q: EqBuilder) => EqBuilder) {
          const matched = build ? rows.filter((row) => build(new EqBuilder()).matches(row)) : rows;
          return new MemoryIndex(matched);
        },
        collect: async () => rows,
      };
    },
  };
}

const org = {
  _id: 'org-northwind',
  companyName: 'Northwind',
  slug: 'northwind',
  portalAccess: 'Enabled' as const,
  notionPageId: 'client-notion',
  lastSyncedAt: 1,
};

const otherOrg = {
  _id: 'org-lumen',
  companyName: 'Lumen Dental',
  slug: 'lumen',
  portalAccess: 'Enabled' as const,
  notionPageId: 'lumen-notion',
  lastSyncedAt: 1,
};

const tables: Record<string, Row[]> = {
  clients: [org, otherOrg],
  contacts: [
    {
      _id: 'contact-client',
      orgId: org._id,
      name: 'Ada Client',
      email: 'ada@northwind.test',
      authUserId: 'auth-client',
      role: 'Client Member',
      portalAccess: 'Enabled',
      notionPageId: 'contact-notion',
      lastSyncedAt: 1,
    },
    {
      _id: 'contact-staff',
      orgId: org._id,
      name: 'Maya Internal',
      email: 'maya@warehaus.studio',
      authUserId: 'auth-staff',
      role: 'Warehaus Staff',
      portalAccess: 'Enabled',
      notionPageId: 'staff-notion',
      lastSyncedAt: 1,
    },
    {
      _id: 'contact-studio-mail',
      orgId: org._id,
      name: 'Sam Studio',
      email: 'sam@warehaus.studio',
      authUserId: 'auth-studio-mail',
      role: 'Client Member',
      portalAccess: 'Enabled',
      notionPageId: 'studio-mail-notion',
      lastSyncedAt: 1,
    },
  ],
  projects: [
    {
      _id: 'proj-public',
      orgId: org._id,
      name: 'Northwind site',
      status: 'In Progress',
      type: ['Website'],
      archive: false,
      publishToWarehaus: true,
      notionPageId: 'project-public',
      lastSyncedAt: 1,
      description: 'Public site',
      stack: [],
    },
    {
      _id: 'proj-internal',
      orgId: org._id,
      name: 'warehaus.studio',
      status: 'In Progress',
      type: ['Internal'],
      archive: false,
      publishToWarehaus: true,
      notionPageId: 'project-internal',
      lastSyncedAt: 1,
      description: 'Staff only studio',
      stack: [],
    },
  ],
  tasks: [
    {
      _id: 'task-public',
      orgId: org._id,
      projectId: 'proj-public',
      name: 'Homepage',
      status: 'To Do',
      isDone: false,
      publishToWarehaus: true,
      notionPageId: 'task-public-notion',
      lastSyncedAt: 1,
      description: 'Staff only task copy',
      estimate: 'estimate-secret',
      priority: 'priority-high',
      stage: 'Planning',
      stagePendingAt: 99,
      stageSynced: 'Idea',
      stagePendingBaseEditedTime: '2026-10-28T00:00:00.000Z',
      stagePendingPullRequest: 'pending-pr-secret',
      pullRequestUrl: 'https://github.com/warehaus/secret/pull/1',
    },
    {
      _id: 'task-internal',
      orgId: org._id,
      projectId: 'proj-internal',
      name: 'Studio ops',
      status: 'To Do',
      isDone: false,
      stage: 'Shipped',
      publishToWarehaus: true,
      notionPageId: 'task-internal-notion',
      lastSyncedAt: 1,
    },
    {
      _id: 'task-draft',
      orgId: org._id,
      projectId: 'proj-public',
      name: 'Secret draft',
      status: 'Inbox',
      isDone: false,
      stage: 'Parked',
      publishToWarehaus: false,
      notionPageId: 'task-draft-notion',
      lastSyncedAt: 1,
    },
    {
      _id: 'task-hidden',
      orgId: org._id,
      projectId: 'proj-public',
      name: 'Hidden launch task',
      status: 'To Do',
      isDone: false,
      stage: 'Awaiting Go',
      publishToWarehaus: true,
      notionPageId: 'task-hidden-notion',
      lastSyncedAt: 1,
      syncHiddenAt: 5,
    },
  ],
  activity: [
    {
      _id: 'act-internal',
      orgId: org._id,
      projectId: 'proj-internal',
      name: 'Internal note',
      type: 'project',
      summary: 'warehaus.studio planning',
      timestamp: 30,
      tone: 'muted',
    },
    {
      _id: 'act-sync',
      orgId: org._id,
      projectId: 'proj-public',
      name: 'Sync',
      type: 'sync',
      summary: 'sync noise',
      timestamp: 25,
      tone: 'muted',
    },
    {
      _id: 'act-public',
      orgId: org._id,
      projectId: 'proj-public',
      name: 'Public note',
      type: 'project',
      summary: 'Northwind site update',
      timestamp: 20,
      tone: 'muted',
    },
    {
      _id: 'act-leaky',
      orgId: org._id,
      projectId: 'proj-public',
      name: 'Homepage wireframes moved to Awaiting Go',
      type: 'project',
      summary: 'Maya Chen · Source: Notion · ada@northwind.test · invite pending',
      timestamp: 40,
      tone: 'muted',
    },
    {
      _id: 'act-general',
      orgId: org._id,
      name: 'Org note',
      type: 'project',
      summary: 'General update',
      timestamp: 10,
      tone: 'muted',
    },
    {
      _id: 'act-task',
      orgId: org._id,
      projectId: 'proj-public',
      name: 'Task moved',
      type: 'task',
      summary: 'Task row for a published task',
      timestamp: 15,
      tone: 'muted',
    },
  ],
  clientDocs: [
    {
      _id: 'doc-public',
      orgId: org._id,
      projectId: 'proj-public',
      title: 'Public brief',
      summary: 'Shared scope',
      docType: 'Brief',
      order: 1,
      status: 'Published',
      publishToWarehaus: true,
      notionPageId: 'doc-public-notion',
      lastSyncedAt: 1,
    },
    {
      _id: 'doc-draft',
      orgId: org._id,
      projectId: 'proj-public',
      title: 'Secret doc',
      summary: 'Draft',
      docType: 'Note',
      status: 'Draft',
      publishToWarehaus: false,
      notionPageId: 'doc-draft-notion',
      lastSyncedAt: 1,
    },
    {
      _id: 'doc-unpub',
      orgId: org._id,
      projectId: 'proj-public',
      title: 'Unpublished doc',
      summary: 'Held',
      docType: 'Note',
      status: 'Published',
      publishToWarehaus: false,
      notionPageId: 'doc-unpub-notion',
      lastSyncedAt: 1,
    },
    {
      _id: 'doc-internal',
      orgId: org._id,
      projectId: 'proj-internal',
      title: 'Studio doc',
      summary: 'Internal notes',
      docType: 'Note',
      status: 'Published',
      publishToWarehaus: true,
      notionPageId: 'doc-internal-notion',
      lastSyncedAt: 1,
    },
    {
      _id: 'doc-orphan',
      orgId: org._id,
      projectId: 'proj-gone',
      title: 'Orphan doc',
      summary: 'Missing project',
      docType: 'Note',
      order: 3,
      status: 'Published',
      publishToWarehaus: true,
      notionPageId: 'doc-orphan-notion',
      lastSyncedAt: 1,
    },
    {
      _id: 'doc-org',
      orgId: org._id,
      title: 'Org guide',
      summary: 'No project',
      docType: 'Guide',
      order: 0,
      status: 'Published',
      publishToWarehaus: true,
      notionPageId: 'doc-org-notion',
      lastSyncedAt: 1,
    },
  ],
  sharedResources: [
    {
      _id: 'res-public',
      orgId: org._id,
      projectId: 'proj-public',
      title: 'Kickoff notes',
      description: 'Shared recap',
      type: 'Meeting notes',
      url: 'https://example.com/recap',
      publishToWarehaus: true,
      archive: false,
      externalId: 'wh_res_secret',
      sourceNotionUrl: 'https://www.notion.so/secret-page',
      notionPageId: 'res-public-notion',
      lastSyncedAt: 1,
    },
    {
      _id: 'res-draft',
      orgId: org._id,
      projectId: 'proj-public',
      title: 'Draft file',
      publishToWarehaus: false,
      archive: false,
      notionPageId: 'res-draft-notion',
      lastSyncedAt: 1,
    },
    {
      _id: 'res-internal',
      orgId: org._id,
      projectId: 'proj-internal',
      title: 'Studio file',
      publishToWarehaus: true,
      archive: false,
      notionPageId: 'res-internal-notion',
      lastSyncedAt: 1,
    },
    {
      _id: 'res-orphan',
      orgId: org._id,
      projectId: 'proj-gone',
      title: 'Orphan file',
      publishToWarehaus: true,
      archive: false,
      notionPageId: 'res-orphan-notion',
      lastSyncedAt: 1,
    },
    {
      _id: 'res-foreign',
      orgId: otherOrg._id,
      projectId: 'proj-foreign',
      title: 'Foreign recap',
      description: 'Another client',
      type: 'Meeting notes',
      publishToWarehaus: true,
      archive: false,
      notionPageId: 'res-foreign-notion',
      lastSyncedAt: 1,
    },
    {
      _id: 'res-org',
      orgId: org._id,
      title: 'Org file',
      publishToWarehaus: true,
      archive: false,
      notionPageId: 'res-org-notion',
      lastSyncedAt: 1,
    },
  ],
  syncMeta: [],
  auditEvents: [
    {
      _id: 'audit-public',
      orgId: org._id,
      action: 'outbox.confirmed',
      actorKind: 'staff',
      notionPageId: 'task-public-notion',
      after: JSON.stringify({ properties: { Status: 'To Do' } }),
      createdAt: 40,
    },
    {
      _id: 'audit-description',
      orgId: org._id,
      action: 'outbox.confirmed',
      actorKind: 'staff',
      notionPageId: 'task-public-notion',
      after: JSON.stringify({ properties: { Description: 'Staff only task copy' } }),
      createdAt: 35,
    },
    {
      _id: 'audit-internal',
      orgId: org._id,
      action: 'outbox.confirmed',
      actorKind: 'staff',
      notionPageId: 'task-internal-notion',
      after: JSON.stringify({ properties: { Status: 'To Do', Name: 'Studio ops' } }),
      createdAt: 45,
    },
  ],
  taskResources: [
    { _id: 'link-public', orgId: org._id, resourceId: 'res-public', taskId: 'task-public' },
    { _id: 'link-draft', orgId: org._id, resourceId: 'res-public', taskId: 'task-draft' },
    { _id: 'link-internal', orgId: org._id, resourceId: 'res-public', taskId: 'task-internal' },
    { _id: 'link-foreign', orgId: otherOrg._id, resourceId: 'res-foreign', taskId: 'task-foreign' },
  ],
  notionOutbox: [
    {
      _id: 'outbox-internal',
      orgId: org._id,
      kind: 'task-description',
      status: 'conflict',
      database: 'tasks',
      notionPageId: 'task-internal-notion',
      lastError: 'warehaus.studio write conflict',
      createdAt: 50,
      idempotencyKey: 'task-description:internal',
      payload: '{}',
      actor: 'staff',
      attempts: 1,
      nextAttemptAt: 50,
    },
  ],
};

const ctx = {
  auth: {
    getUserIdentity: async () => ({ subject: 'auth-client' }),
  },
  db: memoryDb(tables),
};

type Handler = (
  ctx: {
    auth: { getUserIdentity: () => Promise<{ subject: string }> };
    db: ReturnType<typeof memoryDb>;
  },
  args: Record<string, unknown>,
) => Promise<unknown>;

const staffCtx = {
  auth: {
    getUserIdentity: async () => ({ subject: 'auth-staff' }),
  },
  db: memoryDb(tables),
};

function run(fn: object, args: Record<string, unknown> = {}) {
  return (fn as { _handler: Handler })._handler(ctx, args);
}

function runStaff(fn: object, args: Record<string, unknown> = {}) {
  return (fn as { _handler: Handler })._handler(staffCtx, args);
}

function text(value: unknown): string {
  return JSON.stringify(value);
}

describe('client identity against warehaus.studio', () => {
  it('returns the shared project and task and none of the internal rows', async () => {
    const projects = await run(listProjectsForClient);
    const tasks = await run(listTasksForClient);
    const docs = await run(listDocsForClient);
    const resources = await run(listResourcesForClient);
    const people = await run(listPeopleForClient);
    const snapshot = await run(getSnapshot);
    const bundled = text({ projects, tasks, docs, resources, people, snapshot });

    assert.match(bundled, /Northwind site/);
    assert.match(bundled, /Homepage/);
    assert.match(bundled, /A task in Northwind site is ready for your review/);
    assert.equal(bundled.includes('Northwind site update'), false);
    assert.equal(bundled.includes('Public note'), false);
    assert.equal(bundled.includes('Awaiting Go'), false);
    assert.equal(bundled.includes('Maya Chen'), false);
    assert.equal(bundled.includes('invite pending'), false);
    assert.equal(bundled.includes('General update'), false);
    assert.equal(bundled.includes('Task row for a published task'), false);
    assert.equal(bundled.includes('warehaus.studio'), false);
    assert.equal(bundled.includes('Studio ops'), false);
    assert.equal(bundled.includes('Secret draft'), false);
    assert.equal(bundled.includes('proj-internal'), false);
    assert.equal(bundled.includes('task-internal'), false);
    assert.equal(bundled.includes('project-internal'), false);
    assert.equal(bundled.includes('sync noise'), false);
    assert.equal(bundled.includes('Staff only task copy'), false);
    assert.equal(bundled.includes('Public brief'), true);
    assert.equal(bundled.includes('Kickoff notes'), true);
    assert.equal(bundled.includes('Ada Client'), true);
    assert.equal(bundled.includes('Secret doc'), false);
    assert.equal(bundled.includes('Unpublished doc'), false);
    assert.equal(bundled.includes('Studio doc'), false);
    assert.equal(bundled.includes('Draft file'), false);
    assert.equal(bundled.includes('Studio file'), false);
    assert.equal(bundled.includes('maya@warehaus.studio'), false);
    assert.equal(bundled.includes('sam@warehaus.studio'), false);
    assert.equal(bundled.includes('Ada Client'), true);
    assert.equal(bundled.includes('Orphan doc'), false);
    assert.equal(bundled.includes('Org guide'), true);
    assert.equal(bundled.includes('Orphan file'), false);
    assert.equal(bundled.includes('Org file'), true);
    assert.equal(bundled.includes('Foreign recap'), false);
    assert.equal(bundled.includes('Lumen Dental'), false);
    assert.equal(text(docs).includes('notionPageId'), false);
    assert.equal(text(docs).includes('"order"'), false);
    assert.equal(text(docs).includes('publishToWarehaus'), false);
    assert.equal(text(docs).includes('lastSyncedAt'), false);
    assert.equal(text(docs).includes('syncHidden'), false);
    assert.equal(text(docs).includes('syncState'), false);
    assert.equal(text(docs).includes('"status"'), false);
    assert.equal(text(resources).includes('notionPageId'), false);
    assert.equal(text(resources).includes('lastSyncedAt'), false);
    assert.equal(text(resources).includes('updatedAt'), true);
    const listedTasks = tasks as Array<{ name: string; stage: string | null }>;
    assert.equal(listedTasks.some((task) => task.name === 'Homepage' && task.stage === 'Planning'), true);
    assert.equal(listedTasks.some((task) => task.name === 'Secret draft' || task.name === 'Studio ops' || task.name === 'Hidden launch task'), false);
    const docTitles = (docs as Array<{ title: string }>).map((doc) => doc.title);
    assert.deepEqual(docTitles.slice(0, 2), ['Org guide', 'Public brief']);
    assert.equal(bundled.includes('Warehaus Staff'), false);
    assert.equal(bundled.includes('estimate-secret'), false);
    assert.equal(bundled.includes('priority-high'), false);
    assert.equal(bundled.includes('secret/pull/1'), false);
    assert.equal(bundled.includes('pending-pr-secret'), false);
    assert.equal(bundled.includes('stagePending'), false);
    assert.equal(bundled.includes('stageSynced'), false);
    assert.equal(bundled.includes('stagePendingAt'), false);
    assert.equal(bundled.includes('wh_res_secret'), false);
    assert.equal(bundled.includes('notion.so'), false);
    assert.equal(bundled.includes('publishToWarehaus'), false);
    assert.equal(text(docs).includes('"status"'), false);
    assert.equal(text(people).includes('role'), false);

    const publicDoc = await run(getDocForClient, { docId: 'doc-public' });
    assert.equal((publicDoc as { title: string }).title, 'Public brief');
    assert.equal('notionPageId' in (publicDoc as object), false);
    assert.equal('order' in (publicDoc as object), false);
    assert.equal('publishToWarehaus' in (publicDoc as object), false);
    assert.equal('syncState' in (publicDoc as object), false);
    assert.equal('lastSyncedAt' in (publicDoc as object), false);
    assert.equal('status' in (publicDoc as object), false);
    for (const docId of ['doc-draft', 'doc-unpub', 'doc-internal', 'doc-orphan', 'doc-missing']) {
      await assert.rejects(run(getDocForClient, { docId }), (err: unknown) => {
        assert.ok(err instanceof PortalAuthError);
        assert.equal(err.message, 'Doc not found');
        return true;
      });
    }
    const publicResource = await run(getResourceForClient, { resourceId: 'res-public' });
    assert.equal((publicResource as { name: string }).name, 'Kickoff notes');
    assert.equal('notionPageId' in (publicResource as object), false);
    assert.equal('lastSyncedAt' in (publicResource as object), false);
    assert.equal(typeof (publicResource as { updatedAt: number }).updatedAt, 'number');
    const orgResource = await run(getResourceForClient, { resourceId: 'res-org' });
    assert.equal((orgResource as { name: string }).name, 'Org file');
    for (const resourceId of ['res-draft', 'res-internal', 'res-orphan', 'res-missing']) {
      await assert.rejects(run(getResourceForClient, { resourceId }), (err: unknown) => {
        assert.ok(err instanceof PortalAuthError);
        assert.equal(err.message, 'Resource not found');
        return true;
      });
    }

    const snapshotBody = snapshot as {
      projects: Array<{ name: string }>;
      tasks: Array<{ name: string }>;
      activity: Array<{ name: string; summary: string }>;
    };
    assert.deepEqual(snapshotBody.projects.map((project) => project.name), ['Northwind site']);
    assert.deepEqual(snapshotBody.tasks.map((task) => task.name), ['Homepage']);
    assert.deepEqual(
      snapshotBody.activity.map((item) => item.name),
      ['A task in Northwind site is ready for your review', 'A task in Northwind site is ready for your review'],
    );
    assert.deepEqual(
      snapshotBody.activity.map((item) => item.summary),
      ['', ''],
    );
    const snapshotText = text(snapshot);
    assert.equal((snapshot as { leadName?: string }).leadName, 'Maya Internal');
    assert.equal(snapshotText.includes('maya@warehaus.studio'), false);
    assert.equal(snapshotText.includes('contact-staff'), false);
    assert.equal(snapshotText.includes('staff-notion'), false);
    assert.equal(snapshotText.includes('notionPageId'), false);
    assert.equal(snapshotText.includes('publishToWarehaus'), false);
    assert.equal(snapshotText.includes('lastSyncedAt'), false);
    assert.equal(snapshotText.includes('syncHidden'), false);
    assert.equal(snapshotText.includes('syncState'), false);
  });

  it('returns used-in-tasks without publish, sync, or warehaus.studio rows', async () => {
    const visible = (await run(usedInTasksForClient, { resourceId: 'res-public' })) as Array<{ name: string }>;
    assert.deepEqual(visible.map((task) => task.name), ['Homepage']);
    const hiddenResource = await run(usedInTasksForClient, { resourceId: 'res-internal' });
    assert.deepEqual(hiddenResource, []);
    const draft = await run(usedInTasksForClient, { resourceId: 'res-draft' });
    assert.deepEqual(draft, []);
    const foreign = await run(usedInTasksForClient, { resourceId: 'res-foreign' });
    assert.deepEqual(foreign, []);
    assert.equal(text(foreign).includes('Foreign recap'), false);
    assert.equal(text(foreign).includes('Lumen Dental'), false);
    const body = text(visible);
    assert.equal(body.includes('notionPageId'), false);
    assert.equal(body.includes('publishToWarehaus'), false);
    assert.equal(body.includes('lastSyncedAt'), false);
    assert.equal(body.includes('warehaus.studio'), false);
    assert.equal(body.includes('Studio ops'), false);
    assert.equal(body.includes('Secret draft'), false);
    const staff = (await runStaff(usedInTasks, { resourceId: 'res-public' })) as Array<{ name: string }>;
    assert.deepEqual(staff.map((task) => task.name), ['Homepage', 'Secret draft', 'Studio ops']);
  });

  it('keeps raw activity text out of the client snapshot', async () => {
    const snapshot = (await run(getSnapshot)) as { activity: Array<{ name: string; summary: string }> };
    const blob = text(snapshot.activity);
    assert.equal(blob.includes('Source'), false);
    assert.equal(blob.includes('Awaiting Go'), false);
    assert.equal(blob.includes('Maya Chen'), false);
    assert.equal(blob.includes('Public note'), false);
    assert.equal(blob.includes('@'), false);
    assert.equal(/invite pending/i.test(blob), false);
    assert.match(blob, /A task in Northwind site is ready for your review/);
  });

  it('uses the same unavailable message for a hidden task and a missing task', async () => {
    const visible = await run(getForClient, { taskId: 'task-public' });
    assert.equal((visible as { name: string }).name, 'Homepage');
    assert.equal((visible as { stage: string | null }).stage, 'Planning');
    assert.equal('stagePending' in (visible as object), false);
    assert.equal('pullRequestUrl' in (visible as object), false);

    for (const taskId of ['task-internal', 'task-missing', 'task-draft']) {
      await assert.rejects(run(getForClient, { taskId }), (err: unknown) => {
        assert.ok(err instanceof PortalAuthError);
        assert.equal(err.message, TASK_UNAVAILABLE);
        assert.equal(err.message.includes('warehaus'), false);
        return true;
      });
    }
  });

  it('keeps internal projects, server descriptions, and outbox rows out of the client feed', async () => {
    const feed = await run(listActivityForClient);
    const timeline = await run(activityForClient, { taskId: 'task-public' });
    const bundled = text({ feed, timeline });
    assert.match(bundled, /A task in Northwind site is ready for your review/);
    assert.match(bundled, /Homepage was updated/);
    assert.equal(bundled.includes('Northwind site update'), false);
    assert.equal(bundled.includes('Public note'), false);
    assert.equal(bundled.includes('Status:'), false);
    assert.equal(bundled.includes('To Do'), false);
    assert.equal(bundled.includes('ada@northwind.test'), false);
    assert.equal(bundled.includes('maya@warehaus.studio'), false);
    assert.equal(bundled.includes('warehaus.studio'), false);
    assert.equal(bundled.includes('Studio ops'), false);
    assert.equal(bundled.includes('sync noise'), false);
    assert.equal(bundled.includes('Staff only task copy'), false);
    assert.equal(bundled.includes('write conflict'), false);
    assert.equal(bundled.includes('task-internal-notion'), false);

    await assert.rejects(run(activityForClient, { taskId: 'task-internal' }), (err: unknown) => {
      assert.ok(err instanceof PortalAuthError);
      assert.equal(err.message, TASK_UNAVAILABLE);
      return true;
    });
    for (const query of [listActivityForStaff, activityForStaff]) {
      await assert.rejects(run(query, { taskId: 'task-public' }), (err: unknown) => {
        assert.ok(err instanceof PortalAuthError);
        assert.equal(err.message, 'Staff role required');
        return true;
      });
    }
  });

  it('shows a saved stage to clients and stagePending only to staff', async () => {
    const clientList = (await run(listTasksForClient)) as Array<Record<string, unknown>>;
    const clientTask = clientList.find((task) => task.name === 'Homepage');
    const clientSnapshot = (await run(getSnapshot)) as { tasks: Array<Record<string, unknown>> };
    const clientSnap = clientSnapshot.tasks.find((task) => task.name === 'Homepage');
    const clientDetail = (await run(getForClient, { taskId: 'task-public' })) as Record<string, unknown>;
    const hidden = ['stagePending', 'stagePendingAt', 'stageSynced', 'stagePendingBaseEditedTime', 'stagePendingPullRequest', 'pullRequestUrl'];
    for (const payload of [clientTask, clientSnap, clientDetail]) {
      assert.equal(payload?.stage, 'Planning');
      for (const key of hidden) assert.equal(key in (payload ?? {}), false, key);
    }
    const names = clientList.map((task) => task.name);
    assert.equal(names.includes('Secret draft'), false);
    assert.equal(names.includes('Studio ops'), false);
    assert.equal(names.includes('Hidden launch task'), false);
    assert.equal(JSON.stringify(clientSnapshot).includes('Parked'), false);
    assert.equal(JSON.stringify(clientSnapshot).includes('Hidden launch task'), false);

    const staffList = (await runStaff(listTasksForStaff)) as Array<Record<string, unknown>>;
    const staffTask = staffList.find((task) => task.name === 'Homepage');
    assert.equal(staffTask?.stagePending, true);
    assert.equal(staffTask?.stage, 'Planning');
    for (const key of ['stagePendingAt', 'stageSynced', 'stagePendingBaseEditedTime', 'stagePendingPullRequest']) {
      assert.equal(key in (staffTask ?? {}), false, key);
    }
    const staffSnapshot = (await runStaff(getSnapshot)) as { tasks: Array<Record<string, unknown>> };
    const staffSnap = staffSnapshot.tasks.find((task) => task.name === 'Homepage');
    assert.equal(staffSnap?.stagePending, true);
    assert.equal(staffSnap?.stage, 'Planning');
    for (const key of hidden.filter((key) => key !== 'stagePending')) {
      assert.equal(key in (staffSnap ?? {}), false, key);
    }
    assert.equal(JSON.stringify(clientList).includes('pending-pr-secret'), false);
    assert.equal(JSON.stringify(clientSnapshot).includes('pending-pr-secret'), false);
    assert.equal(JSON.stringify(clientDetail).includes('pending-pr-secret'), false);
  });

  it('shows internal work and the task description to staff', async () => {
    const feed = text(await runStaff(listActivityForStaff));
    const tasks = text(await runStaff(listTasksForStaff));
    const timeline = text(await runStaff(activityForStaff, { taskId: 'task-internal' }));
    assert.match(feed, /warehaus.studio/);
    assert.match(feed, /sync noise/);
    assert.match(feed, /Staff only task copy/);
    assert.match(tasks, /Staff only task copy/);
    assert.match(timeline, /Studio ops/);
  });

  it('does not return internal projects from the staff project queries', async () => {
    for (const query of [listForOrgAdmin, listPublishedForStaff, listForStaff]) {
      await assert.rejects(run(query, { orgId: org._id }), (err: unknown) => {
        assert.ok(err instanceof PortalAuthError);
        assert.equal(err.message, 'Staff role required');
        return true;
      });
    }
  });
});
