import assert from 'node:assert/strict';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it } from 'node:test';
import type { MilestoneRoadmapView } from '@convex/_lib/milestones';
import type { PortalTask } from '@/lib/data/view-models';
import {
  BLOCKED_ASK,
  BOARD_BUILDING,
  BOARD_FOOTER,
  BOARD_FOOTER_PHONE,
  BOARD_INTRO,
  BOARD_SHIPPED,
  WAITING_STATUS,
  boardFooter,
  boardSummary,
  MILESTONE_BOARD_STATUSES,
  ORDER_LOCKED,
  milestoneBoardCards,
  milestoneBoardReadOnly,
  milestoneBoardStatus,
  milestoneTaskToOpen,
  runOrderAfterReorder,
} from './milestoneBoard';

Object.assign(globalThis, { React });
const { MilestoneTaskBoard } = await import('./MilestoneTaskBoard');
const {
  MoveSheet,
  NeedsDialog,
  TaskCardFace,
  applyPendingOrder,
  boardAskFor,
  boardCanChange,
  boardColumnTemplate,
  columnsInGivenOrder,
  givenOrderSlot,
  movedOrder,
  pickStatusColumns,
  pressMoved,
  reorderSlot,
  stageSavedFeedback,
} = await import('@/components/tasks/TaskBoard');

const project = { id: 'p-portal', name: 'Warehaus Portal' };

const row = (
  id: string,
  status: string,
  extra: Partial<MilestoneRoadmapView['rows'][number]> = {},
): MilestoneRoadmapView['rows'][number] => ({
  id,
  name: `Task ${id}`,
  status,
  isDone: status === 'Done',
  stage: null,
  resourceCount: 0,
  onMilestone: true,
  children: [],
  ...extra,
});

const rows = [
  row('a', 'To Do'),
  row('b', 'In Progress', { children: [{ id: 'b1', name: 'Sub of b', status: 'Done', isDone: true, stage: null, resourceCount: 0 }] }),
  row('c', 'Blocked'),
  row('d', 'Done'),
  row('e', 'Inbox'),
];

function milestone(status: string, list = rows): MilestoneRoadmapView {
  return { id: 'm-board', name: 'Board', status, rows: list } as unknown as MilestoneRoadmapView;
}

function board(input: { staff: boolean; status?: string; fixtures?: boolean; archived?: number; list?: typeof rows }): string {
  const archivedTasks = Array.from({ length: input.archived ?? 0 }, (_, index) => ({
    id: `x${index}`,
    name: `Archived ${index}`,
    status: 'To Do',
    isDone: false,
    stage: null,
    parentTaskId: null,
    milestoneId: 'm-board',
    archivedAt: 1,
  }));
  return renderToStaticMarkup(
    createElement(MilestoneTaskBoard, {
      milestone: milestone(input.status ?? 'Planning', input.list),
      project,
      tasks: [],
      staff: input.staff,
      fixtures: input.fixtures ?? true,
      archivedTasks,
    }),
  );
}

const columnLabels = (html: string) => [...html.matchAll(/data-testid="task-column"/g)].length;
const lanes = (html: string) => [...html.matchAll(/<section[^>]*aria-label="([^"]+)"[^>]*data-testid="task-column"/g)].map((m) => m[1]);

