import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import schema from '../schema';
import { applyOutcome, enqueue } from '../sync/outbox';
import { processDue } from '../sync/outboxWork';
import { DRAIN_PENDING_TAKE, drainPendingStages } from '../sync/taskWrite';
import { upsertTask } from '../sync/upsert';
import { detachTask } from '../milestones';
import { moveStage, moveStatus, saveShipped, updateLiveFields } from '../tasks';
import { memoryCtx, type CallOptions, type MemoryCtx, type Respond } from './memoryCtx.testkit';
import { seedMilestone, seedOrg, seedProject, seedTask } from './seedRows.testkit';

type Fields = Record<string, unknown>;
type Result = Record<string, unknown> & { ok?: boolean };

const TIME = '2026-10-28T00:00:00.000Z';
const NEWER = '2026-10-29T00:00:00.000Z';
const STALE = '2026-10-01T00:00:00.000Z';
const SECRET_PR = 'https://github.com/warehaus/secret/pull/1';

async function withFlag(on: boolean, fn: () => Promise<void>) {
  await withFlagValue(on ? 'true' : undefined, fn);
}

async function withFlagValue(flag: string | undefined, fn: () => Promise<void>) {
  const previous = process.env.NOTION_WRITEBACK_ENABLED;
  if (flag === undefined) delete process.env.NOTION_WRITEBACK_ENABLED;
  else process.env.NOTION_WRITEBACK_ENABLED = flag;
  try {
    await fn();
  } finally {
    if (previous === undefined) delete process.env.NOTION_WRITEBACK_ENABLED;
    else process.env.NOTION_WRITEBACK_ENABLED = previous;
  }
}

/** Every row of every table, to prove a call wrote nothing. */
const everything = (t: MemoryCtx) =>
  Object.keys((schema as unknown as { tables: Record<string, unknown> }).tables).map((table) => t.rows(table));

/**
 * An org and project on a fresh in-memory ctx. `call` runs a handler and lets
 * its `runMutation(internal.sync.outbox.enqueue)` really run, as Convex does.
 */
function world() {
  const t = memoryCtx();
  const orgId = seedOrg(t);
  const projectId = seedProject(t, orgId);
  let keys = 0;
  const respond: Respond = (run) => (run.name === 'sync/outbox:enqueue' ? t.call(enqueue, run.args) : undefined);
  return {
    t,
    orgId,
    projectId,
    respond,
    call: (fn: unknown, args: Fields, options: CallOptions = { respond }) => t.call<Result>(fn, args, options),
    task: (extra: Fields = {}) =>
      seedTask(t, orgId, projectId, {
        notionPageId: 'page-1',
        name: 'Homepage',
        status: 'Inbox',
        isDone: false,
        publishToWarehaus: true,
        lastSyncedAt: 1,
        stage: 'Idea',
        lastEditedTime: TIME,
        pullRequestUrl: SECRET_PR,
        ...extra,
      }),
    outbox: (fields: Fields = {}) =>
      t.seed('notionOutbox', {
        idempotencyKey: `seed-${(keys += 1)}`,
        kind: 'task-stage',
        orgId,
        database: 'tasks',
        notionPageId: 'page-1',
        payload: JSON.stringify({ properties: { Stage: 'Planning' } }),
        actor: 'staff',
        status: 'inflight',
        attempts: 1,
        nextAttemptAt: 1,
        createdAt: 1,
        ...fields,
      }),
    outboxRows: () => t.rows('notionOutbox'),
  };
}

