/**
 * The attention feed, through its real handler on the in-memory ctx.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { decodePageMessage } from '@warehaus/native-bridge';
import { portalLinkHref } from '../../src/lib/nav/portalLink';
import { feed } from '../attention';
import { ATTENTION_LIMIT, milestoneLink, taskLink, type AttentionFeed } from './attentionFeed';
import { DEFAULT_NOTIFICATION_PREFS } from './notificationPrefs';
import { memoryCtx, type Actor, type MemoryCtx } from './memoryCtx.testkit';
import { seedMilestone, seedMilestoneWorld, seedOrg, seedProject } from './seedRows.testkit';

const read = (t: MemoryCtx, as: Actor) => t.call<AttentionFeed>(feed, {}, { as });

/** Seeds the actor's contact (the first call does) and returns its id. */
async function contactOf(t: MemoryCtx, as: 'staff' | 'peter' | 'client'): Promise<string> {
  await read(t, as);
  const contact = await t.db
    .query('contacts')
    .withIndex('by_authUserId', (q) => q.eq('authUserId', `auth-${as}`))
    .unique();
  assert.ok(contact);
  return contact._id;
}

async function world(t: MemoryCtx) {
  const maya = await contactOf(t, 'staff');
  const peter = await contactOf(t, 'peter');
  const ready = seedMilestoneWorld(t, { name: 'Mac app: Portal window', status: 'Ready to Ship' });
  const building = seedMilestoneWorld(t, { name: 'Runner on production', status: 'Building' });
  const ask = (
    on: { orgId: string; milestoneId: string },
    createdAt: number,
    fields: Record<string, unknown> = {},
  ) =>
    t.seed('milestoneNotes', {
      orgId: on.orgId,
      milestoneId: on.milestoneId,
      body: 'waiting',
      addedBy: 'runner:studio-mini',
      createdAt,
      open: true,
      reason: 'approval',
      waitingOn: peter,
      ...fields,
    });
  const savePrefs = (contactId: string, patch: Record<string, boolean>) =>
    t.seed('notificationPrefs', { contactId, ...DEFAULT_NOTIFICATION_PREFS, ...patch, updatedAt: 1 });
  return { maya, peter, ready, building, ask, savePrefs };
}

