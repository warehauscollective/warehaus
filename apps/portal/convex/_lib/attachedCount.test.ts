import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { listAttachedForClient, listAttachedForStaff } from '../sharedResources';
import { memoryCtx } from './memoryCtx.testkit';
import { seedProject, seedTask } from './seedRows.testkit';

type Attached = Array<{ name: string; attachedCount?: number }>;

/** One resource linked to four tasks: visible, hidden, unpublished, and on an unpublished project. */
function world() {
  const t = memoryCtx();
  t.actor('client');
  t.actor('staff');
  const orgId = t.rows('clients').find((row) => row.slug === 'northwind')?._id as string;
  const publicProject = seedProject(t, orgId, { name: 'Northwind site', type: ['Website'], publishToWarehaus: true });
  const draftProject = seedProject(t, orgId, { name: 'Secret draft site', type: ['Website'], publishToWarehaus: false });
  const taskPublic = seedTask(t, orgId, publicProject, { name: 'Visible task', publishToWarehaus: true });
  const taskHidden = seedTask(t, orgId, publicProject, { name: 'Hidden task', publishToWarehaus: true, syncHiddenAt: 9 });
  const taskDraft = seedTask(t, orgId, publicProject, { name: 'Unpublished task', publishToWarehaus: false });
  const taskSecret = seedTask(t, orgId, draftProject, { name: 'Task on unpublished project', publishToWarehaus: true });
  const resourceId = t.seed('sharedResources', {
    orgId,
    projectId: publicProject,
    title: 'Kickoff recap',
    description: 'Decisions',
    type: 'Meeting notes',
    publishToWarehaus: true,
    archive: false,
    notionPageId: 'notion-res',
    lastSyncedAt: 41,
  });
  for (const taskId of [taskPublic, taskHidden, taskDraft, taskSecret]) {
    t.seed('taskResources', { orgId, taskId, resourceId });
  }
  return { t, taskPublic };
}

describe('attached resource counts', () => {
  it('hides hidden and unpublished tasks from the client count', async () => {
    const { t, taskPublic } = world();
    const rows = await t.call<Attached>(listAttachedForClient, { taskId: taskPublic }, { as: 'client' });
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.name, 'Kickoff recap');
    assert.equal(rows[0]?.attachedCount, 1);
  });

  it('keeps the raw link count for staff', async () => {
    const { t, taskPublic } = world();
    const rows = await t.call<Attached>(listAttachedForStaff, { taskId: taskPublic }, { as: 'staff' });
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.attachedCount, 4);
  });
});
