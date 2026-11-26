import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { buildRoadmap, roadmapViewForAudience, type RoadmapTaskInput } from './milestones';
import { iterationTaskDrafts, notionWriteAllowedForTask, planReview } from './milestoneReview';
import {
  MILESTONE_NOT_ON_PROJECT,
  MILESTONE_REQUIRED,
  REORDER_MISMATCH,
  REVIEW_TASK_LIMIT,
  SHIPPED_TAKES_NO_TASKS,
  TASK_EDIT_IN_SOURCE,
  TASK_NOT_ON_MILESTONE,
  TASK_STARTED,
  TASK_TITLE_REQUIRED,
  TOO_MANY_REVIEW_TASKS,
  addTaskDecision,
  checklistState,
  checklistStatusText,
  checklistSummary,
  createdViaLabel,
  editTaskDecision,
  groupMilestones,
  isPortalOwnedTask,
  originLabel,
  removeTaskDecision,
  reorderDecision,
  runOrderLocked,
  RUN_ORDER_LOCKED,
  reviewTaskLines,
  taskMilestoneGate,
  taskOrigin,
} from './milestoneTasks';
import { reviewPreviews } from './previewLink';

const project = { orgId: 'org', projectId: 'project' };

describe('a task needs a milestone', () => {
  it('refuses a create with no milestone', () => {
    assert.deepEqual(taskMilestoneGate(null, project), { ok: false, reason: MILESTONE_REQUIRED });
    assert.deepEqual(taskMilestoneGate(undefined, project), { ok: false, reason: MILESTONE_REQUIRED });
  });

  it('refuses a milestone on another project or client', () => {
    assert.deepEqual(taskMilestoneGate({ orgId: 'org', projectId: 'other', status: 'Building' }, project), {
      ok: false,
      reason: MILESTONE_NOT_ON_PROJECT,
    });
    assert.deepEqual(taskMilestoneGate({ orgId: 'other', projectId: 'project', status: 'Building' }, project), {
      ok: false,
      reason: MILESTONE_NOT_ON_PROJECT,
    });
  });

  it('refuses a Shipped milestone and takes every other status', () => {
    assert.deepEqual(taskMilestoneGate({ ...project, status: 'Shipped' }, project), {
      ok: false,
      reason: SHIPPED_TAKES_NO_TASKS,
    });
    for (const status of ['Idea', 'Planning', 'Awaiting Go', 'Building', 'Ready to Ship', 'Parked'] as const) {
      assert.deepEqual(taskMilestoneGate({ ...project, status }, project), { ok: true });
    }
  });

  it('keeps every task-create path on the same gate', () => {
    const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
    const tasks = read('../tasks.ts');
    const create = tasks.slice(tasks.indexOf('export const createTask'), tasks.indexOf('export const updateLiveFields'));
    assert.match(create, /milestoneId: v\.id\('milestones'\)/);
    assert.match(read('../sync/taskWrite.ts'), /taskMilestoneGate\(/);
    const api = read('../portalApi.ts');
    const apiCreate = api.slice(api.indexOf('export const createTask'), api.indexOf('export const updateTask'));
    assert.match(apiCreate, /taskMilestoneGate\(/);
    const tools = read('../../src/lib/mcp/tools.ts');
    const tool = tools.slice(tools.indexOf("name: 'create_task'"), tools.indexOf("name: 'update_task'"));
    assert.match(tool, /milestoneId: z\.string\(\)\.min\(1\),/);
  });
});

describe('adding a task inside a milestone', () => {
  it('is staff only and marks the task as a manual add', () => {
    assert.deepEqual(addTaskDecision({ staff: false, milestoneStatus: 'Building', title: 'Ship it' }), {
      ok: false,
      reason: 'Staff role required',
    });
    assert.deepEqual(addTaskDecision({ staff: true, milestoneStatus: 'Building', title: '  Ship   it ', detail: ' why ' }), {
      ok: true,
      title: 'Ship it',
      detail: 'why',
      origin: 'manual',
      stage: 'Building',
    });
  });

  it('rejects a Shipped milestone and an empty title', () => {
    assert.deepEqual(addTaskDecision({ staff: true, milestoneStatus: 'Shipped', title: 'Late task' }), {
      ok: false,
      reason: SHIPPED_TAKES_NO_TASKS,
    });
    assert.deepEqual(addTaskDecision({ staff: true, milestoneStatus: 'Planning', title: '   ' }), {
      ok: false,
      reason: TASK_TITLE_REQUIRED,
    });
  });

  it('stores the task in the portal only', () => {
    assert.equal(notionWriteAllowedForTask({ source: 'portal-milestone' }), false);
    assert.equal(notionWriteAllowedForTask({ notionPageId: 'portal-milestone:m1:1:0' }), false);
    assert.equal(notionWriteAllowedForTask({ source: 'portal-review' }), false);
    assert.equal(notionWriteAllowedForTask({ source: 'Client', notionPageId: 'abc123' }), true);
    const source = readFileSync(new URL('../milestones.ts', import.meta.url), 'utf8');
    const add = source.slice(source.indexOf('export const addTask'), source.indexOf('export const editTask'));
    assert.match(add, /adminMutation/);
    assert.doesNotMatch(add, /outbox/i);
    assert.match(add, /source: PORTAL_MILESTONE_TASK_SOURCE/);
  });
});

describe('editing, removing and reordering', () => {
  const owned = { milestoneId: 'm1', source: 'portal-milestone', status: 'To Do', isDone: false, name: 'Old', description: '' };

  it('edits a portal task while it is To do, and skips a no-op', () => {
    assert.deepEqual(editTaskDecision({ staff: true, milestoneId: 'm1', task: owned, title: 'New', detail: 'More' }), {
      ok: true,
      wrote: true,
      patch: { name: 'New', description: 'More' },
    });
    assert.deepEqual(editTaskDecision({ staff: true, milestoneId: 'm1', task: owned, title: 'Old', detail: '' }), {
      ok: true,
      wrote: false,
    });
  });

  it('leaves a synced, started or foreign task alone', () => {
    const synced = { ...owned, source: 'Client', notionPageId: 'abc' };
    assert.deepEqual(removeTaskDecision({ staff: true, milestoneId: 'm1', task: synced }), {
      ok: false,
      reason: TASK_EDIT_IN_SOURCE,
    });
    assert.deepEqual(removeTaskDecision({ staff: true, milestoneId: 'm1', task: { ...owned, status: 'In Progress' } }), {
      ok: false,
      reason: TASK_STARTED,
    });
    assert.deepEqual(removeTaskDecision({ staff: true, milestoneId: 'm1', task: { ...owned, isDone: true } }), {
      ok: false,
      reason: TASK_STARTED,
    });
    assert.deepEqual(removeTaskDecision({ staff: true, milestoneId: 'm2', task: owned }), {
      ok: false,
      reason: TASK_NOT_ON_MILESTONE,
    });
    assert.deepEqual(removeTaskDecision({ staff: true, milestoneId: 'm1', task: owned }), { ok: true });
  });

  it('writes only the rows that move', () => {
    const current = [
      { id: 'a', milestoneOrder: 0 },
      { id: 'b', milestoneOrder: 1 },
      { id: 'c', milestoneOrder: 2 },
    ];
    assert.deepEqual(reorderDecision({ staff: true, milestoneStatus: 'Planning', current, taskIds: ['a', 'b', 'c'] }), { ok: true, writes: [] });
    assert.deepEqual(reorderDecision({ staff: true, milestoneStatus: 'Planning', current, taskIds: ['a', 'c', 'b'] }), {
      ok: true,
      writes: [
        { id: 'c', milestoneOrder: 1 },
        { id: 'b', milestoneOrder: 2 },
      ],
    });
  });

  it('locks the order while the milestone is Building', () => {
    const current = [{ id: 'a', milestoneOrder: 0 }, { id: 'b', milestoneOrder: 1 }];
    assert.deepEqual(reorderDecision({ staff: true, milestoneStatus: 'Building', current, taskIds: ['b', 'a'] }), {
      ok: false,
      reason: RUN_ORDER_LOCKED,
    });
    for (const status of ['Idea', 'Planning', 'Awaiting Go', 'Ready to Ship'] as const) {
      assert.equal(reorderDecision({ staff: true, milestoneStatus: status, current, taskIds: ['b', 'a'] }).ok, true);
      assert.equal(runOrderLocked(status), false);
    }
    assert.equal(runOrderLocked('Building'), true);
  });

  it('refuses a list that does not match the milestone', () => {
    const current = [{ id: 'a', milestoneOrder: 0 }, { id: 'b', milestoneOrder: 1 }];
    for (const taskIds of [['a'], ['a', 'a'], ['a', 'x'], ['a', 'b', 'c']]) {
      assert.deepEqual(reorderDecision({ staff: true, milestoneStatus: 'Planning', current, taskIds }), { ok: false, reason: REORDER_MISMATCH });
    }
  });
});

describe('review tasks', () => {
  it('turns typed lines into the tasks, each with the round it starts', () => {
    const drafts = iterationTaskDrafts({
      notes: 'More space on mobile.',
      nextIteration: 3,
      appliesTo: [{ id: 't1', name: 'Review card' }],
      newTasks: ['Give the card more space', '  ', 'Full-width tap target'],
    });
    assert.deepEqual(drafts, [
      { name: 'Give the card more space', description: 'More space on mobile.', parentTaskId: null, origin: 'review', round: 3 },
      { name: 'Full-width tap target', description: 'More space on mobile.', parentTaskId: null, origin: 'review', round: 3 },
    ]);
  });

  it('still splits the notes when no line is typed, and keeps the round', () => {
    const drafts = iterationTaskDrafts({ notes: 'First.\n\nSecond.', nextIteration: 2, appliesTo: [] });
    assert.equal(drafts.length, 2);
    assert.deepEqual(drafts.map((draft) => [draft.origin, draft.round]), [['review', 2], ['review', 2]]);
  });

  it('carries the lines through the review plan', () => {
    const planned = planReview({
      actor: { source: 'portal', role: 'Warehaus Staff', email: 'staff@warehaus.studio' },
      currentIteration: 2,
      status: 'Ready to Ship',
      hasPreview: true,
      iteration: 2,
      decision: 'request_changes',
      notes: 'Tighten it.',
      existing: null,
      appliesTo: [],
      newTasks: ['One', 'Two'],
    });
    assert.equal(planned.ok, true);
    if (planned.ok && !planned.idempotent && planned.decision === 'request_changes') {
      assert.equal(planned.nextIteration, 3);
      assert.deepEqual(planned.tasks.map((task) => [task.name, task.round]), [['One', 3], ['Two', 3]]);
      assert.equal(planned.status, 'Building');
    }
  });

  it('caps the number of lines', () => {
    const many = Array.from({ length: REVIEW_TASK_LIMIT + 1 }, (_, index) => `Task ${index}`);
    assert.deepEqual(reviewTaskLines(many), { ok: false, reason: TOO_MANY_REVIEW_TASKS });
    assert.deepEqual(reviewTaskLines(['  a  ', '', 'b']), { ok: true, titles: ['a', 'b'] });
    assert.deepEqual(reviewTaskLines(undefined), { ok: true, titles: [] });
  });
});

describe('origin and source labels', () => {
  it('reads origin from the row, then from the source', () => {
    assert.equal(taskOrigin({ origin: 'brief' }), 'brief');
    assert.equal(taskOrigin({ source: 'portal-review' }), 'review');
    assert.equal(taskOrigin({ source: 'portal-milestone' }), 'manual');
    assert.equal(taskOrigin({ source: 'Client' }), null);
    assert.equal(isPortalOwnedTask({ source: 'Client', notionPageId: 'abc' }), false);
  });

  it('labels the badge and the source mark', () => {
    assert.equal(originLabel('brief'), 'Brief');
    assert.equal(originLabel('planner'), 'Planner');
    assert.equal(originLabel('manual'), 'Manual');
    assert.equal(originLabel('review', 2), 'Review 2');
    assert.equal(originLabel('review'), 'Review');
    assert.equal(originLabel(null), null);
    assert.equal(createdViaLabel('grok'), 'via Grok Bot');
    assert.equal(createdViaLabel('claude'), 'via Claude');
    assert.equal(createdViaLabel('portal'), 'via Portal');
    assert.equal(createdViaLabel('other'), null);
    assert.equal(createdViaLabel(undefined), null);
  });
});

describe('checklist', () => {
  it('reads done, in progress and to do', () => {
    assert.equal(checklistState({ status: 'Done', isDone: true }), 'done');
    assert.equal(checklistState({ status: 'To Do', isDone: false }), 'todo');
    assert.equal(checklistState({ status: 'In Progress', isDone: false }), 'progress');
    assert.equal(checklistStatusText({ status: 'in_progress', isDone: false }), 'In progress');
    assert.equal(checklistStatusText({ status: 'Blocked', isDone: false }), 'Blocked');
    assert.equal(
      checklistSummary([
        { status: 'Done', isDone: true },
        { status: 'In Progress', isDone: false },
        { status: 'To Do', isDone: false },
      ]),
      '1 done · 1 in progress',
    );
  });
});

describe('project page groups', () => {
  const list = [
    { id: 'a', status: 'Building' as const, approval: 'unreviewed' },
    { id: 'b', status: 'Ready to Ship' as const, approval: 'unreviewed' },
    { id: 'c', status: 'Shipped' as const, approval: 'approved' },
    { id: 'd', status: 'Ready to Ship' as const, approval: 'approved' },
    { id: 'e', status: 'Parked' as const, approval: 'unreviewed' },
  ];

  it('puts review first for staff and keeps the order inside a group', () => {
    const groups = groupMilestones(list, true);
    assert.deepEqual(groups.map((group) => [group.id, group.label, group.milestones.map((item) => item.id)]), [
      ['review', 'NEEDS YOUR REVIEW', ['b']],
      ['progress', 'IN PROGRESS', ['a', 'd', 'e']],
      ['shipped', 'SHIPPED', ['c']],
    ]);
  });

  it('never shows a review group to a client, and drops empty groups', () => {
    const groups = groupMilestones(list.slice(0, 2), false);
    assert.deepEqual(groups.map((group) => group.id), ['progress']);
    assert.deepEqual(groupMilestones([], true), []);
  });
});

describe('two review previews', () => {
  it('keeps local and Vercel in their own fields', () => {
    assert.deepEqual(
      reviewPreviews({
        previewUrl: 'https://warehaus-portal-git-x-warehaus-collective.vercel.app',
        localPreviewUrl: 'http://localhost:3100/',
      }),
      {
        local: 'http://localhost:3100/',
        vercel: 'https://warehaus-portal-git-x-warehaus-collective.vercel.app',
        any: true,
      },
    );
  });

  it('reads an older localhost link in previewUrl as local, and either one unlocks Approve', () => {
    assert.deepEqual(reviewPreviews({ previewUrl: 'localhost:3100/p/x' }), {
      local: 'localhost:3100/p/x',
      vercel: null,
      any: true,
    });
    assert.equal(reviewPreviews({ localPreviewUrl: 'http://localhost:3200/' }).any, true);
    assert.deepEqual(reviewPreviews({ previewUrl: '', localPreviewUrl: null }), { local: null, vercel: null, any: false });
  });
});

describe('what a client receives', () => {
  const tasks: RoadmapTaskInput[] = [
    {
      id: 't1',
      name: 'Review task',
      status: 'To Do',
      isDone: false,
      stage: 'Building',
      pullRequestUrl: null,
      parentTaskId: null,
      milestoneId: 'm1',
      milestoneOrder: 0,
      resourceCount: 0,
      publishToWarehaus: true,
      hidden: false,
      source: 'portal-review',
      origin: 'review',
      round: 2,
      portalOwned: true,
      detail: 'Staff note about the change request.',
    },
  ];

  it('never includes origin, round, ownership or detail on a task row', () => {
    const client = buildRoadmap({ audience: 'client', milestoneId: 'm1', tasks, projectVisibleToClient: true });
    const row = client.rows[0];
    assert.ok(row);
    for (const key of ['origin', 'round', 'portalOwned', 'detail', 'source', 'pullRequestUrl']) {
      assert.equal(key in row, false, key);
    }
    const staff = buildRoadmap({ audience: 'staff', milestoneId: 'm1', tasks, projectVisibleToClient: true });
    assert.equal(staff.rows[0]?.origin, 'review');
    assert.equal(staff.rows[0]?.round, 2);
    assert.equal(staff.rows[0]?.portalOwned, true);
  });

  it('never includes previews, review notes or the source mark on a milestone', () => {
    const view = {
      id: 'm1',
      note: 'Internal note',
      approval: 'changes_requested',
      localPreviewUrl: 'http://localhost:3100/',
      figmaUrl: 'https://figma.com/file/x',
      createdVia: 'grok',
      review: { previewUrl: 'https://example.vercel.app', history: [] },
    };
    const client = roadmapViewForAudience(view, 'client');
    for (const key of ['note', 'approval', 'localPreviewUrl', 'figmaUrl', 'createdVia', 'review']) {
      assert.equal(key in client, false, key);
    }
    assert.equal(roadmapViewForAudience(view, 'staff'), view);
  });
});