describe('staff stage and status save', () => {
  const staffCall = (w: ReturnType<typeof world>, fn: unknown, args: Fields) => {
    w.t.actor('staff');
    return w.call(fn, args, { as: 'staff', respond: w.respond });
  };

  it('saves a flag-off stage move in the portal with no pending mark and no outbox row', async () => {
    const w = world();
    const taskId = w.task();
    await withFlag(false, async () => {
      const result = await staffCall(w, moveStage, { taskId, stage: 'Planning', expectedLastEditedTime: TIME });
      assert.deepEqual(result, { ok: true, wrote: true, notion: 'off', outboxIds: [] });
      const row = w.t.row(taskId);
      assert.equal(row?.stage, 'Planning');
      assert.equal(row?.stagePendingAt, undefined);
      assert.equal(row?.stageSynced, undefined);
      assert.equal(row?.lastEditedTime, TIME);
      assert.equal(row?.pullRequestUrl, SECRET_PR);
      assert.equal(w.outboxRows().length, 0);
    });
  });

  it('saves a flag-off status move and schedules nothing', async () => {
    const w = world();
    const taskId = w.task();
    await withFlag(false, async () => {
      const result = await staffCall(w, moveStatus, { taskId, status: 'To Do', expectedLastEditedTime: TIME });
      assert.deepEqual(result, { ok: true, wrote: true, notion: 'off', outboxIds: [] });
      assert.equal(w.t.row(taskId)?.status, 'To Do');
      assert.equal(w.outboxRows().length, 0);
      assert.equal(w.t.scheduled.length, 0);
    });
  });

  it('refuses a stage move against a stale read and writes nothing', async () => {
    const w = world();
    const taskId = w.task();
    w.t.actor('staff');
    const before = everything(w.t);
    await withFlag(true, async () => {
      const result = await staffCall(w, moveStage, { taskId, stage: 'Planning', expectedLastEditedTime: STALE });
      assert.equal(result.ok, false);
      assert.equal(result.code, 'stale');
      assert.deepEqual(everything(w.t), before);
    });
  });

  it('saves live fields in the portal and queues nothing when the flag is not exactly true', async () => {
    for (const flag of [undefined, 'TRUE', 'false', '1']) {
      const w = world();
      w.t.actor('staff');
      const taskId = w.task({ estimate: 'S', priority: 'Low', source: 'portal', publishToWarehaus: true });
      await withFlagValue(flag, async () => {
        const result = await w.call(
          updateLiveFields,
          { taskId, estimate: 'M', priority: 'High', source: 'notion-ui', publishToWarehaus: false, expectedLastEditedTime: TIME },
          { as: 'staff', respond: w.respond },
        );
        assert.deepEqual(result, { ok: true, wrote: true, notion: 'off', outboxIds: [] });
        const row = w.t.row(taskId);
        assert.deepEqual([row?.estimate, row?.priority, row?.source, row?.publishToWarehaus], ['M', 'High', 'notion-ui', false]);
        assert.equal(w.outboxRows().length, 0);
      });
    }
  });

  it('saves Estimate, Priority, Source and publish, stamps them, and queues one task-fields row', async () => {
    const w = world();
    w.t.actor('staff');
    const staffId = String(w.t.rows('contacts').find((row) => row.authUserId === 'auth-staff')?._id);
    const taskId = w.task({ estimate: 'S', priority: 'Low', source: 'portal', publishToWarehaus: true });
    await withFlag(true, async () => {
      const result = await w.call(
        updateLiveFields,
        { taskId, estimate: 'M', priority: 'High', source: 'arc', publishToWarehaus: false, expectedLastEditedTime: TIME },
        { as: 'staff', respond: w.respond },
      );
      assert.equal(result.ok, true);
      assert.equal(result.notion, 'queued');
      assert.equal(w.outboxRows().length, 1);
      const queued = w.outboxRows()[0];
      assert.deepEqual(result.outboxIds, [queued?._id]);
      assert.equal(queued?.kind, 'task-fields');
      assert.equal(queued?.database, 'tasks');
      assert.equal(queued?.notionPageId, 'page-1');
      assert.equal(queued?.expectedLastEditedTime, TIME);
      assert.equal(queued?.actor, 'staff');
      assert.equal(queued?.actorId, staffId);
      assert.deepEqual(JSON.parse(String(queued?.payload)).properties, {
        Estimate: 'M',
        Priority: 'High',
        Source: 'arc',
        'Publish to Warehaus': false,
      });
      const row = w.t.row(taskId);
      assert.deepEqual([row?.estimate, row?.priority, row?.source, row?.publishToWarehaus], ['M', 'High', 'arc', false]);
      assert.equal(row?.lastEditedTime, TIME);
      const stamps = row?.fieldStamps as Record<string, { updatedBy: string }>;
      assert.deepEqual(
        ['estimate', 'priority', 'source', 'publishToWarehaus'].map((field) => stamps[field]?.updatedBy),
        [staffId, staffId, staffId, staffId],
      );
    });
  });

  it('queues a single cleared estimate and refuses an unknown source', async () => {
    const w = world();
    w.t.actor('staff');
    const taskId = w.task({ estimate: 'S', publishToWarehaus: false });
    const staff: CallOptions = { as: 'staff', respond: w.respond };
    await withFlag(true, async () => {
      const cleared = await w.call(updateLiveFields, { taskId, estimate: null, expectedLastEditedTime: TIME }, staff);
      assert.equal(cleared.ok, true);
      assert.deepEqual(JSON.parse(String(w.outboxRows()[0]?.payload)).properties, { Estimate: null });
      const rejected = await w.call(updateLiveFields, { taskId, source: 'notion', expectedLastEditedTime: TIME }, staff);
      assert.equal(rejected.ok, false);
      assert.equal(rejected.error, 'Unknown source');
      const status = await w.call(enqueue, {
        idempotencyKey: 'task-fields:status',
        kind: 'task-fields',
        orgId: w.orgId,
        database: 'tasks',
        notionPageId: 'page-1',
        expectedLastEditedTime: TIME,
        payload: JSON.stringify({ properties: { Status: 'Done' } }),
        actor: 'staff',
        schedule: false,
      });
      assert.equal(status.ok, false);
      assert.equal(w.outboxRows().length, 1);
      assert.equal(w.t.row(taskId)?.estimate, undefined, 'the cleared estimate was saved');
      assert.equal(w.t.row(taskId)?.source, undefined, 'the refused source was not');
    });
  });

  it('saves, marks pending, and inserts one task-stage row with the existing key when the flag is on', async () => {
    const w = world();
    const taskId = w.task();
    await withFlag(true, async () => {
      const result = await staffCall(w, moveStage, { taskId, stage: 'Planning', expectedLastEditedTime: TIME });
      assert.equal(result.ok, true);
      assert.equal(result.notion, 'queued');
      assert.equal(w.outboxRows().length, 1);
      const queued = w.outboxRows()[0];
      assert.deepEqual(result.outboxIds, [queued?._id]);
      assert.equal(queued?.kind, 'task-stage');
      assert.equal(queued?.idempotencyKey, `task-stage:page-1:Planning::${TIME}`);
      assert.equal(queued?.expectedLastEditedTime, TIME);
      assert.match(String(queued?.payload), /"Stage":"Planning"/);
      const row = w.t.row(taskId);
      assert.equal(row?.stage, 'Planning');
      assert.equal(row?.stageSynced, 'Idea');
      assert.equal(typeof row?.stagePendingAt, 'number');
      assert.equal(row?.stagePendingBaseEditedTime, TIME);
      assert.equal(row?.pullRequestUrl, SECRET_PR);
      assert.deepEqual(
        w.t.scheduled.map((call) => [call.name, call.args.id]),
        [['sync/outboxWork:processOne', queued?._id]],
      );
    });
  });

  it('clears pending and leaves no row when Undo returns to stageSynced', async () => {
    const w = world();
    const taskId = w.task();
    await withFlag(true, async () => {
      await staffCall(w, moveStage, { taskId, stage: 'Planning', expectedLastEditedTime: TIME });
      assert.equal(w.outboxRows().length, 1);
      const undone = await staffCall(w, moveStage, { taskId, stage: 'Idea', expectedLastEditedTime: TIME });
      assert.deepEqual(undone, { ok: true, wrote: true, notion: 'portal', outboxIds: [] });
      const row = w.t.row(taskId);
      assert.equal(row?.stage, 'Idea');
      assert.equal(row?.stagePendingAt, undefined);
      assert.equal(row?.stagePendingBaseEditedTime, undefined);
      assert.equal(row?.stagePendingPullRequest, undefined);
      assert.equal(w.outboxRows().length, 0);
    });
  });

  it('refuses unverified Shipped and an unstaged move outside Idea or Planning, writing nothing', async () => {
    const w = world();
    const shipped = w.task();
    const unstaged = w.task({ notionPageId: 'page-3', stage: undefined });
    w.t.actor('staff');
    const before = everything(w.t);
    await withFlag(true, async () => {
      const intoShipped = await staffCall(w, moveStage, { taskId: shipped, stage: 'Shipped', pullRequestLink: SECRET_PR, expectedLastEditedTime: TIME });
      const parked = await staffCall(w, moveStage, { taskId: unstaged, stage: 'Parked', expectedLastEditedTime: TIME });
      assert.equal(intoShipped.ok, false);
      assert.equal(parked.ok, false);
      assert.deepEqual(everything(w.t), before);
    });
  });

  it('queues Shipped once saveShipped carries the verified merge', async () => {
    const w = world();
    const taskId = w.task();
    await withFlag(true, async () => {
      const verified = await w.call(saveShipped, {
        taskId,
        pullRequestLink: SECRET_PR,
        expectedLastEditedTime: TIME,
        actorId: 'contact-staff',
      });
      assert.equal(verified.ok, true);
      const stored = JSON.parse(String(w.outboxRows()[0]?.payload)) as { properties: { Stage: string } };
      assert.equal(stored.properties.Stage, 'Shipped');
      assert.equal(w.outboxRows()[0]?.kind, 'task-stage');
      assert.equal(w.t.row(taskId)?.stagePendingBy, 'contact-staff');
    });
  });
});

