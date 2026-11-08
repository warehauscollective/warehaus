import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FIXTURE_GRANOLA_NOTES, GRANOLA_IMPORT_FAILED } from '@warehaus/portal-sync';
import { applyImport, retryImport } from '../sync/granola';
import { getForClient, listForClient } from '../sharedResources';
import { searchCatalog } from './portalSearch';
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

function memoryDb(tables: Record<string, Row[]>) {
  let seq = 1;
  return {
    async get(id: string) {
      for (const rows of Object.values(tables)) {
        const found = rows.find((row) => row._id === id);
        if (found) return found;
      }
      return null;
    },
    async insert(table: string, row: Record<string, unknown>) {
      const stored = { ...row, _id: `gen-${seq++}` } as Row;
      (tables[table] ??= []).push(stored);
      return stored._id;
    },
    async patch(id: string, value: Record<string, unknown>) {
      const row = await this.get(id);
      if (!row) return;
      for (const [key, field] of Object.entries(value)) {
        if (field === undefined) delete row[key];
        else row[key] = field;
      }
    },
    query(table: string) {
      const chain = (list: Row[]) => ({
        withIndex(_name: string, build?: (q: EqBuilder) => EqBuilder) {
          const builder = new EqBuilder();
          build?.(builder);
          return chain(list.filter((row) => builder.matches(row)));
        },
        collect: async () => list,
        unique: async () => {
          if (list.length > 1) throw new Error('Expected a unique row');
          return list[0] ?? null;
        },
      });
      return chain(tables[table] ?? []);
    },
  };
}

const TRANSCRIPT = 'TRANSCRIPT: Ada: the raw speaker turns stay in Notion.';

const tables = (): Record<string, Row[]> => ({
  clients: [
    {
      _id: 'org-north',
      companyName: 'Northwind',
      slug: 'northwind',
      portalAccess: 'Enabled',
    },
  ],
  contacts: [
    {
      _id: 'contact-client',
      orgId: 'org-north',
      name: 'Ada Client',
      email: 'ada@northwind.test',
      authUserId: 'auth-client',
      role: 'Client Member',
      portalAccess: 'Enabled',
    },
    {
      _id: 'contact-staff',
      orgId: 'org-north',
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
      orgId: 'org-north',
      name: 'Website refresh',
      publishToWarehaus: true,
      archive: false,
      type: ['Website'],
    },
  ],
  sharedResources: [
    {
      _id: 'res-kept',
      orgId: 'org-north',
      notionPageId: 'granola:standup',
      externalId: 'wh_grn_standup',
      title: 'Internal standup',
      description: 'Summary: The earlier recap stays.',
      type: 'Meeting notes',
      source: 'granola',
      publishToWarehaus: false,
      archive: false,
      lastSyncedAt: 1,
    },
  ],
  syncMeta: [],
});

type Handler = (ctx: unknown, args: Record<string, unknown>) => Promise<unknown>;

function run(fn: object, ctx: unknown, args: Record<string, unknown> = {}) {
  return (fn as { _handler: Handler })._handler(ctx, args);
}

