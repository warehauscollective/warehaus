import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { enqueue } from '../sync/outbox';
import type { Doc } from '../_generated/dataModel';
import { createInMilestone } from '../sync/taskWrite';
import { PORTAL_MILESTONE_TASK_SOURCE } from './milestoneTasks';
import { createTask, moveStage, moveStatus, saveShipped, updateLiveFields } from '../tasks';
import { PortalAuthError } from './identity';
import { memoryCtx, type MemoryCtx, type Respond, type RunCall } from './memoryCtx.testkit';
import { seedMilestone, seedOrg, seedProject, seedTask } from './seedRows.testkit';

type Result = Record<string, unknown> & { ok: boolean; error?: string };

const EDITED = '2026-10-28T00:00:00.000Z';
const OUTBOX = 'sync/outbox:enqueue';

/** The Notion outbox answers every enqueue as queued. */
const queued: Respond = () => ({ ok: true, outboxId: 'notionOutbox:1', duplicate: false });

/** Run each nested internal mutation for real, so the outbox rows land in the ctx. */
function chain(t: MemoryCtx): Respond {
  const registry: Record<string, unknown> = {
    [OUTBOX]: enqueue,
    'sync/taskWrite:createInMilestone': createInMilestone,
  };
  const respond: Respond = (call: RunCall) => {
    const fn = registry[call.name];
    if (!fn) throw new Error(`unexpected mutation ${call.name}`);
    return t.call(fn, call.args, { respond });
  };
  return respond;
}

async function withWriteback<T>(value: string | undefined, body: () => Promise<T>): Promise<T> {
  const previous = process.env.NOTION_WRITEBACK_ENABLED;
  if (value === undefined) delete process.env.NOTION_WRITEBACK_ENABLED;
  else process.env.NOTION_WRITEBACK_ENABLED = value;
  try {
    return await body();
  } finally {
    if (previous === undefined) delete process.env.NOTION_WRITEBACK_ENABLED;
    else process.env.NOTION_WRITEBACK_ENABLED = previous;
  }
}

const outboxRuns = (t: MemoryCtx) => t.runs.filter((run) => run.name === OUTBOX);
const staffContactId = (t: MemoryCtx) => t.rows('contacts').find((row) => row.authUserId === 'auth-staff')?._id;

/** Northwind with one project whose Notion page is `notion-proj`. */
function northwind() {
  const t = memoryCtx();
  const orgId = seedOrg(t, { slug: 'northwind', companyName: 'Northwind' });
  const projectId = seedProject(t, orgId, { notionPageId: 'notion-proj', name: 'Site' });
  return { t, orgId, projectId };
}

describe('createTask project org', () => {
  it('rejects a project that belongs to another client', async () => {
    const t = memoryCtx();
    const northwindId = seedOrg(t, { slug: 'northwind' });
    const otherId = seedOrg(t, { slug: 'other' });
    seedProject(t, otherId, { notionPageId: 'notion-proj' });
    const result = await t.call<Result>(createInMilestone, {
      orgId: northwindId,
      name: 'Homepage',
      status: 'To Do',
      projectNotionId: 'notion-proj',
      externalId: 'wh_tsk_homepage',
    });
    assert.deepEqual(result, { ok: false, error: 'Project is not in this client' });
    assert.equal(t.rows('tasks').length, 0);
  });
});