describe('milestone board columns', () => {
  it('names four status columns, with no Inbox', () => {
    assert.deepEqual([...MILESTONE_BOARD_STATUSES], ['To Do', 'In Progress', 'Blocked', 'Done']);
  });

  it('puts every task in one of the four columns', () => {
    assert.equal(milestoneBoardStatus({ status: 'To Do', isDone: false }), 'To Do');
    assert.equal(milestoneBoardStatus({ status: 'Inbox', isDone: false }), 'To Do');
    assert.equal(milestoneBoardStatus({ status: 'Not started', isDone: false }), 'To Do');
    assert.equal(milestoneBoardStatus({ status: 'Backlog', isDone: false }), 'To Do');
    assert.equal(milestoneBoardStatus({ status: 'In Review', isDone: false }), 'In Progress');
    assert.equal(milestoneBoardStatus({ status: 'blocked', isDone: false }), 'Blocked');
    assert.equal(milestoneBoardStatus({ status: 'Blocked', isDone: true }), 'Done');
  });

  it('keeps only the named columns, in the named order', () => {
    const all = ['Inbox', 'To Do', 'Blocked', 'In Progress', 'Done', 'unknown:Odd'].map((key) => ({ key, label: key }));
    assert.deepEqual(pickStatusColumns(all, MILESTONE_BOARD_STATUSES).map((column) => column.key), [...MILESTONE_BOARD_STATUSES]);
    assert.equal(pickStatusColumns(all, undefined).length, all.length);
  });
});

describe('milestone board cards', () => {
  it('builds a card for a task that exists only on the milestone', () => {
    const cards = milestoneBoardCards(rows, [], project);
    const first = cards[0];
    assert.equal(first?.id, 'a');
    assert.equal(first?.projectId, 'p-portal');
    assert.equal(first?.date, null);
    assert.equal(first?.stage, null);
  });

  it('keeps the milestone order and nests a subtask under its row', () => {
    const cards = milestoneBoardCards(rows, [], project);
    assert.deepEqual(cards.map((card) => card.id), ['a', 'b', 'b1', 'c', 'd', 'e']);
    assert.equal(cards.find((card) => card.id === 'b1')?.parentTaskId, 'b');
    assert.equal(cards.find((card) => card.id === 'b')?.parentTaskId, null);
  });

  it('takes the read time and due date from the project task, and the status from the row', () => {
    const live: PortalTask = {
      id: 'a',
      name: 'Old name',
      status: 'Done',
      isDone: true,
      date: '2026-12-01',
      stage: 'Building',
      lastEditedTime: '2026-11-25T10:00:00.000Z',
      projectId: 'p-other',
      projectName: 'Other',
      projectStatus: null,
      projectEndDate: null,
    };
    const card = milestoneBoardCards(rows, [live], project)[0];
    assert.equal(card?.name, 'Task a');
    assert.equal(card?.status, 'To Do');
    assert.equal(card?.isDone, false);
    assert.equal(card?.date, '2026-12-01');
    assert.equal(card?.lastEditedTime, '2026-11-25T10:00:00.000Z');
    assert.equal(card?.stage, null);
  });
});

describe('milestone board access', () => {
  it('is read-only for clients and on a Shipped milestone', () => {
    assert.equal(milestoneBoardReadOnly({ staff: true, status: 'Planning' }), false);
    assert.equal(milestoneBoardReadOnly({ staff: true, status: 'Building' }), false);
    assert.equal(milestoneBoardReadOnly({ staff: true, status: 'Shipped' }), true);
    assert.equal(milestoneBoardReadOnly({ staff: false, status: 'Planning' }), true);
  });

  it('lets only staff with the staff rules change a board that is not read-only', () => {
    assert.equal(boardCanChange({ staff: true, actor: 'staff', readOnly: false }), true);
    assert.equal(boardCanChange({ staff: true, actor: 'staff', readOnly: true }), false);
    assert.equal(boardCanChange({ staff: false, actor: 'client', readOnly: false }), false);
    assert.equal(boardCanChange({ staff: true, actor: undefined, readOnly: false }), false);
  });
});

