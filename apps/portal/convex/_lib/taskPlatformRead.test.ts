import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getSnapshot } from '../portalData';
import { getForClient, listForClient } from '../tasks';
import { getMyTaskPlatform, getTaskPlatform, setTaskPlatform } from '../clients';
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

function memoryDb(tables: Record<string, Row[]>, patches: Array<{ id: string; value: Record<string, unknown> }>) {
  return {
    async get(id: string) {
      for (const rows of Object.values(tables)) {
        const found = rows.find((row) => row._id === id);
        if (found) return found;
      }
      return null;
    },
    async patch(id: string, value: Record<string, unknown>) {
      patches.push({ id, value });
      for (const rows of Object.values(tables)) {
        const found = rows.find((row) => row._id === id);
        if (found) Object.assign(found, value);
      }
    },
    query(table: string) {
      const rows = tables[table] ?? [];
      return {
        withIndex(_name: string, build?: (q: EqBuilder) => EqBuilder) {
          const matched = build ? rows.filter((row) => build(new EqBuilder()).matches(row)) : rows;
          return {
            order() {
              return this;
            },
            async take(n: number) {
              return matched.slice(0, n);
            },
            async collect() {
              return matched;
            },
            async unique() {
              if (matched.length > 1) throw new Error('Expected a unique row');
              return matched[0] ?? null;
            },
          };
        },
        async collect() {
          return rows;
        },
      };
    },
  };
}

const org = {
  _id: 'org-north',
  companyName: 'Northwind',
  slug: 'northwind',
  portalAccess: 'Enabled' as const,
  notionPageId: 'client-notion',
  lastSyncedAt: 1,
  taskPlatform: undefined as 'notion' | 'linear' | undefined,
};

const task = {
  _id: 'task-public',
  orgId: org._id,
  projectId: 'proj-public',
  name: 'Homepage',
  status: 'To Do',
  isDone: false,
  publishToWarehaus: true,
  notionPageId: 'task-public-notion',
  lastSyncedAt: 1,
  stage: 'Planning',
  description: 'Staff only task copy',
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
      role: 'Client Admin',
      portalAccess: 'Enabled',
    },
    {
      _id: 'contact-staff',
      orgId: org._id,
      name: 'Maya Staff',
      email: 'maya@warehaus.co',
      authUserId: 'auth-staff',
      role: 'Warehaus Staff',
      portalAccess: 'Enabled',
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
    },
  ],
  tasks: [task],
  activity: [],
  syncMeta: [],
};

function ctxFor(subject: string, patches: Array<{ id: string; value: Record<string, unknown> }>) {
  return {
    auth: { getUserIdentity: async () => ({ subject }) },
    db: memoryDb(tables, patches),
  };
}

type Handler = (ctx: ReturnType<typeof ctxFor>, args: Record<string, unknown>) => Promise<unknown>;

function run(fn: object, subject: string, args: Record<string, unknown> = {}) {
  const patches: Array<{ id: string; value: Record<string, unknown> }> = [];
  const ctx = ctxFor(subject, patches);
  return (fn as { _handler: Handler })._handler(ctx, args).then((result) => ({ result, patches }));
}