describe('attention feed', () => {
  it('is empty when nothing waits', async () => {
    const t = memoryCtx();
    await world(t);
    assert.deepEqual(await read(t, 'peter'), { count: 0, alerts: [] });
  });

  it('refuses a signed-out caller', async () => {
    const t = memoryCtx();
    await assert.rejects(t.call(feed, {}));
  });

  it('shows an approval Ask to the person it waits on as Needs you, and to other staff as Ready to Ship', async () => {
    const t = memoryCtx();
    const { ready, ask } = await world(t);
    const id = ask(ready, 100);
    const url = `warehaus://milestone/${ready.milestoneId}?project=${ready.projectId}`;

    assert.deepEqual(await read(t, 'peter'), {
      count: 1,
      alerts: [{ id, kind: 'ask', title: 'Mac app: Portal window', url, createdAt: 100 }],
    });
    assert.deepEqual(await read(t, 'staff'), {
      count: 1,
      alerts: [{ id, kind: 'readyToShip', title: 'Mac app: Portal window', url, createdAt: 100 }],
    });
  });

  it('links a blocked Ask to its task and shows it only to the person it waits on', async () => {
    const t = memoryCtx();
    const { building, ask, maya } = await world(t);
    const taskId = building.task();
    const id = ask(building, 5, { reason: 'blocked', taskId, waitingOn: maya });

    const mine = await read(t, 'staff');
    assert.deepEqual(mine.alerts, [
      { id, kind: 'ask', title: 'Runner on production', url: `warehaus://task/${taskId}`, createdAt: 5 },
    ]);
    assert.deepEqual(await read(t, 'peter'), { count: 0, alerts: [] });
  });

  it('leaves out answered Asks and plain notes', async () => {
    const t = memoryCtx();
    const { ready, ask } = await world(t);
    ask(ready, 1, { open: undefined });
    t.seed('milestoneNotes', { orgId: ready.orgId, milestoneId: ready.milestoneId, body: 'a note', addedBy: 'Maya Chen', createdAt: 2 });
    assert.equal((await read(t, 'peter')).count, 0);
    assert.equal((await read(t, 'staff')).count, 0);
  });

  it("leaves out the viewer's own actions", async () => {
    const t = memoryCtx();
    const { ready, building, ask, maya } = await world(t);
    // Maya moved it to Ready to Ship: Peter is asked, Maya is not told about her own move.
    const approval = ask(ready, 1, { addedBy: 'Maya Chen' });
    // Peter raised an Ask on himself.
    ask(building, 2, { reason: 'blocked', addedBy: 'Peter' });
    // Maya raised an Ask on herself.
    ask(building, 3, { reason: 'blocked', addedBy: 'Maya Chen', waitingOn: maya });

    assert.deepEqual((await read(t, 'peter')).alerts.map((a) => a.id), [approval]);
    assert.deepEqual(await read(t, 'staff'), { count: 0, alerts: [] });
  });

  it('follows notification preferences', async () => {
    const t = memoryCtx();
    const { ready, ask, maya, peter, savePrefs } = await world(t);
    ask(ready, 1);
    savePrefs(peter, { awaitingGo: false });
    savePrefs(maya, { syncProblems: false, draftRecaps: false });

    assert.deepEqual(await read(t, 'peter'), { count: 0, alerts: [] });
    assert.equal((await read(t, 'staff')).count, 1);
  });

  it('reads no Ask when the preference is off', async () => {
    const t = memoryCtx();
    const { ready, ask, peter, savePrefs } = await world(t);
    ask(ready, 1);
    savePrefs(peter, { awaitingGo: false });
    t.reads.reset();
    await read(t, 'peter');
    assert.equal(t.reads.all.filter((r) => r.table === 'milestoneNotes').length, 0);
  });

  it('gives a client an empty feed and reads no Ask', async () => {
    const t = memoryCtx();
    const { ready, ask } = await world(t);
    ask(ready, 1);
    await contactOf(t, 'client');
    t.reads.reset();
    assert.deepEqual(await read(t, 'client'), { count: 0, alerts: [] });
    assert.equal(t.reads.all.filter((r) => r.table === 'milestoneNotes').length, 0);
  });

  it('shows Ready to Ship only while the milestone is Ready to Ship', async () => {
    const t = memoryCtx();
    const { building, ask } = await world(t);
    // An approval Ask left open on a milestone that moved on.
    ask(building, 1);
    assert.equal((await read(t, 'staff')).count, 0);
    // It still waits on Peter, so he still sees it.
    assert.equal((await read(t, 'peter')).count, 1);
  });

  it('leaves out archived milestones and concealed clients', async () => {
    const t = memoryCtx();
    const { ask } = await world(t);
    const archived = seedMilestoneWorld(t, { status: 'Ready to Ship', archivedAt: 9 });
    ask(archived, 1);
    const hiddenOrg = seedOrg(t, { syncHiddenAt: 5 });
    const hiddenProject = seedProject(t, hiddenOrg);
    const hidden = seedMilestone(t, hiddenOrg, hiddenProject, { status: 'Ready to Ship' });
    ask({ orgId: hiddenOrg, milestoneId: hidden }, 2);

    assert.equal((await read(t, 'peter')).count, 0);
    assert.equal((await read(t, 'staff')).count, 0);
  });

  it('tells other staff once where Peter has no contact and the Ask waits on no one', async () => {
    const t = memoryCtx();
    const { ready, ask } = await world(t);
    const id = ask(ready, 1, { waitingOn: undefined });
    assert.deepEqual((await read(t, 'staff')).alerts.map((a) => [a.id, a.kind]), [[id, 'readyToShip']]);
  });

  it('is newest first, capped, indexed and bounded', async () => {
    const t = memoryCtx();
    const { ready, building, ask, maya } = await world(t);
    for (let i = 1; i <= ATTENTION_LIMIT + 5; i += 1) ask(building, i, { reason: 'blocked', waitingOn: maya });
    const newest = ask(ready, 1000);
    t.reads.reset();

    const result = await read(t, 'staff');
    assert.equal(result.count, ATTENTION_LIMIT);
    assert.equal(result.alerts.length, ATTENTION_LIMIT);
    assert.equal(result.alerts[0].id, newest);
    const stamps = result.alerts.map((a) => a.createdAt);
    assert.deepEqual(stamps, [...stamps].sort((a, b) => b - a));
    assert.deepEqual(t.reads.unbounded(), []);
    assert.deepEqual(t.reads.unindexed(), []);
    // One milestone read per milestone, not per Ask.
    assert.equal(new Set(t.reads.gets).size, t.reads.gets.length);
  });

  it('writes links the Portal resolves', () => {
    // Real Convex ids. The in-memory ctx ids carry a colon, which no real id does.
    const milestoneId = 'nn77zctgc8wm54zmdkfxr5zntd8jwsh4';
    const projectId = 'k975vmerwebjswcbmh27gbp6tx8h175e';
    const taskId = 'm17as35g3paw4dj8tyxra46h998jx2d6';
    assert.equal(
      portalLinkHref(milestoneLink({ _id: milestoneId, projectId } as Parameters<typeof milestoneLink>[0])),
      `/projects/${projectId}?milestone=${milestoneId}`,
    );
    assert.equal(portalLinkHref(taskLink(taskId as Parameters<typeof taskLink>[0])), `/tasks/${taskId}`);
  });

  it('fits the native bridge attention message', async () => {
    const t = memoryCtx();
    const { ready, building, ask, maya } = await world(t);
    ask(ready, 2);
    ask(building, 1, { reason: 'blocked', waitingOn: maya, taskId: building.task() });
    const result = await read(t, 'staff');
    assert.equal(result.count, 2);
    const decoded = decodePageMessage({ type: 'attention', ...result });
    assert.equal(decoded.ok, true);
  });
});