describe('milestone Tasks tab board', () => {
  it('shows To Do, In Progress, Blocked and Done, and no group toggle', () => {
    const html = board({ staff: true });
    assert.deepEqual(lanes(html), ['To Do', 'In Progress', 'Blocked', 'Done']);
    assert.equal(html.includes('aria-label="Group by"'), false);
    assert.equal(html.includes('INBOX'), false);
    for (const id of ['a', 'b', 'c', 'd', 'e']) assert.ok(html.includes(`data-task-name="Task ${id}"`), id);
    // A subtask counts on its parent card. It is not a card of its own.
    assert.equal(html.includes('data-task-name="Sub of b"'), false);
  });

  it('gives staff the intro, the footer and Add task under To Do only', () => {
    const html = board({ staff: true });
    assert.ok(html.includes(BOARD_INTRO));
    assert.ok(html.includes(BOARD_FOOTER));
    assert.equal((html.match(/\+ Add task/g) ?? []).length, 1);
    assert.match(html, /aria-label="Add task to To Do"/);
    assert.equal(html.includes('aria-label="Add task to Done"'), false);
    assert.match(html, /cursor:grab/);
  });

  it('is read-only for a client: no intro, footer, Add task, Archived chip or drag', () => {
    const html = board({ staff: false, archived: 2 });
    assert.equal(columnLabels(html), 4);
    assert.equal(html.includes(BOARD_INTRO), false);
    assert.equal(html.includes(BOARD_FOOTER), false);
    assert.equal(html.includes('Add task'), false);
    assert.equal(html.includes('data-testid="archived-filter"'), false);
    assert.equal(html.includes('cursor:grab'), false);
    assert.ok(html.includes('data-task-name="Task a"'));
  });

  it('reads Nothing here yet. in a client’s empty column and No tasks in a staff one', () => {
    assert.match(board({ staff: false, list: [] }), /Nothing here yet\./);
    const staff = board({ staff: true, list: [] });
    assert.match(staff, /No tasks/);
    assert.equal(staff.includes('Nothing here yet.'), false);
  });

  it('is read-only for staff on a Shipped milestone', () => {
    const html = board({ staff: true, status: 'Shipped' });
    assert.equal(columnLabels(html), 4);
    assert.ok(html.includes(BOARD_SHIPPED));
    assert.equal(html.includes(BOARD_FOOTER), false);
    assert.equal(html.includes('Add task'), false);
    assert.equal(html.includes('cursor:grab'), false);
  });

  it('is read-only on a live page that passes no move', () => {
    const html = board({ staff: true, fixtures: false });
    assert.equal(html.includes('cursor:grab'), false);
    assert.equal(html.includes('Add task'), false);
  });

  it('keeps archived tasks behind the Archived chip, for staff', () => {
    const html = board({ staff: true, archived: 2 });
    assert.match(html, /data-testid="archived-filter"/);
    assert.match(html, /data-testid="archived-filter-count"[^>]*>2</);
    assert.equal(html.includes('Archived 0'), false);
    assert.equal(board({ staff: true }).includes('data-testid="archived-filter"'), false);
  });
});

