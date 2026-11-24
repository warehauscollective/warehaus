import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { isClientVisibleActivityType } from '@warehaus/portal-sync';
import { advance, create, decideAsClient, listForProject, moveProject, ownerChoices, setDueDate, setOwner, setStatus } from '../milestones';
import { upsertTask } from '../sync/upsert';
import { PortalAuthError } from './identity';
import { MemoryCtxError, memoryCtx } from './memoryCtx.testkit';
import { roadmapViewForAudience } from './milestones';
import {
  clientReviewDecision,
  clientSeesDetailsRow,
  detailActivitySummary,
  dueDateChangeDecision,
  formatDueDate,
  heldTaskProjectId,
  isCalendarDate,
  movedLaneCount,
  ownerChangeDecision,
  projectMoveDecision,
  publishChangeDecision,
  taskIdsToMove,
  textBlurSave,
} from './milestoneDetails';
import { isPeterEmail } from './milestoneReview';
import { STATUS_STALE, statusOptionLock, transitionMilestone } from './milestoneStatus';
import { seedContact, seedMilestone, seedMilestoneWorld, seedOrg, seedProject, seedTask } from './seedRows.testkit';

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const schemaError = (pattern: RegExp) => (error: unknown) => error instanceof MemoryCtxError && pattern.test(error.message);

describe('staff stages', () => {
  it('uses the one Peter check from the review protocol', () => {
    // Absence guard: who counts as Peter has one list, in milestoneReview.ts.
    const details = source('./milestoneDetails.ts');
    assert.equal(details.includes('PETER_EMAILS'), false);
    assert.equal(details.includes('function isPeterEmail'), false);
    assert.equal(isPeterEmail('Peter@warehaus.co'), true);
    assert.equal(isPeterEmail('alex@warehaus.co'), false);
  });

  it('lets any staff member set Awaiting Go and Ready to Ship', () => {
    assert.deepEqual(transitionMilestone({ from: 'Planning', cause: 'set', to: 'Awaiting Go' }), {
      ok: true,
      from: 'Planning',
      status: 'Awaiting Go',
      wrote: true,
    });
    assert.deepEqual(transitionMilestone({ from: 'Building', cause: 'set', to: 'Ready to Ship' }), {
      ok: true,
      from: 'Building',
      status: 'Ready to Ship',
      wrote: true,
    });
    assert.deepEqual(transitionMilestone({ from: 'Awaiting Go', cause: 'set', to: 'Building' }), {
      ok: true,
      from: 'Awaiting Go',
      status: 'Building',
      wrote: true,
    });
  });

  it('lets staff set Shipped only when every non-Parked task is Done', () => {
    assert.deepEqual(transitionMilestone({ from: 'Building', cause: 'set', to: 'Shipped' }), {
      ok: false,
      reason: 'Shipped needs every task that is not Parked to be Done.',
      code: 'shipped',
    });
    assert.deepEqual(transitionMilestone({ from: 'Building', cause: 'set', to: 'Shipped', tasksReady: true }), {
      ok: true,
      from: 'Building',
      status: 'Shipped',
      wrote: true,
    });
    assert.equal(statusOptionLock('Shipped'), 'shipped');
    assert.equal(statusOptionLock('Shipped', true), null);
    assert.equal(statusOptionLock('Awaiting Go'), null);
  });

  it('skips a no-op status write, including a repeat of Shipped', () => {
    assert.deepEqual(transitionMilestone({ from: 'Building', cause: 'set', to: 'Building' }), {
      ok: true,
      from: 'Building',
      status: 'Building',
      wrote: false,
    });
    const shipped = transitionMilestone({ from: 'Shipped', cause: 'set', to: 'Shipped' });
    assert.equal(shipped.ok, true);
    if (shipped.ok) assert.equal(shipped.wrote, false);
  });
});

