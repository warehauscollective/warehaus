import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

Object.assign(globalThis, { React });
import { DoneGroup } from './DoneGroup';
import { NeedMilestoneBanner } from './NeedMilestoneBanner';
import {
  doneGroupLabel,
  needMilestoneBannerState,
  needMilestoneCopy,
  attachedMilestoneTaskIds,
  tasksNeedingMilestone,
  type NeedMilestoneTask,
} from './needMilestone';

const HERE = new Set(['m-here']);

function task(patch: Partial<NeedMilestoneTask> & Pick<NeedMilestoneTask, 'id'>): NeedMilestoneTask {
  return {
    status: 'To Do',
    isDone: false,
    parentTaskId: null,
    milestoneId: null,
    archivedAt: null,
    ...patch,
  };
}

describe('tasks that need a milestone', () => {
  const rows = [
    task({ id: 'open' }),
    task({ id: 'done', status: 'Done', isDone: true }),
    task({ id: 'parked', status: 'Parked' }),
    task({ id: 'flagged', status: 'In Progress', isDone: true }),
    task({ id: 'child', parentTaskId: 'open' }),
    task({ id: 'other', milestoneId: 'm-other' }),
    task({ id: 'missing' }),
    task({ id: 'ours', milestoneId: 'm-here' }),
    task({ id: 'archived', archivedAt: 10 }),
    task({ id: 'attached', milestoneId: 'm-other' }),
  ];

  it('counts only open top-level tasks with no milestone of this project', () => {
    const ids = tasksNeedingMilestone(rows, HERE, new Set(['attached'])).map((row) => row.id);
    assert.deepEqual(ids, ['open', 'other', 'missing']);
  });

  it('drops Done, Parked, isDone, subtasks, archived, and this project’s milestone', () => {
    const counted = new Set(tasksNeedingMilestone(rows, HERE, new Set(['attached'])).map((row) => row.id));
    for (const id of ['done', 'parked', 'flagged', 'child', 'ours', 'archived', 'attached']) {
      assert.equal(counted.has(id), false, id);
    }
  });

  it('counts 5 on the staff list and the snapshot fallback for the prod mix', () => {
    const milestoneId = 'm-prod';
    const milestones = [
      {
        id: milestoneId,
        rows: [
          {
            id: 'row-1',
            children: Array.from({ length: 19 }, (_, index) => ({ id: `nested-${index}` })),
          },
        ],
      },
    ];
    const open = Array.from({ length: 5 }, (_, index) =>
      task({ id: `open-${index}`, status: 'To Do', isDone: false, parentTaskId: null, milestoneId: null }),
    );
    const done = Array.from({ length: 5 }, (_, index) =>
      task({ id: `done-${index}`, status: 'Done', isDone: true, parentTaskId: null, milestoneId: null }),
    );
    const parent = task({ id: 'row-1', status: 'In Progress', isDone: false, parentTaskId: null, milestoneId });
    const nested = Array.from({ length: 19 }, (_, index) =>
      task({ id: `nested-${index}`, status: 'To Do', isDone: false, parentTaskId: 'row-1', milestoneId: null }),
    );
    const loose = Array.from({ length: 4 }, (_, index) =>
      task({ id: `loose-${index}`, status: 'To Do', isDone: false, parentTaskId: 'open-0', milestoneId: null }),
    );
    const docs = [parent, ...open, ...done, ...nested, ...loose];
    const attached = attachedMilestoneTaskIds(milestones);
    assert.equal(attached.has('row-1'), true);
    assert.equal(attached.has('nested-0'), true);
    assert.equal(attached.has('nested-18'), true);
    assert.equal(attached.has('loose-0'), false);
    assert.equal(attached.size, 20);

    const staffList = docs.map((row) => ({
      id: row.id,
      status: row.status,
      isDone: row.isDone,
      parentTaskId: row.parentTaskId ?? null,
      milestoneId: row.milestoneId ?? null,
    }));
    const snapshot = docs.map((row) => ({
      id: row.id,
      status: row.status,
      isDone: row.isDone,
      parentTaskId: row.parentTaskId ?? null,
      ...(row.milestoneId ? { milestoneId: row.milestoneId } : {}),
    }));
    const projectIds = new Set([milestoneId]);
    assert.deepEqual(
      tasksNeedingMilestone(staffList, projectIds, attached).map((row) => row.id),
      open.map((row) => row.id),
    );
    assert.equal(tasksNeedingMilestone(snapshot, projectIds, attached).length, 5);
    assert.deepEqual(
      tasksNeedingMilestone(snapshot, projectIds, attached).map((row) => row.id),
      open.map((row) => row.id),
    );
  });

  it('uses the singular line for one task and hides a zero count', () => {
    assert.equal(needMilestoneCopy(1), '1 task needs a milestone');
    assert.equal(needMilestoneCopy(3), '3 tasks need a milestone');
    assert.equal(needMilestoneBannerState(0, false), 'hidden');
    assert.equal(needMilestoneBannerState(2, false), 'visible');
    assert.equal(needMilestoneBannerState(2, true), 'dismissed');
    assert.equal(needMilestoneBannerState(0, true), 'hidden');
  });

  it('renders nothing at zero, the banner while visible, and the chip after dismiss', () => {
    assert.equal(renderToStaticMarkup(createElement(NeedMilestoneBanner, { count: 0, dismissed: false, onDismiss() {} })), '');
    const visible = renderToStaticMarkup(createElement(NeedMilestoneBanner, { count: 3, dismissed: false, onDismiss() {} }));
    assert.match(visible, /3 tasks need a milestone/);
    assert.match(visible, /aria-label="Dismiss"/);
    assert.equal(visible.includes('Need a milestone'), false);
    const one = renderToStaticMarkup(createElement(NeedMilestoneBanner, { count: 1, dismissed: false, onDismiss() {} }));
    assert.match(one, /1 task needs a milestone/);
    const chip = renderToStaticMarkup(createElement(NeedMilestoneBanner, { count: 3, dismissed: true, onDismiss() {} }));
    assert.match(chip, /data-testid="milestone-need-chip"/);
    assert.match(chip, /Need a milestone/);
    assert.match(chip, />3</);
    assert.equal(chip.includes('tasks need a milestone'), false);
    assert.equal(chip.includes('Dismiss'), false);
  });
});

