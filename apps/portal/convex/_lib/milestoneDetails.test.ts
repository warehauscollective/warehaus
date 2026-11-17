import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { isClientVisibleActivityType } from '@warehaus/portal-sync';
import { roadmapViewForAudience } from './milestones';
import {
  clientReviewDecision,
  clientSeesDetailsRow,
  detailActivitySummary,
  detailStatusDecision,
  effectiveDetailStatus,
  effectiveStage,
  heldTaskProjectId,
  isPeterEmail,
  movedLaneCount,
  projectMoveDecision,
  publishChangeDecision,
  stageChangeDecision,
  stageOptionLock,
  taskIdsToMove,
  textBlurSave,
  workStatusWrite,
} from './milestoneDetails';
import { workStatusDecision } from './milestones';

describe('peter-only stages', () => {
  it('treats both of Peter’s portal emails as Peter and nobody else', () => {
    assert.equal(isPeterEmail('Peter@warehaus.co'), true);
    assert.equal(isPeterEmail(' peter@warehaus.studio '), true);
    assert.equal(isPeterEmail('alex@warehaus.co'), false);
    assert.equal(isPeterEmail(''), false);
    assert.equal(isPeterEmail(null), false);
  });

  it('lets only Peter set Awaiting Go and Ready to Ship', () => {
    assert.deepEqual(stageChangeDecision({ peter: false, from: 'Planning', to: 'Awaiting Go' }), {
      ok: false,
      reason: 'Only Peter can set Awaiting Go or Ready to Ship',
    });
    assert.deepEqual(stageChangeDecision({ peter: false, from: 'Building', to: 'Ready to Ship' }), {
      ok: false,
      reason: 'Only Peter can set Awaiting Go or Ready to Ship',
    });
    assert.deepEqual(stageChangeDecision({ peter: true, from: 'Planning', to: 'Awaiting Go' }), {
      ok: true,
      stage: 'Awaiting Go',
      wrote: true,
    });
    assert.deepEqual(stageChangeDecision({ peter: true, from: 'Building', to: 'Ready to Ship' }), {
      ok: true,
      stage: 'Ready to Ship',
      wrote: true,
    });
  });

  it('lets only Peter move Awaiting Go to Building', () => {
    assert.deepEqual(stageChangeDecision({ peter: false, from: 'Awaiting Go', to: 'Building' }), {
      ok: false,
      reason: 'Only Peter can move a milestone out of Awaiting Go',
    });
    assert.deepEqual(stageChangeDecision({ peter: true, from: 'Awaiting Go', to: 'Building' }), {
      ok: true,
      stage: 'Building',
      wrote: true,
    });
  });

  it('lets nobody set Shipped, and locks those options in the menu', () => {
    assert.deepEqual(stageChangeDecision({ peter: true, from: 'Building', to: 'Shipped' }), {
      ok: false,
      reason: 'Shipped is set by deploy main',
    });
    assert.equal(stageOptionLock({ stage: 'Shipped', peter: true }), 'shipped');
    assert.equal(stageOptionLock({ stage: 'Awaiting Go', peter: false }), 'peter');
    assert.equal(stageOptionLock({ stage: 'Awaiting Go', peter: true }), null);
    assert.equal(stageOptionLock({ stage: 'Building', peter: false }), null);
  });

  it('skips a no-op stage write, including a repeat of Shipped', () => {
    assert.deepEqual(stageChangeDecision({ peter: false, from: 'Building', to: 'Building' }), {
      ok: true,
      stage: 'Building',
      wrote: false,
    });
    const shipped = stageChangeDecision({ peter: true, from: 'Shipped', to: 'Shipped' });
    assert.equal(shipped.ok, true);
    if (shipped.ok) assert.equal(shipped.wrote, false);
  });
});

