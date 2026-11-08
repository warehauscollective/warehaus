import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { linearTaskPlatform } from './linearTaskPlatform';
import { notionTaskPlatform } from './notionTaskPlatform';
import {
  adapterFor,
  readTaskPlatform,
  storedTaskPlatform,
  taskPlatformBlockedMessage,
  taskPlatformCopy,
  toTaskPlatformView,
  type MilestoneSeam,
  type TaskPlatformAdapter,
} from './taskPlatform';

const tasks = [
  { id: 'task-1', projectId: 'proj-1', name: 'Homepage', notionPageId: 'notion-1' },
];

describe('task platform adapter', () => {
  it('stores notion when the field is missing and linear only for that exact value', () => {
    assert.equal(storedTaskPlatform(undefined), 'notion');
    assert.equal(storedTaskPlatform(null), 'notion');
    assert.equal(storedTaskPlatform(''), 'notion');
    assert.equal(storedTaskPlatform('Linear'), 'notion');
    assert.equal(storedTaskPlatform('linear'), 'linear');
  });

  it('uses one interface for both modules', () => {
    const adapters: TaskPlatformAdapter[] = [notionTaskPlatform, linearTaskPlatform];
    assert.deepEqual(
      adapters.map((adapter) => adapter.platform),
      ['notion', 'linear'],
    );
    assert.equal(adapterFor('notion'), notionTaskPlatform);
    assert.equal(adapterFor('linear'), linearTaskPlatform);
  });

  it('returns the Notion tasks and an empty milestone seam', () => {
    const read = readTaskPlatform({ platform: undefined, tasks, env: {} });
    assert.equal(read.platform, 'notion');
    assert.equal(read.tasks.ok, true);
    if (!read.tasks.ok) return;
    assert.deepEqual(read.tasks.items, tasks);
    assert.notEqual(read.tasks.items, tasks);
    assert.equal(read.milestones.ok, true);
    if (!read.milestones.ok) return;
    const milestones: MilestoneSeam[] = read.milestones.items;
    assert.deepEqual(milestones, []);
    assert.equal(taskPlatformBlockedMessage(read), null);
  });

  it('leaves the Notion rows untouched when the read is Linear', () => {
    const before = structuredClone(tasks);
    const read = readTaskPlatform({ platform: 'linear', tasks, env: {} });
    assert.deepEqual(tasks, before);
    assert.equal(read.tasks.ok, false);
    assert.equal(read.milestones.ok, false);
    if (read.tasks.ok || read.milestones.ok) return;
    assert.equal(read.tasks.reason, 'not-configured');
    assert.equal(read.tasks.env, 'LINEAR_API_KEY');
    assert.equal(read.milestones.reason, 'not-configured');
    assert.equal(JSON.stringify(read).includes('notion-1'), false);
    assert.equal(taskPlatformBlockedMessage(read), 'Linear is not configured');
  });

  it('does not fetch from the sync preview when a key is present', async () => {
    const original = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = () => {
      calls += 1;
      throw new Error('Linear was called');
    };
    try {
      const read = readTaskPlatform({
        platform: 'linear',
        tasks,
        env: { LINEAR_API_KEY: 'linear-test-key' },
      });
      assert.equal(calls, 0);
      assert.equal(read.tasks.ok, false);
      if (read.tasks.ok) return;
      assert.equal(read.tasks.reason, 'remote');
      assert.equal(read.milestones.ok, false);
      assert.equal(JSON.stringify(read).includes('linear-test-key'), false);
      assert.deepEqual(tasks, [
        { id: 'task-1', projectId: 'proj-1', name: 'Homepage', notionPageId: 'notion-1' },
      ]);
      assert.equal(taskPlatformBlockedMessage(read), 'This client reads tasks from Linear');
      const view = toTaskPlatformView({
        platform: 'linear',
        tasks,
        canChange: true,
        env: { LINEAR_API_KEY: 'linear-test-key' },
      });
      assert.match(taskPlatformCopy(view, 'staff').body, /Tasks load from Linear/);
      assert.match(taskPlatformCopy(view, 'client').body, /Only Warehaus staff can change this/);
      assert.equal(JSON.stringify(view).includes('linear-test-key'), false);
      const loaded = {
        platform: 'linear' as const,
        tasks: { ok: true as const, platform: 'linear' as const, count: 2 },
      };
      assert.match(taskPlatformCopy(loaded, 'staff').body, /read from Linear/);
      assert.equal(taskPlatformCopy(loaded, 'staff').title, 'Linear');
    } finally {
      globalThis.fetch = original;
    }
  });

  it('describes the choice for staff and for clients', () => {
    const notion = toTaskPlatformView({ platform: 'notion', tasks, canChange: true, env: {} });
    assert.equal(notion.tasks.ok, true);
    if (notion.tasks.ok) assert.equal(notion.tasks.count, 1);
    assert.match(taskPlatformCopy(notion, 'staff').body, /leaves Notion tasks/);
    assert.match(taskPlatformCopy(notion, 'client').body, /Only Warehaus staff can change this/);

    const linear = toTaskPlatformView({ platform: 'linear', tasks, canChange: false, env: {} });
    assert.equal(linear.canChange, false);
    assert.equal(linear.tasks.ok, false);
    assert.match(taskPlatformCopy(linear, 'staff').body, /LINEAR_API_KEY is unset/);
    assert.match(taskPlatformCopy(linear, 'client').body, /Notion tasks are still stored/);
    assert.equal(taskPlatformCopy(linear, 'client').body.includes('button'), false);
  });
});
