import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  enqueueCreate,
  enqueueDescription,
  enqueueResources,
  enqueueStage,
  enqueueStatus,
} from '../sync/taskWrite';

type Handler = (ctx: unknown, args: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>;

function run(fn: object, ctx: unknown, args: Record<string, unknown>) {
  return (fn as { _handler: Handler })._handler(ctx, args);
}

const notionTask = {
  _id: 'task-1',
  orgId: 'org-northwind',
  notionPageId: 'page-1',
  lastEditedTime: '2026-10-28T00:00:00.000Z',
  stage: 'Idea',
};
const linearTask = { ...notionTask, taskSource: 'linear' };
const base = { taskId: 'task-1', expectedLastEditedTime: '2026-10-28T00:00:00.000Z', actorId: 'staff-1' };

function ctxFor(task: object, calls: unknown[]) {
  return {
    db: {
      get: async () => task,
      patch: async () => undefined,
      query: () => ({ withIndex: () => ({ collect: async () => [] }) }),
    },
    runMutation: async (_ref: unknown, args: unknown) => {
      calls.push(args);
      return { ok: true, outboxId: 'out-1', duplicate: false };
    },
  };
}

describe('task source write guard', () => {
  it('refuses status, description and resources on a Linear task without queuing', async () => {
    const calls: unknown[] = [];
    const ctx = ctxFor(linearTask, calls);
    const status = await run(enqueueStatus, ctx, { ...base, status: 'Done' });
    const description = await run(enqueueDescription, ctx, { ...base, description: 'x' });
    const resources = await run(enqueueResources, ctx, { ...base, resourceNotionIds: [] });
    for (const result of [status, description, resources]) {
      assert.deepEqual(result, { ok: false, error: 'This task comes from Linear. Edit it there.' });
    }
    assert.equal(calls.length, 0);
  });

  it('still queues a status write for a task with no taskSource (Notion)', async () => {
    const calls: unknown[] = [];
    const result = await run(enqueueStatus, ctxFor(notionTask, calls), { ...base, status: 'Done' });
    assert.equal(result.ok, true);
    assert.equal(calls.length, 1);
  });

  it('still queues a status write for an explicit notion task', async () => {
    const calls: unknown[] = [];
    const result = await run(enqueueStatus, ctxFor({ ...notionTask, taskSource: 'notion' }, calls), {
      ...base,
      status: 'Done',
    });
    assert.equal(result.ok, true);
  });

  it('lets Stage move on a Linear task (Stage lives on the Notion page)', async () => {
    const previous = process.env.NOTION_WRITEBACK_ENABLED;
    delete process.env.NOTION_WRITEBACK_ENABLED;
    try {
      const calls: unknown[] = [];
      const result = await run(enqueueStage, ctxFor(linearTask, calls), {
        ...base,
        stage: 'Planning',
        actor: 'staff',
      });
      assert.deepEqual(result, { ok: true, pending: true });
      assert.equal(calls.length, 0);
    } finally {
      if (previous === undefined) delete process.env.NOTION_WRITEBACK_ENABLED;
      else process.env.NOTION_WRITEBACK_ENABLED = previous;
    }
  });

  it('refuses a portal create when the project resolves to Linear', async () => {
    const calls: unknown[] = [];
    const project = { _id: 'proj-1', orgId: 'org-northwind', notionPageId: 'notion-proj' };
    const result = await run(
      enqueueCreate,
      {
        db: {
          query: (table: string) =>
            table === 'taskSourceConfigs'
              ? {
                  withIndex: (_name: string, build: (q: { eq: (f: string, v: unknown) => unknown }) => unknown) => {
                    const filters: Record<string, unknown> = {};
                    const q = {
                      eq(field: string, value: unknown) {
                        filters[field] = value;
                        return q;
                      },
                    };
                    build(q);
                    return {
                      first: async () =>
                        filters.projectId === 'proj-1'
                          ? {
                              _id: 'cfg-1',
                              orgId: 'org-northwind',
                              projectId: 'proj-1',
                              source: 'linear',
                              syncDirection: 'read',
                              enabled: true,
                            }
                          : null,
                    };
                  },
                }
              : { withIndex: () => ({ unique: async () => project }) },
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
    assert.deepEqual(result, {
      ok: false,
      error: 'This project takes tasks from Linear. Create it there.',
    });
    assert.equal(calls.length, 0);
  });
});