describe('client task platform', () => {
  const previous = process.env.LINEAR_API_KEY;

  it('keeps Notion tasks when the field is missing, and leaves them stored when the read is Linear', async () => {
    delete process.env.LINEAR_API_KEY;
    try {
      org.taskPlatform = undefined;
      const notion = await run(listForClient, 'auth-client');
      const listed = notion.result as Array<{ name: string }>;
      assert.equal(listed.some((row) => row.name === 'Homepage'), true);
      assert.deepEqual(notion.patches, []);

      const snapshot = (await run(getSnapshot, 'auth-client')).result as {
        tasks: Array<{ name: string }>;
        taskPlatform: { platform: string; canChange: boolean; tasks: { ok: boolean }; milestones: { ok: boolean; count?: number } };
      };
      assert.equal(snapshot.tasks.some((row) => row.name === 'Homepage'), true);
      assert.equal(snapshot.taskPlatform.platform, 'notion');
      assert.equal(snapshot.taskPlatform.canChange, false);
      assert.equal(snapshot.taskPlatform.tasks.ok, true);
      assert.equal(snapshot.taskPlatform.milestones.ok, true);
      assert.equal(snapshot.taskPlatform.milestones.count, 0);

      org.taskPlatform = 'linear';
      const hidden = await run(listForClient, 'auth-client');
      assert.deepEqual(hidden.result, []);
      assert.equal(task.name, 'Homepage');
      assert.equal(task.notionPageId, 'task-public-notion');
      const linearSnapshot = (await run(getSnapshot, 'auth-client')).result as {
        tasks: unknown[];
        taskPlatform: { tasks: { ok: boolean; reason?: string } };
      };
      assert.deepEqual(linearSnapshot.tasks, []);
      assert.equal(linearSnapshot.taskPlatform.tasks.ok, false);
      assert.equal(linearSnapshot.taskPlatform.tasks.reason, 'not-configured');
      await assert.rejects(run(getForClient, 'auth-client', { taskId: 'task-public' }), (err: unknown) => {
        assert.ok(err instanceof PortalAuthError);
        assert.equal(err.message, 'Linear is not configured');
        return true;
      });
      assert.equal(task.name, 'Homepage');
    } finally {
      org.taskPlatform = undefined;
      if (previous === undefined) delete process.env.LINEAR_API_KEY;
      else process.env.LINEAR_API_KEY = previous;
    }
  });

  it('lets staff store the choice and rejects a client, without rewriting tasks', async () => {
    delete process.env.LINEAR_API_KEY;
    const before = structuredClone(task);
    try {
      await assert.rejects(
        run(setTaskPlatform, 'auth-client', { orgId: org._id, platform: 'linear' }),
        (err: unknown) => {
          assert.ok(err instanceof PortalAuthError);
          assert.equal(err.message, 'Staff role required');
          return true;
        },
      );
      assert.equal(org.taskPlatform, undefined);
      assert.deepEqual(task, before);

      const saved = await run(setTaskPlatform, 'auth-staff', { orgId: org._id, platform: 'linear' });
      assert.deepEqual(saved.patches, [{ id: org._id, value: { taskPlatform: 'linear' } }]);
      assert.equal(org.taskPlatform, 'linear');
      assert.deepEqual(task, before);

      const clientView = (await run(getMyTaskPlatform, 'auth-client')).result as {
        platform: string;
        canChange: boolean;
        tasks: { ok: boolean };
      };
      assert.equal(clientView.platform, 'linear');
      assert.equal(clientView.canChange, false);
      assert.equal(clientView.tasks.ok, false);

      const staffView = (await run(getTaskPlatform, 'auth-staff', { orgId: org._id })).result as {
        canChange: boolean;
        platform: string;
      };
      assert.equal(staffView.platform, 'linear');
      assert.equal(staffView.canChange, true);
      await assert.rejects(run(getTaskPlatform, 'auth-client', { orgId: org._id }), (err: unknown) => {
        assert.ok(err instanceof PortalAuthError);
        assert.equal(err.message, 'Staff role required');
        return true;
      });

      const back = await run(setTaskPlatform, 'auth-staff', { orgId: org._id, platform: 'notion' });
      assert.deepEqual(back.patches, [{ id: org._id, value: { taskPlatform: 'notion' } }]);
      assert.deepEqual(task, before);
      const restored = (await run(listForClient, 'auth-client')).result as Array<{ name: string }>;
      assert.equal(restored.some((row) => row.name === 'Homepage'), true);
    } finally {
      org.taskPlatform = undefined;
      if (previous === undefined) delete process.env.LINEAR_API_KEY;
      else process.env.LINEAR_API_KEY = previous;
    }
  });
});
