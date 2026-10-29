import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { WRITEBACK_OFF_ERROR } from '@warehaus/portal-sync';
import { applyOutcome } from '../sync/outbox';
import { enqueue } from '../sync/outbox';
import { processDue } from '../sync/outboxWork';
import { drainPendingStages, enqueueStage, enqueueStatus } from '../sync/taskWrite';
import { upsertTask } from '../sync/upsert';

type Row = Record<string, unknown> & { _id: string };

class EqBuilder {
  private eqs: Array<[string, unknown]> = [];
  eq(field: string, value: unknown): this {
    this.eqs.push([field, value]);
    return this;
  }
  matches(row: Row): boolean {
    return this.eqs.every(([field, value]) => row[field] === value);
  }
}

function memoryDb(tables: Record<string, Row[]>) {
  let seq = 1;
  return {
    async get(id: string) {
      for (const rows of Object.values(tables)) {
        const found = rows.find((row) => row._id === id);
        if (found) return found;
      }
      return null;
    },
    async insert(table: string, row: Record<string, unknown>) {
      const stored = { ...row, _id: `gen-${seq++}` } as Row;
      (tables[table] ??= []).push(stored);
      return stored._id;
    },
    async patch(id: string, value: Record<string, unknown>) {
      const row = await this.get(id);
      if (!row) return;
      for (const [key, field] of Object.entries(value)) {
        if (field === undefined) delete row[key];
        else row[key] = field;
      }
    },
    async delete(id: string) {
      for (const rows of Object.values(tables)) {
        const index = rows.findIndex((row) => row._id === id);
        if (index >= 0) {
          rows.splice(index, 1);
          return;
        }
      }
    },
    query(table: string) {
      const chain = (list: Row[]) => ({
        withIndex(_name: string, build?: (q: EqBuilder) => EqBuilder) {
          const builder = new EqBuilder();
          build?.(builder);
          return chain(list.filter((row) => builder.matches(row)));
        },
        order() {
          return chain(list);
        },
        collect: async () => list,
        unique: async () => {
          if (list.length > 1) throw new Error('Expected a unique row');
          return list[0] ?? null;
        },
      });
      return chain(tables[table] ?? []);
    },
  };
}

type Handler = (ctx: unknown, args: Record<string, unknown>) => Promise<unknown>;

function run(fn: object, ctx: unknown, args: Record<string, unknown> = {}) {
  return (fn as { _handler: Handler })._handler(ctx, args);
}

const TIME = '2026-10-28T00:00:00.000Z';
const NEWER = '2026-10-29T00:00:00.000Z';
const STALE = '2026-10-01T00:00:00.000Z';

async function withFlag(on: boolean, fn: () => Promise<void>) {
  const previous = process.env.NOTION_WRITEBACK_ENABLED;
  if (on) process.env.NOTION_WRITEBACK_ENABLED = 'true';
  else delete process.env.NOTION_WRITEBACK_ENABLED;
  try {
    await fn();
  } finally {
    if (previous === undefined) delete process.env.NOTION_WRITEBACK_ENABLED;
    else process.env.NOTION_WRITEBACK_ENABLED = previous;
  }
}

function task(extra: Record<string, unknown> = {}): Row {
  return {
    _id: 'task-1',
    orgId: 'org-1',
    projectId: 'proj-1',
    notionPageId: 'page-1',
    name: 'Homepage',
    status: 'Inbox',
    isDone: false,
    publishToWarehaus: true,
    lastSyncedAt: 1,
    stage: 'Idea',
    lastEditedTime: TIME,
    pullRequestUrl: 'https://github.com/warehaus/secret/pull/1',
    ...extra,
  };
}

function stageCtx(tables: Record<string, Row[]>) {
  const db = memoryDb(tables);
  const ctx = {
    db,
    scheduler: { runAfter: async () => undefined },
    runMutation: async (_ref: unknown, args: Record<string, unknown>) => run(enqueue, ctx, args),
  };
  return ctx;
}

function outboxRows(tables: Record<string, Row[]>) {
  return tables.notionOutbox ?? [];
}

