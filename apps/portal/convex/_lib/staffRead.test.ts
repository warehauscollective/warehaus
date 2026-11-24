import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as projects from '../projects';
import * as tasks from '../tasks';
import * as portalCatalog from '../portalCatalog';
import { memoryCtx } from './memoryCtx.testkit';
import { seedOrg, seedProject, seedTask } from './seedRows.testkit';

type Named = { name: string };

function world() {
  const t = memoryCtx();
  const open = seedOrg(t, { slug: 'open', companyName: 'Open Co' });
  const disabled = seedOrg(t, { slug: 'disabled', companyName: 'Disabled Co', portalAccess: 'Disabled' });
  const trashed = seedOrg(t, { slug: 'trashed', companyName: 'Trashed Co', syncHiddenAt: 5 });
  const openProject = seedProject(t, open, { name: 'Open site', publishToWarehaus: true, type: ['Website'] });
  const disabledProject = seedProject(t, disabled, { name: 'Disabled draft', publishToWarehaus: false, type: ['Website'] });
  const trashedProject = seedProject(t, trashed, { name: 'Trashed site', publishToWarehaus: true, type: ['Website'] });
  seedTask(t, open, openProject, { name: 'Open task' });
  seedTask(t, disabled, disabledProject, { name: 'Disabled task' });
  seedTask(t, trashed, trashedProject, { name: 'Trashed task' });
  return t;
}

const names = (rows: unknown) => (rows as Named[]).map((row) => row.name).sort();

describe('staff read model', () => {
  it('leaves concealed clients out of the staff UI, keeping Disabled ones and drafts', async () => {
    const t = world();
    assert.deepEqual(names(await t.call(projects.listForStaff, {}, { as: 'staff' })), ['Disabled draft', 'Open site']);
    assert.deepEqual(names(await t.call(projects.listPublishedForStaff, {}, { as: 'staff' })), ['Open site']);
    assert.deepEqual(names(await t.call(tasks.listForStaff, {}, { as: 'staff' })), ['Disabled task', 'Open task']);
  });

  it('reads projects and tasks by org index, never a whole-table scan', async () => {
    const t = world();
    await t.actor('staff');
    t.reads.reset();
    await t.call(projects.listForStaff, {}, { as: 'staff' });
    await t.call(tasks.listForStaff, {}, { as: 'staff' });
    const scans = t.reads.unindexed().filter((read) => read.table === 'projects' || read.table === 'tasks');
    assert.deepEqual(scans, []);
  });

  it('gives the staff API the same concealment', async () => {
    const t = world();
    const result = (await t.call(portalCatalog.listProjects, { cursor: null, limit: 50 })) as {
      body: { items: Named[] };
    };
    assert.deepEqual(names(result.body.items), ['Disabled draft', 'Open site']);
  });
});