describe('granola applyImport', () => {
  it('writes a recap with publish off and leaves a failed note unchanged', async () => {
    const data = tables();
    const ctx = { db: memoryDb(data) };
    const result = await run(applyImport, ctx, {
      configured: true,
      notes: FIXTURE_GRANOLA_NOTES,
    });
    assert.deepEqual(result, { configured: true, imported: 1, failed: 1 });

    const kickoff = data.sharedResources.find((row) => row.notionPageId === 'granola:kickoff');
    assert.ok(kickoff);
    assert.equal(kickoff.publishToWarehaus, false);
    assert.equal(kickoff.source, 'granola');
    assert.match(String(kickoff.description), /The menu structure is agreed/);
    assert.equal(String(kickoff.description).includes(TRANSCRIPT), false);
    assert.equal(kickoff.sourceNotionUrl, 'https://www.notion.so/0123456789abcdef0123456789abcdef');

    const standup = data.sharedResources.find((row) => row._id === 'res-kept');
    assert.equal(standup?.description, 'Summary: The earlier recap stays.');
    assert.equal(standup?.publishToWarehaus, false);

    const meta = data.syncMeta.find((row) => row.key === 'granola-import');
    assert.equal(meta?.lastError, GRANOLA_IMPORT_FAILED);
    const stored = JSON.stringify({ resources: data.sharedResources, meta: data.syncMeta });
    assert.equal(stored.includes(TRANSCRIPT), false);
    assert.equal(stored.includes('raw speaker'), false);
  });

  it('keeps publish off on update and does not turn a published recap back on by itself', async () => {
    const data = tables();
    data.sharedResources.push({
      _id: 'res-live',
      orgId: 'org-north',
      notionPageId: 'granola:kickoff',
      title: 'Old title',
      description: 'Summary: Old.',
      type: 'Meeting notes',
      source: 'granola',
      publishToWarehaus: true,
      archive: false,
      lastSyncedAt: 1,
    });
    await run(applyImport, { db: memoryDb(data) }, {
      configured: true,
      notes: [FIXTURE_GRANOLA_NOTES[0]],
    });
    const kickoff = data.sharedResources.find((row) => row.notionPageId === 'granola:kickoff');
    assert.equal(kickoff?.publishToWarehaus, true);
    assert.match(String(kickoff?.description), /The menu structure is agreed/);
    assert.equal(String(kickoff?.description).includes('TRANSCRIPT'), false);
  });

  it('does not insert fixture notes when credentials are missing', async () => {
    const data = tables();
    const before = data.sharedResources.length;
    await run(applyImport, { db: memoryDb(data) }, { configured: false });
    assert.equal(data.sharedResources.length, before);
    const meta = data.syncMeta.find((row) => row.key === 'granola-import');
    assert.equal(meta?.details, JSON.stringify({ configured: false }));
    assert.equal(meta?.lastError, undefined);
  });

  it('rejects a client retry and lets staff schedule the import', async () => {
    const data = tables();
    const clientCtx = {
      auth: { getUserIdentity: async () => ({ subject: 'auth-client' }) },
      db: memoryDb(data),
      scheduler: { runAfter: async () => { throw new Error('client must not schedule'); } },
    };
    await assert.rejects(run(retryImport, clientCtx, {}), (err: unknown) => {
      assert.ok(err instanceof PortalAuthError);
      return true;
    });

    const scheduled: unknown[] = [];
    const staffCtx = {
      auth: { getUserIdentity: async () => ({ subject: 'auth-staff' }) },
      db: memoryDb(data),
      scheduler: {
        runAfter: async (_delay: number, ref: unknown, args: unknown) => {
          scheduled.push({ ref, args });
        },
      },
    };
    const result = await run(retryImport, staffCtx, {});
    assert.deepEqual(result, { scheduled: true });
    assert.equal(scheduled.length, 1);
  });
});

