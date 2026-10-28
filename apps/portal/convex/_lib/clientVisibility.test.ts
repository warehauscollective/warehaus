import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TASK_UNAVAILABLE } from '@warehaus/portal-sync';
import { getSnapshot } from '../portalData';
import {
  listForClient as listProjectsForClient,
  listForOrgAdmin,
  listForStaff,
  listPublishedForStaff,
} from '../projects';
import { getForClient, listForClient as listTasksForClient } from '../tasks';
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
        withIndex(_name: string, build: (q: EqBuilder) => EqBuilder) {
          const matched = rows.filter((row) => build(new EqBuilder()).matches(row));
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
  syncMeta: [],
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

function run(fn: object, args: Record<string, unknown> = {}) {
  return (fn as { _handler: Handler })._handler(ctx, args);
}

function text(value: unknown): string {
  return JSON.stringify(value);
}

describe('client identity against warehaus.studio', () => {
  it('returns the shared project and task and none of the internal rows', async () => {
    const projects = await run(listProjectsForClient);
    const tasks = await run(listTasksForClient);
    const snapshot = await run(getSnapshot);
    const bundled = text({ projects, tasks, snapshot });

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

    for (const taskId of ['task-internal', 'task-missing', 'task-draft']) {
      await assert.rejects(run(getForClient, { taskId }), (err: unknown) => {
        assert.ok(err instanceof PortalAuthError);
        assert.equal(err.message, TASK_UNAVAILABLE);
        assert.equal(err.message.includes('warehaus'), false);
        return true;
      });
    }
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