describe('Done group', () => {
  it('labels the group with a middle dot and starts collapsed', () => {
    assert.equal(doneGroupLabel(1), 'Done \u00B7 1');
    assert.equal(doneGroupLabel(4), 'Done \u00B7 4');
    const collapsed = renderToStaticMarkup(
      createElement(DoneGroup, { count: 1, layout: 'list', expanded: false, onToggle() {} }, createElement('p', null, 'Shipped card')),
    );
    assert.match(collapsed, /Done · 1/);
    assert.match(collapsed, /aria-expanded="false"/);
    assert.equal(collapsed.includes('Shipped card'), false);
    assert.match(collapsed, /data-layout="list"/);
    const expanded = renderToStaticMarkup(
      createElement(DoneGroup, { count: 1, layout: 'list', expanded: true, onToggle() {} }, createElement('p', null, 'Shipped card')),
    );
    assert.match(expanded, /aria-expanded="true"/);
    assert.match(expanded, /Shipped card/);
    assert.match(expanded, /data-testid="milestone-done-panel"/);
  });

  it('keeps a collapsed board at 56px and stacks an expanded phone board', () => {
    const column = renderToStaticMarkup(
      createElement(DoneGroup, { count: 2, layout: 'board', expanded: false, onToggle() {} }),
    );
    assert.match(column, /data-layout="board"/);
    assert.match(column, /width:56px/);
    assert.equal(column.includes('data-testid="milestone-done-panel"'), false);
    const stacked = renderToStaticMarkup(
      createElement(DoneGroup, { count: 2, layout: 'board', expanded: true, stacked: true, onToggle() {} }, createElement('p', null, 'Open card')),
    );
    assert.match(stacked, /data-stacked="true"/);
    assert.match(stacked, /Open card/);
    assert.equal(stacked.includes('width:56px'), false);
    const beside = renderToStaticMarkup(
      createElement(DoneGroup, { count: 2, layout: 'board', expanded: true, onToggle() {} }),
    );
    assert.match(beside, /width:358px/);
    assert.match(beside, /data-stacked="false"/);
  });
});