describe('taskWriteGuards stage save', () => {
  it('patches a flag-off stage move and inserts no outbox row', async () => {
    const row = task();
    const tables = { tasks: [row], notionOutbox: [] as Row[] };
    await withFlag(false, async () => {
      const result = await run(enqueueStage, stageCtx(tables), {
        taskId: 'task-1',
        stage: 'Planning',
        expectedLastEditedTime: STALE,
        actor: 'staff',
        actorId: 'contact-staff',
      });
      assert.deepEqual(result, { ok: true, pending: true });
      assert.equal(row.stage, 'Planning');
      assert.equal(typeof row.stagePendingAt, 'number');
      assert.equal(row.stageSynced, 'Idea');
      assert.equal(row.stagePendingBaseEditedTime, TIME);
      assert.equal(row.lastEditedTime, TIME);
      assert.equal(row.pullRequestUrl, 'https://github.com/warehaus/secret/pull/1');
      assert.equal(outboxRows(tables).length, 0);
    });
  });

  it('keeps a flag-off status drop as WRITEBACK_OFF_ERROR and does not patch', async () => {
    const row = task();
    const tables = { tasks: [row], notionOutbox: [] as Row[] };
    await withFlag(false, async () => {
      const result = await run(enqueueStatus, stageCtx(tables), {
        taskId: 'task-1',
        status: 'To Do',
        expectedLastEditedTime: TIME,
      });
      assert.deepEqual(result, { ok: false, error: WRITEBACK_OFF_ERROR });
      assert.equal(row.status, 'Inbox');
      assert.equal(row.stagePendingAt, undefined);
      assert.equal(outboxRows(tables).length, 0);
    });
  });

  it('patches and inserts one task-stage row with the existing key when the flag is on', async () => {
    const row = task();
    const tables = { tasks: [row], notionOutbox: [] as Row[] };
    await withFlag(true, async () => {
      const result = (await run(enqueueStage, stageCtx(tables), {
        taskId: 'task-1',
        stage: 'Planning',
        expectedLastEditedTime: STALE,
        actor: 'staff',
      })) as { ok: boolean; pending?: boolean; outboxId?: string; duplicate?: boolean };
      assert.equal(result.ok, true);
      assert.equal(result.pending, true);
      assert.equal(typeof result.outboxId, 'string');
      assert.equal(result.duplicate, false);
      assert.equal(outboxRows(tables).length, 1);
      const queued = outboxRows(tables)[0];
      assert.equal(queued?.kind, 'task-stage');
      assert.equal(queued?.idempotencyKey, `task-stage:page-1:Planning::${TIME}`);
      assert.equal(queued?.expectedLastEditedTime, TIME);
      assert.match(String(queued?.payload), /"Stage":"Planning"/);
      assert.equal(row.pullRequestUrl, 'https://github.com/warehaus/secret/pull/1');
    });
  });

  it('keeps only the latest stage after two flag-off moves', async () => {
    const row = task();
    const tables = { tasks: [row], notionOutbox: [] as Row[] };
    const ctx = stageCtx(tables);
    await withFlag(false, async () => {
      await run(enqueueStage, ctx, {
        taskId: 'task-1',
        stage: 'Planning',
        expectedLastEditedTime: TIME,
        actor: 'staff',
      });
      const second = await run(enqueueStage, ctx, {
        taskId: 'task-1',
        stage: 'Parked',
        expectedLastEditedTime: STALE,
        actor: 'staff',
      });
      assert.deepEqual(second, { ok: true, pending: true });
      assert.equal(row.stage, 'Parked');
      assert.equal(row.stageSynced, 'Idea');
      assert.equal(typeof row.stagePendingAt, 'number');
      assert.equal(outboxRows(tables).length, 0);
    });
  });

  it('clears pending and leaves no row when Undo returns to stageSynced', async () => {
    const row = task();
    const tables = { tasks: [row], notionOutbox: [] as Row[] };
    const ctx = stageCtx(tables);
    await withFlag(true, async () => {
      await run(enqueueStage, ctx, {
        taskId: 'task-1',
        stage: 'Planning',
        expectedLastEditedTime: TIME,
        actor: 'staff',
      });
      assert.equal(outboxRows(tables).length, 1);
      const undone = await run(enqueueStage, ctx, {
        taskId: 'task-1',
        stage: 'Idea',
        expectedLastEditedTime: TIME,
        actor: 'staff',
      });
      assert.deepEqual(undone, { ok: true, pending: false });
      assert.equal(row.stage, 'Idea');
      assert.equal(row.stagePendingAt, undefined);
      assert.equal(row.stagePendingBaseEditedTime, undefined);
      assert.equal(row.stagePendingPullRequest, undefined);
      assert.equal(outboxRows(tables).length, 0);
    });
  });

  it('does not patch Building, Shipped, or unstaged rejections', async () => {
    const building = task();
    const shipped = task({ _id: 'task-2' });
    const unstaged = task({ _id: 'task-3', stage: undefined });
    delete unstaged.stage;
    const tables = { tasks: [building, shipped, unstaged], notionOutbox: [] as Row[] };
    const ctx = stageCtx(tables);
    await withFlag(false, async () => {
      const intoBuilding = await run(enqueueStage, ctx, {
        taskId: 'task-1',
        stage: 'Building',
        expectedLastEditedTime: TIME,
        actor: 'staff',
      });
      const intoShipped = await run(enqueueStage, ctx, {
        taskId: 'task-2',
        stage: 'Shipped',
        expectedLastEditedTime: TIME,
        actor: 'staff',
      });
      const parked = await run(enqueueStage, ctx, {
        taskId: 'task-3',
        stage: 'Parked',
        expectedLastEditedTime: TIME,
        actor: 'staff',
      });
      assert.equal((intoBuilding as { ok: boolean }).ok, false);
      assert.equal((intoShipped as { ok: boolean }).ok, false);
      assert.equal((parked as { ok: boolean }).ok, false);
      assert.equal(building.stage, 'Idea');
      assert.equal(building.stagePendingAt, undefined);
      assert.equal(shipped.stage, 'Idea');
      assert.equal(shipped.stagePendingAt, undefined);
      assert.equal(unstaged.stage, undefined);
      assert.equal(unstaged.stagePendingAt, undefined);
      assert.equal(outboxRows(tables).length, 0);
    });
  });

  it('stores a Ready to Ship link on stagePendingPullRequest only', async () => {
    const row = task();
    const tables = { tasks: [row], notionOutbox: [] as Row[] };
    await withFlag(false, async () => {
      const result = await run(enqueueStage, stageCtx(tables), {
        taskId: 'task-1',
        stage: 'Ready to Ship',
        pullRequestLink: 'github.com/warehauscollective/warehaus/pull/38',
        expectedLastEditedTime: TIME,
        actor: 'staff',
      });
      assert.deepEqual(result, { ok: true, pending: true });
      assert.equal(row.stagePendingPullRequest, 'github.com/warehauscollective/warehaus/pull/38');
      assert.equal(row.pullRequestUrl, 'https://github.com/warehaus/secret/pull/1');
      assert.equal(outboxRows(tables).length, 0);
    });
  });
});

