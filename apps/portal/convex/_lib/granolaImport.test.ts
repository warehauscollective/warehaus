import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FIXTURE_GRANOLA_NOTES, GRANOLA_IMPORT_FAILED } from '@warehaus/portal-sync';
import { applyImport, retryImport } from '../sync/granola';
import { getForClient, listForClient } from '../sharedResources';
import { searchCatalog } from './portalSearch';
import { PortalAuthError } from './identity';
import { memoryCtx } from './memoryCtx.testkit';
import { seedProject } from './seedRows.testkit';

type Fields = Record<string, unknown>;

const TRANSCRIPT = 'TRANSCRIPT: Ada: the raw speaker turns stay in Notion.';

/**
 * The client org `northwind` (the slug the fixture notes name), its client and
 * staff contacts, one published project and (unless `kept` is false) one
 * earlier, unpublished recap.
 */
function world({ kept = true } = {}) {
  const t = memoryCtx();
  t.actor('client');
  t.actor('staff');
  const orgId = t.rows('clients').find((row) => row.slug === 'northwind')?._id as string;
  const projectId = seedProject(t, orgId, { name: 'Website refresh', publishToWarehaus: true, archive: false, type: ['Website'] });
  const resource = (fields: Fields) => t.seed('sharedResources', { orgId, archive: false, ...fields });
  const keptId = kept && resource({
    notionPageId: 'granola:standup',
    externalId: 'wh_grn_standup',
    title: 'Internal standup',
    description: 'Summary: The earlier recap stays.',
    type: 'Meeting notes',
    source: 'granola',
    publishToWarehaus: false,
    lastSyncedAt: 1,
  });
  return { t, orgId, projectId, keptId, resource };
}

describe('granola applyImport', () => {
  it('writes a recap with publish off and leaves a failed note unchanged', async () => {
    const { t, keptId } = world();
    const result = await t.call(applyImport, {
      configured: true,
      notes: FIXTURE_GRANOLA_NOTES,
    });
    assert.deepEqual(result, { configured: true, imported: 1, failed: 1 });

    const kickoff = t.rows('sharedResources').find((row) => row.notionPageId === 'granola:kickoff');
    assert.ok(kickoff);
    assert.equal(kickoff.publishToWarehaus, false);
    assert.equal(kickoff.source, 'granola');
    assert.match(String(kickoff.description), /The menu structure is agreed/);
    assert.equal(String(kickoff.description).includes(TRANSCRIPT), false);
    assert.equal(kickoff.sourceNotionUrl, 'https://www.notion.so/0123456789abcdef0123456789abcdef');

    const standup = t.row(keptId as string);
    assert.equal(standup?.description, 'Summary: The earlier recap stays.');
    assert.equal(standup?.publishToWarehaus, false);

    const meta = t.rows('syncMeta').find((row) => row.key === 'granola-import');
    assert.equal(meta?.lastError, GRANOLA_IMPORT_FAILED);
    const stored = JSON.stringify({ resources: t.rows('sharedResources'), meta: t.rows('syncMeta') });
    assert.equal(stored.includes(TRANSCRIPT), false);
    assert.equal(stored.includes('raw speaker'), false);
  });

  it('keeps publish off on update and does not turn a published recap back on by itself', async () => {
    const { t, resource } = world();
    const liveId = resource({
      notionPageId: 'granola:kickoff',
      title: 'Old title',
      description: 'Summary: Old.',
      type: 'Meeting notes',
      source: 'granola',
      publishToWarehaus: true,
      lastSyncedAt: 1,
    });
    await t.call(applyImport, {
      configured: true,
      notes: [FIXTURE_GRANOLA_NOTES[0]],
    });
    const kickoffs = t.rows('sharedResources').filter((row) => row.notionPageId === 'granola:kickoff');
    assert.equal(kickoffs.length, 1);
    const kickoff = t.row(liveId);
    assert.equal(kickoff?.publishToWarehaus, true);
    assert.match(String(kickoff?.description), /The menu structure is agreed/);
    assert.equal(String(kickoff?.description).includes('TRANSCRIPT'), false);
  });

  it('does not insert fixture notes when credentials are missing', async () => {
    const { t } = world();
    const before = t.rows('sharedResources').length;
    await t.call(applyImport, { configured: false });
    assert.equal(t.rows('sharedResources').length, before);
    const meta = t.rows('syncMeta').find((row) => row.key === 'granola-import');
    assert.equal(meta?.details, JSON.stringify({ configured: false }));
    assert.equal(meta?.lastError, undefined);
  });

  it('rejects a client retry and lets staff schedule the import', async () => {
    const { t } = world();
    await assert.rejects(t.call(retryImport, {}, { as: 'client' }), (err: unknown) => {
      assert.ok(err instanceof PortalAuthError);
      return true;
    });
    assert.equal(t.scheduled.length, 0);

    const result = await t.call(retryImport, {}, { as: 'staff' });
    assert.deepEqual(result, { scheduled: true });
    assert.equal(t.scheduled.length, 1);
    assert.equal(t.scheduled[0]?.name, 'sync/granola:runImport');
  });
});

describe('client recap query', () => {
  const published = (projectId: string): Fields => ({
    projectId,
    notionPageId: 'granola:kickoff',
    title: 'Kickoff recap',
    description: `Summary: The menu structure is agreed.\nTranscript:\n${TRANSCRIPT}`,
    type: 'Meeting notes',
    source: 'granola',
    publishToWarehaus: true,
    lastSyncedAt: 5,
  });
  const transcriptOnly: Fields = {
    notionPageId: 'granola:secret',
    title: 'Secret standup',
    description: ['Ada: one', 'Ben: two', 'Cara: three', 'Diego: four'].join('\n'),
    type: 'Meeting notes',
    source: 'granola',
    publishToWarehaus: true,
    lastSyncedAt: 6,
  };
  const ordinary = (projectId: string): Fields => ({
    projectId,
    notionPageId: 'notion-file',
    title: 'Brand file',
    description: 'Shared recap',
    type: 'File',
    publishToWarehaus: true,
    lastSyncedAt: 7,
  });

  /** The client org with only the given resources. */
  function clientWorld(resources: (projectId: string) => Fields[]) {
    const w = world({ kept: false });
    const ids = resources(w.projectId).map((fields) => w.resource(fields));
    return { ...w, ids };
  }

  it('returns a published recap and hides the transcript and unpublished notes', async () => {
    const { t } = clientWorld((projectId) => [
      published(projectId),
      transcriptOnly,
      ordinary(projectId),
      {
        notionPageId: 'granola:draft',
        title: 'Draft recap',
        description: 'Summary: Not published.',
        source: 'granola',
        publishToWarehaus: false,
        lastSyncedAt: 8,
      },
    ]);
    const rows = await t.call<Array<{ name: string; description: string | null }>>(listForClient, {}, { as: 'client' });
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

    const draft = clientWorld((projectId) => [
      published(projectId),
      { ...published(projectId), publishToWarehaus: false, notionPageId: 'granola:draft' },
    ]);
    await assert.rejects(
      draft.t.call(getForClient, { resourceId: draft.ids[1] }, { as: 'client' }),
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