describe('Portal New task', () => {
  it('lands the task on its milestone at once, with no outbox row and no Notion write', async () => {
    const { t, orgId, projectId } = northwind();
    const launch = seedMilestone(t, orgId, projectId, { status: 'Building' });
    const created = await t.call<Result>(
      createTask,
      { orgId, name: '  Homepage ', status: 'To Do', projectNotionId: 'notion-proj', externalId: 'wh_tsk_homepage', milestoneId: launch },
      { as: 'staff', respond: chain(t) },
    );
    assert.equal(created.ok, true, JSON.stringify(created));
    const task = t.row(created.taskId as string) as Doc<'tasks'>;
    assert.equal(task.milestoneId, launch);
    assert.equal(task.milestoneOrder, 0);
    assert.equal(task.name, 'Homepage');
    assert.equal(task.source, PORTAL_MILESTONE_TASK_SOURCE);
    assert.equal(task.stage, 'Building');
    assert.equal(task.publishToWarehaus, false);
    assert.equal(outboxRuns(t).length, 0);
    assert.equal(t.rows('notionOutbox').length, 0);

    const second = await t.call<Result>(
      createTask,
      { orgId, name: 'Footer', status: 'To Do', projectNotionId: 'notion-proj', externalId: 'wh_tsk_footer', milestoneId: launch },
      { as: 'staff', respond: chain(t) },
    );
    assert.equal((t.row(second.taskId as string) as Doc<'tasks'>).milestoneOrder, 1);

    const again = await t.call<Result>(
      createTask,
      { orgId, name: 'Homepage', status: 'To Do', projectNotionId: 'notion-proj', externalId: 'wh_tsk_homepage', milestoneId: launch },
      { as: 'staff', respond: chain(t) },
    );
    assert.deepEqual([again.taskId, again.duplicate], [created.taskId, true]);
    assert.equal(t.rows('tasks').length, 2);
  });

  it('refuses no milestone, another project, a Shipped milestone and an unknown status', async () => {
    const { t, orgId, projectId } = northwind();
    const otherProject = seedProject(t, orgId);
    const other = seedMilestone(t, orgId, otherProject, { status: 'Building' });
    const shippedId = seedMilestone(t, orgId, projectId, { status: 'Shipped', approval: 'approved' });
    const launch = seedMilestone(t, orgId, projectId, { status: 'Building' });
    const base = { orgId, name: 'Homepage', status: 'To Do', projectNotionId: 'notion-proj' };

    const plain = await t.call<Result>(createInMilestone, { ...base, externalId: 'wh_tsk_1' });
    assert.deepEqual(plain, { ok: false, error: 'Choose a milestone. A task only exists inside a milestone.' });
    const wrong = await t.call<Result>(createInMilestone, { ...base, externalId: 'wh_tsk_2', milestoneId: other });
    assert.deepEqual(wrong, { ok: false, error: 'Milestone is not on this project' });
    const shipped = await t.call<Result>(createInMilestone, { ...base, externalId: 'wh_tsk_3', milestoneId: shippedId });
    assert.deepEqual(shipped, { ok: false, error: 'This milestone has shipped. Add the task to a new milestone.' });
    const bad = await t.call<Result>(createInMilestone, { ...base, status: 'Nope', externalId: 'wh_tsk_4', milestoneId: launch });
    assert.equal(bad.ok, false);
    assert.equal(t.rows('tasks').length, 0);
  });
});