describe('run order in To Do', () => {
  const cardNames = (html: string) => [...html.matchAll(/data-task-name="([^"]+)"/g)].map((m) => m[1]);

  it('shows each column in milestone order, not due date order', () => {
    const list = [row('late', 'To Do'), row('early', 'To Do'), row('doing', 'In Progress'), row('last', 'To Do')];
    const dated = (id: string, date: string) => ({ id, name: `Task ${id}`, status: 'To Do', isDone: false, date }) as unknown as PortalTask;
    const html = renderToStaticMarkup(
      createElement(MilestoneTaskBoard, {
        milestone: milestone('Planning', list),
        project,
        tasks: [dated('late', '2026-12-30'), dated('early', '2026-12-01')],
        staff: true,
        fixtures: true,
      }),
    );
    assert.deepEqual(cardNames(html), ['Task late', 'Task early', 'Task last', 'Task doing']);
  });

  it('keeps the given order inside each column', () => {
    const given = [{ id: 'c' }, { id: 'a' }, { id: 'b' }];
    const columns = [{ key: 'To Do', tasks: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] }];
    assert.deepEqual(columnsInGivenOrder(columns, given)[0]?.tasks.map((task) => task.id), ['c', 'a', 'b']);
  });

  it('lands a card from another column where the milestone order puts it', () => {
    const given = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
    assert.equal(givenOrderSlot([{ id: 'a' }, { id: 'd' }], { id: 'b' }, given), 1);
    assert.equal(givenOrderSlot([{ id: 'a' }, { id: 'b' }], { id: 'd' }, given), 2);
    assert.equal(givenOrderSlot([], { id: 'a' }, given), 0);
  });

  it('finds the slot under a lifted card from the middles of the resting cards', () => {
    assert.equal(reorderSlot([100, 200, 300], 50), 0);
    assert.equal(reorderSlot([100, 200, 300], 150), 1);
    assert.equal(reorderSlot([100, 200, 300], 350), 3);
    assert.equal(reorderSlot([], 10), 0);
  });

  it('moves one card to a slot among the others, and reports no change as null', () => {
    assert.deepEqual(movedOrder(['a', 'b', 'c'], 'c', 0), ['c', 'a', 'b']);
    assert.deepEqual(movedOrder(['a', 'b', 'c'], 'a', 2), ['b', 'c', 'a']);
    assert.deepEqual(movedOrder(['a', 'b', 'c'], 'a', 9), ['b', 'c', 'a']);
    assert.equal(movedOrder(['a', 'b', 'c'], 'b', 1), null);
    assert.equal(movedOrder(['a', 'b', 'c'], 'a', -1), null);
    assert.equal(movedOrder(['a', 'b', 'c'], 'x', 0), null);
  });

  it('shows an order that is still saving, with an unnamed card last', () => {
    const tasks = [{ id: 'a' }, { id: 'b' }, { id: 'new' }];
    assert.deepEqual(applyPendingOrder(tasks, ['b', 'a']).map((task) => task.id), ['b', 'a', 'new']);
    assert.deepEqual(applyPendingOrder(tasks, null).map((task) => task.id), ['a', 'b', 'new']);
  });

  it('saves the whole milestone order, moving only the To Do rows', () => {
    // a and e (Inbox) are To Do. b, c and d keep their places.
    assert.deepEqual(runOrderAfterReorder(rows, ['e', 'a']), ['e', 'b', 'c', 'd', 'a']);
    assert.deepEqual(runOrderAfterReorder(rows, ['a', 'e']), ['a', 'b', 'c', 'd', 'e']);
  });

  it('refuses an order that does not name exactly the To Do rows', () => {
    for (const ids of [['a'], ['a', 'a'], ['a', 'b'], ['a', 'e', 'x']]) {
      assert.equal(runOrderAfterReorder(rows, ids), null);
    }
  });

  it('locks the To Do order while the milestone is Building, and says so', () => {
    const building = board({ staff: true, status: 'Building' });
    assert.match(building, new RegExp(`data-testid="column-order-locked"[^>]*>.*?${ORDER_LOCKED}`));
    assert.equal([...building.matchAll(/data-testid="column-order-locked"/g)].length, 1);
    assert.match(building, new RegExp(BOARD_BUILDING));
    assert.equal(building.includes(BOARD_FOOTER), false);
    // Add task stays, and cards still move between columns.
    assert.match(building, /\+ Add task/);
    assert.match(building, /cursor:grab/);
  });

  it('shows no lock outside Building, or to a client', () => {
    assert.equal(board({ staff: true, status: 'Planning' }).includes('column-order-locked'), false);
    assert.equal(board({ staff: true, status: 'Shipped' }).includes('column-order-locked'), false);
    assert.equal(board({ staff: false, status: 'Building' }).includes('column-order-locked'), false);
  });
});

