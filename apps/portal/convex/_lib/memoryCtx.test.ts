import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { v } from 'convex/values';
import { components, internal } from '../_generated/api';
import { httpAction, internalAction, internalMutation, internalQuery } from '../_generated/server';
import { advance, setStatus } from '../milestones';
import { PortalAuthError } from './identity';
import { MemoryCtxError, checkAgainst, memoryCtx, type MemoryCtx } from './memoryCtx.testkit';

function seedProject(t: MemoryCtx) {
  const orgId = t.seed('clients', {
    notionPageId: 'org-north',
    lastSyncedAt: 0,
    companyName: 'Northwind',
    slug: 'northwind',
    status: 'Active',
    portalAccess: 'Enabled',
  });
  const projectId = t.seed('projects', {
    orgId,
    notionPageId: 'project-site',
    lastSyncedAt: 0,
    name: 'Site',
    status: 'Active',
    type: [],
    archive: false,
    publishToWarehaus: true,
  });
  return { orgId, projectId };
}

function seedMilestone(t: MemoryCtx, fields: Record<string, unknown> = {}) {
  const { orgId, projectId } = seedProject(t);
  const milestoneId = t.seed('milestones', {
    orgId,
    projectId,
    name: 'Launch',
    objective: 'Ship it',
    goals: [],
    status: 'Building',
    approval: 'unreviewed',
    publishToWarehaus: false,
    ...fields,
  });
  return { orgId, projectId, milestoneId };
}

function seedTask(t: MemoryCtx, ids: { orgId: string; projectId: string; milestoneId?: string }, fields: Record<string, unknown> = {}) {
  return t.seed('tasks', {
    orgId: ids.orgId,
    projectId: ids.projectId,
    notionPageId: `task-${Math.random()}`,
    lastSyncedAt: 0,
    name: 'Task',
    status: 'To Do',
    isDone: false,
    publishToWarehaus: false,
    ...(ids.milestoneId ? { milestoneId: ids.milestoneId } : {}),
    ...fields,
  });
}

const throwsMemory = (pattern: RegExp) => (error: unknown) => error instanceof MemoryCtxError && pattern.test(error.message);

describe('memoryCtx validators', () => {
  it('checks values against a validator', () => {
    const json = v.object({ id: v.id('tasks'), name: v.string(), tags: v.array(v.string()), note: v.optional(v.string()) });
    assert.equal(checkAgainst(json, { id: 'tasks:1', name: 'a', tags: [] }), null);
    assert.match(checkAgainst(json, { id: 'projects:1', name: 'a', tags: [] }) ?? '', /expected an id of tasks/);
    assert.match(checkAgainst(json, { id: 'tasks:1', tags: [] }) ?? '', /name: required/);
    assert.match(checkAgainst(json, { id: 'tasks:1', name: 'a', tags: [1] }) ?? '', /tags\[0\]: expected string/);
    assert.match(checkAgainst(json, { id: 'tasks:1', name: 'a', tags: [], extra: 1 }) ?? '', /extra: not in the validator/);
    const union = v.union(v.literal('a'), v.literal('b'));
    assert.equal(checkAgainst(union, 'b'), null);
    assert.match(checkAgainst(union, 'c') ?? '', /matches no member/);
  });

  it('refuses a seeded row that breaks the schema', () => {
    const t = memoryCtx();
    assert.throws(() => t.seed('clients', { slug: 'x' }), throwsMemory(/Schema: clients\.notionPageId: required/));
    assert.throws(() => t.seed('nope', {}), throwsMemory(/Unknown table/));
  });

  it('checks the arguments against the function validator', async () => {
    const t = memoryCtx();
    await assert.rejects(t.call(setStatus, { milestoneId: 'tasks:1', status: 'Building' }, { as: 'staff' }), throwsMemory(/Arguments: args\.milestoneId: expected an id of milestones/));
  });
});

