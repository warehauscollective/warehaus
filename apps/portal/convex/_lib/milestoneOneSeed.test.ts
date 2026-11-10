import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  MILESTONE_ONE_NAME,
  MILESTONE_ONE_OBJECTIVE,
  planMilestoneOne,
  summarizeMilestoneOne,
  type MilestoneOneMilestone,
  type MilestoneOneProject,
  type MilestoneOneTask,
} from './milestoneOneSeed';

const projects: MilestoneOneProject[] = [
  { id: 'p-site', name: 'Northwind site' },
  { id: 'p-empty', name: 'Empty project' },
  { id: 'p-brand', name: 'Brand' },
];

function task(extra: Partial<MilestoneOneTask> & Pick<MilestoneOneTask, 'id' | 'projectId'>): MilestoneOneTask {
  return {
    parentTaskId: null,
    milestoneId: null,
    ...extra,
  };
}

function plan(input: {
  milestones?: MilestoneOneMilestone[];
  tasks?: MilestoneOneTask[];
  projects?: MilestoneOneProject[];
}) {
  return planMilestoneOne({
    projects: input.projects ?? projects,
    milestones: input.milestones ?? [],
    tasks: input.tasks ?? [],
  });
}

describe('Milestone One plan', () => {
  it('uses the exact name and does not describe task generation', () => {
    assert.equal(MILESTONE_ONE_NAME, 'Milestone One');
    assert.equal(MILESTONE_ONE_OBJECTIVE.includes('generat'), false);
    assert.equal(MILESTONE_ONE_OBJECTIVE.trim().length > 0, true);
  });

  it('leaves a project with no tasks alone', () => {
    const result = plan({ tasks: [task({ id: 't-site', projectId: 'p-site' })] });
    const empty = result.projects.find((row) => row.projectId === 'p-empty');
    assert.equal(empty?.taskCount, 0);
    assert.equal(empty?.action, 'skip');
    assert.deepEqual(empty?.taskIds, []);
    assert.equal(result.projects.some((row) => row.projectId === 'p-empty' && row.action === 'create'), false);
  });

  it('creates one milestone for unassigned top-level tasks and leaves assigned tasks out', () => {
    const result = plan({
      tasks: [
        task({ id: 't-b', projectId: 'p-site' }),
        task({ id: 't-a', projectId: 'p-site' }),
        task({ id: 't-kept', projectId: 'p-site', milestoneId: 'm-launch' }),
        task({ id: 't-child', projectId: 'p-site', parentTaskId: 't-a' }),
      ],
    });
    const site = result.projects.find((row) => row.projectId === 'p-site');
    assert.equal(site?.action, 'create');
    assert.equal(site?.milestoneId, null);
    assert.deepEqual(site?.taskIds, ['t-a', 't-b']);
    assert.equal(site?.taskCount, 4);
    assert.equal(site?.attachedCount, 1);
    assert.equal(site?.unassignedCount, 2);
    assert.equal(site?.nestedCount, 1);
    assert.equal(site?.taskIds.includes('t-kept'), false);
    assert.equal(site?.taskIds.includes('t-child'), false);
  });

  it('reuses the existing Milestone One instead of creating a second', () => {
    const result = plan({
      milestones: [
        { id: 'm-later', projectId: 'p-site', name: 'Milestone One', createdAt: 20 },
        { id: 'm-early', projectId: 'p-site', name: 'Milestone One', createdAt: 10 },
        { id: 'm-other', projectId: 'p-brand', name: 'Milestone One', createdAt: 1 },
        { id: 'm-close', projectId: 'p-site', name: 'Milestone one', createdAt: 1 },
        { id: 'm-space', projectId: 'p-site', name: 'Milestone One ', createdAt: 1 },
      ],
      tasks: [task({ id: 't-open', projectId: 'p-site' }), task({ id: 't-brand', projectId: 'p-brand', milestoneId: 'm-other' })],
    });
    const site = result.projects.find((row) => row.projectId === 'p-site');
    const brand = result.projects.find((row) => row.projectId === 'p-brand');
    assert.equal(site?.action, 'reuse');
    assert.equal(site?.milestoneId, 'm-early');
    assert.deepEqual(site?.taskIds, ['t-open']);
    assert.equal(result.projects.filter((row) => row.action === 'create').length, 0);
    assert.equal(brand?.action, 'skip');
    assert.deepEqual(brand?.taskIds, []);
  });

  it('skips a project whose tasks already have milestones', () => {
    const result = plan({
      tasks: [task({ id: 't-done', projectId: 'p-brand', milestoneId: 'm-launch' })],
      milestones: [{ id: 'm-launch', projectId: 'p-brand', name: 'Launch', createdAt: 1 }],
    });
    const brand = result.projects.find((row) => row.projectId === 'p-brand');
    assert.equal(brand?.action, 'skip');
    assert.equal(brand?.attachedCount, 1);
    assert.deepEqual(brand?.taskIds, []);
  });

  it('does not invent a project for a task with no project row', () => {
    const result = plan({ tasks: [task({ id: 't-orphan', projectId: 'p-missing' })] });
    assert.equal(result.orphans, 1);
    assert.equal(result.projects.some((row) => row.projectId === 'p-missing'), false);
  });

  it('is idempotent once those tasks have Milestone One', () => {
    const first = plan({ tasks: [task({ id: 't-a', projectId: 'p-site' })] });
    assert.equal(first.projects.find((row) => row.projectId === 'p-site')?.action, 'create');
    const second = plan({
      milestones: [{ id: 'm-one', projectId: 'p-site', name: MILESTONE_ONE_NAME, createdAt: 5 }],
      tasks: [task({ id: 't-a', projectId: 'p-site', milestoneId: 'm-one' })],
    });
    const site = second.projects.find((row) => row.projectId === 'p-site');
    assert.equal(site?.action, 'skip');
    assert.deepEqual(site?.taskIds, []);
    const counts = summarizeMilestoneOne(second.projects, second.orphans);
    assert.equal(counts.creates, 0);
    assert.equal(counts.reuses, 0);
    assert.equal(counts.attaches, 0);
    assert.equal(counts.alreadyAttached, 1);
  });

  it('counts a create and the tasks it would attach', () => {
    const result = plan({
      tasks: [task({ id: 't-a', projectId: 'p-site' }), task({ id: 't-b', projectId: 'p-brand' })],
    });
    const counts = summarizeMilestoneOne(result.projects, result.orphans);
    assert.equal(counts.projects, 3);
    assert.equal(counts.projectsWithTasks, 2);
    assert.equal(counts.leftAlone, 1);
    assert.equal(counts.creates, 2);
    assert.equal(counts.attaches, 2);
    assert.equal(counts.orphans, 0);
  });
});

