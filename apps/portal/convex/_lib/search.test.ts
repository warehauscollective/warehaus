import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PortalAuthError } from './identity';
import { forClient, forStaff } from '../search';

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

const other = {
  _id: 'org-other',
  companyName: 'Other Org',
  slug: 'other',
  portalAccess: 'Enabled' as const,
};

const tables: Record<string, Row[]> = {
  clients: [north, other],
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
      description: 'Public site',
      status: 'In Progress',
      type: ['Website'],
      archive: false,
      publishToWarehaus: true,
      notionPageId: 'notion-project-public',
      externalId: 'ext-project-public',
      lastSyncedAt: 11,
    },
    {
      _id: 'proj-draft',
      orgId: north._id,
      name: 'Secret draft site',
      description: 'Held',
      status: 'Inbox',
      type: ['Website'],
      archive: false,
      publishToWarehaus: false,
      notionPageId: 'notion-project-draft',
      externalId: 'ext-project-draft',
      lastSyncedAt: 12,
    },
    {
      _id: 'proj-hidden',
      orgId: north._id,
      name: 'Hidden launch',
      status: 'In Progress',
      type: ['Website'],
      archive: false,
      publishToWarehaus: true,
      syncHiddenAt: 9,
      notionPageId: 'notion-project-hidden',
      lastSyncedAt: 13,
    },
    {
      _id: 'proj-other',
      orgId: other._id,
      name: 'Lighthouse site',
      description: 'Other org',
      status: 'In Progress',
      type: ['Website'],
      archive: false,
      publishToWarehaus: true,
      notionPageId: 'notion-project-other',
      externalId: 'ext-project-other',
      lastSyncedAt: 14,
    },
  ],
  tasks: [
    {
      _id: 'task-public',
      orgId: north._id,
      projectId: 'proj-public',
      name: 'Homepage',
      status: 'To Do',
      publishToWarehaus: true,
      description: 'Staff only task copy',
      notionPageId: 'notion-task-public',
      externalId: 'ext-task-public',
      lastSyncedAt: 21,
    },
    {
      _id: 'task-draft',
      orgId: north._id,
      projectId: 'proj-public',
      name: 'Secret draft task',
      status: 'Inbox',
      publishToWarehaus: false,
      notionPageId: 'notion-task-draft',
      lastSyncedAt: 22,
    },
    {
      _id: 'task-other',
      orgId: other._id,
      projectId: 'proj-other',
      name: 'Other org task',
      status: 'To Do',
      publishToWarehaus: true,
      notionPageId: 'notion-task-other',
      lastSyncedAt: 23,
    },
  ],
  clientDocs: [
    {
      _id: 'doc-public',
      orgId: north._id,
      projectId: 'proj-public',
      title: 'Public brief',
      summary: 'Shared scope',
      docType: 'Brief',
      order: 4,
      status: 'Published',
      publishToWarehaus: true,
      notionPageId: 'notion-doc-public',
      externalId: 'ext-doc-public',
      lastSyncedAt: 31,
    },
    {
      _id: 'doc-draft',
      orgId: north._id,
      projectId: 'proj-public',
      title: 'Secret draft doc',
      summary: 'Held',
      docType: 'Note',
      order: 9,
      status: 'Draft',
      publishToWarehaus: false,
      notionPageId: 'notion-doc-draft',
      lastSyncedAt: 32,
    },
    {
      _id: 'doc-other',
      orgId: other._id,
      title: 'Other org guide',
      summary: 'Foreign',
      docType: 'Guide',
      order: 1,
      status: 'Published',
      publishToWarehaus: true,
      notionPageId: 'notion-doc-other',
      lastSyncedAt: 33,
    },
  ],
  sharedResources: [
    {
      _id: 'res-public',
      orgId: north._id,
      projectId: 'proj-public',
      title: 'Kickoff recap',
      description: 'Decisions',
      type: 'Meeting notes',
      publishToWarehaus: true,
      archive: false,
      notionPageId: 'notion-res-public',
      externalId: 'wh_res_secret',
      lastSyncedAt: 41,
    },
    {
      _id: 'res-draft',
      orgId: north._id,
      projectId: 'proj-public',
      title: 'Unpublished file',
      type: 'File',
      publishToWarehaus: false,
      archive: false,
      notionPageId: 'notion-res-draft',
      lastSyncedAt: 42,
    },
    {
      _id: 'res-other',
      orgId: other._id,
      title: 'Other org file',
      type: 'File',
      publishToWarehaus: true,
      archive: false,
      notionPageId: 'notion-res-other',
      lastSyncedAt: 43,
    },
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

type Handler = (ctx: typeof clientCtx, args: Record<string, unknown>) => Promise<unknown>;

function run(fn: object, args: Record<string, unknown> = {}) {
  return (fn as { _handler: Handler })._handler(clientCtx, args);
}

function runStaff(fn: object, args: Record<string, unknown> = {}) {
  return (fn as { _handler: Handler })._handler(staffCtx, args);
}

function keysOf(value: unknown, found = new Set<string>()): Set<string> {
  if (!value || typeof value !== 'object') return found;
  if (Array.isArray(value)) {
    for (const item of value) keysOf(item, found);
    return found;
  }
  for (const [key, child] of Object.entries(value)) {
    found.add(key);
    keysOf(child, found);
  }
  return found;
}

const FORBIDDEN = [
  'notionPageId',
  'externalId',
  'lastSyncedAt',
  'publishToWarehaus',
  'published',
  'publishState',
  'syncStatus',
  'syncHidden',
  'syncNotice',
  'order',
  'sourceNotionUrl',
];

describe('portal search tiers', () => {
  it('hides other orgs, unpublished rows, and server fields from clients', async () => {
    const result = await run(forClient, { q: 'site' });
    const text = JSON.stringify(result);
    assert.match(text, /Northwind site/);
    assert.equal(text.includes('Lighthouse'), false);
    assert.equal(text.includes('Secret draft'), false);
    assert.equal(text.includes('Hidden launch'), false);
    assert.equal(text.includes('notion-'), false);
    assert.equal(text.includes('ext-'), false);
    assert.equal(text.includes('wh_res_secret'), false);
    const keys = keysOf(result);
    for (const key of FORBIDDEN) assert.equal(keys.has(key), false, key);

    const leaked = await run(forClient, { q: 'lighthouse' });
    assert.equal(JSON.stringify(leaked).includes('Lighthouse'), false);
    const unpublished = await run(forClient, { q: 'secret draft' });
    assert.equal(JSON.stringify(unpublished).includes('Secret'), false);
    const hidden = await run(forClient, { q: 'hidden launch' });
    assert.equal(JSON.stringify(hidden).includes('Hidden'), false);
    const description = await run(forClient, { q: 'staff only task copy' });
    assert.equal(JSON.stringify(description).includes('Homepage'), false);
    const external = await run(forClient, { q: 'wh_res_secret' });
    assert.equal(JSON.stringify(external).includes('Kickoff'), false);

    const docs = await run(forClient, { q: 'brief' });
    const docText = JSON.stringify(docs);
    assert.match(docText, /Public brief/);
    assert.equal(docText.includes('Secret draft doc'), false);
    assert.equal(docText.includes('Other org guide'), false);
    assert.equal(keysOf(docs).has('order'), false);
  });

  it('gives staff full access across orgs, including unpublished rows', async () => {
    const lighthouse = JSON.stringify(await runStaff(forStaff, { q: 'lighthouse' }));
    assert.match(lighthouse, /Lighthouse site/);
    assert.equal(lighthouse.includes('Northwind'), false);

    const cross = JSON.stringify(await runStaff(forStaff, { q: 'other org' }));
    assert.match(cross, /Lighthouse site/);
    assert.match(cross, /Other org task/);
    assert.match(cross, /Other org guide/);
    assert.match(cross, /Other org file/);

    const drafts = JSON.stringify(await runStaff(forStaff, { q: 'secret draft' }));
    assert.match(drafts, /Secret draft site/);
    assert.match(drafts, /Secret draft task/);
    assert.match(drafts, /Secret draft doc/);

    const copy = JSON.stringify(await runStaff(forStaff, { q: 'staff only task copy' }));
    assert.match(copy, /Homepage/);

    const hidden = JSON.stringify(await runStaff(forStaff, { q: 'hidden launch' }));
    assert.match(hidden, /Hidden launch/);

    await assert.rejects(run(forStaff, { q: 'site' }), (err: unknown) => {
      assert.ok(err instanceof PortalAuthError);
      assert.equal(err.message, 'Staff role required');
      return true;
    });
  });
});
