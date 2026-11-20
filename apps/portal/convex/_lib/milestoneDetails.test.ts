import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { isClientVisibleActivityType } from '@warehaus/portal-sync';
import { roadmapViewForAudience } from './milestones';
import {
  clientReviewDecision,
  finishedMilestoneDecision,
  milestoneCanClose,
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
import { statusOptionLock, transitionMilestone } from './milestoneStatus';

describe('staff stages', () => {
  it('uses the one Peter check from the review protocol', () => {
    const details = readFileSync(new URL('./milestoneDetails.ts', import.meta.url), 'utf8');
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
    const done = { status: 'Done', isDone: true };
    const parked = { stage: 'Parked', status: 'To Do', isDone: false };
    assert.deepEqual(finishedMilestoneDecision([done, parked], 'Shipped'), { ok: true });
    assert.equal(finishedMilestoneDecision([done, { status: 'To Do', isDone: false }], 'Shipped').ok, false);
    const onlyParked = finishedMilestoneDecision([parked], 'Complete');
    const empty = finishedMilestoneDecision([], 'Shipped');
    assert.equal(onlyParked.ok, false);
    assert.equal(empty.ok, false);
    if (!onlyParked.ok) assert.match(onlyParked.reason, /at least one task/);
    if (!empty.ok) assert.match(empty.reason, /at least one task/);
    assert.equal(milestoneCanClose([{ ...done, children: [parked] }]), true);
    assert.equal(milestoneCanClose([{ ...done, children: [{ status: 'To Do', isDone: false }] }]), false);
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

  it('refuses a client review', () => {
    assert.deepEqual(clientReviewDecision(), { ok: false, reason: 'Clients cannot review a milestone' });
    const source = readFileSync(new URL('../milestones.ts', import.meta.url), 'utf8');
    const start = source.indexOf('export const decideAsClient');
    const end = source.indexOf('export const previewMilestoneOne');
    const block = source.slice(start, end === -1 ? source.length : end);
    assert.match(block, /clientReviewDecision/);
    assert.doesNotMatch(block, /decideMilestone/);
  });

  it('has one Status and no second status picker', () => {
    const details = readFileSync(new URL('./milestoneDetails.ts', import.meta.url), 'utf8');
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
    const schema = readFileSync(new URL('../schema.ts', import.meta.url), 'utf8');
    const table = schema.slice(schema.indexOf('  milestones: defineTable({'), schema.indexOf('  milestoneReviews: defineTable({'));
    for (const retired of ['workStatus', 'detailStatus', 'stage:']) {
      assert.equal(table.includes(retired), false, retired);
    }
    assert.match(table, /status: v\.union\(/);
    assert.equal(table.includes('status: v.optional('), false);
    const server = readFileSync(new URL('../milestones.ts', import.meta.url), 'utf8');
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

  it('resolves names with point reads and lists owners with one capped index read', () => {
    const source = readFileSync(new URL('../milestones.ts', import.meta.url), 'utf8');
    const names = source.slice(source.indexOf('async function personName'), source.indexOf('async function insertMilestone'));
    assert.match(names, /ctx\.db\.get\(contactId\)/);
    assert.match(names, /\.take\(OWNER_TAKE\)/);
    assert.match(names, /by_orgId/);
    assert.doesNotMatch(names, /\.collect\(\)/);
    assert.match(source, /ownerNameFor/);
    assert.match(source, /creatorNameFor/);
    const schema = readFileSync(new URL('../schema.ts', import.meta.url), 'utf8');
    const table = schema.slice(schema.indexOf('milestones: defineTable'), schema.indexOf('contacts: defineTable'));
    assert.match(table, /ownerContactId: v\.optional\(v\.id\('contacts'\)\)/);
    assert.match(table, /dueDate: v\.optional\(v\.string\(\)\)/);
    assert.match(table, /createdByContactId: v\.optional\(v\.id\('contacts'\)\)/);
  });
});

describe('server enforcement', () => {
  it('keeps the detail mutations staff-only and off the Notion outbox', () => {
    const source = readFileSync(new URL('../milestones.ts', import.meta.url), 'utf8');
    const start = source.indexOf('export const setStatus');
    const end = source.indexOf('export const decide');
    const block = source.slice(start, end);
    assert.ok(start > 0 && end > start);
    assert.match(block, /transitionMilestone/);
    assert.doesNotMatch(block, /isPeterEmail/);
    assert.match(block, /projectMoveDecision/);
    assert.match(block, /taskIdsToMove/);
    assert.match(block, /by_parentTaskId/);
    assert.match(block, /by_orgId_milestoneId/);
    assert.doesNotMatch(block, /by_orgId_projectId/);
    for (const retired of ['export const setStage', 'export const setDetailStatus', 'export const setWorkStatus']) {
      assert.equal(source.includes(retired), false, retired);
    }
    const statusBlock = source.slice(start, source.indexOf('export const ownerChoices'));
    assert.match(statusBlock, /export const advance = adminMutation/);
    assert.match(statusBlock, /cause: 'advance'/);
    assert.match(statusBlock, /expected: args\.expectedStatus/);
    // Every status write goes through the one writer, which skips a no-op.
    assert.equal(statusBlock.includes('ctx.db.patch'), false);
    assert.match(statusBlock, /writeStatus\(ctx, milestone, moved, ctx\.identity\.name\)/);
    const writer = source.slice(source.indexOf('async function writeStatus'), source.indexOf('async function replaceResources'));
    assert.match(writer, /if \(!decision\.wrote\) return false;/);
    assert.equal(writer.match(/logMilestone\(/g)?.length, 1);
    assert.match(block, /wrote: false/);
    assert.match(block, /'milestone\.project'/);
    assert.doesNotMatch(block, /clientMutation/);
    assert.doesNotMatch(block, /notionOutbox/);
    assert.doesNotMatch(block, /notion\.pages/);
    const upsert = readFileSync(new URL('../sync/upsert.ts', import.meta.url), 'utf8');
    assert.match(upsert, /heldTaskProjectId/);
    assert.doesNotMatch(upsert.slice(upsert.indexOf('export const upsertTask'), upsert.indexOf('export const upsertContact')), /notionOutbox\.insert|db\.insert\('notionOutbox'/);
  });
});