describe('upsert pulled stage', () => {
  function pendingTask(): Row {
    return task({
      stage: 'Planning',
      stageSynced: 'Idea',
      stagePendingAt: 50,
      stagePendingBaseEditedTime: TIME,
      lastEditedTime: TIME,
    });
  }

  function pull(extra: Record<string, unknown> = {}) {
    return {
      notionPageId: 'page-1',
      orgId: 'org-1',
      projectId: 'proj-1',
      name: 'Homepage',
      status: 'To Do',
      isDone: false,
      publishToWarehaus: true,
      stage: 'Idea',
      lastEditedTime: TIME,
      ...extra,
    };
  }

  it('keeps the local stage when Notion time matches and the stage is old', async () => {
    const row = pendingTask();
    const tables = {
      tasks: [row],
      notionOutbox: [{ _id: 'queued', notionPageId: 'page-1', kind: 'task-stage', status: 'queued' } as Row],
    };
    const notices: unknown[] = [];
    await run(upsertTask, {
      db: memoryDb(tables),
      runMutation: async (_ref: unknown, args: unknown) => {
        notices.push(args);
        return { inserted: true };
      },
    }, pull({ name: 'Homepage renamed' }));
    assert.equal(row.stage, 'Planning');
    assert.equal(row.stageSynced, 'Idea');
    assert.equal(row.stagePendingAt, 50);
    assert.equal(row.name, 'Homepage renamed');
    assert.equal(row.status, 'To Do');
    assert.equal(row.lastEditedTime, TIME);
    assert.equal(tables.notionOutbox.length, 1);
    assert.equal(notices.length, 0);
  });

  it('takes a newer different Notion stage and clears pending', async () => {
    const row = pendingTask();
    const tables = {
      tasks: [row],
      notionOutbox: [
        { _id: 'queued', notionPageId: 'page-1', kind: 'task-stage', status: 'queued' },
        { _id: 'failed', notionPageId: 'page-1', kind: 'task-stage', status: 'failed' },
        { _id: 'inflight', notionPageId: 'page-1', kind: 'task-stage', status: 'inflight' },
        { _id: 'done', notionPageId: 'page-1', kind: 'task-stage', status: 'done' },
      ] as Row[],
    };
    const notices: Array<{ message?: string; edgeCase?: string }> = [];
    await run(upsertTask, {
      db: memoryDb(tables),
      runMutation: async (_ref: unknown, args: { message?: string; edgeCase?: string }) => {
        notices.push(args);
        return { inserted: true };
      },
    }, pull({ stage: 'Parked', lastEditedTime: NEWER }));
    assert.equal(row.stage, 'Parked');
    assert.equal(row.stageSynced, 'Parked');
    assert.equal(row.stagePendingAt, undefined);
    assert.equal(row.stagePendingBaseEditedTime, undefined);
    assert.equal(row.lastEditedTime, NEWER);
    assert.deepEqual(tables.notionOutbox.map((item) => item._id).sort(), ['done', 'inflight']);
    assert.equal(notices.length, 1);
    assert.equal(notices[0]?.edgeCase, 'stage-superseded:page-1');
    assert.equal(
      notices[0]?.message,
      'Homepage stage in Notion changed to Parked after a portal move to Planning.',
    );
  });

  it('keeps the local stage and bumps the base when a newer pull still matches stageSynced', async () => {
    const row = pendingTask();
    const tables = {
      tasks: [row],
      notionOutbox: [
        { _id: 'queued', notionPageId: 'page-1', kind: 'task-stage', status: 'queued' },
        { _id: 'inflight', notionPageId: 'page-1', kind: 'task-stage', status: 'inflight' },
      ] as Row[],
    };
    await run(upsertTask, {
      db: memoryDb(tables),
      runMutation: async () => {
        throw new Error('no notice');
      },
    }, pull({ stage: 'Idea', lastEditedTime: NEWER }));
    assert.equal(row.stage, 'Planning');
    assert.equal(row.stageSynced, 'Idea');
    assert.equal(row.stagePendingAt, 50);
    assert.equal(row.stagePendingBaseEditedTime, NEWER);
    assert.equal(row.lastEditedTime, NEWER);
    assert.deepEqual(tables.notionOutbox.map((item) => item._id), ['inflight']);
  });
});