describe('upsert pulled stage', () => {
  function pendingTask(w: ReturnType<typeof world>) {
    return w.task({
      stage: 'Planning',
      stageSynced: 'Idea',
      stagePendingAt: 50,
      stagePendingBaseEditedTime: TIME,
      lastEditedTime: TIME,
    });
  }

  function pull(w: ReturnType<typeof world>, extra: Fields = {}) {
    return {
      notionPageId: 'page-1',
      orgId: w.orgId,
      projectId: w.projectId,
      name: 'Homepage',
      status: 'To Do',
      isDone: false,
      publishToWarehaus: true,
      stage: 'Idea',
      lastEditedTime: TIME,
      ...extra,
    };
  }

  const notices = (t: MemoryCtx) => t.runs.filter((run) => run.name === 'invitesSync:recordStaffNotice');

  it('keeps the local stage when Notion time matches and the stage is old', async () => {
    const w = world();
    const taskId = pendingTask(w);
    w.outbox({ status: 'queued' });
    await w.call(upsertTask, pull(w, { name: 'Homepage renamed' }), { respond: () => ({ inserted: true }) });
    const row = w.t.row(taskId);
    assert.equal(row?.stage, 'Planning');
    assert.equal(row?.stageSynced, 'Idea');
    assert.equal(row?.stagePendingAt, 50);
    assert.equal(row?.name, 'Homepage renamed');
    assert.equal(row?.status, 'To Do');
    assert.equal(row?.lastEditedTime, TIME);
    assert.equal(w.outboxRows().length, 1);
    assert.equal(notices(w.t).length, 0);
  });

  it('takes a newer different Notion stage and clears pending', async () => {
    const w = world();
    const taskId = pendingTask(w);
    const ids: Record<string, string> = {};
    for (const status of ['queued', 'failed', 'inflight', 'done']) ids[status] = w.outbox({ status });
    await w.call(upsertTask, pull(w, { stage: 'Parked', lastEditedTime: NEWER }), { respond: () => ({ inserted: true }) });
    const row = w.t.row(taskId);
    assert.equal(row?.stage, 'Parked');
    assert.equal(row?.stageSynced, 'Parked');
    assert.equal(row?.stagePendingAt, undefined);
    assert.equal(row?.stagePendingBaseEditedTime, undefined);
    assert.equal(row?.lastEditedTime, NEWER);
    assert.deepEqual(w.outboxRows().map((item) => item._id).sort(), [ids.done, ids.inflight].sort());
    assert.deepEqual(w.outboxRows().map((item) => item.status).sort(), ['done', 'inflight']);
    const sent = notices(w.t);
    assert.equal(sent.length, 1);
    assert.equal(sent[0]?.args.edgeCase, 'stage-superseded:page-1');
    assert.equal(sent[0]?.args.message, 'Homepage stage in Notion changed to Parked after a portal move to Planning.');
  });

  it('keeps the local stage and bumps the base when a newer pull still matches stageSynced', async () => {
    const w = world();
    const taskId = pendingTask(w);
    w.outbox({ status: 'queued' });
    const inflight = w.outbox({ status: 'inflight' });
    await w.call(upsertTask, pull(w, { stage: 'Idea', lastEditedTime: NEWER }), {
      respond: () => {
        throw new Error('no notice');
      },
    });
    const row = w.t.row(taskId);
    assert.equal(row?.stage, 'Planning');
    assert.equal(row?.stageSynced, 'Idea');
    assert.equal(row?.stagePendingAt, 50);
    assert.equal(row?.stagePendingBaseEditedTime, NEWER);
    assert.equal(row?.lastEditedTime, NEWER);
    assert.deepEqual(w.outboxRows().map((item) => item._id), [inflight]);
    assert.equal(w.t.runs.length, 0);
  });
});

