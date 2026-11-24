import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getSnapshot } from '../portalData';
import { getForClient, listForClient } from '../tasks';
import { getMyTaskPlatform, getTaskPlatform, setTaskPlatform } from '../clients';
import { PortalAuthError } from './identity';
import { memoryCtx } from './memoryCtx.testkit';
import { seedOrg, seedProject, seedTask } from './seedRows.testkit';

/** Northwind with one published project and task. The 'client' actor joins this org. */
function world() {
  const t = memoryCtx();
  const orgId = seedOrg(t, { slug: 'northwind', companyName: 'Northwind', notionPageId: 'client-notion', lastSyncedAt: 1 });
  const projectId = seedProject(t, orgId, {
    name: 'Northwind site',
    status: 'In Progress',
    type: ['Website'],
    notionPageId: 'project-public',
    lastSyncedAt: 1,
  });
  const taskId = seedTask(t, orgId, projectId, {
    name: 'Homepage',
    status: 'To Do',
    publishToWarehaus: true,
    notionPageId: 'task-public-notion',
    lastSyncedAt: 1,
    stage: 'Planning',
    description: 'Staff only task copy',
  });
  t.actor('client');
  t.actor('staff');
  return { t, orgId, taskId };
}

const authError = (message: string) => (err: unknown) => {
  assert.ok(err instanceof PortalAuthError);
  assert.equal(err.message, message);
  return true;
};

describe('client task platform', () => {
  const previous = process.env.LINEAR_API_KEY;

  it('keeps Notion tasks when the field is missing, and leaves them stored when the read is Linear', async () => {
    delete process.env.LINEAR_API_KEY;
    const { t, orgId, taskId } = world();
    const storedTask = t.row(taskId);
    try {
      const listed = await t.call<Array<{ name: string }>>(listForClient, {}, { as: 'client' });
      assert.equal(listed.some((row) => row.name === 'Homepage'), true);
      assert.deepEqual(t.row(taskId), storedTask);

      const snapshot = await t.call<{
        tasks: Array<{ name: string }>;
        taskPlatform: { platform: string; canChange: boolean; tasks: { ok: boolean }; milestones: { ok: boolean; count?: number } };
      }>(getSnapshot, {}, { as: 'client' });
      assert.equal(snapshot.tasks.some((row) => row.name === 'Homepage'), true);
      assert.equal(snapshot.taskPlatform.platform, 'notion');
      assert.equal(snapshot.taskPlatform.canChange, false);
      assert.equal(snapshot.taskPlatform.tasks.ok, true);
      assert.equal(snapshot.taskPlatform.milestones.ok, true);
      assert.equal(snapshot.taskPlatform.milestones.count, 0);

      await t.db.patch(orgId, { taskPlatform: 'linear' });
      const hidden = await t.call(listForClient, {}, { as: 'client' });
      assert.deepEqual(hidden, []);
      assert.deepEqual(t.row(taskId), storedTask);
      const linearSnapshot = await t.call<{
        tasks: unknown[];
        taskPlatform: { tasks: { ok: boolean; reason?: string } };
      }>(getSnapshot, {}, { as: 'client' });
      assert.deepEqual(linearSnapshot.tasks, []);
      assert.equal(linearSnapshot.taskPlatform.tasks.ok, false);
      assert.equal(linearSnapshot.taskPlatform.tasks.reason, 'not-configured');
      await assert.rejects(t.call(getForClient, { taskId }, { as: 'client' }), authError('Linear is not configured'));
      assert.deepEqual(t.row(taskId), storedTask);

      process.env.LINEAR_API_KEY = 'linear-test-key';
      const originalFetch = globalThis.fetch;
      let calls = 0;
      globalThis.fetch = () => {
        calls += 1;
        throw new Error('query fetched');
      };
      try {
        const remoteSnapshot = await t.call<{
          tasks: unknown[];
          taskPlatform: { tasks: { ok: boolean; reason?: string } };
        }>(getSnapshot, {}, { as: 'client' });
        assert.equal(calls, 0);
        assert.deepEqual(remoteSnapshot.tasks, []);
        assert.equal(remoteSnapshot.taskPlatform.tasks.reason, 'remote');
        assert.equal(JSON.stringify(remoteSnapshot).includes('linear-test-key'), false);
        assert.deepEqual(t.row(taskId), storedTask);
        await assert.rejects(t.call(getForClient, { taskId }, { as: 'client' }), authError('This client reads tasks from Linear'));
      } finally {
        globalThis.fetch = originalFetch;
      }
    } finally {
      if (previous === undefined) delete process.env.LINEAR_API_KEY;
      else process.env.LINEAR_API_KEY = previous;
    }
  });

  it('lets staff store the choice and rejects a client, without rewriting tasks', async () => {
    delete process.env.LINEAR_API_KEY;
    const { t, orgId, taskId } = world();
    const storedTask = t.row(taskId);
    const storedOrg = t.row(orgId);
    try {
      await assert.rejects(
        t.call(setTaskPlatform, { orgId, platform: 'linear' }, { as: 'client' }),
        authError('Staff role required'),
      );
      assert.equal(t.row(orgId)?.taskPlatform, undefined);
      assert.deepEqual(t.row(orgId), storedOrg);
      assert.deepEqual(t.row(taskId), storedTask);

      const saved = await t.call(setTaskPlatform, { orgId, platform: 'linear' }, { as: 'staff' });
      assert.deepEqual(saved, { orgId, platform: 'linear' });
      // The patch is only `taskPlatform`.
      assert.deepEqual(t.row(orgId), { ...storedOrg, taskPlatform: 'linear' });
      assert.deepEqual(t.row(taskId), storedTask);

      const clientView = await t.call<{ platform: string; canChange: boolean; tasks: { ok: boolean } }>(
        getMyTaskPlatform,
        {},
        { as: 'client' },
      );
      assert.equal(clientView.platform, 'linear');
      assert.equal(clientView.canChange, false);
      assert.equal(clientView.tasks.ok, false);

      const staffView = await t.call<{ canChange: boolean; platform: string }>(getTaskPlatform, { orgId }, { as: 'staff' });
      assert.equal(staffView.platform, 'linear');
      assert.equal(staffView.canChange, true);
      await assert.rejects(t.call(getTaskPlatform, { orgId }, { as: 'client' }), authError('Staff role required'));

      const back = await t.call(setTaskPlatform, { orgId, platform: 'notion' }, { as: 'staff' });
      assert.deepEqual(back, { orgId, platform: 'notion' });
      assert.deepEqual(t.row(orgId), { ...storedOrg, taskPlatform: 'notion' });
      assert.deepEqual(t.row(taskId), storedTask);
      const restored = await t.call<Array<{ name: string }>>(listForClient, {}, { as: 'client' });
      assert.equal(restored.some((row) => row.name === 'Homepage'), true);
    } finally {
      if (previous === undefined) delete process.env.LINEAR_API_KEY;
      else process.env.LINEAR_API_KEY = previous;
    }
  });
});