describe('status, publish, and project decisions', () => {
  it('lets a non-Peter move to Ready to Ship without approving anything', () => {
    const ready = transitionMilestone({ from: 'Building', cause: 'advance', expected: 'Building' });
    assert.deepEqual(ready, { ok: true, from: 'Building', status: 'Ready to Ship', wrote: true });
    assert.equal('approval' in ready, false);
    assert.equal(transitionMilestone({ from: 'Building', cause: 'set', to: 'Awaiting Go' }).ok, true);
    assert.equal(transitionMilestone({ from: 'Building', cause: 'set', to: 'Shipped' }).ok, false);
  });

  it('refuses a client review', async () => {
    assert.deepEqual(clientReviewDecision(), { ok: false, reason: 'Clients cannot review a milestone' });
    const t = memoryCtx();
    const { milestoneId } = seedMilestoneWorld(t, { status: 'Ready to Ship' });
    await assert.rejects(
      t.call(decideAsClient, { milestoneId, decision: 'approved', note: 'Looks good' }, { as: 'client' }),
      /Clients cannot review a milestone/,
    );
    assert.equal(t.row(milestoneId)?.approval, 'unreviewed');
    assert.equal(t.row(milestoneId)?.status, 'Ready to Ship');
    assert.deepEqual(t.rows('milestoneReviews'), []);
    assert.deepEqual(t.rows('activity'), []);
  });

  it('has one Status and no second status picker', () => {
    // Absence guard: the retired status helpers stay deleted.
    const details = source('./milestoneDetails.ts');
    for (const retired of ['detailStatus', 'workStatus', 'effectiveStage', 'MILESTONE_STAGES']) {
      assert.equal(details.includes(retired), false, retired);
    }
    assert.equal(transitionMilestone({ from: 'Planning', cause: 'set', to: 'later' }).ok, false);
    assert.equal(transitionMilestone({ from: 'Planning', cause: 'set', to: 'in_review' }).ok, false);
  });

  it('confirms publish only when the value changes', () => {
    assert.deepEqual(publishChangeDecision(false, true), { wrote: true });
    assert.deepEqual(publishChangeDecision(true, false), { wrote: true });
    assert.deepEqual(publishChangeDecision(true, true), { wrote: false });
  });

  it('lets any staff project id through and skips the current project', () => {
    assert.deepEqual(projectMoveDecision({ fromProjectId: 'p-a', toProjectId: 'p-b', sameOrg: true }), {
      ok: true,
      wrote: true,
    });
    assert.deepEqual(projectMoveDecision({ fromProjectId: 'p-a', toProjectId: 'p-a', sameOrg: true }), {
      ok: true,
      wrote: false,
    });
    assert.equal(projectMoveDecision({ fromProjectId: 'p-a', toProjectId: 'p-b', sameOrg: false }).ok, false);
  });
});

describe('text blur and activity', () => {
  it('saves a changed blur, skips an unchanged blur, and discards on Escape', () => {
    assert.deepEqual(textBlurSave({ previous: 'Brief', next: ' Brief updated ', escape: false }), {
      action: 'save',
      value: 'Brief updated',
    });
    assert.deepEqual(textBlurSave({ previous: 'Brief', next: ' Brief ', escape: false }), { action: 'skip' });
    assert.deepEqual(textBlurSave({ previous: 'Brief', next: 'Changed', escape: true }), { action: 'discard' });
  });

  it('logs a project change with who, old, new, and Eastern time', () => {
    const summary = detailActivitySummary({
      actor: 'Alex Staff',
      from: 'Northwind site',
      to: 'Northwind brand',
      at: Date.UTC(2026, 10, 17, 18, 19),
    });
    assert.match(summary, /Alex Staff · Northwind site → Northwind brand · /);
    assert.match(summary, /ET$/);
    const withTasks = detailActivitySummary({
      actor: 'Alex Staff',
      from: 'Northwind site',
      to: 'Northwind brand',
      at: Date.UTC(2026, 10, 17, 18, 19),
      tasks: 2,
    });
    assert.match(withTasks, /Northwind brand · 2 tasks · /);
    assert.equal(summary.includes('@'), false);
    assert.equal(isClientVisibleActivityType('milestone.project'), false);
    assert.equal(isClientVisibleActivityType('milestone.status'), false);
    assert.equal(isClientVisibleActivityType('milestone.publish'), false);
  });
});

