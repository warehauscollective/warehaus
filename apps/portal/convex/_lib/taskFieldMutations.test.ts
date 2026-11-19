import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { enqueueArchive } from '../sync/taskWrite';
import { addLink, archiveTask, moveProject, setAssignee, setDueDate } from '../tasks';
import { PortalAuthError } from './identity';

type Handler = (ctx: unknown, args: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>;

function run(fn: object, ctx: unknown, args: Record<string, unknown>) {
  return (fn as { _handler: Handler })._handler(ctx, args);
}

type Row = Record<string, unknown> & { _id: string };

function memory(tables: Record<string, Row[]>) {
  const patches: Array<{ id: string; fields: Record<string, unknown> }> = [];
  const inserts: Array<{ table: string; doc: Record<string, unknown> }> = [];
  const deletes: string[] = [];
  const takes: number[] = [];
  const db = {
    async get(id: string) {
      for (const rows of Object.values(tables)) {
        const found = rows.find((row) => row._id === id);
        if (found) return found;
      }
      return null;
    },
    async patch(id: string, fields: Record<string, unknown>) {
      patches.push({ id, fields: { ...fields } });
      for (const rows of Object.values(tables)) {
        const index = rows.findIndex((row) => row._id === id);
        if (index >= 0) rows[index] = { ...rows[index], ...fields };
      }
    },
    async insert(table: string, doc: Record<string, unknown>) {
      const id = `inserted-${inserts.length + 1}`;
      inserts.push({ table, doc });
      tables[table] = tables[table] ?? [];
      tables[table].push({ ...doc, _id: id });
      return id;
    },
    async delete(id: string) {
      deletes.push(id);
    },
    query(table: string) {
      return {
        withIndex(_name: string, build: (q: { eq: (field: string, value: unknown) => unknown }) => unknown) {
          const recorder = {
            pairs: [] as Array<[string, unknown]>,
            eq(field: string, value: unknown) {
              this.pairs.push([field, value]);
              return this;
            },
          };
          build(recorder);
          const matched = (tables[table] ?? []).filter((row) =>
            recorder.pairs.every(([field, value]) => row[field] === value),
          );
          return {
            unique: async () => matched[0] ?? null,
            take: async (limit: number) => {
              takes.push(limit);
              return matched.slice(0, limit);
            },
          };
        },
      };
    },
  };
  return { db, patches, inserts, deletes, takes };
}

const staffContact: Row = {
  _id: 'contact-staff',
  orgId: 'org-warehaus',
  name: 'Maya Chen',
  email: 'maya@warehaus.studio',
  authUserId: 'auth-staff',
  role: 'Warehaus Staff',
  portalAccess: 'Enabled',
};

const warehaus: Row = { _id: 'org-warehaus', slug: 'warehaus', portalAccess: 'Enabled' };

function staffCtx(store: ReturnType<typeof memory>, calls: unknown[] = []) {
  return {
    auth: { getUserIdentity: async () => ({ subject: 'auth-staff' }) },
    identity: { contactId: 'contact-staff' },
    db: {
      ...store.db,
      async get(id: string) {
        if (id === warehaus._id) return warehaus;
        if (id === staffContact._id) return staffContact;
        return store.db.get(id);
      },
      query(table: string) {
        if (table === 'contacts') {
          return {
            withIndex(_name: string, build: (q: { eq: (field: string, value: unknown) => unknown }) => unknown) {
              const recorder = {
                pairs: [] as Array<[string, unknown]>,
                eq(field: string, value: unknown) {
                  this.pairs.push([field, value]);
                  return this;
                },
              };
              build(recorder);
              const auth = recorder.pairs.find(([field]) => field === 'authUserId');
              if (auth) {
                return { unique: async () => (auth[1] === 'auth-staff' ? staffContact : null), take: async () => [] };
              }
              return store.db.query(table).withIndex(_name, build);
            },
          };
        }
        return store.db.query(table);
      },
    },
    runMutation: async (_ref: unknown, args: unknown) => {
      calls.push(args);
      return { ok: true, outboxId: 'out-1', duplicate: false };
    },
  };
}

const task: Row = {
  _id: 'task-1',
  orgId: 'org-north',
  projectId: 'project-site',
  notionPageId: 'notion-task-1',
  lastEditedTime: '2026-10-20T00:00:00.000Z',
  name: 'Build the project page',
  assigneeName: 'Alex Bauer',
};

describe('task field mutations', () => {
  it('rejects a client on every new staff mutation', async () => {
    const calls: unknown[] = [];
    const client = { _id: 'org-north', slug: 'northwind', portalAccess: 'Enabled' as const };
    const contact = {
      _id: 'contact-client',
      orgId: client._id,
      name: 'Ada Client',
      email: 'ada@northwind.test',
      authUserId: 'auth-client',
      role: 'Client Admin' as const,
      portalAccess: 'Enabled' as const,
    };
    const ctx = {
      auth: { getUserIdentity: async () => ({ subject: 'auth-client' }) },
      runMutation: async (_ref: unknown, args: unknown) => {
        calls.push(args);
        return { ok: true };
      },
      db: {
        async get(id: string) {
          if (id === client._id) return client;
          return null;
        },
        query(table: string) {
          return {
            withIndex(_name: string, build: (q: { eq: (field: string, value: string) => unknown }) => unknown) {
              const recorder = {
                pairs: [] as Array<[string, string]>,
                eq(field: string, value: string) {
                  this.pairs.push([field, value]);
                  return this;
                },
              };
              build(recorder);
              const rows = table === 'contacts' ? [contact] : [];
              const matched = rows.filter((row) =>
                recorder.pairs.every(([field, value]) => (row as Record<string, string>)[field] === value),
              );
              return { unique: async () => matched[0] ?? null, take: async () => matched };
            },
          };
        },
        patch: async () => {
          throw new Error('client patched a task');
        },
        insert: async () => {
          throw new Error('client inserted a row');
        },
        delete: async () => {
          throw new Error('client deleted a row');
        },
      },
    };
    for (const [fn, args] of [
      [setAssignee, { taskId: 'task-1', assigneeContactId: 'contact-staff' }],
      [setDueDate, { taskId: 'task-1', date: '2026-11-02' }],
      [moveProject, { taskId: 'task-1', projectId: 'project-brand' }],
      [addLink, { taskId: 'task-1', kind: 'PR', url: 'https://example.com/pr/1' }],
      [archiveTask, { taskId: 'task-1' }],
    ] as const) {
      await assert.rejects(run(fn, ctx, args), (err: unknown) => {
        assert.ok(err instanceof PortalAuthError);
        assert.equal(err.code, 'FORBIDDEN');
        assert.equal(err.message, 'Staff role required');
        return true;
      });
    }
    assert.equal(calls.length, 0);
  });

  it('rejects an assignee and a project from another org, and never writes Owner / DRI', async () => {
    const calls: unknown[] = [];
    const store = memory({
      tasks: [{ ...task }],
      contacts: [
        {
          _id: 'contact-other',
          orgId: 'org-other',
          name: 'Other Staff',
          role: 'Warehaus Staff',
          portalAccess: 'Enabled',
        },
      ],
      projects: [{ _id: 'project-other', orgId: 'org-other', name: 'Other brand', archive: false }],
    });
    const ctx = staffCtx(store, calls);
    const assignee = await run(setAssignee, ctx, { taskId: 'task-1', assigneeContactId: 'contact-other' });
    assert.deepEqual(assignee, { ok: false, error: 'Choose someone on this client', assigneeName: 'Alex Bauer' });
    const project = await run(moveProject, ctx, { taskId: 'task-1', projectId: 'project-other' });
    assert.deepEqual(project, { ok: false, error: 'Choose a project on this client' });
    assert.equal(store.patches.length, 0);
    assert.equal(calls.length, 0);

    const sameOrg = memory({
      tasks: [{ ...task }],
      contacts: [
        {
          _id: 'contact-maya',
          orgId: 'org-north',
          name: 'Maya Chen',
          role: 'Warehaus Staff',
          portalAccess: 'Enabled',
        },
      ],
    });
    const saved = await run(setAssignee, staffCtx(sameOrg, calls), {
      taskId: 'task-1',
      assigneeContactId: 'contact-maya',
    });
    assert.equal(saved.ok, true);
    assert.equal(sameOrg.patches.length, 1);
    assert.deepEqual(Object.keys(sameOrg.patches[0]!.fields).sort(), ['assigneeContactId', 'assigneeName']);
    assert.equal(JSON.stringify(sameOrg.patches[0]!.fields).includes('Owner / DRI'), false);
    assert.equal(calls.length, 0);
  });

  it('soft-hides the task and its direct sub-tasks, capped at 50, with no hard delete', async () => {
    const children: Row[] = Array.from({ length: 51 }, (_, index) => ({
      _id: `child-${index + 1}`,
      orgId: 'org-north',
      parentTaskId: 'task-1',
      name: `Child ${index + 1}`,
    }));
    children[2]!.archivedAt = 1;
    const grandchild: Row = {
      _id: 'grandchild-1',
      orgId: 'org-north',
      parentTaskId: 'child-1',
      name: 'Grandchild',
    };
    const calls: unknown[] = [];
    const store = memory({ tasks: [{ ...task }, ...children, grandchild] });
    const result = await run(archiveTask, staffCtx(store, calls), { taskId: 'task-1' });
    assert.equal(result.ok, true);
    assert.deepEqual(store.takes, [50]);
    const patched = new Set(store.patches.map((row) => row.id));
    assert.equal(patched.has('task-1'), true);
    assert.equal(patched.has('child-50'), true);
    assert.equal(patched.has('child-51'), false);
    assert.equal(patched.has('child-3'), false);
    assert.equal(patched.has('grandchild-1'), false);
    assert.equal(store.deletes.length, 0);
    for (const patch of store.patches) {
      assert.equal(typeof patch.fields.archivedAt, 'number');
      assert.deepEqual(Object.keys(patch.fields), ['archivedAt']);
    }
    assert.equal(calls.length, 1);
  });

  it('archives the Notion page only when write-back is on', async () => {
    const previous = process.env.NOTION_WRITEBACK_ENABLED;
    const taskRow = { ...task };
    try {
      delete process.env.NOTION_WRITEBACK_ENABLED;
      const offCalls: unknown[] = [];
      const off = await run(
        enqueueArchive,
        { db: { get: async () => taskRow }, runMutation: async (_ref: unknown, args: unknown) => offCalls.push(args) },
        { taskId: 'task-1', actorId: 'contact-staff' },
      );
      assert.equal(off.ok, false);
      assert.equal(offCalls.length, 0);

      process.env.NOTION_WRITEBACK_ENABLED = 'true';
      const onCalls: Array<{ kind?: string; notionPageId?: string }> = [];
      const on = await run(
        enqueueArchive,
        {
          db: { get: async () => taskRow },
          runMutation: async (_ref: unknown, args: { kind?: string; notionPageId?: string }) => {
            onCalls.push(args);
            return { ok: true, outboxId: 'out-archive', duplicate: false };
          },
        },
        { taskId: 'task-1', actorId: 'contact-staff' },
      );
      assert.equal(on.ok, true);
      assert.equal(onCalls.length, 1);
      assert.equal(onCalls[0]?.kind, 'task-archive');
      assert.equal(onCalls[0]?.notionPageId, 'notion-task-1');
    } finally {
      if (previous === undefined) delete process.env.NOTION_WRITEBACK_ENABLED;
      else process.env.NOTION_WRITEBACK_ENABLED = previous;
    }
  });

  it('refuses a 51st source and does not insert', async () => {
    const links = Array.from({ length: 50 }, (_, index) => ({
      _id: `link-${index + 1}`,
      taskId: 'task-1',
      url: `https://example.com/${index + 1}`,
    }));
    const store = memory({ tasks: [{ ...task }], taskLinks: links });
    const result = await run(addLink, staffCtx(store), {
      taskId: 'task-1',
      kind: 'PR',
      url: 'https://example.com/new',
    });
    assert.deepEqual(result, { ok: false, error: 'This task already has 50 sources' });
    assert.equal(store.inserts.length, 0);
    assert.equal(store.deletes.length, 0);
  });
});
