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

const tables: Record<string, Row[]> = {
  clients: [org],
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
      pullRequestUrl: 'https://github.com/warehaus/secret/pull/1',
    },
    {
      _id: 'task-internal',
      orgId: org._id,
      projectId: 'proj-internal',
      name: 'Studio ops',
      status: 'To Do',
      isDone: false,
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
      publishToWarehaus: false,
      notionPageId: 'task-draft-notion',
      lastSyncedAt: 1,
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
      _id: 'act-general',
      orgId: org._id,
      name: 'Org note',
      type: 'project',
      summary: 'General update',
      timestamp: 10,
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
    assert.match(bundled, /Northwind site update/);
    assert.match(bundled, /General update/);
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
    assert.equal(listedTasks.some((task) => task.name === 'Homepage' && task.stage == null), true);
    const docTitles = (docs as Array<{ title: string }>).map((doc) => doc.title);
    assert.deepEqual(docTitles.slice(0, 2), ['Org guide', 'Public brief']);
    assert.equal(bundled.includes('Warehaus Staff'), false);
    assert.equal(bundled.includes('estimate-secret'), false);
    assert.equal(bundled.includes('priority-high'), false);
    assert.equal(bundled.includes('secret/pull/1'), false);
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
      activity: Array<{ summary: string }>;
    };
    assert.deepEqual(snapshotBody.projects.map((project) => project.name), ['Northwind site']);
    assert.deepEqual(snapshotBody.tasks.map((task) => task.name), ['Homepage']);
    assert.deepEqual(
      snapshotBody.activity.map((item) => item.summary),
      ['Northwind site update', 'General update'],
    );
  });

  it('uses the same unavailable message for a hidden task and a missing task', async () => {
    const visible = await run(getForClient, { taskId: 'task-public' });
    assert.equal((visible as { name: string }).name, 'Homepage');
    assert.equal((visible as { stage: string | null }).stage, null);

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
    assert.match(bundled, /Northwind site update/);
    assert.match(bundled, /Status: To Do/);
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