describe('opening a milestone card', () => {
  const list = [
    row('only', 'Inbox', {
      detail: 'Fix the lookup.',
      source: 'portal-milestone',
      pullRequestUrl: 'https://github.com/warehauscollective/warehaus/pull/1',
      resourceCount: 2,
      portalOwned: true,
    }),
    row('parent', 'In Progress', {
      children: [{ id: 'sub', name: 'Sub', status: 'Done', isDone: true, stage: null, resourceCount: 0, onMilestone: false }],
    }),
  ];
  const open = (taskId: string, tasks: PortalTask[] = []) =>
    milestoneTaskToOpen({ taskId, milestone: { id: 'm-board', rows: list }, tasks, project });

  it('builds a task that exists only on the milestone from its row', () => {
    const task = open('only');
    assert.equal(task?.id, 'only');
    assert.equal(task?.name, 'Task only');
    // The row's own status, not the column it sits in.
    assert.equal(task?.status, 'Inbox');
    assert.equal(task?.description, 'Fix the lookup.');
    assert.equal(task?.source, 'portal-milestone');
    assert.equal(task?.pullRequestUrl, 'https://github.com/warehauscollective/warehaus/pull/1');
    assert.equal(task?.resourceCount, 2);
    assert.equal(task?.milestoneId, 'm-board');
    assert.equal(task?.projectId, 'p-portal');
    assert.equal(task?.projectName, 'Warehaus Portal');
    assert.equal(task?.parentTaskId, null);
  });

  it('opens a subtask under its parent, without claiming a milestone it is not on', () => {
    const task = open('sub');
    assert.equal(task?.parentTaskId, 'parent');
    assert.equal(task?.isDone, true);
    assert.equal('milestoneId' in (task ?? {}), false);
  });

  it('opens the task the page already holds as that task', () => {
    const live: PortalTask = {
      id: 'only',
      name: 'Live name',
      status: 'In Progress',
      isDone: false,
      date: '2026-12-01',
      lastEditedTime: '2026-11-25T10:00:00.000Z',
      projectId: 'p-other',
      projectName: 'Other',
      projectStatus: null,
      projectEndDate: null,
    };
    const task = open('only', [live]);
    assert.equal(task?.name, 'Live name');
    assert.equal(task?.status, 'In Progress');
    assert.equal(task?.date, '2026-12-01');
    assert.equal(task?.projectId, 'p-other');
    assert.equal(task?.lastEditedTime, '2026-11-25T10:00:00.000Z');
  });

  it('opens nothing for an id no row has', () => {
    assert.equal(open('missing'), null);
  });
});

describe('moving a card to Blocked', () => {
  const ask = { status: WAITING_STATUS, copy: BLOCKED_ASK };

  it('asks only on a move to Blocked, and only on status columns', () => {
    assert.equal(boardAskFor(ask, 'status', 'Blocked'), ask);
    assert.equal(boardAskFor(ask, 'status', 'Done'), null);
    assert.equal(boardAskFor(ask, 'status', 'To Do'), null);
    assert.equal(boardAskFor(ask, 'stage', 'Blocked'), null);
    assert.equal(boardAskFor(undefined, 'status', 'Blocked'), null);
  });

  it('asks what the task is waiting on, with no pull request field and no client note', () => {
    const html = renderToStaticMarkup(
      createElement(NeedsDialog, { taskName: 'Task a', copy: BLOCKED_ASK, onCancel: () => undefined, onSave: () => undefined }),
    );
    assert.match(html, /Move to Blocked/);
    assert.match(html, /What is “Task a” waiting on\? It is saved as the task’s next action\./);
    assert.match(html, /Waiting on/);
    assert.equal(html.includes('Pull request'), false);
    assert.equal(html.includes('Ready to Ship'), false);
    assert.equal(html.includes('Note for the client'), false);
  });

  it('says what is missing when the answer is empty', () => {
    const html = renderToStaticMarkup(
      createElement(NeedsDialog, {
        taskName: 'Task a',
        copy: BLOCKED_ASK,
        initialError: BLOCKED_ASK.required,
        onCancel: () => undefined,
        onSave: () => undefined,
      }),
    );
    assert.match(html, /Say what it is waiting on\./);
  });

  it('keeps the pull request copy on a dialog that passes no copy', () => {
    const rule = { kind: 'needs' as const, reason: '', fields: [{ key: 'pullRequestLink' as const, label: 'Pull request link', placeholder: 'github.com/…/pull/123' }] };
    const html = renderToStaticMarkup(
      createElement(NeedsDialog, { taskName: 'Homepage', rule, onCancel: () => undefined, onSave: () => undefined }),
    );
    assert.match(html, /Move to Ready to Ship/);
    assert.match(html, /Note for the client/);
  });

  it('carries the next action onto the card, and shows it to staff on a Blocked card only', () => {
    const cards = milestoneBoardCards(
      [row('c', 'Blocked', { nextAction: 'Photography from the client' }), row('a', 'To Do', { nextAction: 'Write the brief' })],
      [],
      project,
    );
    assert.equal(cards[0]?.nextAction, 'Photography from the client');
    const face = (index: number, staff: boolean) => renderToStaticMarkup(createElement(TaskCardFace, { task: cards[index], staff }));
    assert.match(face(0, true), /card-waiting-on/);
    assert.match(face(0, true), /Photography from the client/);
    assert.equal(face(0, false).includes('Photography from the client'), false);
    assert.equal(face(1, true).includes('Write the brief'), false);
  });
});