describe('drain pending stages', () => {
  it('inserts nothing when the flag is off', async () => {
    const row = task({
      stage: 'Planning',
      stagePendingAt: 10,
      stagePendingBaseEditedTime: TIME,
      stageSynced: 'Idea',
    });
    const tables = { tasks: [row], notionOutbox: [] as Row[] };
    await withFlag(false, async () => {
      const result = await run(drainPendingStages, stageCtx(tables), {});
      assert.deepEqual(result, { inserted: 0, reused: 0 });
      assert.equal(outboxRows(tables).length, 0);
    });
  });

  it('inserts one row per pending task and reuses it on the next drain', async () => {
    const row = task({
      stage: 'Planning',
      stagePendingAt: 10,
      stagePendingBaseEditedTime: TIME,
      stageSynced: 'Idea',
    });
    const tables = { tasks: [row], notionOutbox: [] as Row[] };
    const ctx = stageCtx(tables);
    await withFlag(true, async () => {
      const first = (await run(drainPendingStages, ctx, {})) as { inserted: number; reused: number };
      assert.equal(first.inserted, 1);
      assert.equal(first.reused, 0);
      assert.equal(outboxRows(tables).length, 1);
      assert.equal(outboxRows(tables)[0]?.idempotencyKey, `task-stage:page-1:Planning::${TIME}`);
      const second = (await run(drainPendingStages, ctx, {})) as { inserted: number; reused: number; duplicate?: boolean };
      assert.equal(second.inserted, 0);
      assert.equal(second.reused, 1);
      assert.equal(outboxRows(tables).length, 1);
      assert.equal(outboxRows(tables)[0]?.status, 'queued');
    });
  });

  it('sends only the latest stage after two local moves', async () => {
    const row = task();
    const tables = { tasks: [row], notionOutbox: [] as Row[] };
    const ctx = stageCtx(tables);
    await withFlag(false, async () => {
      await run(enqueueStage, ctx, { taskId: 'task-1', stage: 'Planning', expectedLastEditedTime: TIME, actor: 'staff' });
      await run(enqueueStage, ctx, { taskId: 'task-1', stage: 'Parked', expectedLastEditedTime: TIME, actor: 'staff' });
      assert.equal(outboxRows(tables).length, 0);
    });
    await withFlag(true, async () => {
      const drained = (await run(drainPendingStages, ctx, {})) as { inserted: number };
      assert.equal(drained.inserted, 1);
      assert.equal(outboxRows(tables).length, 1);
      assert.match(String(outboxRows(tables)[0]?.payload), /"Stage":"Parked"/);
      assert.equal(String(outboxRows(tables)[0]?.payload).includes('Planning'), false);
      assert.equal(outboxRows(tables)[0]?.idempotencyKey, `task-stage:page-1:Parked::${TIME}`);
    });
  });

  it('does not drain from processDue while write-back is off', async () => {
    await withFlag(false, async () => {
      const result = await run(processDue, {
        runMutation: async () => {
          throw new Error('drain');
        },
        runQuery: async () => {
          throw new Error('due');
        },
      }, {});
      assert.deepEqual(result, { processed: 0, held: true });
    });
  });
});

