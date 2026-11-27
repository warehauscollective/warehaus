/**
 * The run order, through the real handlers on the in-memory ctx: a reorder
 * saves `milestoneOrder`, a Building milestone refuses one, and a new task
 * lands last.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { addTask, reorderTasks } from '../milestones';
import { PortalAuthError } from './identity';
import { RUN_ORDER_LOCKED } from './milestoneTasks';
import { memoryCtx, type MemoryCtx } from './memoryCtx.testkit';
import { seedMilestoneWorld } from './seedRows.testkit';

const orderOf = (t: MemoryCtx, id: string) => (t.row(id) as { milestoneOrder?: number } | undefined)?.milestoneOrder;

function world(status: string) {
  const t = memoryCtx();
  const seeded = seedMilestoneWorld(t, { status });
  const ids = ['First', 'Second', 'Third'].map((name, index) => seeded.task({ name, milestoneOrder: index }));
  return { t, milestoneId: seeded.milestoneId, ids };
}

describe('run order', () => {
  it('saves the new order and writes only the rows that moved', async () => {
    const { t, milestoneId, ids } = world('Planning');
    const [first, second, third] = ids;
    const result = await t.call<{ ok: true; wrote: number }>(
      reorderTasks,
      { milestoneId, taskIds: [first, third, second] },
      { as: 'staff' },
    );
    assert.equal(result.wrote, 2);
    assert.deepEqual([first, third, second].map((id) => orderOf(t, id)), [0, 1, 2]);
    assert.deepEqual(t.reads.unbounded(), []);
    assert.deepEqual(t.reads.unindexed(), []);
  });

  it('refuses a new order while the milestone is Building, and writes nothing', async () => {
    const { t, milestoneId, ids } = world('Building');
    const [first, second, third] = ids;
    await assert.rejects(
      () => t.call(reorderTasks, { milestoneId, taskIds: [third, second, first] }, { as: 'staff' }),
      (error: unknown) => error instanceof PortalAuthError && error.message === RUN_ORDER_LOCKED,
    );
    assert.deepEqual(ids.map((id) => orderOf(t, id)), [0, 1, 2]);
  });

  it('puts a new task last, Building or not', async () => {
    for (const status of ['Planning', 'Building']) {
      const { t, milestoneId } = world(status);
      const added = await t.call<{ ok: true; taskId: string }>(addTask, { milestoneId, title: 'One more' }, { as: 'staff' });
      assert.equal(orderOf(t, added.taskId), 3);
      assert.equal((t.row(added.taskId) as { status?: string } | null)?.status, 'To Do');
    }
  });
});