describe('task move and client rows', () => {
  it('moves the milestone tasks and their subtasks, and skips tasks already there', () => {
    const ids = taskIdsToMove({
      milestoneId: 'm-1',
      toProjectId: 'p-next',
      tasks: [
        { id: 't-parent', projectId: 'p-now', milestoneId: 'm-1', parentTaskId: null },
        { id: 't-child', projectId: 'p-now', milestoneId: null, parentTaskId: 't-parent' },
        { id: 't-there', projectId: 'p-next', milestoneId: 'm-1', parentTaskId: null },
        { id: 't-other', projectId: 'p-now', milestoneId: null, parentTaskId: null },
      ],
    });
    assert.deepEqual(ids.sort(), ['t-child', 't-parent']);
  });

  it('holds a moved task project without writing it back, then clears the hold once Notion matches', () => {
    assert.deepEqual(heldTaskProjectId({ held: 'p-next', incoming: 'p-now' }), {
      projectId: 'p-next',
      clearHold: false,
    });
    assert.deepEqual(heldTaskProjectId({ held: 'p-next', incoming: 'p-next' }), {
      projectId: 'p-next',
      clearHold: true,
    });
    assert.deepEqual(heldTaskProjectId({ held: null, incoming: 'p-now' }), {
      projectId: 'p-now',
      clearHold: false,
    });
  });

  it('shows Creator and Visibility to clients and keeps approval private', () => {
    assert.equal(clientSeesDetailsRow('creator', false), true);
    assert.equal(clientSeesDetailsRow('visibility', false), true);
    assert.equal(clientSeesDetailsRow('creator', true), true);
    assert.equal(clientSeesDetailsRow('visibility', true), true);
    assert.equal(clientSeesDetailsRow('approval', false), false);
    assert.equal(clientSeesDetailsRow('review', false), false);
    assert.equal(clientSeesDetailsRow('approval', true), true);
    assert.equal(clientSeesDetailsRow('project', false), true);
    assert.equal(clientSeesDetailsRow('status', false), true);
  });

  it('keeps the retired status fields out of the schema and off the server', () => {
    const t = memoryCtx();
    const orgId = seedOrg(t);
    const projectId = seedProject(t, orgId);
    for (const retired of ['workStatus', 'detailStatus', 'stage']) {
      assert.throws(() => seedMilestone(t, orgId, projectId, { [retired]: 'Building' }), schemaError(new RegExp(`milestones\\.${retired}: not in the validator`)), retired);
    }
    assert.throws(() => seedMilestone(t, orgId, projectId, { status: undefined }), schemaError(/milestones\.status: required/));
    assert.throws(() => seedMilestone(t, orgId, projectId, { status: 'in_review' }), schemaError(/milestones\.status: matches no member/));
    // Absence guard: the retired status backfills stay deleted.
    const server = source('../milestones.ts');
    for (const retired of ['backfillStatus', 'clearRetiredStatusFields', 'milestoneStatusOf']) {
      assert.equal(server.includes(retired), false, retired);
    }
    const clientView = roadmapViewForAudience({
      name: 'Launch',
      publishToWarehaus: true,
      approval: 'approved',
      note: 'Ship it',
      approverName: 'Peter',
      decidedAt: 1,
      creator: 'Peter',
      creatorName: 'Peter',
      status: 'Ready to Ship',
      localPreviewUrl: 'http://localhost:3200',
      figmaUrl: 'https://www.figma.com/design/abc',
    }, 'client');
    for (const key of ['approval', 'note', 'approverName', 'decidedAt', 'creator', 'localPreviewUrl', 'figmaUrl']) {
      assert.equal(key in clientView, false, key);
    }
    assert.equal(clientView.creatorName, 'Peter');
    assert.equal(clientView.publishToWarehaus, true);
    assert.equal(clientView.status, 'Ready to Ship');
    const staffView = roadmapViewForAudience({ publishToWarehaus: true, approval: 'approved' }, 'staff');
    assert.equal(staffView.publishToWarehaus, true);
    assert.equal(movedLaneCount([
      { id: 'a', projectId: 'p1', milestoneId: 'm', parentTaskId: null },
      { id: 'b', projectId: 'p1', milestoneId: 'm', parentTaskId: null },
      { id: 'c', projectId: 'p1', milestoneId: 'm', parentTaskId: 'a' },
    ], ['a', 'b', 'c']), 2);
  });
});

