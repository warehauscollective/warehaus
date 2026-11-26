/**
 * Staff API / MCP `create_task` with a milestone. The task is stored in the
 * portal only and is on the milestone as soon as the call returns. Before, it
 * went to Notion unpublished, the pull gate skipped it, and it never arrived.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Doc } from '../_generated/dataModel';
import { createTask, getMilestoneStatus } from '../portalApi';
import { memoryCtx } from './memoryCtx.testkit';
import { PORTAL_MILESTONE_TASK_SOURCE, SHIPPED_TAKES_NO_TASKS } from './milestoneTasks';
import { seedMilestone, seedOrg, seedProject } from './seedRows.testkit';

type ApiResult = { status: number; body: Record<string, unknown> };

function world(milestone: Record<string, unknown> = {}) {
  const t = memoryCtx();
  const orgId = seedOrg(t);
  const projectId = seedProject(t, orgId);
  const milestoneId = seedMilestone(t, orgId, projectId, { status: 'Building', ...milestone });
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
  const create = (key: string, body: Record<string, unknown> = {}) =>
    t.call<ApiResult>(createTask, {
      tokenId,
      key,
      requestHash: `hash-${key}`,
      tokenName: 'claude',
      projectId,
      milestoneId,
      name: 'Wire the runner chip',
      status: 'To Do',
      ...body,
    });
  return { t, milestoneId, create };
}

describe('create_task with a milestone', () => {
  it('returns a task id that is on the milestone at once, with no outbox row', async () => {
    const w = world();
    const result = await w.create('key-1');
    assert.equal(result.status, 200, JSON.stringify(result.body));
    const task = w.t.row(result.body.id as string) as Doc<'tasks'>;
    assert.ok(task, 'task row exists');
    assert.equal(task.milestoneId, w.milestoneId);
    assert.equal(task.milestoneOrder, 0);
    assert.equal(task.source, PORTAL_MILESTONE_TASK_SOURCE);
    assert.equal(task.name, 'Wire the runner chip');
    assert.equal(task.stage, 'Building');
    assert.equal(task.publishToWarehaus, false);
    assert.equal(w.t.rows('notionOutbox').length, 0);
    assert.equal(w.t.scheduled.length, 0);

    const status = await w.t.call<ApiResult>(getMilestoneStatus, { milestoneId: w.milestoneId });
    const tasks = status.body.tasks as { id: string }[];
    assert.deepEqual(
      tasks.map((row) => row.id),
      [result.body.id],
    );
  });

  it('puts a second task after the first and replays a retried key', async () => {
    const w = world();
    const first = await w.create('key-1');
    const second = await w.create('key-2', { name: 'Second', stage: 'Idea' });
    assert.equal((w.t.row(second.body.id as string) as Doc<'tasks'>).milestoneOrder, 1);
    assert.equal((w.t.row(second.body.id as string) as Doc<'tasks'>).stage, 'Idea');
    const again = await w.create('key-1');
    assert.equal(again.body.id, first.body.id);
    assert.equal(w.t.rows('tasks').length, 2);
  });

  it('refuses a Shipped milestone and an unknown status, writing nothing', async () => {
    const shipped = world({ status: 'Shipped' });
    const refused = await shipped.create('key-1');
    assert.deepEqual([refused.status, refused.body.error], [400, SHIPPED_TAKES_NO_TASKS]);
    assert.equal(shipped.t.rows('tasks').length, 0);

    const w = world();
    const bad = await w.create('key-1', { status: 'Nope' });
    assert.equal(bad.status, 400);
    assert.equal(w.t.rows('tasks').length, 0);
  });
});
