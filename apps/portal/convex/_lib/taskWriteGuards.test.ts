import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { enqueue } from '../sync/outbox';
import { enqueueCreate, enqueueStage } from '../sync/taskWrite';

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