describe('memoryCtx reads', () => {
  it('throws on an index the schema does not define, or eq fields out of order', async () => {
    const t = memoryCtx();
    const { orgId } = seedMilestone(t);
    await assert.rejects(async () => t.db.query('tasks').withIndex('by_nothing').take(1), throwsMemory(/Index "by_nothing" is not defined on table "tasks"/));
    await assert.rejects(
      async () => t.db.query('tasks').withIndex('by_orgId_milestoneId', (q) => q.eq('milestoneId', 'milestones:1')).take(1),
      throwsMemory(/eq\("milestoneId"\) is not field 1/),
    );
    const rows = await t.db.query('tasks').withIndex('by_orgId_milestoneId', (q) => q.eq('orgId', orgId)).take(5);
    assert.deepEqual(rows, []);
  });

  it('returns rows in index order, then creation order, and reverses with desc', async () => {
    const t = memoryCtx();
    const ids = seedMilestone(t);
    const late = seedTask(t, ids, { updatedAt: 20 });
    const early1 = seedTask(t, ids, { updatedAt: 10 });
    const early2 = seedTask(t, ids, { updatedAt: 10 });
    const byUpdate = () => t.db.query('tasks').withIndex('by_projectId_updatedAt', (q) => q.eq('projectId', ids.projectId));
    assert.deepEqual((await byUpdate().take(10)).map((row) => row._id), [early1, early2, late]);
    assert.deepEqual((await byUpdate().order('desc').take(10)).map((row) => row._id), [late, early2, early1]);
    const after = await t.db.query('tasks').withIndex('by_projectId_updatedAt', (q) => q.eq('projectId', ids.projectId).gt('updatedAt', 10)).take(10);
    assert.deepEqual(after.map((row) => row._id), [late]);
  });

  it('applies a range on the field after the eq fields', async () => {
    const t = memoryCtx();
    const ids = seedMilestone(t);
    seedTask(t, ids);
    const rows = await t.db.query('tasks').withIndex('by_creation_time', (q) => q.gt('_creationTime', 3)).take(10);
    assert.equal(rows.length, 1);
    await assert.rejects(
      async () => t.db.query('tasks').withIndex('by_creation_time', (q) => q.gt('_creationTime', 1).gte('_creationTime', 2)).take(1),
      throwsMemory(/two lower bounds/),
    );
  });

  it('throws when unique matches more than one row', async () => {
    const t = memoryCtx();
    const ids = seedMilestone(t);
    seedTask(t, ids);
    seedTask(t, ids);
    await assert.rejects(
      t.db.query('tasks').withIndex('by_orgId_milestoneId', (q) => q.eq('orgId', ids.orgId).eq('milestoneId', ids.milestoneId)).unique(),
      throwsMemory(/matched 2 rows/),
    );
  });

  it('records unbounded and unindexed reads instead of refusing them', async () => {
    const t = memoryCtx();
    const ids = seedMilestone(t);
    t.reads.reset();
    await t.db.query('tasks').withIndex('by_orgId', (q) => q.eq('orgId', ids.orgId)).take(5);
    assert.deepEqual(t.reads.unbounded(), []);
    await t.db.query('tasks').collect();
    for await (const _row of t.db.query('projects') as AsyncIterable<unknown>) void _row;
    assert.deepEqual(
      t.reads.unbounded().map((read) => [read.table, read.index, read.terminal]),
      [
        ['tasks', null, 'collect'],
        ['projects', null, 'iterate'],
      ],
    );
    assert.equal(t.reads.unindexed().length, 2);
  });

  it('records the limit of a take or a page, and every id passed to get', async () => {
    const t = memoryCtx();
    const ids = seedMilestone(t);
    t.reads.reset();
    await t.db.query('tasks').withIndex('by_orgId', (q) => q.eq('orgId', ids.orgId)).take(7);
    await t.db.query('tasks').withIndex('by_orgId', (q) => q.eq('orgId', ids.orgId)).paginate({ numItems: 3, cursor: null });
    await t.db.query('tasks').withIndex('by_orgId', (q) => q.eq('orgId', ids.orgId)).first();
    assert.deepEqual(t.reads.all.map((read) => read.limit), [7, 3, undefined]);
    await t.db.get(ids.milestoneId as never);
    await t.db.get('clients:999' as never);
    assert.deepEqual(t.reads.gets, [ids.milestoneId, 'clients:999']);
    t.reads.reset();
    assert.deepEqual(t.reads.gets, []);
  });

  it('pages through an index', async () => {
    const t = memoryCtx();
    const ids = seedMilestone(t);
    for (let i = 0; i < 5; i += 1) seedTask(t, ids);
    const first = await t.db.query('tasks').withIndex('by_orgId', (q) => q.eq('orgId', ids.orgId)).paginate({ numItems: 3, cursor: null });
    assert.equal(first.page.length, 3);
    assert.equal(first.isDone, false);
    const second = await t.db.query('tasks').withIndex('by_orgId', (q) => q.eq('orgId', ids.orgId)).paginate({ numItems: 3, cursor: first.continueCursor });
    assert.equal(second.page.length, 2);
    assert.equal(second.isDone, true);
  });
});

