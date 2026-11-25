/**
 * Staff API writes on a Portal-only task: one created inside a milestone, with
 * no Notion page and so no last read time. `updateTask` and `addLink` must
 * save it, and a Notion-backed task must still need a matching read time.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Doc } from '../_generated/dataModel';
import { addLink, updateTask } from '../portalApi';
import { memoryCtx } from './memoryCtx.testkit';
import { PORTAL_MILESTONE_TASK_SOURCE } from './milestoneTasks';
import { seedOrg, seedProject, seedTask } from './seedRows.testkit';
import { TASK_CHANGED_IN_NOTION } from './taskChange';

const TIME = '2026-11-20T10:00:00.000Z';
const PR = 'https://github.com/warehauscollective/warehaus/pull/177';

type ApiResult = { status: number; body: Record<string, unknown> };

async function withWriteback(fn: () => Promise<void>) {
  const previous = process.env.NOTION_WRITEBACK_ENABLED;
  process.env.NOTION_WRITEBACK_ENABLED = 'true';
  try {
    await fn();
  } finally {
    if (previous === undefined) delete process.env.NOTION_WRITEBACK_ENABLED;
    else process.env.NOTION_WRITEBACK_ENABLED = previous;
  }
}

const PORTAL_ONLY = {
  source: PORTAL_MILESTONE_TASK_SOURCE,
  notionPageId: `${PORTAL_MILESTONE_TASK_SOURCE}:milestone-1:1795547097111:1`,
  status: 'To Do',
};

const NOTION_BACKED = { notionPageId: 'page-1', lastEditedTime: TIME, status: 'To Do' };

function world(fields: Record<string, unknown>) {
  const t = memoryCtx();
  const orgId = seedOrg(t);
  const projectId = seedProject(t, orgId);
  const taskId = seedTask(t, orgId, projectId, fields);
  const tokenId = t.seed('apiTokens', {
    name: 'claude',
    tokenHash: 'hash-claude',
    tokenPrefix: 'wh_',
    scope: 'read-write',
    createdAt: 0,
    rateLimit: 100,
    rateWindowMs: 60_000,
    windowStartedAt: 0,
    windowCount: 0,
  });
  let keys = 0;
  const ids = () => ({ tokenId, key: `key-${(keys += 1)}`, requestHash: `hash-${keys}`, tokenName: 'claude', taskId });
  return {
    t,
    update: (body: Record<string, unknown>) => t.call<ApiResult>(updateTask, { ...ids(), ...body }),
    link: (body: Record<string, unknown>) => t.call<ApiResult>(addLink, { ...ids(), ...body }),
    task: () => t.row(taskId) as Doc<'tasks'>,
    links: () => t.rows('taskLinks'),
    outbox: () => t.rows('notionOutbox'),
  };
}

describe('staff API on a Portal-only task', () => {
  it('marks it Done with an empty read time and queues nothing for Notion', async () => {
    await withWriteback(async () => {
      const w = world(PORTAL_ONLY);
      const result = await w.update({ expectedLastEditedTime: '', status: 'Done' });
      assert.equal(result.status, 200, JSON.stringify(result.body));
      assert.deepEqual([w.task().status, w.task().isDone], ['Done', true]);
      assert.equal(w.outbox().length, 0);
    });
  });

  it('adds a PR link with no read time, without a Notion write', async () => {
    await withWriteback(async () => {
      const w = world(PORTAL_ONLY);
      const result = await w.link({ kind: 'PR', url: PR, title: 'Runner on production' });
      assert.equal(result.status, 200, JSON.stringify(result.body));
      assert.equal(result.body.duplicate, false);
      assert.deepEqual(
        w.links().map((row) => [row.kind, row.url]),
        [['PR', PR]],
      );
      assert.equal(w.outbox().length, 0);
      const again = await w.link({ kind: 'PR', url: PR });
      assert.equal(again.body.duplicate, true);
      assert.equal(w.links().length, 1);
    });
  });
});

describe('staff API on a Notion-backed task', () => {
  it('still refuses an empty read time as stale', async () => {
    await withWriteback(async () => {
      const w = world(NOTION_BACKED);
      const result = await w.update({ expectedLastEditedTime: '', status: 'Done' });
      assert.deepEqual(result, { status: 409, body: { error: TASK_CHANGED_IN_NOTION, code: 'stale' } });
      assert.equal(w.task().status, 'To Do');
    });
  });

  it('still needs the read time for a PR link', async () => {
    await withWriteback(async () => {
      const w = world(NOTION_BACKED);
      const missing = await w.link({ kind: 'PR', url: PR });
      assert.equal(missing.status, 400);
      assert.equal(w.links().length, 0);
      const stale = await w.link({ kind: 'PR', url: PR, expectedLastEditedTime: '2026-11-19T00:00:00.000Z' });
      assert.equal(stale.status, 409);
      assert.equal(w.links().length, 0);
      assert.equal(w.outbox().length, 0);
    });
  });
});