describe('drain pending stages', () => {
  const pending = { stage: 'Planning', stagePendingAt: 10, stagePendingBaseEditedTime: TIME, stageSynced: 'Idea' };

  it('inserts nothing when the flag is off', async () => {
    const w = world();
    w.task(pending);
    await withFlag(false, async () => {
      const result = await w.call(drainPendingStages, {});
      assert.deepEqual(result, { inserted: 0, reused: 0 });
      assert.equal(w.outboxRows().length, 0);
    });
  });

  it('inserts one row per pending task and reuses it on the next drain', async () => {
    const w = world();
    w.task(pending);
    await withFlag(true, async () => {
      const first = await w.call(drainPendingStages, {});
      assert.equal(first.inserted, 1);
      assert.equal(first.reused, 0);
      assert.equal(w.outboxRows().length, 1);
      assert.equal(w.outboxRows()[0]?.idempotencyKey, `task-stage:page-1:Planning::${TIME}`);
      assert.equal(w.outboxRows()[0]?.actorId, undefined);
      const second = await w.call(drainPendingStages, {});
      assert.equal(second.inserted, 0);
      assert.equal(second.reused, 1);
      assert.equal(w.outboxRows().length, 1);
      assert.equal(w.outboxRows()[0]?.status, 'queued');
    });
  });

  it('reads only pending tasks, oldest first, through an index and a cap', async () => {
    const w = world();
    w.task();
    w.task({ ...pending, stagePendingAt: 30, notionPageId: 'page-new' });
    w.task({ ...pending, stagePendingAt: 20, notionPageId: 'page-old' });
    await withFlag(true, async () => {
      w.t.reads.reset();
      const result = await w.call(drainPendingStages, {});
      assert.equal(result.inserted, 2);
      const taskReads = w.t.reads.all.filter((read) => read.table === 'tasks');
      assert.deepEqual(taskReads, [{ table: 'tasks', index: 'by_stagePendingAt', eq: [], terminal: 'take', limit: DRAIN_PENDING_TAKE }]);
      // Only the task read is checked: clearing a page's unsent stage rows
      // still collects its outbox rows (deleteUnsentTaskStageRows), left for
      // the Bounded reads milestone.
      assert.deepEqual(w.t.reads.unindexed(), []);
      assert.deepEqual(
        w.outboxRows().map((row) => row.notionPageId),
        ['page-old', 'page-new'],
      );
    });
  });

  it('does not drain a stage saved while write-back was off', async () => {
    const w = world();
    const taskId = w.task();
    await withFlag(false, async () => {
      w.t.actor('staff');
      await w.call(moveStage, { taskId, stage: 'Planning', expectedLastEditedTime: TIME }, { as: 'staff', respond: w.respond });
      assert.equal(w.t.row(taskId)?.stage, 'Planning');
      assert.equal(w.t.row(taskId)?.stagePendingAt, undefined);
      assert.equal(w.outboxRows().length, 0);
    });
    await withFlag(true, async () => {
      const drained = await w.call(drainPendingStages, {});
      assert.equal(drained.inserted, 0);
      assert.equal(w.outboxRows().length, 0);
    });
  });

  it('does not drain from processDue while write-back is off', async () => {
    const w = world();
    await withFlag(false, async () => {
      const result = await w.call(processDue, {}, {
        respond: (run) => {
          throw new Error(run.kind === 'mutation' ? 'drain' : 'due');
        },
      });
      assert.deepEqual(result, { processed: 0, held: true });
      assert.equal(w.t.runs.length, 0);
    });
  });
});

