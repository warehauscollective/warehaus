import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PortalAuthError } from './identity';
import { forClient, forStaff } from '../search';
import { memoryCtx } from './memoryCtx.testkit';
import { seedOrg, seedProject, seedTask } from './seedRows.testkit';

type Fields = Record<string, unknown>;

/**
 * Northwind (the 'client' actor's org) and Other Org, each with public rows,
 * plus Northwind drafts and a sync-hidden project.
 */
function world() {
  const t = memoryCtx();
  const north = seedOrg(t, { slug: 'northwind', companyName: 'Northwind' });
  const other = seedOrg(t, { slug: 'other', companyName: 'Other Org' });
  t.actor('client');
  t.actor('staff');

  const project = (orgId: string, fields: Fields) =>
    seedProject(t, orgId, { status: 'In Progress', type: ['Website'], publishToWarehaus: true, ...fields });
  const projPublic = project(north, {
    name: 'Northwind site',
    description: 'Public site',
    notionPageId: 'notion-project-public',
    externalId: 'ext-project-public',
    lastSyncedAt: 11,
  });
  project(north, {
    name: 'Secret draft site',
    description: 'Held',
    status: 'Inbox',
    publishToWarehaus: false,
    notionPageId: 'notion-project-draft',
    externalId: 'ext-project-draft',
    lastSyncedAt: 12,
  });
  project(north, { name: 'Hidden launch', syncHiddenAt: 9, notionPageId: 'notion-project-hidden', lastSyncedAt: 13 });
  const projOther = project(other, {
    name: 'Lighthouse site',
    description: 'Other org',
    notionPageId: 'notion-project-other',
    externalId: 'ext-project-other',
    lastSyncedAt: 14,
  });

  seedTask(t, north, projPublic, {
    name: 'Homepage',
    publishToWarehaus: true,
    description: 'Staff only task copy',
    notionPageId: 'notion-task-public',
    externalId: 'ext-task-public',
    lastSyncedAt: 21,
  });
  seedTask(t, north, projPublic, {
    name: 'Secret draft task',
    status: 'Inbox',
    publishToWarehaus: false,
    notionPageId: 'notion-task-draft',
    lastSyncedAt: 22,
  });
  seedTask(t, other, projOther, {
    name: 'Other org task',
    publishToWarehaus: true,
    notionPageId: 'notion-task-other',
    lastSyncedAt: 23,
  });

  t.seed('clientDocs', {
    orgId: north,
    projectId: projPublic,
    title: 'Public brief',
    summary: 'Shared scope',
    docType: 'Brief',
    order: 4,
    status: 'Published',
    publishToWarehaus: true,
    notionPageId: 'notion-doc-public',
    externalId: 'ext-doc-public',
    lastSyncedAt: 31,
  });
  t.seed('clientDocs', {
    orgId: north,
    projectId: projPublic,
    title: 'Secret draft doc',
    summary: 'Held',
    docType: 'Note',
    order: 9,
    status: 'Draft',
    publishToWarehaus: false,
    notionPageId: 'notion-doc-draft',
    lastSyncedAt: 32,
  });
  t.seed('clientDocs', {
    orgId: other,
    title: 'Other org guide',
    summary: 'Foreign',
    docType: 'Guide',
    order: 1,
    status: 'Published',
    publishToWarehaus: true,
    notionPageId: 'notion-doc-other',
    lastSyncedAt: 33,
  });

  t.seed('sharedResources', {
    orgId: north,
    projectId: projPublic,
    title: 'Kickoff recap',
    description: 'Decisions',
    type: 'Meeting notes',
    publishToWarehaus: true,
    archive: false,
    notionPageId: 'notion-res-public',
    externalId: 'wh_res_secret',
    lastSyncedAt: 41,
  });
  t.seed('sharedResources', {
    orgId: north,
    projectId: projPublic,
    title: 'Unpublished file',
    type: 'File',
    publishToWarehaus: false,
    archive: false,
    notionPageId: 'notion-res-draft',
    lastSyncedAt: 42,
  });
  t.seed('sharedResources', {
    orgId: other,
    title: 'Other org file',
    type: 'File',
    publishToWarehaus: true,
    archive: false,
    notionPageId: 'notion-res-other',
    lastSyncedAt: 43,
  });

  return {
    t,
    north,
    projPublic,
    run: (fn: unknown, args: Fields) => t.call(fn, args, { as: 'client' }),
    runStaff: (fn: unknown, args: Fields) => t.call(fn, args, { as: 'staff' }),
  };
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
    const { run } = world();
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

    const blank = await run(forClient, { q: '   ' });
    assert.deepEqual(blank, { projects: [], tasks: [], docs: [], resources: [] });
    const capped = JSON.stringify(await run(forClient, { q: `${'x'.repeat(100)}site` }));
    assert.equal(capped.includes('Northwind'), false);

    const docs = await run(forClient, { q: 'brief' });
    const docText = JSON.stringify(docs);
    assert.match(docText, /Public brief/);
    assert.equal(docText.includes('Secret draft doc'), false);
    assert.equal(docText.includes('Other org guide'), false);
    assert.equal(keysOf(docs).has('order'), false);
  });

  it('gives staff full access across orgs, including unpublished rows', async () => {
    const { run, runStaff } = world();
    const blank = await runStaff(forStaff, { q: ' \n ' });
    assert.deepEqual(blank, { projects: [], tasks: [], docs: [], resources: [] });
    const capped = JSON.stringify(await runStaff(forStaff, { q: `${'x'.repeat(100)}lighthouse` }));
    assert.equal(capped.includes('Lighthouse'), false);

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

  it('keeps client tasks that have no stage, and still returns a stage when one is set', async () => {
    const { t, north, projPublic, run } = world();
    const plain = (await run(forClient, { q: 'Homepage' })) as { tasks: Array<Record<string, unknown>> };
    assert.equal(plain.tasks.length, 1);
    assert.equal(plain.tasks[0]?.title, 'Homepage');
    assert.equal('stage' in (plain.tasks[0] ?? {}), false);
    assert.equal('published' in (plain.tasks[0] ?? {}), false);
    assert.match(String(plain.tasks[0]?.subtitle), /^Task · /);

    seedTask(t, north, projPublic, {
      name: 'Staged homepage pass',
      stage: 'Planning',
      date: '2026-10-20',
      publishToWarehaus: true,
      notionPageId: 'notion-task-staged',
      lastSyncedAt: 24,
    });
    const staged = (await run(forClient, { q: 'Staged homepage' })) as { tasks: Array<Record<string, unknown>> };
    assert.equal(staged.tasks[0]?.stage, 'Planning');
    assert.match(String(staged.tasks[0]?.subtitle), /Task · Oct 20 · Northwind site/);
  });

  it('scans the newest 200 staff rows', async () => {
    const t = memoryCtx();
    const north = seedOrg(t, { slug: 'northwind', companyName: 'Northwind' });
    for (let index = 0; index < 250; index += 1) {
      seedProject(t, north, {
        name: index === 0 ? 'Oldest lighthouse' : index === 249 ? 'Newest lighthouse' : `Filler ${index}`,
        description: '',
        status: 'In Progress',
        type: ['Website'],
        publishToWarehaus: true,
        notionPageId: `notion-scan-${index}`,
        lastSyncedAt: index,
      });
    }
    const oldest = JSON.stringify(await t.call(forStaff, { q: 'Oldest lighthouse' }, { as: 'staff' }));
    const newest = JSON.stringify(await t.call(forStaff, { q: 'Newest lighthouse' }, { as: 'staff' }));
    assert.equal(oldest.includes('Oldest lighthouse'), false);
    assert.match(newest, /Newest lighthouse/);
  });
});
