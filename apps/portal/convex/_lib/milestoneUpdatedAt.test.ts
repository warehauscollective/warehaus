import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import type { Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import { displayUpdatedAt, hiddenStateFlips, milestoneStampOnPull, stampParentMilestone, touched } from './milestoneUpdatedAt';

function fake(parentMilestoneId: string | null) {
  const patches: Array<{ id: string; patch: { updatedAt: number } }> = [];
  const ctx = {
    db: {
      get: async () => (parentMilestoneId ? { milestoneId: parentMilestoneId } : null),
      patch: async (id: string, patch: { updatedAt: number }) => {
        patches.push({ id, patch });
      },
    },
  } as unknown as Pick<MutationCtx, 'db'>;
  return { ctx, patches };
}

describe('displayUpdatedAt', () => {
  it('uses the stored write even when a loaded time is newer', () => {
    assert.equal(displayUpdatedAt(10, [99, 50]), 10);
  });

  it('falls back to the newest finite time already loaded', () => {
    assert.equal(displayUpdatedAt(undefined, [null, Number.NaN, 4, 9, 2]), 9);
    assert.equal(displayUpdatedAt(null, []), null);
    assert.equal(displayUpdatedAt(Number.POSITIVE_INFINITY, [3]), 3);
  });
});

describe('touched', () => {
  it('adds updatedAt without dropping the patch', () => {
    assert.deepEqual(touched({ workStatus: 'ready' }, 42), { workStatus: 'ready', updatedAt: 42 });
    assert.deepEqual(touched({}, 7), { updatedAt: 7 });
  });
});

describe('milestoneStampOnPull', () => {
  it('leaves the milestone updatedAt untouched when a pull changes nothing', async () => {
    const { ctx, patches } = fake(null);
    const stamp = milestoneStampOnPull({ existing: true, fieldsChanged: false, linksChanged: false });
    assert.equal(stamp, false);
    if (stamp) await stampParentMilestone(ctx, { milestoneId: 'm-1' as Id<'milestones'> }, 99);
    assert.deepEqual(patches, []);
    assert.equal(milestoneStampOnPull({ existing: false, fieldsChanged: false, linksChanged: false }), true);
    assert.equal(milestoneStampOnPull({ existing: true, fieldsChanged: true, linksChanged: false }), true);
    assert.equal(milestoneStampOnPull({ existing: true, fieldsChanged: false, linksChanged: true }), true);
  });
});

describe('hiddenStateFlips', () => {
  it('stamps only when the hidden reason changes', () => {
    assert.equal(hiddenStateFlips('ancestor', 'ancestor'), false);
    assert.equal(hiddenStateFlips(undefined, 'ancestor'), true);
    assert.equal(hiddenStateFlips('ancestor', null), true);
    assert.equal(hiddenStateFlips(null, null), false);
  });
});

describe('stampParentMilestone', () => {
  it('patches only the milestone on the task', async () => {
    const { ctx, patches } = fake(null);
    await stampParentMilestone(ctx, { milestoneId: 'm-1' as Id<'milestones'> }, 11);
    assert.deepEqual(patches, [{ id: 'm-1', patch: { updatedAt: 11 } }]);
  });

  it('uses the parent task milestone for a nested task', async () => {
    const { ctx, patches } = fake('m-parent');
    await stampParentMilestone(ctx, { parentTaskId: 'task-parent' as Id<'tasks'> }, 12);
    assert.deepEqual(patches, [{ id: 'm-parent', patch: { updatedAt: 12 } }]);
  });

  it('does nothing when the task has no milestone', async () => {
    const { ctx, patches } = fake(null);
    await stampParentMilestone(ctx, {}, 13);
    assert.deepEqual(patches, []);
  });
});

describe('write paths stamp the parent milestone', () => {
  const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

  it('stamps Notion pulls, task edits, and hides, and records milestone writes', () => {
    const upsert = read('../sync/upsert.ts');
    assert.match(upsert, /milestoneStampOnPull\(\{/);
    assert.match(upsert, /fieldsChanged/);
    assert.match(upsert, /linksChanged/);
    assert.doesNotMatch(upsert, /updatedAt != null \|\| linksChanged/);
    assert.match(upsert, /stampParentMilestone\(ctx, row, now\)/);
    assert.match(upsert, /stampParentMilestone\(ctx, \{ \.\.\.task, parentTaskId/);

    const link = read('./taskMilestoneLink.ts');
    assert.match(link, /stampParentMilestone\(ctx, \{ milestoneId: milestone\._id \}/);

    const tasks = read('../tasks.ts');
    assert.equal(tasks.split('stampParentMilestone(').length - 1, 6);

    const portal = read('../portalApi.ts');
    assert.match(portal, /stampParentMilestone\(ctx, task, now\)/);
    const create = portal.slice(portal.indexOf('export const createMilestone'), portal.indexOf('export const updateMilestone'));
    const update = portal.slice(portal.indexOf('export const updateMilestone'), portal.indexOf('export const addComment'));
    assert.match(create, /insert\('milestones', touched\(/);
    assert.match(update, /ctx\.db\.patch\(milestone\._id, touched\(/);

    const outbox = read('../sync/outbox.ts');
    assert.equal(outbox.split('stampParentMilestone(').length - 1, 2);

    const taskWrite = read('../sync/taskWrite.ts');
    assert.match(taskWrite, /stampParentMilestone\(ctx, task, Date\.now\(\)\)/);

    const inbound = read('../sync/inbound.ts');
    assert.match(inbound, /stampParentMilestone\(ctx, task, now\)/);

    const hide = read('../sync/hide.ts');
    assert.equal(hide.split('stampParentMilestone(').length - 1, 6);
    assert.match(hide, /hiddenStateFlips\(row\.syncHiddenReason, 'ancestor'\)/);
    assert.match(hide, /hiddenStateFlips\(row\.syncHiddenReason, null\)/);
    assert.match(hide, /if \(flips\) await stampParentMilestone/);

    const milestones = read('../milestones.ts');
    assert.match(milestones, /updatedAt: Date\.now\(\)/);
    assert.match(milestones, /touched\(/);
    assert.match(milestones, /displayUpdatedAt\(milestone\.updatedAt, loadedTimes\)/);
    assert.doesNotMatch(milestones, /loadedTimes\.push\(milestone\._creationTime\)/);
    assert.doesNotMatch(milestones, /by_updatedAt/);
    const preview = milestones.slice(milestones.indexOf('export const setReviewPreview'), milestones.indexOf('async function applyPreviewOutcome'));
    assert.match(preview, /ctx\.db\.patch\(args\.milestoneId, touched\(/);
    const fallback = milestones.slice(milestones.indexOf('const loadedTimes'), milestones.indexOf('view.updatedAt = displayUpdatedAt'));
    assert.match(fallback, /if \(audience === 'staff'\) \{\s*loadedTimes\.push\(\s*milestone\.decidedAt/);
    assert.match(fallback, /if \(audience === 'staff' && review\)/);
    assert.doesNotMatch(fallback, /lastSyncedAt/);

    const linear = read('../../../../packages/portal-sync/src/linearTaskPlatform.ts');
    assert.doesNotMatch(linear, /ctx\.db\.(patch|insert)/);
  });
});
