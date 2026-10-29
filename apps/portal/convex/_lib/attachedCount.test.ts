import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { listAttachedForClient, listAttachedForStaff } from '../sharedResources';

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
          return {
            collect: async () => matched,
            unique: async () => {
              if (matched.length > 1) throw new Error('Expected a unique row');
              return matched[0] ?? null;
            },
          };
        },
        collect: async () => rows,
      };
    },
  };
}

const north = {
  _id: 'org-north',
  companyName: 'Northwind',
  slug: 'northwind',
  portalAccess: 'Enabled' as const,
};

const resource = {
  _id: 'res-notes',
  orgId: north._id,
  projectId: 'proj-public',
  title: 'Kickoff recap',
  description: 'Decisions',
  type: 'Meeting notes',
  publishToWarehaus: true,
  archive: false,
  notionPageId: 'notion-res',
  lastSyncedAt: 41,
};

const tables: Record<string, Row[]> = {
  clients: [north],
  contacts: [
    {
      _id: 'contact-client',
      orgId: north._id,
      name: 'Ada Client',
      email: 'ada@northwind.test',
      authUserId: 'auth-client',
      role: 'Client Member',
      portalAccess: 'Enabled',
    },
    {
      _id: 'contact-staff',
      orgId: north._id,
      name: 'Maya Internal',
      email: 'maya@warehaus.studio',
      authUserId: 'auth-staff',
      role: 'Warehaus Staff',
      portalAccess: 'Enabled',
    },
  ],
  projects: [
    {
      _id: 'proj-public',
      orgId: north._id,
      name: 'Northwind site',
      type: ['Website'],
      archive: false,
      publishToWarehaus: true,
    },
    {
      _id: 'proj-draft',
      orgId: north._id,
      name: 'Secret draft site',
      type: ['Website'],
      archive: false,
      publishToWarehaus: false,
    },
  ],
  tasks: [
    {
      _id: 'task-public',
      orgId: north._id,
      projectId: 'proj-public',
      name: 'Visible task',
      publishToWarehaus: true,
    },
    {
      _id: 'task-hidden',
      orgId: north._id,
      projectId: 'proj-public',
      name: 'Hidden task',
      publishToWarehaus: true,
      syncHiddenAt: 9,
    },
    {
      _id: 'task-draft',
      orgId: north._id,
      projectId: 'proj-public',
      name: 'Unpublished task',
      publishToWarehaus: false,
    },
    {
      _id: 'task-secret-project',
      orgId: north._id,
      projectId: 'proj-draft',
      name: 'Task on unpublished project',
      publishToWarehaus: true,
    },
  ],
  sharedResources: [resource],
  taskResources: [
    { _id: 'link-public', orgId: north._id, taskId: 'task-public', resourceId: resource._id },
    { _id: 'link-hidden', orgId: north._id, taskId: 'task-hidden', resourceId: resource._id },
    { _id: 'link-draft', orgId: north._id, taskId: 'task-draft', resourceId: resource._id },
    { _id: 'link-secret', orgId: north._id, taskId: 'task-secret-project', resourceId: resource._id },
  ],
};

const clientCtx = {
  auth: { getUserIdentity: async () => ({ subject: 'auth-client' }) },
  db: memoryDb(tables),
};

const staffCtx = {
  auth: { getUserIdentity: async () => ({ subject: 'auth-staff' }) },
  db: memoryDb(tables),
};

type Handler = (ctx: typeof clientCtx, args: { taskId: string }) => Promise<Array<{ name: string; attachedCount?: number }>>;

describe('attached resource counts', () => {
  it('hides hidden and unpublished tasks from the client count', async () => {
    const rows = await (listAttachedForClient as unknown as { _handler: Handler })._handler(clientCtx, {
      taskId: 'task-public',
    });
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.name, 'Kickoff recap');
    assert.equal(rows[0]?.attachedCount, 1);
  });

  it('keeps the raw link count for staff', async () => {
    const rows = await (listAttachedForStaff as unknown as { _handler: Handler })._handler(staffCtx, {
      taskId: 'task-public',
    });
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.attachedCount, 4);
  });
});
