import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { WRITEBACK_OFF_ERROR } from '@warehaus/portal-sync';
import { enqueue } from '../sync/outbox';
import { enqueueCreate, enqueueStage, enqueueStatus } from '../sync/taskWrite';
import { moveStage, moveStatus } from '../tasks';
import { PortalAuthError } from './identity';

type Handler = (ctx: unknown, args: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>;

function run(fn: object, ctx: unknown, args: Record<string, unknown>) {
  return (fn as { _handler: Handler })._handler(ctx, args);
}

describe('createTask project org', () => {
  it('rejects a project that belongs to another client', async () => {
    const calls: unknown[] = [];
    const result = await run(
      enqueueCreate,
      {
        db: {
          query: () => ({
            withIndex: () => ({
              unique: async () => ({ _id: 'proj-other', orgId: 'org-other', notionPageId: 'notion-proj' }),
            }),
          }),
        },
        runMutation: async (_ref: unknown, args: unknown) => {
          calls.push(args);
          return { ok: true, outboxId: 'out-1', duplicate: false };
        },
      },
      {
        orgId: 'org-northwind',
        name: 'Homepage',
        status: 'To Do',
        projectNotionId: 'notion-proj',
        externalId: 'wh_tsk_homepage',
      },
    );
    assert.deepEqual(result, { ok: false, error: 'Project is not in this client' });
    assert.equal(calls.length, 0);
  });

  it('queues a create when the project belongs to the org', async () => {
    const calls: Array<{ actor?: string; orgId?: string }> = [];
    const result = await run(
      enqueueCreate,
      {
        db: {
          query: () => ({
            withIndex: () => ({
              unique: async () => ({ _id: 'proj-public', orgId: 'org-northwind', notionPageId: 'notion-proj' }),
            }),
          }),
        },
        runMutation: async (_ref: unknown, args: { actor?: string; orgId?: string }) => {
          calls.push(args);
          return { ok: true, outboxId: 'out-1', duplicate: false };
        },
      },
      {
        orgId: 'org-northwind',
        name: 'Homepage',
        status: 'To Do',
        projectNotionId: 'notion-proj',
        externalId: 'wh_tsk_homepage',
        actorId: 'contact-staff',
      },
    );
    assert.equal(result.ok, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.actor, 'staff');
    assert.equal(calls[0]?.orgId, 'org-northwind');
  });
});

describe('enqueueStage actor', () => {
  const task = {
    _id: 'task-1',
    orgId: 'org-northwind',
    notionPageId: 'page-1',
  };

  it('records the staff actor and actor id on the outbox call', async () => {
    const calls: Array<{ actor?: string; actorId?: string }> = [];
    const result = await run(
      enqueueStage,
      {
        db: { get: async () => task },
        runMutation: async (_ref: unknown, args: { actor?: string; actorId?: string }) => {
          calls.push(args);
          return { ok: true, outboxId: 'out-1', duplicate: false };
        },
      },
      {
        taskId: 'task-1',
        stage: 'Idea',
        expectedLastEditedTime: '2026-10-28T00:00:00.000Z',
        actor: 'staff',
        actorId: 'contact-staff',
      },
    );
    assert.equal(result.ok, true);
    assert.equal(calls[0]?.actor, 'staff');
    assert.equal(calls[0]?.actorId, 'contact-staff');
  });

  it('does not queue a row when the actor is a client', async () => {
    const calls: unknown[] = [];
    const result = await run(
      enqueueStage,
      {
        db: { get: async () => task },
        runMutation: async (_ref: unknown, args: unknown) => {
          calls.push(args);
          return { ok: true, outboxId: 'out-1', duplicate: false };
        },
      },
      {
        taskId: 'task-1',
        stage: 'Idea',
        expectedLastEditedTime: '2026-10-28T00:00:00.000Z',
        actor: 'client',
        actorId: 'contact-client',
      },
    );
    assert.equal(result.ok, false);
    assert.equal(calls.length, 0);
  });

  it('queues Idea or Planning from No stage yet and refuses every other stage', async () => {
    const calls: string[] = [];
    const ctx = {
      db: { get: async () => task },
      runMutation: async (_ref: unknown, args: { payload?: string }) => {
        calls.push(args.payload ?? '');
        return { ok: true, outboxId: 'out-1', duplicate: false };
      },
    };
    const base = {
      taskId: 'task-1',
      expectedLastEditedTime: '2026-10-28T00:00:00.000Z',
      actor: 'staff' as const,
      actorId: 'contact-staff',
    };
    const parked = await run(enqueueStage, ctx, { ...base, stage: 'Parked' });
    assert.deepEqual(parked, { ok: false, error: 'Tasks with no stage can move to Idea or Planning.' });
    const unknown = await run(enqueueStage, { ...ctx, db: { get: async () => ({ ...task, stage: 'Brainstorm' }) } }, { ...base, stage: 'Awaiting Go' });
    assert.equal(unknown.ok, false);
    const planning = await run(enqueueStage, ctx, { ...base, stage: 'Planning' });
    assert.equal(planning.ok, true);
    const filed = await run(enqueueStage, { ...ctx, db: { get: async () => ({ ...task, stage: 'Idea' }) } }, { ...base, stage: 'Parked' });
    assert.equal(filed.ok, true);
    assert.equal(calls.length, 2);
  });

  it('refuses moves into or out of Building and Shipped', async () => {
    const calls: unknown[] = [];
    const ctxFor = (stage?: string) => ({
      db: { get: async () => ({ ...task, stage }) },
      runMutation: async () => {
        calls.push(stage ?? '');
        return { ok: true, outboxId: 'out-1', duplicate: false };
      },
    });
    const base = {
      taskId: 'task-1',
      expectedLastEditedTime: '2026-10-28T00:00:00.000Z',
      actor: 'staff' as const,
      actorId: 'contact-staff',
    };
    const intoBuilding = await run(enqueueStage, ctxFor('Idea'), { ...base, stage: 'Building' });
    assert.equal(intoBuilding.ok, false);
    if (!intoBuilding.ok) assert.match(intoBuilding.error ?? '', /Building/);
    const intoShipped = await run(enqueueStage, ctxFor('Planning'), { ...base, stage: 'Shipped' });
    assert.equal(intoShipped.ok, false);
    if (!intoShipped.ok) assert.match(intoShipped.error ?? '', /Shipped/);
    const outOfBuilding = await run(enqueueStage, ctxFor('Building'), { ...base, stage: 'Idea' });
    assert.equal(outOfBuilding.ok, false);
    if (!outOfBuilding.ok) assert.match(outOfBuilding.error ?? '', /Building/);
    const outOfShipped = await run(enqueueStage, ctxFor('Shipped'), { ...base, stage: 'Planning' });
    assert.equal(outOfShipped.ok, false);
    if (!outOfShipped.ok) assert.match(outOfShipped.error ?? '', /Shipped/);
    assert.equal(calls.length, 0);
  });

  it('stores the actor argument on the outbox row', async () => {
    const previous = process.env.NOTION_WRITEBACK_ENABLED;
    process.env.NOTION_WRITEBACK_ENABLED = 'true';
    const inserted: Array<Record<string, unknown>> = [];
    try {
      const ctx = {
        db: {
          query: () => ({
            withIndex: () => ({ unique: async () => null }),
          }),
          insert: async (_table: string, row: Record<string, unknown>) => {
            inserted.push(row);
            return 'outbox-1';
          },
        },
        scheduler: { runAfter: async () => undefined },
      };
      const args = {
        idempotencyKey: 'task-stage:page-1:Idea::2026-10-28T00:00:00.000Z',
        kind: 'task-stage',
        orgId: 'org-northwind',
        database: 'tasks',
        notionPageId: 'page-1',
        expectedLastEditedTime: '2026-10-28T00:00:00.000Z',
        payload: JSON.stringify({ properties: { Stage: 'Idea' } }),
        actorId: 'contact-staff',
        schedule: false,
      };
      const staff = await run(enqueue, ctx, { ...args, actor: 'staff' });
      assert.equal(staff.ok, true);
      assert.equal(inserted[0]?.actor, 'staff');
      assert.equal(inserted[0]?.actorId, 'contact-staff');

      const client = await run(enqueue, ctx, { ...args, idempotencyKey: 'other', actor: 'clientAdmin' });
      assert.equal(client.ok, false);
      assert.equal(inserted.length, 1);
    } finally {
      if (previous === undefined) delete process.env.NOTION_WRITEBACK_ENABLED;
      else process.env.NOTION_WRITEBACK_ENABLED = previous;
    }
  });
});

describe('move authorization', () => {
  const northwindTask = {
    _id: 'task-north',
    orgId: 'org-northwind',
    notionPageId: 'page-north',
    stage: 'Idea',
  };

  it('rejects a missing task before any outbox insert', async () => {
    const calls: unknown[] = [];
    const ctx = {
      db: { get: async () => null },
      runMutation: async (_ref: unknown, args: unknown) => {
        calls.push(args);
        return { ok: true, outboxId: 'out-1', duplicate: false };
      },
    };
    const statusMissing = await run(enqueueStatus, ctx, {
      taskId: 'task-missing',
      status: 'To Do',
      expectedLastEditedTime: '2026-10-28T00:00:00.000Z',
    });
    assert.deepEqual(statusMissing, { ok: false, error: 'Task not found' });
    const stageMissing = await run(enqueueStage, ctx, {
      taskId: 'task-missing',
      stage: 'Idea',
      expectedLastEditedTime: '2026-10-28T00:00:00.000Z',
      actor: 'staff',
    });
    assert.deepEqual(stageMissing, { ok: false, error: 'Task not found' });
    assert.equal(calls.length, 0);
  });

  it('lets Warehaus studio staff reach the outbox for a Northwind task', async () => {
    const previous = process.env.NOTION_WRITEBACK_ENABLED;
    delete process.env.NOTION_WRITEBACK_ENABLED;
    const inserted: unknown[] = [];
    const studio = {
      _id: 'org-warehaus',
      slug: 'warehaus',
      portalAccess: 'Enabled' as const,
    };
    const staff = {
      _id: 'contact-staff',
      orgId: studio._id,
      name: 'Maya Staff',
      email: 'maya@warehaus.studio',
      authUserId: 'auth-staff',
      role: 'Warehaus Staff' as const,
      portalAccess: 'Enabled' as const,
    };
    const outboxCtx = {
      db: {
        query: () => ({
          withIndex: () => ({ unique: async () => null }),
        }),
        insert: async (_table: string, row: unknown) => {
          inserted.push(row);
          return 'outbox-1';
        },
      },
      scheduler: { runAfter: async () => undefined },
    };
    const ctx = {
      auth: { getUserIdentity: async () => ({ subject: 'auth-staff' }) },
      db: {
        async get(id: string) {
          if (id === studio._id) return studio;
          if (id === northwindTask._id) return northwindTask;
          return null;
        },
        query(table: string) {
          return {
            withIndex(_name: string, build: (q: { eq: (field: string, value: string) => unknown }) => unknown) {
              const recorder = {
                pairs: [] as Array<[string, string]>,
                eq(field: string, value: string) {
                  this.pairs.push([field, value]);
                  return this;
                },
              };
              build(recorder);
              const rows = table === 'contacts' ? [staff] : [];
              const matched = rows.filter((row) =>
                recorder.pairs.every(([field, value]) => (row as Record<string, string>)[field] === value),
              );
              return { unique: async () => matched[0] ?? null };
            },
          };
        },
      },
      runMutation: async (_ref: unknown, args: Record<string, unknown>) => {
        if (typeof args.kind === 'string') return run(enqueue, outboxCtx, args);
        if (typeof args.status === 'string') return run(enqueueStatus, ctx, args);
        if (typeof args.stage === 'string') return run(enqueueStage, ctx, args);
        throw new Error('unexpected mutation');
      },
    };
    try {
      const status = await run(moveStatus, ctx, {
        taskId: northwindTask._id,
        status: 'To Do',
        expectedLastEditedTime: '2026-10-28T00:00:00.000Z',
      });
      assert.deepEqual(status, { ok: false, error: WRITEBACK_OFF_ERROR });
      const stage = await run(moveStage, ctx, {
        taskId: northwindTask._id,
        stage: 'Planning',
        expectedLastEditedTime: '2026-10-28T00:00:00.000Z',
      });
      assert.deepEqual(stage, { ok: false, error: WRITEBACK_OFF_ERROR });
      assert.equal(inserted.length, 0);
    } finally {
      if (previous === undefined) delete process.env.NOTION_WRITEBACK_ENABLED;
      else process.env.NOTION_WRITEBACK_ENABLED = previous;
    }
  });

  it('rejects a client caller at adminMutation and does not enqueue', async () => {
    const calls: unknown[] = [];
    const client = {
      _id: 'org-northwind',
      slug: 'northwind',
      portalAccess: 'Enabled' as const,
    };
    const contact = {
      _id: 'contact-client',
      orgId: client._id,
      name: 'Ada Client',
      email: 'ada@northwind.test',
      authUserId: 'auth-client',
      role: 'Client Admin' as const,
      portalAccess: 'Enabled' as const,
    };
    const ctx = {
      auth: { getUserIdentity: async () => ({ subject: 'auth-client' }) },
      runMutation: async (_ref: unknown, args: unknown) => {
        calls.push(args);
        return { ok: true, outboxId: 'out-1', duplicate: false };
      },
      db: {
        async get(id: string) {
          if (id === client._id) return client;
          return null;
        },
        query(table: string) {
          return {
            withIndex(_name: string, build: (q: { eq: (field: string, value: string) => unknown }) => unknown) {
              const recorder = {
                pairs: [] as Array<[string, string]>,
                eq(field: string, value: string) {
                  this.pairs.push([field, value]);
                  return this;
                },
              };
              build(recorder);
              const rows = table === 'contacts' ? [contact] : [];
              const matched = rows.filter((row) =>
                recorder.pairs.every(([field, value]) => (row as Record<string, string>)[field] === value),
              );
              return { unique: async () => matched[0] ?? null };
            },
          };
        },
      },
    };
    const args = {
      taskId: 'task-1',
      expectedLastEditedTime: '2026-10-28T00:00:00.000Z',
    };
    await assert.rejects(run(moveStatus, ctx, { ...args, status: 'To Do' }), (err: unknown) => {
      assert.ok(err instanceof PortalAuthError);
      assert.equal(err.message, 'Staff role required');
      return true;
    });
    await assert.rejects(run(moveStage, ctx, { ...args, stage: 'Idea' }), (err: unknown) => {
      assert.ok(err instanceof PortalAuthError);
      assert.equal(err.message, 'Staff role required');
      return true;
    });
    assert.equal(calls.length, 0);
  });
});
