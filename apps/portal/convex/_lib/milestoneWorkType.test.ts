/**
 * A milestone's type on the project page list: design, build or both, worked
 * out from the tasks the list already loads (`milestoneWorkType`,
 * `designGate.ts`). Staff and clients both receive it.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { listForClientProject, listForProject } from '../milestones';
import { milestoneWorkType } from './designGate';
import { memoryCtx, type MemoryCtx } from './memoryCtx.testkit';
import { seedMilestone, seedProject, seedTask } from './seedRows.testkit';

type View = { name: string; workType?: string; rows: unknown[] };

/** One published milestone per case, on the signed-in client's own project. */
function seedWorld(t: MemoryCtx) {
  t.actor('client');
  const orgId = t.rows('clients').find((row) => row.slug === 'northwind')!._id;
  const projectId = seedProject(t, orgId, { name: 'Site' });
  const milestone = (name: string) => seedMilestone(t, orgId, projectId, { name, publishToWarehaus: true });
  const task = (milestoneId: string, fields: Record<string, unknown> = {}) =>
    seedTask(t, orgId, projectId, { milestoneId, ...fields });

  const designOnly = milestone('Design only');
  task(designOnly, { kind: 'design' });
  task(designOnly, { kind: 'design', status: 'Done', isDone: true });

  const buildOnly = milestone('Build only');
  task(buildOnly, { kind: 'build' });
  // A task written before the design gate has no kind. It is a build task.
  task(buildOnly);

  const mixed = milestone('Mixed');
  task(mixed, { kind: 'design', status: 'Done', isDone: true });
  task(mixed, { kind: 'build' });

  // Parked and archived tasks do not count, and a subtask follows its parent.
  const parkedDesign = milestone('Parked design');
  const parent = task(parkedDesign, { kind: 'build' });
  task(parkedDesign, { kind: 'design', stage: 'Parked' });
  task(parkedDesign, { kind: 'design', archivedAt: 1 });
  task(parkedDesign, { kind: 'design', parentTaskId: parent });

  milestone('No tasks');
  const onlyParked = milestone('Only parked');
  task(onlyParked, { kind: 'design', stage: 'Parked' });

  return { projectId };
}

const EXPECTED: Record<string, string | undefined> = {
  'Design only': 'design',
  'Build only': 'build',
  Mixed: 'both',
  'Parked design': 'build',
  'No tasks': undefined,
  'Only parked': undefined,
};

/** What `seedWorld` leaves on the project: six milestones, ten tasks that are not archived. */
const MILESTONES = 6;
const LIVE_TASKS = 10;

function types(views: View[]) {
  return Object.fromEntries(views.map((view) => [view.name, view.workType]));
}

/** `table.index terminal` for every read, sorted, so two runs compare. */
function signature(reads: Array<{ table: string; index: string | null; terminal: string }>) {
  return reads.map((read) => `${read.table}.${read.index} ${read.terminal}`).sort();
}

describe('milestoneWorkType', () => {
  const row = (fields: Record<string, unknown> = {}) => ({ status: 'To Do', isDone: false, ...fields });

  it('is design, build or both from the counted tasks', () => {
    assert.equal(milestoneWorkType([row({ kind: 'design' })]), 'design');
    assert.equal(milestoneWorkType([row({ kind: 'build' }), row()]), 'build');
    assert.equal(milestoneWorkType([row({ kind: 'design' }), row()]), 'both');
  });

  it('is null with no counted task', () => {
    assert.equal(milestoneWorkType([]), null);
    assert.equal(milestoneWorkType([row({ kind: 'design', stage: 'Parked' }), row({ archived: true })]), null);
  });
});

describe('the project page milestone list carries each milestone type', () => {
  it('sends staff the type, and omits it on a milestone with no counted task', async () => {
    const t = memoryCtx();
    const { projectId } = seedWorld(t);
    const views = await t.call<View[]>(listForProject, { projectId }, { as: 'staff' });
    assert.deepEqual(types(views), EXPECTED);
    for (const view of views.filter((item) => EXPECTED[item.name] === undefined)) {
      assert.equal('workType' in view, false, view.name);
    }
  });

  it('sends clients the same type, from tasks they cannot open', async () => {
    const t = memoryCtx();
    const { projectId } = seedWorld(t);
    const views = await t.call<View[]>(listForClientProject, { projectId }, { as: 'client' });
    assert.deepEqual(types(views), EXPECTED);
    // The tasks are unpublished: the type is all a client learns of them.
    assert.deepEqual(views.map((view) => view.rows.length), [0, 0, 0, 0, 0, 0]);
  });

  for (const audience of ['staff', 'client'] as const) {
    it(`reads nothing more to work the type out (${audience})`, async () => {
      // The same project with every kind removed: the type is then build or absent.
      const run = async (stripKinds: boolean) => {
        const t = memoryCtx();
        const { projectId } = seedWorld(t);
        if (stripKinds) {
          for (const task of t.rows('tasks')) await t.db.patch(task._id, { kind: undefined });
        }
        await t.call(audience === 'staff' ? listForProject : listForClientProject, { projectId }, { as: audience });
        return t;
      };
      const typed = await run(false);
      const plain = await run(true);
      assert.deepEqual(typed.reads.unindexed(), []);
      assert.deepEqual(signature(typed.reads.unbounded()), signature(plain.reads.unbounded()));
      // The list's unbounded reads as they stood before the type was added. A new one fails here.
      const counts: Record<string, number> = {};
      for (const line of signature(typed.reads.unbounded())) counts[line] = (counts[line] ?? 0) + 1;
      assert.deepEqual(counts, {
        'milestones.by_orgId_projectId collect': 1,
        'tasks.by_orgId_projectId collect': 1,
        'milestoneResources.by_orgId_milestoneId collect': MILESTONES,
        'taskResources.by_orgId_taskId collect': MILESTONES * LIVE_TASKS,
        ...(audience === 'staff' ? { 'sharedResources.by_orgId collect': MILESTONES } : {}),
      });
    });
  }
});