describe('staff stage rules', () => {
  /** A Notion task last edited at EDITED, with the given stage (none when omitted). */
  function stageWorld() {
    const { t, orgId, projectId } = northwind();
    t.actor('staff');
    let pages = 0;
    const task = (stage?: string) =>
      seedTask(t, orgId, projectId, {
        notionPageId: `page-${(pages += 1)}`,
        lastEditedTime: EDITED,
        ...(stage === undefined ? {} : { stage }),
      });
    const move = (taskId: string, stage: string) =>
      t.call<Result>(moveStage, { taskId, stage, expectedLastEditedTime: EDITED }, { as: 'staff', respond: chain(t) });
    return { t, orgId, task, move };
  }

  it('records the staff actor and contact on the outbox row', async () => {
    const { t, task, move } = stageWorld();
    const result = await withWriteback('true', () => move(task(), 'Idea'));
    assert.equal(result.ok, true);
    const [row] = t.rows('notionOutbox');
    assert.equal(row?.actor, 'staff');
    assert.equal(row?.actorId, staffContactId(t));
  });

  it('queues Idea or Planning from No stage yet and refuses every other stage', async () => {
    const { t, task, move } = stageWorld();
    await withWriteback('true', async () => {
      const parked = await move(task(), 'Parked');
      assert.equal(parked.ok, false);
      assert.equal(parked.error, 'Tasks with no stage can move to Idea or Planning.');
      const unknown = await move(task('Brainstorm'), 'Awaiting Go');
      assert.equal(unknown.ok, false);
      const planning = await move(task(), 'Planning');
      assert.equal(planning.ok, true);
      const filed = await move(task('Idea'), 'Parked');
      assert.equal(filed.ok, true);
      assert.equal(t.rows('notionOutbox').length, 2);
    });
  });

  it('lets staff enter and leave Building and still refuses Shipped', async () => {
    const { t, task, move } = stageWorld();
    await withWriteback('true', async () => {
      assert.equal((await move(task('Idea'), 'Building')).ok, true);
      assert.equal((await move(task('Building'), 'Idea')).ok, true);
      const intoShipped = await move(task('Planning'), 'Shipped');
      assert.equal(intoShipped.ok, false);
      assert.match(String(intoShipped.error), /merged into main/);
      const outOfShipped = await move(task('Shipped'), 'Planning');
      assert.equal(outOfShipped.ok, false);
      assert.match(String(outOfShipped.error), /Leaving Shipped stays locked/);
      assert.equal(t.rows('notionOutbox').length, 2);
    });
  });

  it('stores the actor argument on the outbox row', async () => {
    const { t, orgId } = northwind();
    const args = {
      idempotencyKey: `task-stage:page-1:Idea::${EDITED}`,
      kind: 'task-stage',
      orgId,
      database: 'tasks',
      notionPageId: 'page-1',
      expectedLastEditedTime: EDITED,
      payload: JSON.stringify({ properties: { Stage: 'Idea' } }),
      actorId: 'contact-staff',
      schedule: false,
    };
    await withWriteback('true', async () => {
      const staff = await t.call<Result>(enqueue, { ...args, actor: 'staff' });
      assert.equal(staff.ok, true);
      const rows = t.rows('notionOutbox');
      assert.equal(rows.length, 1);
      assert.equal(rows[0]?.actor, 'staff');
      assert.equal(rows[0]?.actorId, 'contact-staff');

      const client = await t.call<Result>(enqueue, { ...args, idempotencyKey: 'other', actor: 'clientAdmin' });
      assert.equal(client.ok, false);
      assert.equal(t.rows('notionOutbox').length, 1);
    });
  });
});