describe('leaving Done', () => {
  it('toasts the move with Undo, and Undo sends the card back to Done', () => {
    const [card] = milestoneBoardCards([row('d', 'Done')], [], project);
    const undone: { status: string; value: string }[] = [];
    const saved = stageSavedFeedback({
      task: card!,
      mode: 'status',
      value: 'In Progress',
      previous: 'Done',
      onUndo: (request) => undone.push({ status: request.task.status, value: request.value }),
    });
    assert.equal(saved.message, 'Moved “Task d” to In Progress');
    saved.undo();
    assert.deepEqual(undone, [{ status: 'In Progress', value: 'Done' }]);
  });
});

describe('the board at 390', () => {
  it('keeps every column, 220 wide, side by side', () => {
    assert.equal(boardColumnTemplate(4, true, true), 'repeat(4, 220px)');
    assert.equal(boardColumnTemplate(4, true), 'minmax(0, 1fr)');
  });

  it('names press and hold in the footer, and keeps the Building and Shipped lines', () => {
    assert.equal(boardFooter({ status: 'Planning', phone: true }), BOARD_FOOTER_PHONE);
    assert.equal(BOARD_FOOTER_PHONE, 'To Do runs top first. Press and hold a card to move it.');
    assert.equal(boardFooter({ status: 'Planning', phone: false }), BOARD_FOOTER);
    assert.equal(boardFooter({ status: 'Building', phone: true }), BOARD_BUILDING);
    assert.equal(boardFooter({ status: 'Shipped', phone: true }), BOARD_SHIPPED);
  });

  it('counts top-level tasks and the done ones for the context card', () => {
    assert.equal(boardSummary(rows), '5 tasks · 1 complete');
    assert.equal(boardSummary([{ isDone: false }]), '1 task · 0 complete');
  });

  it('ends a hold once the finger travels, so a swipe scrolls the columns', () => {
    assert.equal(pressMoved({ x: 10, y: 10 }, { x: 14, y: 12 }), false);
    assert.equal(pressMoved({ x: 10, y: 10 }, { x: 30, y: 10 }), true);
  });

  it('lists the four columns in the move sheet, marks the current one and names the task', () => {
    const [card] = milestoneBoardCards([row('a', 'To Do')], [], project);
    const html = renderToStaticMarkup(
      createElement(MoveSheet, {
        task: card!,
        showName: true,
        columns: MILESTONE_BOARD_STATUSES.map((status) => ({ key: status, label: status })),
        current: 'To Do',
        decisionFor: (value: string) => (value === 'To Do' ? { kind: 'ignore' as const } : { kind: 'move' as const, value }),
        onClose: () => undefined,
        onPick: () => undefined,
      }),
    );
    assert.match(html, /Move to/);
    assert.match(html, /To Do · Current/);
    for (const status of ['In Progress', 'Blocked', 'Done']) assert.match(html, new RegExp(`>${status}<`));
    assert.equal(/data-testid="move-sheet-task"[^>]*class="sr-only"/.test(html) || /class="sr-only"[^>]*data-testid="move-sheet-task"/.test(html), false);
    assert.match(html, /Task a/);
  });
});