describe('owner and due date', () => {
  it('writes a new person or day and skips the same value', () => {
    assert.equal(isCalendarDate('2026-11-20'), true);
    assert.equal(isCalendarDate('2026-02-31'), false);
    assert.equal(formatDueDate('2026-11-20'), 'Nov 20, 2026');
    assert.equal(formatDueDate(null), null);
    assert.deepEqual(ownerChangeDecision({ from: null, to: null, allowed: true }), { ok: true, wrote: false });
    assert.deepEqual(ownerChangeDecision({ from: 'a', to: 'a', allowed: true }), { ok: true, wrote: false });
    assert.deepEqual(ownerChangeDecision({ from: null, to: 'a', allowed: true }), { ok: true, wrote: true, ownerContactId: 'a' });
    assert.equal(ownerChangeDecision({ from: null, to: 'a', allowed: false }).ok, false);
    assert.deepEqual(dueDateChangeDecision({ from: null, to: null }), { ok: true, wrote: false });
    assert.deepEqual(dueDateChangeDecision({ from: '2026-11-20', to: '2026-11-20' }), { ok: true, wrote: false });
    assert.deepEqual(dueDateChangeDecision({ from: null, to: '2026-11-20' }), { ok: true, wrote: true, dueDate: '2026-11-20' });
    assert.equal(dueDateChangeDecision({ from: null, to: 'tomorrow' }).ok, false);
  });

  it('names the owner and the creator from contacts on the same client only', async () => {
    const t = memoryCtx();
    const { orgId, projectId, milestoneId } = seedMilestoneWorld(t);
    const owner = seedContact(t, orgId, { name: ' Ana Owner ', role: 'Warehaus Staff' });
    const creator = seedContact(t, orgId, { name: 'Cal Creator', role: 'Warehaus Staff' });
    const stranger = seedContact(t, seedOrg(t), { name: 'Elsewhere', role: 'Warehaus Staff' });
    await t.db.patch(milestoneId, { ownerContactId: owner, createdByContactId: creator });
    const other = seedMilestone(t, orgId, projectId, { ownerContactId: stranger, createdByContactId: stranger });
    const views = await t.call<Array<{ id: string; ownerName: string | null; creatorName: string | null }>>(listForProject, { projectId }, { as: 'staff' });
    const byId = new Map(views.map((view) => [view.id, view]));
    assert.equal(byId.get(milestoneId)?.ownerName, 'Ana Owner');
    assert.equal(byId.get(milestoneId)?.creatorName, 'Cal Creator');
    assert.equal(byId.get(other)?.ownerName, null);
    assert.equal(byId.get(other)?.creatorName, null);
  });

  it('lists owners with one capped, indexed read of the client contacts', async () => {
    const t = memoryCtx();
    const { orgId, projectId } = seedMilestoneWorld(t);
    seedContact(t, orgId, { name: 'Zed Staff', role: 'Warehaus Staff' });
    seedContact(t, orgId, { name: 'Amy Staff', role: 'Warehaus Staff' });
    seedContact(t, orgId, { name: 'Cleo Client', role: 'Client Admin' });
    seedContact(t, orgId, { name: 'Dora Disabled', role: 'Warehaus Staff', portalAccess: 'Disabled' });
    seedContact(t, orgId, { name: 'Hal Hidden', role: 'Warehaus Staff', syncHiddenAt: 1 });
    seedContact(t, seedOrg(t), { name: 'Other Org', role: 'Warehaus Staff' });
    t.actor('staff');
    t.reads.reset();
    const choices = await t.call<Array<{ name: string }>>(ownerChoices, { projectId }, { as: 'staff' });
    assert.deepEqual(choices.map((choice) => choice.name), ['Amy Staff', 'Zed Staff']);
    assert.deepEqual(t.reads.unbounded(), []);
    assert.deepEqual(t.reads.unindexed(), []);
    assert.deepEqual(
      t.reads.all.filter((read) => read.table === 'contacts' && read.eq[0] === 'orgId').map((read) => [read.index, read.terminal]),
      [['by_orgId', 'take']],
    );

    for (let i = 0; i < 45; i += 1) seedContact(t, orgId, { name: `Staff ${String(i).padStart(2, '0')}`, role: 'Warehaus Staff' });
    const capped = await t.call<unknown[]>(ownerChoices, { projectId }, { as: 'staff' });
    assert.ok(capped.length <= 40, `read ${capped.length} owners`);
  });

  it('stores the owner, the due date and the creator on the milestone', async () => {
    const t = memoryCtx();
    const { orgId, projectId, milestoneId } = seedMilestoneWorld(t);
    const owner = seedContact(t, orgId, { name: 'Ana Owner', role: 'Warehaus Staff' });
    const client = seedContact(t, orgId, { name: 'Cleo Client', role: 'Client Admin' });

    assert.deepEqual(await t.call(setOwner, { milestoneId, ownerContactId: owner }, { as: 'staff' }), { ok: true, wrote: true });
    assert.equal(t.row(milestoneId)?.ownerContactId, owner);
    assert.deepEqual(await t.call(setOwner, { milestoneId, ownerContactId: owner }, { as: 'staff' }), { ok: true, wrote: false });
    await assert.rejects(t.call(setOwner, { milestoneId, ownerContactId: client }, { as: 'staff' }), PortalAuthError);
    assert.equal(t.row(milestoneId)?.ownerContactId, owner);
    await t.call(setOwner, { milestoneId, ownerContactId: null }, { as: 'staff' });
    assert.equal('ownerContactId' in (t.row(milestoneId) ?? {}), false);

    assert.deepEqual(await t.call(setDueDate, { milestoneId, dueDate: '2026-12-01' }, { as: 'staff' }), { ok: true, wrote: true });
    assert.equal(t.row(milestoneId)?.dueDate, '2026-12-01');
    assert.deepEqual(await t.call(setDueDate, { milestoneId, dueDate: '2026-12-01' }, { as: 'staff' }), { ok: true, wrote: false });
    await assert.rejects(t.call(setDueDate, { milestoneId, dueDate: 'tomorrow' }, { as: 'staff' }), PortalAuthError);
    assert.equal(t.row(milestoneId)?.dueDate, '2026-12-01');

    const staffAuth = t.actor('staff');
    const staffContact = t.rows('contacts').find((row) => row.authUserId === staffAuth)?._id;
    const created = await t.call<{ id: string }>(
      create,
      { projectId, name: 'Launch', objective: 'Ship it', goals: [], ownerContactId: owner, dueDate: '2026-12-24' },
      { as: 'staff' },
    );
    const row = t.row(created.id);
    assert.equal(row?.createdByContactId, staffContact);
    assert.equal(row?.ownerContactId, owner);
    assert.equal(row?.dueDate, '2026-12-24');
  });
});

