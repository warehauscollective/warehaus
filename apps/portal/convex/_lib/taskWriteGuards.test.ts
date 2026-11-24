import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { WRITEBACK_OFF_ERROR } from '@warehaus/portal-sync';
import { enqueue } from '../sync/outbox';
import { enqueueCreate, enqueueStage, enqueueStatus } from '../sync/taskWrite';
import { createTask, moveStage, moveStatus, updateLiveFields } from '../tasks';
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
    'sync/taskWrite:enqueueStatus': enqueueStatus,
    'sync/taskWrite:enqueueStage': enqueueStage,
    [OUTBOX]: enqueue,
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
    const result = await t.call<Result>(
      enqueueCreate,
      { orgId: northwindId, name: 'Homepage', status: 'To Do', projectNotionId: 'notion-proj', externalId: 'wh_tsk_homepage' },
      { respond: queued },
    );
    assert.deepEqual(result, { ok: false, error: 'Project is not in this client' });
    assert.equal(t.runs.length, 0);
  });

  it('queues a create when the project belongs to the org', async () => {
    const { t, orgId, projectId } = northwind();
    const milestoneId = seedMilestone(t, orgId, projectId, { status: 'Building' });
    const result = await t.call<Result>(
      enqueueCreate,
      {
        orgId,
        name: 'Homepage',
        status: 'To Do',
        projectNotionId: 'notion-proj',
        externalId: 'wh_tsk_homepage',
        milestoneId,
        actorId: 'contact-staff',
      },
      { respond: queued },
    );
    assert.equal(result.ok, true);
    assert.equal(t.runs.length, 1);
    assert.equal(t.runs[0]?.name, OUTBOX);
    assert.equal(t.runs[0]?.args.actor, 'staff');
    assert.equal(t.runs[0]?.args.orgId, orgId);
  });

  it('forwards milestoneId from createTask into the outbox payload', async () => {
    const { t, orgId, projectId } = northwind();
    const launch = seedMilestone(t, orgId, projectId, { status: 'Building' });
    const otherProject = seedProject(t, orgId);
    const other = seedMilestone(t, orgId, otherProject, { status: 'Building' });
    const shippedId = seedMilestone(t, orgId, projectId, { status: 'Shipped', approval: 'approved' });

    const created = await t.call<Result>(
      createTask,
      { orgId, name: 'Homepage', status: 'To Do', projectNotionId: 'notion-proj', externalId: 'wh_tsk_homepage', milestoneId: launch },
      { as: 'staff', respond: queued },
    );
    assert.equal(created.ok, true);
    assert.equal(t.runs[0]?.name, 'sync/taskWrite:enqueueCreate');
    assert.equal(t.runs[0]?.args.milestoneId, launch);
    assert.equal(t.runs[0]?.args.actorId, staffContactId(t));

    const base = { orgId, name: 'Homepage', status: 'To Do', projectNotionId: 'notion-proj' };
    const accepted = await t.call<Result>(
      enqueueCreate,
      { ...base, externalId: 'wh_tsk_homepage', milestoneId: launch, actorId: 'contact-staff' },
      { respond: queued },
    );
    assert.equal(accepted.ok, true);
    assert.equal(outboxRuns(t).length, 1);
    const payload = JSON.parse(String(outboxRuns(t)[0]?.args.payload ?? '{}')) as { properties?: object; milestoneId?: string };
    assert.equal(payload.milestoneId, launch);
    assert.equal(typeof payload.properties, 'object');

    const rejected = await t.call<Result>(enqueueCreate, { ...base, externalId: 'wh_tsk_homepage_2', milestoneId: other }, { respond: queued });
    assert.deepEqual(rejected, { ok: false, error: 'Milestone is not on this project' });
    assert.equal(outboxRuns(t).length, 1);

    const plain = await t.call<Result>(enqueueCreate, { ...base, externalId: 'wh_tsk_homepage_3' }, { respond: queued });
    // No milestone: nothing is queued. A task only exists inside a milestone.
    assert.deepEqual(plain, { ok: false, error: 'Choose a milestone. A task only exists inside a milestone.' });
    assert.equal(outboxRuns(t).length, 1);

    const shipped = await t.call<Result>(enqueueCreate, { ...base, externalId: 'wh_tsk_homepage_4', milestoneId: shippedId }, { respond: queued });
    assert.deepEqual(shipped, { ok: false, error: 'This milestone has shipped. Add the task to a new milestone.' });
    assert.equal(outboxRuns(t).length, 1);
  });
});