describe('memoryCtx writes', () => {
  it('scopes ids to their table and refuses writes to a missing row', async () => {
    const t = memoryCtx();
    const { milestoneId } = seedMilestone(t);
    assert.equal(await t.db.get(milestoneId.replace('milestones', 'tasks')), null);
    assert.equal(t.db.normalizeId('tasks', milestoneId), null);
    assert.equal(t.db.normalizeId('milestones', milestoneId), milestoneId);
    await assert.rejects(t.db.patch('milestones:999', { name: 'x' }), throwsMemory(/patch: no row/));
    await assert.rejects(t.db.delete('milestones:999'), throwsMemory(/delete: no row/));
  });

  it('drops a field patched to undefined and checks the result against the schema', async () => {
    const t = memoryCtx();
    const { milestoneId } = seedMilestone(t, { branch: 'milestone/launch' });
    await t.db.patch(milestoneId, { branch: undefined });
    assert.equal('branch' in (t.row(milestoneId) ?? {}), false);
    await assert.rejects(t.db.patch(milestoneId, { status: 'Done' }), throwsMemory(/Schema: milestones\.status/));
  });

  it('hands out copies, so a handler cannot change a row without a write', async () => {
    const t = memoryCtx();
    const { milestoneId } = seedMilestone(t);
    const row = (await t.db.get(milestoneId)) as Record<string, unknown>;
    row.name = 'Changed';
    assert.equal(t.row(milestoneId)?.name, 'Launch');
  });
});

const insertThenThrow = internalMutation({
  args: { milestoneId: v.id('milestones') },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.milestoneId, { name: 'Written' });
    await ctx.scheduler.runAfter(0, internal.milestones.deleteReviewPreview, {
      milestoneId: args.milestoneId,
      deploymentId: 'dpl',
      sha: '',
      scheduledAttempt: 0,
    });
    throw new Error('refused');
  },
});

const schedules = internalMutation({
  args: { milestoneId: v.id('milestones') },
  handler: async (ctx, args) => {
    await ctx.scheduler.runAfter(0, internal.milestones.deleteReviewPreview, {
      milestoneId: args.milestoneId,
      deploymentId: 'dpl',
      sha: '',
      scheduledAttempt: 0,
    });
  },
});

const writesFromQuery = internalQuery({
  args: { milestoneId: v.id('milestones') },
  handler: async (ctx, args) => {
    await (ctx.db as unknown as { patch: (id: string, value: object) => Promise<void> }).patch(args.milestoneId, { name: 'x' });
  },
});

const asksAnAction = internalAction({
  args: {},
  handler: async (ctx) => ctx.runAction(internal.milestones.deleteReviewPreview, { milestoneId: 'milestones:1' as never, deploymentId: 'd', sha: '', scheduledAttempt: 0 }),
});