describe('Milestone One migration wiring', () => {
  it('dry-runs unless apply is set, and writes through create and attachTask', () => {
    const source = readFileSync(new URL('../milestones.ts', import.meta.url), 'utf8');
    const preview = source.slice(source.indexOf('export const previewMilestoneOne'), source.indexOf('export const migrateMilestoneOne'));
    const migrate = source.slice(source.indexOf('export const migrateMilestoneOne'));
    assert.match(preview, /internalQuery/);
    assert.equal(preview.includes('insertMilestone'), false);
    assert.equal(preview.includes('linkTask'), false);
    assert.equal(preview.includes('ctx.db.insert'), false);
    assert.equal(preview.includes('ctx.db.patch'), false);
    const gate = migrate.indexOf('args.apply !== true');
    const createAt = migrate.indexOf('insertMilestone(');
    const attachAt = migrate.indexOf('linkTask(');
    assert.ok(gate >= 0 && createAt > gate && attachAt > gate);
    assert.match(migrate, /insertMilestone\(ctx, 'human'/);
    assert.match(migrate, /linkTask\(ctx, 'human'/);
    assert.match(migrate, /name: MILESTONE_ONE_NAME/);
    assert.match(migrate, /objective: MILESTONE_ONE_OBJECTIVE/);
    assert.equal(migrate.includes('task.name'), false);
    assert.equal(migrate.includes('name: task'), false);
    const schema = readFileSync(new URL('../schema.ts', import.meta.url), 'utf8');
    assert.equal(schema.includes('Milestone One'), false);
  });
});