describe('client recap query', () => {
  const published = {
    _id: 'res-published',
    orgId: 'org-north',
    projectId: 'proj-public',
    notionPageId: 'granola:kickoff',
    title: 'Kickoff recap',
    description: `Summary: The menu structure is agreed.\nTranscript:\n${TRANSCRIPT}`,
    type: 'Meeting notes',
    source: 'granola',
    publishToWarehaus: true,
    archive: false,
    lastSyncedAt: 5,
  };
  const transcriptOnly = {
    _id: 'res-transcript',
    orgId: 'org-north',
    notionPageId: 'granola:secret',
    title: 'Secret standup',
    description: ['Ada: one', 'Ben: two', 'Cara: three', 'Diego: four'].join('\n'),
    type: 'Meeting notes',
    source: 'granola',
    publishToWarehaus: true,
    archive: false,
    lastSyncedAt: 6,
  };
  const ordinary = {
    _id: 'res-file',
    orgId: 'org-north',
    projectId: 'proj-public',
    notionPageId: 'notion-file',
    title: 'Brand file',
    description: 'Shared recap',
    type: 'File',
    publishToWarehaus: true,
    archive: false,
    lastSyncedAt: 7,
  };

  function clientCtx(resources: Row[]) {
    const data = tables();
    data.sharedResources = resources;
    return {
      auth: { getUserIdentity: async () => ({ subject: 'auth-client' }) },
      db: memoryDb(data),
    };
  }

  it('returns a published recap and hides the transcript and unpublished notes', async () => {
    const ctx = clientCtx([
      published,
      transcriptOnly,
      ordinary,
      {
        _id: 'res-draft',
        orgId: 'org-north',
        notionPageId: 'granola:draft',
        title: 'Draft recap',
        description: 'Summary: Not published.',
        source: 'granola',
        publishToWarehaus: false,
        archive: false,
        lastSyncedAt: 8,
      },
    ]);
    const rows = (await run(listForClient, ctx, {})) as Array<{ name: string; description: string | null }>;
    assert.deepEqual(
      rows.map((row) => row.name).sort(),
      ['Brand file', 'Kickoff recap'],
    );
    const kickoff = rows.find((row) => row.name === 'Kickoff recap');
    assert.match(kickoff?.description ?? '', /The menu structure is agreed/);
    const encoded = JSON.stringify(rows);
    assert.equal(encoded.includes(TRANSCRIPT), false);
    assert.equal(encoded.includes('raw speaker'), false);
    assert.equal(encoded.includes('Secret standup'), false);
    assert.equal(encoded.includes('Not published'), false);
    assert.equal(encoded.includes('sourceNotionUrl'), false);
    assert.equal(rows.find((row) => row.name === 'Brand file')?.description, 'Shared recap');

    await assert.rejects(
      run(getForClient, clientCtx([published, { ...published, _id: 'res-draft', publishToWarehaus: false, notionPageId: 'granola:draft' }]), {
        resourceId: 'res-draft',
      }),
      (err: unknown) => err instanceof PortalAuthError,
    );
  });
});

describe('client search does not match a transcript', () => {
  it('skips transcript text and a transcript-only granola note', () => {
    const project = {
      _id: 'proj-public',
      orgId: 'org-north',
      name: 'Website refresh',
      status: 'In Progress',
      publishToWarehaus: true,
      archive: false,
      type: ['Website'],
    };
    const hits = searchCatalog({
      audience: 'client',
      query: 'raw speaker',
      orgId: 'org-north',
      orgVisible: true,
      projects: [project],
      tasks: [],
      docs: [],
      resources: [
        {
          _id: 'res-published',
          orgId: 'org-north',
          projectId: 'proj-public',
          title: 'Kickoff recap',
          description: `Summary: The menu structure is agreed.\nTranscript:\n${TRANSCRIPT}`,
          type: 'Meeting notes',
          notionPageId: 'granola:kickoff',
          source: 'granola',
          publishToWarehaus: true,
          archive: false,
        },
        {
          _id: 'res-transcript',
          orgId: 'org-north',
          title: 'Secret standup',
          description: ['Ada: one', 'Ben: two', 'Cara: three', 'Diego: four'].join('\n'),
          type: 'Meeting notes',
          notionPageId: 'granola:secret',
          source: 'granola',
          publishToWarehaus: true,
          archive: false,
        },
      ],
    });
    assert.equal(hits.resources.length, 0);
    assert.equal(JSON.stringify(hits).includes('raw speaker'), false);

    const byTitle = searchCatalog({
      audience: 'client',
      query: 'Secret standup',
      orgId: 'org-north',
      orgVisible: true,
      projects: [project],
      tasks: [],
      docs: [],
      resources: [
        {
          _id: 'res-transcript',
          orgId: 'org-north',
          title: 'Secret standup',
          description: ['Ada: one', 'Ben: two', 'Cara: three', 'Diego: four'].join('\n'),
          type: 'Meeting notes',
          notionPageId: 'granola:secret',
          source: 'granola',
          publishToWarehaus: true,
          archive: false,
        },
      ],
    });
    assert.equal(byTitle.resources.length, 0);
  });
});