describe('memoryCtx call', () => {
  it('runs a real staff mutation with the identity from as', async () => {
    const t = memoryCtx();
    const ids = seedMilestone(t);
    seedTask(t, ids, { status: 'Done', isDone: true });
    const result = await t.call<{ status: string }>(advance, { milestoneId: ids.milestoneId, expectedStatus: 'Building' }, { as: 'staff' });
    assert.equal(result.status, 'Ready to Ship');
    assert.equal(t.row(ids.milestoneId)?.status, 'Ready to Ship');
    assert.equal(t.rows('milestoneNotes').filter((note) => note.open === true).length, 1);
  });

  it('refuses a staff mutation with no identity, and with a client identity', async () => {
    const t = memoryCtx();
    const { milestoneId } = seedMilestone(t);
    await assert.rejects(t.call(setStatus, { milestoneId, status: 'Planning' }), PortalAuthError);
    await assert.rejects(t.call(setStatus, { milestoneId, status: 'Planning' }, { as: 'client' }), PortalAuthError);
    assert.equal(t.row(milestoneId)?.status, 'Building');
  });

  it('rolls back every write and scheduled call when the handler throws', async () => {
    const t = memoryCtx();
    const { milestoneId } = seedMilestone(t);
    await assert.rejects(t.call(insertThenThrow, { milestoneId }), /refused/);
    assert.equal(t.row(milestoneId)?.name, 'Launch');
    assert.deepEqual(t.scheduled, []);
  });

  it('records scheduled calls by function name and runs nothing', async () => {
    const t = memoryCtx();
    const { milestoneId } = seedMilestone(t);
    await t.call(schedules, { milestoneId });
    assert.deepEqual(t.scheduled.map((call) => call.name), ['milestones:deleteReviewPreview']);
  });

  it('gives a query a db that cannot write', async () => {
    const t = memoryCtx();
    const { milestoneId } = seedMilestone(t);
    await assert.rejects(t.call(writesFromQuery, { milestoneId }), throwsMemory(/A query cannot write/));
  });

  it('answers a run call from an action through respond, and records it', async () => {
    const t = memoryCtx();
    const result = await t.call(asksAnAction, {}, { respond: (call) => ({ answered: call.name }) });
    assert.deepEqual(result, { answered: 'milestones:deleteReviewPreview' });
    assert.deepEqual(t.runs.map((run) => [run.kind, run.name]), [['action', 'milestones:deleteReviewPreview']]);
  });

  it('records a call into a component by its reference path', async () => {
    const t = memoryCtx();
    const result = await t.call(asksTheAuthComponent, {}, { respond: (call) => (call.args.model === 'user' ? { _id: 'user-1' } : null) });
    assert.deepEqual(result, { _id: 'user-1' });
    assert.equal(t.runs.length, 1);
    assert.equal(t.runs[0].kind, 'query');
    assert.match(t.runs[0].name, /betterAuth\/adapter\/findOne$/);
  });
});

const asksTheAuthComponent = internalAction({
  args: {},
  handler: async (ctx) => ctx.runQuery(components.betterAuth.adapter.findOne, { model: 'user', where: [] } as never),
});

const echoHttp = httpAction(async (ctx, request) => {
  const answer = await ctx.runMutation(internal.milestones.saveFromAi as never, { body: await request.text() } as never);
  return new Response(JSON.stringify(answer), { status: 200 });
});

describe('memoryCtx callHttp', () => {
  it('runs an http action with an action ctx and records its run calls', async () => {
    const t = memoryCtx();
    const response = await t.callHttp(echoHttp, new Request('https://example.test/hook', { method: 'POST', body: 'hi' }), {
      respond: (call) => ({ seen: call.args.body }),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { seen: 'hi' });
    assert.deepEqual(t.runs.map((run) => run.kind), ['mutation']);
  });

  it('refuses a function that is not an http action', async () => {
    const t = memoryCtx();
    await assert.rejects(t.callHttp(setStatus, new Request('https://example.test/')), throwsMemory(/needs an httpAction/));
  });
});