describe('applyOutcome task-stage', () => {
  function outbox(id: string): Row {
    return {
      _id: id,
      kind: 'task-stage',
      orgId: 'org-1',
      database: 'tasks',
      notionPageId: 'page-1',
      payload: JSON.stringify({ properties: { Stage: 'Planning' } }),
      actor: 'staff',
      status: 'inflight',
      attempts: 1,
      createdAt: 1,
    };
  }

  it('clears pending and sets stageSynced when the confirmed stage still matches', async () => {
    const row = task({
      stage: 'Planning',
      stageSynced: 'Idea',
      stagePendingAt: 10,
      stagePendingBaseEditedTime: TIME,
      lastEditedTime: TIME,
    });
    const tables: Record<string, Row[]> = {
      tasks: [row],
      notionOutbox: [outbox('out-1')],
      notionWriteState: [],
      auditEvents: [],
    };
    await run(applyOutcome, { db: memoryDb(tables) }, {
      id: 'out-1',
      outcome: {
        kind: 'confirmed',
        notionPageId: 'page-1',
        lastEditedTime: NEWER,
        propertiesJson: JSON.stringify({ Stage: 'Planning', 'GitHub Issue/PR': 'github.com/warehauscollective/warehaus/pull/38' }),
        reused: false,
      },
    });
    assert.equal(row.stage, 'Planning');
    assert.equal(row.stageSynced, 'Planning');
    assert.equal(row.stagePendingAt, undefined);
    assert.equal(row.stagePendingBaseEditedTime, undefined);
    assert.equal(row.lastEditedTime, NEWER);
    assert.equal(row.pullRequestUrl, 'github.com/warehauscollective/warehaus/pull/38');
    assert.equal(tables.notionOutbox[0]?.status, 'done');
  });

  it('does not overwrite tasks.stage when a later move is already saved', async () => {
    const row = task({
      stage: 'Parked',
      stageSynced: 'Idea',
      stagePendingAt: 10,
      stagePendingBaseEditedTime: TIME,
      lastEditedTime: TIME,
    });
    const tables: Record<string, Row[]> = {
      tasks: [row],
      notionOutbox: [outbox('out-2')],
      notionWriteState: [],
      auditEvents: [],
    };
    await run(applyOutcome, { db: memoryDb(tables) }, {
      id: 'out-2',
      outcome: {
        kind: 'confirmed',
        notionPageId: 'page-1',
        lastEditedTime: NEWER,
        propertiesJson: JSON.stringify({ Stage: 'Planning' }),
        reused: false,
      },
    });
    assert.equal(row.stage, 'Parked');
    assert.equal(row.stageSynced, 'Idea');
    assert.equal(row.stagePendingAt, 10);
    assert.equal(row.stagePendingBaseEditedTime, NEWER);
    assert.equal(row.lastEditedTime, TIME);
    assert.equal(row.pullRequestUrl, 'https://github.com/warehaus/secret/pull/1');
  });
});