describe('status, publish, and project decisions', () => {
  it('lets a non-Peter mark work ready without storing a Peter stage', () => {
    const ready = workStatusDecision({ actor: 'human', approval: 'unreviewed', from: 'active', to: 'ready' });
    assert.equal(ready.ok, true);
    if (!ready.ok) return;
    assert.equal(ready.workStatus, 'ready');
    assert.equal(ready.stage, null);
    const review = detailStatusDecision({ from: 'in_progress', to: 'in_review' });
    assert.equal(review.ok, true);
    if (!review.ok) return;
    assert.equal(review.workStatus, 'ready');
    assert.equal(review.stage, null);
    const patch = workStatusWrite('ready');
    assert.deepEqual(patch, { workStatus: 'ready' });
    assert.equal('stage' in patch, false);
    assert.equal(stageChangeDecision({ peter: false, from: 'Building', to: 'Ready to Ship' }).ok, false);
    assert.equal(stageChangeDecision({ peter: false, from: 'Building', to: 'Awaiting Go' }).ok, false);
    assert.equal(stageChangeDecision({ peter: true, from: 'Building', to: 'Ready to Ship' }).ok, true);
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

  it('saves a new status and skips the same one', () => {
    assert.deepEqual(detailStatusDecision({ from: 'in_progress', to: 'in_review' }), {
      ok: true,
      status: 'in_review',
      wrote: true,
      workStatus: 'ready',
      stage: null,
    });
    const complete = detailStatusDecision({ from: 'in_progress', to: 'complete' });
    if (complete.ok) assert.equal(complete.workStatus, null);
    const same = detailStatusDecision({ from: 'draft', to: 'draft' });
    if (same.ok) assert.equal(same.wrote, false);
    assert.equal(detailStatusDecision({ from: 'draft', to: 'later' }).ok, false);
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
    assert.equal(isClientVisibleActivityType('milestone.stage'), false);
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

  it('hides Creator and Visibility from clients and shows the other rows', () => {
    assert.equal(clientSeesDetailsRow('creator', false), false);
    assert.equal(clientSeesDetailsRow('visibility', false), false);
    assert.equal(clientSeesDetailsRow('creator', true), true);
    assert.equal(clientSeesDetailsRow('visibility', true), true);
    assert.equal(clientSeesDetailsRow('approval', false), false);
    assert.equal(clientSeesDetailsRow('review', false), false);
    assert.equal(clientSeesDetailsRow('approval', true), true);
    assert.equal(clientSeesDetailsRow('project', false), true);
    assert.equal(clientSeesDetailsRow('status', false), true);
  });

  it('derives a stage and status when nothing has been stored yet', () => {
    assert.equal(effectiveStage({ stage: null, workStatus: 'draft', approval: 'unreviewed' }), 'Planning');
    assert.equal(effectiveStage({ stage: 'Parked', workStatus: 'active', approval: 'unreviewed' }), 'Parked');
    assert.equal(effectiveDetailStatus({ detailStatus: null, workStatus: 'ready' }), 'in_review');
    assert.equal(effectiveDetailStatus({ detailStatus: 'complete', workStatus: 'active' }), 'complete');
    assert.equal(effectiveStage({ stage: null, workStatus: 'active', approval: 'approved' }), 'Ready to Ship');
    assert.equal(effectiveStage({ stage: 'Shipped', workStatus: 'active', approval: 'approved' }), 'Shipped');
    const clientView = roadmapViewForAudience({
      name: 'Launch',
      publishToWarehaus: true,
      approval: 'approved',
      note: 'Ship it',
      approverName: 'Peter',
      decidedAt: 1,
      creator: 'Peter',
      workStatus: 'ready',
    }, 'client');
    for (const key of ['publishToWarehaus', 'approval', 'note', 'approverName', 'decidedAt', 'creator']) {
      assert.equal(key in clientView, false, key);
    }
    assert.equal(clientView.workStatus, 'ready');
    const staffView = roadmapViewForAudience({ publishToWarehaus: true, approval: 'approved' }, 'staff');
    assert.equal(staffView.publishToWarehaus, true);
    assert.equal(movedLaneCount([
      { id: 'a', projectId: 'p1', milestoneId: 'm', parentTaskId: null },
      { id: 'b', projectId: 'p1', milestoneId: 'm', parentTaskId: null },
      { id: 'c', projectId: 'p1', milestoneId: 'm', parentTaskId: 'a' },
    ], ['a', 'b', 'c']), 2);
  });
});

describe('server enforcement', () => {
  it('keeps the detail mutations staff-only and off the Notion outbox', () => {
    const source = readFileSync(new URL('../milestones.ts', import.meta.url), 'utf8');
    const start = source.indexOf('export const setDetailStatus');
    const end = source.indexOf('export const decide');
    const block = source.slice(start, end);
    assert.ok(start > 0 && end > start);
    assert.match(block, /stageChangeDecision/);
    assert.match(block, /isPeterEmail\(ctx\.identity\.email\)/);
    assert.match(block, /detailStatusDecision/);
    assert.match(block, /projectMoveDecision/);
    assert.match(block, /taskIdsToMove/);
    assert.match(block, /by_parentTaskId/);
    assert.match(block, /by_orgId_milestoneId/);
    assert.doesNotMatch(block, /by_orgId_projectId/);
    const statusBlock = source.slice(source.indexOf('export const setDetailStatus'), source.indexOf('export const setStage'));
    const workBlock = source.slice(source.indexOf('export const setWorkStatus'), source.indexOf('export const setPublish'));
    assert.doesNotMatch(statusBlock, /\bstage:/);
    assert.doesNotMatch(workBlock, /\bstage:/);
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