describe('applyOutcome task-stage', () => {
  it('clears pending and sets stageSynced when the confirmed stage still matches', async () => {
    const w = world();
    const taskId = w.task({
      stage: 'Planning',
      stageSynced: 'Idea',
      stagePendingAt: 10,
      stagePendingBaseEditedTime: TIME,
      lastEditedTime: TIME,
    });
    const outboxId = w.outbox();
    await w.call(applyOutcome, {
      id: outboxId,
      outcome: {
        kind: 'confirmed',
        notionPageId: 'page-1',
        lastEditedTime: NEWER,
        propertiesJson: JSON.stringify({ Stage: 'Planning', 'GitHub Issue/PR': 'github.com/warehauscollective/warehaus/pull/38' }),
        reused: false,
      },
    });
    const row = w.t.row(taskId);
    assert.equal(row?.stage, 'Planning');
    assert.equal(row?.stageSynced, 'Planning');
    assert.equal(row?.stagePendingAt, undefined);
    assert.equal(row?.stagePendingBaseEditedTime, undefined);
    assert.equal(row?.lastEditedTime, NEWER);
    assert.equal(row?.pullRequestUrl, 'github.com/warehauscollective/warehaus/pull/38');
    assert.equal(w.t.row(outboxId)?.status, 'done');
  });

  it('does not overwrite tasks.stage when a later move is already saved', async () => {
    const w = world();
    const taskId = w.task({
      stage: 'Parked',
      stageSynced: 'Idea',
      stagePendingAt: 10,
      stagePendingBaseEditedTime: TIME,
      lastEditedTime: TIME,
    });
    const outboxId = w.outbox();
    await w.call(applyOutcome, {
      id: outboxId,
      outcome: {
        kind: 'confirmed',
        notionPageId: 'page-1',
        lastEditedTime: NEWER,
        propertiesJson: JSON.stringify({ Stage: 'Planning' }),
        reused: false,
      },
    });
    const row = w.t.row(taskId);
    assert.equal(row?.stage, 'Parked');
    assert.equal(row?.stageSynced, 'Idea');
    assert.equal(row?.stagePendingAt, 10);
    assert.equal(row?.stagePendingBaseEditedTime, NEWER);
    assert.equal(row?.lastEditedTime, TIME);
    assert.equal(row?.pullRequestUrl, SECRET_PR);
  });

  it('links an existing task when a create is confirmed', async () => {
    const w = world();
    const milestoneId = seedMilestone(w.t, w.orgId, w.projectId);
    const taskId = w.task();
    const outboxId = w.outbox({
      kind: 'create',
      notionPageId: undefined,
      payload: JSON.stringify({ properties: { Name: 'Homepage' }, milestoneId }),
    });
    await w.call(applyOutcome, {
      id: outboxId,
      outcome: {
        kind: 'confirmed',
        notionPageId: 'page-1',
        lastEditedTime: TIME,
        propertiesJson: JSON.stringify({ Name: 'Homepage', Status: 'To Do' }),
        reused: false,
      },
    });
    assert.equal(w.t.row(taskId)?.milestoneId, milestoneId);
    assert.equal(w.t.row(taskId)?.milestoneOrder, 0);
    assert.equal(w.t.row(outboxId)?.status, 'done');
  });
});