describe('server enforcement', () => {
  it('keeps the detail mutations staff-only and off the Notion outbox', () => {
    // Absence guards. Each one is a safety rule, not a call that should be present.
    const server = source('../milestones.ts');
    const start = server.indexOf('export const setStatus');
    const end = server.indexOf('export const decide');
    assert.ok(start > 0 && end > start);
    const block = server.slice(start, end);
    // Staff mutations have no Peter gate.
    assert.doesNotMatch(block, /isPeterEmail/);
    // A milestone's tasks are never read by project, which would pull in other milestones' tasks.
    assert.doesNotMatch(block, /by_orgId_projectId/);
    // Detail mutations are staff only and never write Notion.
    assert.doesNotMatch(block, /clientMutation/);
    assert.doesNotMatch(block, /notionOutbox/);
    assert.doesNotMatch(block, /notion\.pages/);
    // The retired status mutations stay deleted.
    for (const retired of ['export const setStage', 'export const setDetailStatus', 'export const setWorkStatus']) {
      assert.equal(server.includes(retired), false, retired);
    }
    // A Notion pull of a task never queues a write back.
    const upsert = source('../sync/upsert.ts');
    assert.doesNotMatch(upsert.slice(upsert.indexOf('export const upsertTask'), upsert.indexOf('export const upsertContact')), /notionOutbox\.insert|db\.insert\('notionOutbox'/);
  });

  it('setStatus writes the status and one activity row through the one writer, and a repeat writes nothing', async () => {
    const t = memoryCtx();
    const { milestoneId } = seedMilestoneWorld(t, { status: 'Planning' });
    const moved = await t.call(setStatus, { milestoneId, status: 'Awaiting Go' }, { as: 'staff' });
    assert.deepEqual(moved, { ok: true, wrote: true, status: 'Awaiting Go', previous: 'Planning' });
    assert.equal(t.row(milestoneId)?.status, 'Awaiting Go');
    const activity = t.rows('activity');
    assert.equal(activity.length, 1);
    assert.equal(activity[0]?.type, 'milestone.status');
    assert.equal(activity[0]?.milestoneId, milestoneId);
    assert.match(String(activity[0]?.summary), /^Maya Chen · Planning → Awaiting Go · .* ET$/);

    const before = t.row(milestoneId);
    const again = await t.call(setStatus, { milestoneId, status: 'Awaiting Go' }, { as: 'staff' });
    assert.deepEqual(again, { ok: true, wrote: false, status: 'Awaiting Go', previous: 'Awaiting Go' });
    assert.deepEqual(t.row(milestoneId), before);
    assert.equal(t.rows('activity').length, 1);
    assert.deepEqual(t.rows('notionOutbox'), []);
  });

  it('advance is staff only, moves one step, never to Shipped, and refuses a stale status', async () => {
    const t = memoryCtx();
    const { milestoneId } = seedMilestoneWorld(t, { status: 'Awaiting Go' });
    await assert.rejects(t.call(advance, { milestoneId, expectedStatus: 'Awaiting Go' }), PortalAuthError);
    await assert.rejects(t.call(advance, { milestoneId, expectedStatus: 'Awaiting Go' }, { as: 'client' }), PortalAuthError);
    assert.equal(t.row(milestoneId)?.status, 'Awaiting Go');

    const moved = await t.call(advance, { milestoneId, expectedStatus: 'Awaiting Go' }, { as: 'staff' });
    assert.deepEqual(moved, { ok: true, wrote: true, status: 'Building', previous: 'Awaiting Go' });
    assert.equal(t.rows('activity').length, 1);

    // The same click sent twice writes once.
    const twice = await t.call(advance, { milestoneId, expectedStatus: 'Awaiting Go' }, { as: 'staff' });
    assert.deepEqual(twice, { ok: true, wrote: false, status: 'Building', previous: 'Building' });
    assert.equal(t.rows('activity').length, 1);
    // A status the caller saw long ago is refused and writes nothing.
    await assert.rejects(t.call(advance, { milestoneId, expectedStatus: 'Idea' }, { as: 'staff' }), (error: unknown) => error instanceof PortalAuthError && error.message === STATUS_STALE);
    assert.equal(t.row(milestoneId)?.status, 'Building');
    assert.equal(t.rows('activity').length, 1);

    const ready = seedMilestoneWorld(t, { status: 'Ready to Ship' });
    seedTask(t, ready.orgId, ready.projectId, { milestoneId: ready.milestoneId, status: 'Done', isDone: true });
    await assert.rejects(t.call(advance, { milestoneId: ready.milestoneId, expectedStatus: 'Ready to Ship' }, { as: 'staff' }), PortalAuthError);
    assert.equal(t.row(ready.milestoneId)?.status, 'Ready to Ship');
    assert.equal(t.rows('activity').length, 1);
  });

  it('moveProject moves the milestone, its tasks and their subtasks, and logs one project row', async () => {
    const t = memoryCtx();
    const orgId = seedOrg(t);
    const from = seedProject(t, orgId, { name: 'Northwind site' });
    const to = seedProject(t, orgId, { name: 'Northwind brand' });
    const milestoneId = seedMilestone(t, orgId, from);
    const parent = seedTask(t, orgId, from, { milestoneId });
    const child = seedTask(t, orgId, from, { parentTaskId: parent });
    const there = seedTask(t, orgId, to, { milestoneId });
    const unrelated = seedTask(t, orgId, from);
    const thereBefore = t.row(there);
    const unrelatedBefore = t.row(unrelated);
    t.actor('staff');
    t.reads.reset();

    const result = await t.call(moveProject, { milestoneId, projectId: to }, { as: 'staff' });
    assert.deepEqual(result, { ok: true, wrote: true, movedTasks: 1 });
    assert.equal(t.row(milestoneId)?.projectId, to);
    for (const id of [parent, child]) {
      assert.equal(t.row(id)?.projectId, to, id);
      assert.equal(t.row(id)?.portalProjectId, to, id);
    }
    assert.deepEqual(t.row(there), thereBefore);
    assert.deepEqual(t.row(unrelated), unrelatedBefore);
    const activity = t.rows('activity');
    assert.equal(activity.length, 1);
    assert.equal(activity[0]?.type, 'milestone.project');
    assert.equal(activity[0]?.projectId, to);
    assert.match(String(activity[0]?.summary), /^Maya Chen · Northwind site → Northwind brand · 1 task · .* ET$/);
    assert.deepEqual(t.reads.unindexed(), []);
    assert.deepEqual(t.reads.all.filter((read) => read.index === 'by_orgId_projectId'), []);
    assert.deepEqual(t.rows('notionOutbox'), []);
  });

  it('moveProject writes nothing for the current project and refuses a project on another client', async () => {
    const t = memoryCtx();
    const { orgId, projectId, milestoneId } = seedMilestoneWorld(t);
    const task = seedTask(t, orgId, projectId, { milestoneId });
    const before = { milestone: t.row(milestoneId), task: t.row(task) };

    assert.deepEqual(await t.call(moveProject, { milestoneId, projectId }, { as: 'staff' }), { ok: true, wrote: false, movedTasks: 0 });
    const elsewhere = seedProject(t, seedOrg(t));
    await assert.rejects(t.call(moveProject, { milestoneId, projectId: elsewhere }, { as: 'staff' }), PortalAuthError);
    assert.deepEqual({ milestone: t.row(milestoneId), task: t.row(task) }, before);
    assert.deepEqual(t.rows('activity'), []);
  });

  it('a Notion pull keeps a task the portal moved on its new project, then clears the hold once Notion matches', async () => {
    const t = memoryCtx();
    const orgId = seedOrg(t);
    const oldProject = seedProject(t, orgId);
    const newProject = seedProject(t, orgId);
    const taskId = seedTask(t, orgId, newProject, { notionPageId: 'notion-held', portalProjectId: newProject });
    const pull = (projectId: string) => ({
      notionPageId: 'notion-held',
      orgId,
      projectId,
      name: 'Held task',
      status: 'To Do',
      isDone: false,
      publishToWarehaus: false,
    });

    await t.call(upsertTask, pull(oldProject));
    assert.equal(t.row(taskId)?.projectId, newProject);
    assert.equal(t.row(taskId)?.portalProjectId, newProject);

    await t.call(upsertTask, pull(newProject));
    assert.equal(t.row(taskId)?.projectId, newProject);
    assert.equal('portalProjectId' in (t.row(taskId) ?? {}), false);
    assert.deepEqual(t.rows('notionOutbox'), []);
  });
});
