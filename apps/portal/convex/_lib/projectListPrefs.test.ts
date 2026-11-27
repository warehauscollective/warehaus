import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { getMine, saveMine } from '../projectListPrefs';
import { memoryCtx, type MemoryCtx } from './memoryCtx.testkit';
import { defaultProjectListView, type ProjectListView } from './projectListView';

const view = (over: Partial<ProjectListView> = {}): ProjectListView => ({ ...defaultProjectListView(), ...over });

/** The stored view without the row's own fields. */
function stored(t: MemoryCtx, index = 0): Record<string, unknown> {
  const fields: Record<string, unknown> = { ...t.rows('projectListPrefs')[index] };
  for (const key of ['_id', '_creationTime', 'contactId', 'updatedAt']) delete fields[key];
  return fields;
}

function contactIdOf(t: MemoryCtx, authUserId: string): string {
  const contact = t.rows('contacts').find((row) => row.authUserId === authUserId);
  assert.ok(contact);
  return contact._id as string;
}

describe('projectListPrefs', () => {
  it('returns null when nothing is saved', async () => {
    const t = memoryCtx();
    assert.equal(await t.call(getMine, {}, { as: 'staff' }), null);
    assert.equal(await t.call(getMine, {}, { as: 'client' }), null);
    assert.equal(t.rows('projectListPrefs').length, 0);
  });

  it('refuses a signed-out caller', async () => {
    const t = memoryCtx();
    await assert.rejects(t.call(getMine, {}));
    await assert.rejects(t.call(saveMine, view({ quick: 'active' })));
    assert.equal(t.rows('projectListPrefs').length, 0);
  });

  it('saves a view and reads it back', async () => {
    const t = memoryCtx();
    const saved = view({
      quick: 'active',
      status: ['In progress', 'Planned'],
      clientIds: ['clients:9'],
      publish: 'published',
      stack: ['Next.js'],
      startDate: { from: '2026-01-01', to: null },
      endDate: { from: null, to: '2026-12-31' },
      progress: ['inProgress', 'complete'],
      tasks: 'has',
      updated: '30d',
      sort: { key: 'client', direction: 'desc' },
    });
    assert.deepEqual(await t.call(saveMine, saved, { as: 'staff' }), saved);
    assert.deepEqual(await t.call(getMine, {}, { as: 'staff' }), saved);

    const rows = t.rows('projectListPrefs');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].contactId, contactIdOf(t, t.actor('staff')));
    assert.equal(typeof rows[0].updatedAt, 'number');
  });

  it('updates the one row on a second save', async () => {
    const t = memoryCtx();
    await t.call(saveMine, view({ quick: 'active' }), { as: 'staff' });
    const first = t.rows('projectListPrefs')[0];
    await t.call(saveMine, view({ quick: 'shipped', tasks: 'none' }), { as: 'staff' });
    const rows = t.rows('projectListPrefs');
    assert.equal(rows.length, 1);
    assert.equal(rows[0]._id, first._id);
    assert.deepEqual(await t.call(getMine, {}, { as: 'staff' }), view({ quick: 'shipped', tasks: 'none' }));
  });

  it('keeps each contact to their own view', async () => {
    const t = memoryCtx();
    const staffView = view({ quick: 'internal', sort: { key: 'name', direction: 'asc' } });
    await t.call(saveMine, staffView, { as: 'staff' });

    // The second contact sees nothing of the first.
    assert.equal(await t.call(getMine, {}, { as: 'client' }), null);

    // And saving writes their own row, leaving the first untouched.
    const before = t.rows('projectListPrefs')[0];
    await t.call(saveMine, view({ quick: 'shipped' }), { as: 'client' });
    const rows = t.rows('projectListPrefs');
    assert.equal(rows.length, 2);
    assert.deepEqual(rows[0], before);
    assert.equal(rows[1].contactId, contactIdOf(t, t.actor('client')));
    assert.notEqual(rows[1].contactId, rows[0].contactId);

    assert.deepEqual(await t.call(getMine, {}, { as: 'staff' }), staffView);
    assert.deepEqual(await t.call(getMine, {}, { as: 'client' }), view({ quick: 'shipped' }));

    // Two staff contacts are separate too.
    assert.equal(await t.call(getMine, {}, { as: 'peter' }), null);
  });

  it('takes no contact argument', async () => {
    const t = memoryCtx();
    await t.call(saveMine, view({ quick: 'active' }), { as: 'staff' });
    const staffContact = contactIdOf(t, t.actor('staff'));
    await assert.rejects(
      t.call(saveMine, { ...view({ quick: 'shipped' }), contactId: staffContact }, { as: 'client' }),
      /Arguments/,
    );
    await assert.rejects(t.call(getMine, { contactId: staffContact }, { as: 'client' }), /Arguments/);
    assert.equal(t.rows('projectListPrefs').length, 1);
    assert.equal(stored(t).quick, 'active');
  });

  it('strips staff-only filters from a client save', async () => {
    const t = memoryCtx();
    const sent = view({
      quick: 'internal',
      clientIds: ['clients:1', 'clients:2'],
      publish: 'unpublished',
      status: ['Planned'],
      sort: { key: 'client', direction: 'asc' },
    });
    const kept = view({ status: ['Planned'] });
    assert.deepEqual(await t.call(saveMine, sent, { as: 'client' }), kept);
    assert.deepEqual(stored(t), kept);
    assert.deepEqual(await t.call(getMine, {}, { as: 'client' }), kept);
  });

  it('stores nothing when a client sends only staff-only filters', async () => {
    const t = memoryCtx();
    await t.call(saveMine, view({ quick: 'internal', clientIds: ['clients:1'], publish: 'published' }), { as: 'client' });
    assert.equal(t.rows('projectListPrefs').length, 0);
  });

  it('does not hand a stored staff-only filter to a client', async () => {
    const t = memoryCtx();
    const contactId = contactIdOf(t, t.actor('client'));
    t.seed('projectListPrefs', {
      contactId,
      ...view({ quick: 'internal', clientIds: ['clients:1'], publish: 'published', tasks: 'has' }),
      updatedAt: 1,
    });
    assert.deepEqual(await t.call(getMine, {}, { as: 'client' }), view({ tasks: 'has' }));
    // The next save rewrites the row clean, even though the caller's view is the same.
    await t.call(saveMine, view({ tasks: 'has' }), { as: 'client' });
    assert.deepEqual(stored(t), view({ tasks: 'has' }));
  });

  it('refuses unknown keys and values', async () => {
    const t = memoryCtx();
    await assert.rejects(t.call(saveMine, { ...view(), extra: true }, { as: 'staff' }), /Arguments/);
    await assert.rejects(t.call(saveMine, { ...view(), quick: 'everything' }, { as: 'staff' }), /Arguments/);
    await assert.rejects(
      t.call(saveMine, { ...view(), sort: { key: 'budget', direction: 'asc' } }, { as: 'staff' }),
      /Arguments/,
    );
    await assert.rejects(t.call(saveMine, { ...view(), status: [1] }, { as: 'staff' }), /Arguments/);
    await assert.rejects(t.call(saveMine, { quick: 'all' }, { as: 'staff' }), /Arguments/);
    assert.equal(t.rows('projectListPrefs').length, 0);
  });

  it('caps picked lists and drops bad values', async () => {
    const t = memoryCtx();
    const many = Array.from({ length: 250 }, (_, index) => `Status ${index}`);
    await t.call(
      saveMine,
      view({
        status: many,
        clientIds: Array.from({ length: 250 }, (_, index) => `clients:${index}`),
        stack: ['React', 'React', '  ', 'x'.repeat(201), 'Convex'],
        progress: ['complete', 'complete', 'notStarted'],
        startDate: { from: '2026-02-31', to: 'tomorrow' },
      }),
      { as: 'staff' },
    );
    const row = stored(t);
    assert.deepEqual(row.status, many.slice(0, 100));
    assert.equal((row.clientIds as string[]).length, 100);
    assert.deepEqual(row.stack, ['React', 'Convex']);
    assert.deepEqual(row.progress, ['notStarted', 'complete']);
    assert.deepEqual(row.startDate, { from: null, to: null });
  });

  it('writes nothing when the view is unchanged', async (context) => {
    const t = memoryCtx();
    const saved = view({ quick: 'active', status: ['Planned'], sort: { key: 'name', direction: 'asc' } });
    context.mock.method(Date, 'now', () => 1_000);
    await t.call(saveMine, saved, { as: 'staff' });
    const before = t.rows('projectListPrefs');
    assert.equal(before[0].updatedAt, 1_000);

    context.mock.method(Date, 'now', () => 2_000);
    assert.deepEqual(await t.call(saveMine, view({ ...saved, status: ['Planned'] }), { as: 'staff' }), saved);
    assert.deepEqual(t.rows('projectListPrefs'), before);

    // A real change does write.
    await t.call(saveMine, view({ ...saved, quick: 'shipped' }), { as: 'staff' });
    assert.equal(t.rows('projectListPrefs')[0].updatedAt, 2_000);
  });

  it('stores the default view as no row', async () => {
    const t = memoryCtx();
    await t.call(saveMine, view(), { as: 'staff' });
    assert.equal(t.rows('projectListPrefs').length, 0);

    await t.call(saveMine, view({ quick: 'active' }), { as: 'staff' });
    await t.call(saveMine, view({ quick: 'shipped' }), { as: 'client' });
    await t.call(saveMine, view(), { as: 'staff' });
    assert.equal(await t.call(getMine, {}, { as: 'staff' }), null);
    // Only the caller's row went.
    assert.deepEqual(await t.call(getMine, {}, { as: 'client' }), view({ quick: 'shipped' }));
    assert.equal(t.rows('projectListPrefs').length, 1);
  });

  it('reads by index, bounded, and touches nothing else', async () => {
    const t = memoryCtx();
    await t.call(saveMine, view({ quick: 'active' }), { as: 'staff' });
    await t.call(saveMine, view({ quick: 'active' }), { as: 'staff' });
    await t.call(saveMine, view({ quick: 'shipped' }), { as: 'staff' });
    await t.call(getMine, {}, { as: 'staff' });
    await t.call(saveMine, view(), { as: 'staff' });
    await t.call(getMine, {}, { as: 'client' });

    assert.deepEqual(t.reads.unbounded(), []);
    assert.deepEqual(t.reads.unindexed(), []);
    assert.deepEqual(t.scheduled, []);
    assert.deepEqual(t.runs, []);
    assert.equal(t.rows('notionOutbox').length, 0);
  });

  it('has no Notion outbox write and no scheduler call in the source', () => {
    const source = readFileSync(new URL('../projectListPrefs.ts', import.meta.url), 'utf8');
    assert.doesNotMatch(source, /notionOutbox|scheduler|runMutation|runAction|\.collect\(/);
  });
});