describe('create task milestone link', () => {
  it('links a new task once and leaves it unlinked after detach', async () => {
    const w = world();
    const milestoneId = seedMilestone(w.t, w.orgId, w.projectId, { approval: 'unreviewed' });
    seedTask(w.t, w.orgId, w.projectId, {
      notionPageId: 'page-older',
      milestoneId,
      milestoneOrder: 4,
      name: 'Older',
      status: 'To Do',
      isDone: false,
      publishToWarehaus: false,
    });
    const outboxId = w.outbox({
      kind: 'create',
      notionPageId: undefined,
      payload: JSON.stringify({ properties: { Name: 'Homepage', 'External ID': 'wh_tsk_homepage' }, milestoneId }),
    });
    await w.call(applyOutcome, {
      id: outboxId,
      outcome: {
        kind: 'confirmed',
        notionPageId: 'page-new',
        lastEditedTime: TIME,
        propertiesJson: JSON.stringify({ Name: 'Homepage', Status: 'To Do' }),
        reused: false,
      },
    });
    const pageNew = () => w.t.rows('tasks').filter((row) => row.notionPageId === 'page-new');
    assert.equal(pageNew().length, 0);
    assert.ok(String(w.t.row(outboxId)?.payload).includes(milestoneId));

    const noNotice: CallOptions = {
      as: 'staff',
      respond: () => {
        throw new Error('no notice');
      },
    };
    const pull = {
      notionPageId: 'page-new',
      orgId: w.orgId,
      projectId: w.projectId,
      name: 'Homepage',
      status: 'To Do',
      isDone: false,
      publishToWarehaus: false,
      lastEditedTime: TIME,
    };
    await w.call(upsertTask, pull, noNotice);
    const created = pageNew()[0];
    assert.ok(created);
    assert.equal(pageNew().length, 1);
    assert.equal(created.milestoneId, milestoneId);
    assert.equal(created.milestoneOrder, 5);
    assert.equal(created.name, 'Homepage');

    await w.call(detachTask, { milestoneId, taskId: created._id }, noNotice);
    assert.equal(w.t.row(created._id)?.milestoneId, undefined);
    await w.call(upsertTask, { ...pull, name: 'Homepage revised' }, noNotice);
    const after = w.t.row(created._id);
    assert.equal(after?.milestoneId, undefined);
    assert.equal(after?.milestoneOrder, undefined);
    assert.equal(after?.name, 'Homepage revised');
    assert.ok(String(w.t.row(outboxId)?.payload).includes(milestoneId));
    assert.equal(w.t.runs.length, 0);
  });
});

