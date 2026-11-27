/**
 * The one-off needs-Peter to Ask migration, through its real handler on the
 * in-memory ctx.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { migrateNeedsPeterToAsks } from '../milestones';
import { listOpenAsks } from '../portalApi';
import { ASK_MIGRATION_BATCH, NO_PETER_CONTACT, type AskMigrationResult } from './askMigration';
import { PETER_EMAILS } from './milestoneReview';
import { memoryCtx, type MemoryCtx } from './memoryCtx.testkit';
import { seedMilestoneWorld } from './seedRows.testkit';

function world(t: MemoryCtx, { peter = true }: { peter?: boolean } = {}) {
  const { orgId, milestoneId } = seedMilestoneWorld(t, { status: 'Building' });
  const staff = (name: string, email: string) =>
    t.seed('contacts', {
      orgId,
      notionPageId: `seed-contact-${name}`,
      lastSyncedAt: 0,
      name,
      email,
      role: 'Warehaus Staff',
      portalAccess: 'Enabled',
    });
  const peterId = peter ? staff('Peter', PETER_EMAILS[0]) : null;
  const note = (body: string, createdAt: number, fields: Record<string, unknown> = {}) =>
    t.seed('milestoneNotes', { orgId, milestoneId, body, addedBy: 'runner', createdAt, ...fields });
  const old = (body: string, createdAt: number, fields: Record<string, unknown> = {}) =>
    note(body, createdAt, { needsPeter: 'open', reason: 'blocked', ...fields });
  return { orgId, milestoneId, peterId, staff, note, old };
}

const run = (t: MemoryCtx, args: { apply?: boolean; limit?: number } = {}) =>
  t.call<AskMigrationResult>(migrateNeedsPeterToAsks, args);

describe('needs-Peter to Ask migration', () => {
  it('reports on a dry run and writes nothing', async () => {
    const t = memoryCtx();
    const { old } = world(t);
    const id = old('blocked on a frame', 1);
    const result = await run(t);
    assert.deepEqual(result, { dryRun: true, wrote: false, found: 1, migrated: 0, more: false });
    assert.equal(t.row(id)?.needsPeter, 'open');
    assert.equal(t.row(id)?.open, undefined);
  });

  it('turns open needs-Peter notes into Asks waiting on Peter and leaves other notes alone', async () => {
    const t = memoryCtx();
    const { old, note, peterId } = world(t);
    const blocked = old('blocked on a frame', 1);
    const approval = old('ready to ship', 2, { reason: 'approval' });
    const answered = note('answered before the rename', 3, { reason: 'blocked' });
    const plain = note('a plain note', 4);
    const before = { answered: { ...t.row(answered) }, plain: { ...t.row(plain) } };

    const result = await run(t, { apply: true });
    assert.deepEqual(result, { dryRun: false, wrote: true, found: 2, migrated: 2, more: false });
    for (const id of [blocked, approval]) {
      assert.equal(t.row(id)?.open, true);
      assert.equal(t.row(id)?.waitingOn, peterId);
      assert.equal(t.row(id)?.needsPeter, undefined);
    }
    assert.equal(t.row(blocked)?.reason, 'blocked');
    assert.equal(t.row(approval)?.reason, 'approval');
    assert.deepEqual(t.row(answered), before.answered);
    assert.deepEqual(t.row(plain), before.plain);

    type Listed = { body: { items: Array<{ body: string; waitingOn: { id: string; name: string } | null }> } };
    const listed = await t.call<Listed>(listOpenAsks, { waitingOn: peterId as string });
    assert.deepEqual(listed.body.items.map((item) => item.body), ['ready to ship', 'blocked on a frame']);
  });

  it('reads the old open index only, one bounded batch', async () => {
    const t = memoryCtx();
    const { old, note } = world(t);
    old('one', 1);
    note('a plain note', 2);
    t.reads.reset();
    await run(t, { apply: true });
    assert.deepEqual(t.reads.unbounded(), []);
    assert.deepEqual(t.reads.unindexed(), []);
    const noteReads = t.reads.all.filter((read) => read.table === 'milestoneNotes');
    assert.equal(noteReads.length, 1);
    assert.equal(noteReads[0]?.index, 'by_needsPeter');
    assert.equal(noteReads[0]?.limit, ASK_MIGRATION_BATCH);
  });

  it('moves one batch a call and says when there is more', async () => {
    const t = memoryCtx();
    const { old } = world(t);
    const ids = [1, 2, 3].map((at) => old(`note ${at}`, at));
    const first = await run(t, { apply: true, limit: 2 });
    assert.deepEqual(first, { dryRun: false, wrote: true, found: 2, migrated: 2, more: true });
    assert.equal(t.row(ids[2] as string)?.needsPeter, 'open');
    const second = await run(t, { apply: true, limit: 2 });
    assert.deepEqual(second, { dryRun: false, wrote: true, found: 1, migrated: 1, more: false });
    assert.ok(ids.every((id) => t.row(id)?.open === true && t.row(id)?.needsPeter === undefined));
  });

  it('caps the batch whatever limit is asked for', async () => {
    const t = memoryCtx();
    const { old } = world(t);
    old('one', 1);
    t.reads.reset();
    await run(t, { limit: 5000 });
    const read = t.reads.all.filter((entry) => entry.table === 'milestoneNotes')[0];
    assert.equal(read?.limit, ASK_MIGRATION_BATCH);
  });

  it('writes nothing on a second run', async () => {
    const t = memoryCtx();
    const { old } = world(t);
    const id = old('one', 1);
    await run(t, { apply: true });
    const after = { ...t.row(id) };
    const again = await run(t, { apply: true });
    assert.deepEqual(again, { dryRun: false, wrote: false, found: 0, migrated: 0, more: false });
    assert.deepEqual(t.row(id), after);
  });

  it('keeps the person on a row that already names one', async () => {
    const t = memoryCtx();
    const { old, staff } = world(t);
    const maya = staff('Maya Chen', 'maya@warehaus.test');
    const id = old('half moved', 1, { waitingOn: maya });
    await run(t, { apply: true });
    assert.equal(t.row(id)?.waitingOn, maya);
    assert.equal(t.row(id)?.open, true);
  });

  it('refuses to apply where Peter has no contact, and leaves the notes as they were', async () => {
    const t = memoryCtx();
    const { old } = world(t, { peter: false });
    const id = old('one', 1);
    await assert.rejects(run(t, { apply: true }), new RegExp(NO_PETER_CONTACT));
    assert.equal(t.row(id)?.needsPeter, 'open');
    assert.equal(t.row(id)?.open, undefined);
  });
});