describe('enqueueStage actor', () => {
  /** A Notion task last edited at EDITED, with the given stage (none when omitted). */
  function stageWorld() {
    const { t, orgId, projectId } = northwind();
    const task = (stage?: string) =>
      seedTask(t, orgId, projectId, { lastEditedTime: EDITED, ...(stage === undefined ? {} : { stage }) });
    return { t, orgId, task };
  }
  const base = { expectedLastEditedTime: EDITED, actor: 'staff' as const, actorId: 'contact-staff' };

  it('records the staff actor and actor id on the outbox call', async () => {
    const { t, task } = stageWorld();
    const taskId = task();
    const result = await withWriteback('true', () => t.call<Result>(enqueueStage, { ...base, taskId, stage: 'Idea' }, { respond: queued }));
    assert.equal(result.ok, true);
    assert.equal(t.runs[0]?.name, OUTBOX);
    assert.equal(t.runs[0]?.args.actor, 'staff');
    assert.equal(t.runs[0]?.args.actorId, 'contact-staff');
  });

  it('does not queue a row when the actor is a client', async () => {
    const { t, task } = stageWorld();
    const taskId = task();
    const before = t.row(taskId);
    const result = await t.call<Result>(
      enqueueStage,
      { ...base, taskId, stage: 'Idea', actor: 'client', actorId: 'contact-client' },
      { respond: queued },
    );
    assert.equal(result.ok, false);
    assert.equal(t.runs.length, 0);
    assert.deepEqual(t.row(taskId), before);
  });

  it('queues Idea or Planning from No stage yet and refuses every other stage', async () => {
    const { t, task } = stageWorld();
    await withWriteback('true', async () => {
      const call = (taskId: string, stage: string) => t.call<Result>(enqueueStage, { ...base, taskId, stage }, { respond: queued });
      const parked = await call(task(), 'Parked');
      assert.deepEqual(parked, { ok: false, error: 'Tasks with no stage can move to Idea or Planning.' });
      const unknown = await call(task('Brainstorm'), 'Awaiting Go');
      assert.equal(unknown.ok, false);
      const planning = await call(task(), 'Planning');
      assert.equal(planning.ok, true);
      const filed = await call(task('Idea'), 'Parked');
      assert.equal(filed.ok, true);
      assert.equal(outboxRuns(t).length, 2);
    });
  });

  it('lets staff enter and leave Building and still refuses Shipped', async () => {
    const { t, task } = stageWorld();
    await withWriteback('true', async () => {
      const call = (from: string, stage: string) => t.call<Result>(enqueueStage, { ...base, taskId: task(from), stage }, { respond: queued });
      const intoBuilding = await call('Idea', 'Building');
      assert.equal(intoBuilding.ok, true);
      const outOfBuilding = await call('Building', 'Idea');
      assert.equal(outOfBuilding.ok, true);
      const intoShipped = await call('Planning', 'Shipped');
      assert.equal(intoShipped.ok, false);
      assert.match(intoShipped.error ?? '', /merged into main/);
      const outOfShipped = await call('Shipped', 'Planning');
      assert.equal(outOfShipped.ok, false);
      assert.match(outOfShipped.error ?? '', /Leaving Shipped stays locked/);
      assert.equal(outboxRuns(t).length, 2);
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
    const statusMissing = await t.call<Result>(
      enqueueStatus,
      { taskId: 'tasks:999', status: 'To Do', expectedLastEditedTime: EDITED },
      { respond: queued },
    );
    assert.deepEqual(statusMissing, { ok: false, error: 'Task not found' });
    const stageMissing = await t.call<Result>(
      enqueueStage,
      { taskId: 'tasks:999', stage: 'Idea', expectedLastEditedTime: EDITED, actor: 'staff' },
      { respond: queued },
    );
    assert.deepEqual(stageMissing, { ok: false, error: 'Task not found' });
    assert.equal(t.runs.length, 0);
    assert.equal(t.rows('notionOutbox').length, 0);
  });

  it('lets Warehaus studio staff past auth, then write-back off writes nothing', async () => {
    const { t, taskId } = moveWorld();
    await withWriteback(undefined, async () => {
      const options = { as: 'staff' as const, respond: chain(t) };
      const status = await t.call<Result>(moveStatus, { taskId, status: 'To Do', expectedLastEditedTime: EDITED }, options);
      assert.deepEqual(status, { ok: false, error: WRITEBACK_OFF_ERROR });
      const stage = await t.call<Result>(moveStage, { taskId, stage: 'Planning', expectedLastEditedTime: EDITED }, options);
      assert.deepEqual(stage, { ok: false, error: WRITEBACK_OFF_ERROR });
    });
    // The status move reached the real outbox, which refused it.
    assert.equal(outboxRuns(t).length, 1);
    assert.equal(t.row(taskId)?.stage, 'Idea');
    assert.equal(t.row(taskId)?.stagePendingAt, undefined);
    assert.equal(t.rows('notionOutbox').length, 0);
  });

  it('files a flag-on cross-org move under the task org', async () => {
    const { t, orgId, taskId } = moveWorld();
    const studioId = t.rows('clients').find((row) => row.slug === 'warehaus')?._id;
    await withWriteback('true', async () => {
      const options = { as: 'staff' as const, respond: chain(t) };
      const status = await t.call<Result>(moveStatus, { taskId, status: 'To Do', expectedLastEditedTime: EDITED }, options);
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