describe('move authorization', () => {
  /** A Northwind task at stage Idea, and the Warehaus staff contact that moves it. */
  function moveWorld() {
    const { t, orgId, projectId } = northwind();
    t.actor('staff');
    const taskId = seedTask(t, orgId, projectId, { notionPageId: 'page-north', stage: 'Idea', lastEditedTime: EDITED });
    return { t, orgId, taskId };
  }

  it('rejects a missing task before any outbox insert', async () => {
    const { t } = northwind();
    t.actor('staff');
    const options = { as: 'staff' as const, respond: chain(t) };
    const statusMissing = await t.call<Result>(moveStatus, { taskId: 'tasks:999', status: 'To Do', expectedLastEditedTime: EDITED }, options);
    assert.equal(statusMissing.error, 'Task not found');
    const stageMissing = await t.call<Result>(moveStage, { taskId: 'tasks:999', stage: 'Idea', expectedLastEditedTime: EDITED }, options);
    assert.equal(stageMissing.error, 'Task not found');
    assert.equal(t.rows('notionOutbox').length, 0);
  });

  it('lets Warehaus studio staff past auth, then write-back off saves in the portal and queues nothing', async () => {
    const { t, taskId } = moveWorld();
    await withWriteback(undefined, async () => {
      const options = { as: 'staff' as const, respond: chain(t) };
      const status = await t.call<Result>(moveStatus, { taskId, status: 'In Progress', expectedLastEditedTime: EDITED }, options);
      assert.deepEqual(status, { ok: true, wrote: true, notion: 'off', outboxIds: [] });
      const stage = await t.call<Result>(moveStage, { taskId, stage: 'Planning', expectedLastEditedTime: EDITED }, options);
      assert.deepEqual(stage, { ok: true, wrote: true, notion: 'off', outboxIds: [] });
    });
    assert.equal(t.row(taskId)?.status, 'In Progress');
    assert.equal(t.row(taskId)?.stage, 'Planning');
    assert.equal(t.row(taskId)?.stagePendingAt, undefined, 'nothing is pending when nothing was queued');
    assert.equal(t.rows('notionOutbox').length, 0);
    assert.deepEqual(t.scheduled, []);
  });

  it('refuses a staff move against a stale last edit time and writes nothing', async () => {
    const { t, taskId } = moveWorld();
    await withWriteback('true', async () => {
      const options = { as: 'staff' as const, respond: chain(t) };
      const status = await t.call<Result>(moveStatus, { taskId, status: 'In Progress', expectedLastEditedTime: '2026-10-01T00:00:00.000Z' }, options);
      assert.equal(status.ok, false);
      assert.equal(status.code, 'stale');
    });
    assert.equal(t.row(taskId)?.status, 'To Do');
    assert.equal(t.rows('notionOutbox').length, 0);
  });

  it('saves a verified Shipped and queues the stage with its pull request link', async () => {
    const { t, taskId } = moveWorld();
    const link = 'https://github.com/warehauscollective/warehaus/pull/171';
    await withWriteback('true', async () => {
      const result = await t.call<Result>(
        saveShipped,
        { taskId, pullRequestLink: link, expectedLastEditedTime: EDITED, actorId: 'contacts:staff' },
        { respond: chain(t) },
      );
      assert.equal(result.notion, 'queued');
    });
    assert.equal(t.row(taskId)?.stage, 'Shipped');
    assert.equal(t.row(taskId)?.stagePendingPullRequest, link);
    const [row] = t.rows('notionOutbox');
    assert.equal(row?.kind, 'task-stage');
    assert.deepEqual(JSON.parse(String(row?.payload)).properties, { Stage: 'Shipped', 'GitHub Issue/PR': link });
  });

  it('files a flag-on cross-org move under the task org', async () => {
    const { t, orgId, taskId } = moveWorld();
    const studioId = t.rows('clients').find((row) => row.slug === 'warehaus')?._id;
    await withWriteback('true', async () => {
      const options = { as: 'staff' as const, respond: chain(t) };
      const status = await t.call<Result>(moveStatus, { taskId, status: 'In Progress', expectedLastEditedTime: EDITED }, options);
      assert.equal(status.ok, true);
      const stage = await t.call<Result>(moveStage, { taskId, stage: 'Planning', expectedLastEditedTime: EDITED }, options);
      assert.equal(stage.ok, true);
    });
    assert.equal(t.row(taskId)?.orgId, orgId);
    const inserted = t.rows('notionOutbox');
    assert.equal(inserted.length, 2);
    assert.deepEqual(
      inserted.map((row) => row.orgId),
      [orgId, orgId],
    );
    assert.equal(inserted.some((row) => row.orgId === studioId), false);
    assert.deepEqual(
      inserted.map((row) => row.kind),
      ['task-status', 'task-stage'],
    );
    assert.equal(inserted.every((row) => row.actorId === staffContactId(t)), true);
  });

  it('rejects a client caller at adminMutation and does not enqueue', async () => {
    const { t, taskId } = moveWorld();
    t.actor('client');
    const before = ['tasks', 'notionOutbox'].map((table) => t.rows(table));
    const args = { taskId, expectedLastEditedTime: EDITED };
    const asClient = { as: 'client' as const, respond: queued };
    const staffOnly = (err: unknown) => {
      assert.ok(err instanceof PortalAuthError);
      assert.equal(err.message, 'Staff role required');
      return true;
    };
    await assert.rejects(t.call(moveStatus, { ...args, status: 'To Do' }, asClient), staffOnly);
    await assert.rejects(t.call(moveStage, { ...args, stage: 'Idea' }, asClient), staffOnly);
    await assert.rejects(t.call(updateLiveFields, { ...args, estimate: 'M' }, asClient), staffOnly);
    assert.equal(t.runs.length, 0);
    assert.deepEqual(
      ['tasks', 'notionOutbox'].map((table) => t.rows(table)),
      before,
    );
  });
});