describe('missing property rejection', () => {
  it('raises a staff notice and does not call it a write conflict', async () => {
    const w = world();
    const invite = {
      kind: 'createInvite',
      database: 'contacts',
      payload: JSON.stringify({ properties: { Name: 'Ada Lovelace' } }),
    };
    const respond: Respond = () => ({ inserted: true });
    const missId = w.outbox(invite);
    await w.call(
      applyOutcome,
      { id: missId, outcome: { kind: 'rejected', reason: 'Notion is missing property "Invite Status".' } },
      { respond },
    );
    assert.equal(w.t.row(missId)?.status, 'dead');
    assert.equal(w.t.row(missId)?.lastError, 'Notion is missing property "Invite Status".');
    const notices = w.t.runs.filter((run) => run.name === 'invitesSync:recordStaffNotice');
    assert.equal(notices.length, 1);
    assert.equal(notices[0]?.args.edgeCase, 'missing-property');
    const message = String(notices[0]?.args.message);
    assert.match(message, /Notion is missing property "Invite Status"/);
    assert.equal(message.toLowerCase().includes('write conflict'), false);
    assert.equal(message.includes('conflicted'), false);

    const runsBefore = w.t.runs.length;
    const otherId = w.outbox(invite);
    await w.call(applyOutcome, { id: otherId, outcome: { kind: 'rejected', reason: 'Unknown property Secret' } }, { respond });
    assert.equal(w.t.runs.length, runsBefore);
    assert.equal(w.t.row(otherId)?.status, 'dead');
  });
});
