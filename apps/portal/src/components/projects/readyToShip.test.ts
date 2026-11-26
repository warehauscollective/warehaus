import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { MilestoneRoadmapView } from '@convex/_lib/milestones';
import {
  approvalField,
  approvedByLine,
  approvedByShort,
  blockingTasks,
  nextStepCopy,
  readyToShipNextStep,
  shortDay,
  tasksTabCount,
} from './readyToShip';

type Row = MilestoneRoadmapView['rows'][number];

function task(id: string, over: Partial<Row> = {}): Row {
  return { id, name: `Task ${id}`, status: 'To Do', isDone: false, stage: null, resourceCount: 0, children: [], ...over };
}

const done = (id: string) => task(id, { status: 'Done', isDone: true });
// 2026-11-17 17:04 UTC is 12:04 PM ET.
const DECIDED = Date.UTC(2026, 10, 17, 17, 4);

describe('readyToShipNextStep', () => {
  it('asks for review while Ready to Ship is not approved', () => {
    const step = readyToShipNextStep({ status: 'Ready to Ship', approval: 'unreviewed', rows: [task('a')] }, true);
    assert.equal(step.kind, 'review');
  });

  it('lists the open tasks that block Shipped once approved', () => {
    const rows = [done('a'), task('b', { status: 'In Progress' }), task('c', { stage: 'Parked' }), task('d', { archived: true })];
    const step = readyToShipNextStep({ status: 'Ready to Ship', approval: 'approved', rows }, true);
    assert.equal(step.kind, 'blocked');
    assert.deepEqual(step.blocking.map((t) => t.id), ['b']);
  });

  it('counts an open subtask as blocking and marks it nested', () => {
    const rows = [done('a'), { ...done('p'), children: [task('child')] }];
    const step = readyToShipNextStep({ status: 'Ready to Ship', approval: 'approved', rows }, true);
    assert.equal(step.kind, 'blocked');
    assert.deepEqual(step.blocking, [{ id: 'child', name: 'Task child', status: 'To Do', stage: null, nested: true }]);
  });

  it('offers Mark shipped when every task that is not Parked is Done', () => {
    const step = readyToShipNextStep({ status: 'Ready to Ship', approval: 'approved', rows: [done('a'), task('b', { stage: 'Parked' })] }, true);
    assert.equal(step.kind, 'clear');
  });

  it('shows the record once shipped, and nothing for clients or other statuses', () => {
    assert.equal(readyToShipNextStep({ status: 'Shipped', approval: 'approved', rows: [] }, true).kind, 'shipped');
    assert.equal(readyToShipNextStep({ status: 'Shipped', approval: 'unreviewed', rows: [] }, true).kind, 'none');
    assert.equal(readyToShipNextStep({ status: 'Building', approval: 'approved', rows: [] }, true).kind, 'none');
    assert.equal(readyToShipNextStep({ status: 'Ready to Ship', approval: 'approved', rows: [] }, false).kind, 'none');
  });
});

describe('approval lines', () => {
  it('names the approver with the ET stamp', () => {
    assert.equal(approvedByLine({ approverName: 'Peter Roquemore', decidedAt: DECIDED }), 'Approved by Peter · Nov 17, 2026 · 12:04 PM ET');
    assert.equal(approvedByShort({ approverName: 'Peter Roquemore', decidedAt: DECIDED }), 'Approved by Peter · Nov 17');
    assert.equal(approvedByLine({ approverName: null, decidedAt: null }), 'Approved by Peter');
  });
});

describe('nextStepCopy', () => {
  it('words the blocked count in the singular and plural', () => {
    const one = nextStepCopy({ kind: 'blocked', blocking: blockingTasks([task('a')]) }, { doneCount: 0, total: 1 });
    assert.equal(one?.eyebrow, 'NEXT STEP · 1 OPEN TASK BLOCKS SHIPPED');
    assert.equal(one?.title, 'Finish or move 1 task to mark this shipped');
    const two = nextStepCopy({ kind: 'blocked', blocking: blockingTasks([task('a'), task('b')]) }, { doneCount: 0, total: 2 });
    assert.equal(two?.eyebrow, 'NEXT STEP · 2 OPEN TASKS BLOCK SHIPPED');
  });

  it('dates the shipped title from the stored ship time', () => {
    const copy = nextStepCopy({ kind: 'shipped', blocking: [] }, { doneCount: 4, total: 4, shippedAt: DECIDED });
    assert.equal(copy?.title, 'Shipped · Nov 17, 2026');
    assert.equal(nextStepCopy({ kind: 'review', blocking: [] }, { doneCount: 0, total: 0 }), null);
  });
});

describe('tasksTabCount', () => {
  it('counts every row the Tasks tab lists, subtasks included', () => {
    assert.equal(tasksTabCount([task('a'), { ...task('b'), children: [task('c'), task('d')] }]), 4);
    assert.equal(tasksTabCount([]), 0);
  });

  it('names the approver in the Approval field and waits for Peter at Ready to Ship', () => {
    const at = Date.parse('2026-11-17T17:04:00Z');
    assert.deepEqual(approvalField({ status: 'Ready to Ship', approval: 'approved', approverName: 'Peter Roquemore', decidedAt: at }), {
      value: 'Approved by Peter',
      note: 'Nov 17, 2026 · 12:04 PM ET',
    });
    assert.equal(approvalField({ status: 'Shipped', approval: 'approved', approverName: null, decidedAt: null })?.value, 'Approved by Peter');
    assert.equal(approvalField({ status: 'Building', approval: 'changes_requested', approverName: 'Peter', decidedAt: null })?.value, 'Changes requested');
    assert.deepEqual(approvalField({ status: 'Ready to Ship', approval: 'unreviewed', approverName: null }), {
      value: 'Waiting for Peter',
      note: 'Review ready',
    });
    assert.equal(approvalField({ status: 'Building', approval: 'unreviewed', approverName: null }), null);
  });

  it('prints the short day in Eastern time', () => {
    assert.equal(shortDay(Date.parse('2026-11-25T03:00:00Z')), 'Nov 24');
    assert.equal(shortDay(Date.parse('2026-11-25T15:00:00Z')), 'Nov 25');
  });
});
