import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { isClientVisibleActivityType } from '@warehaus/portal-sync';
import { attachTask, attachTaskFromAi, create, saveFromAi } from '../milestones';
import { createMilestone } from '../portalApi';
import { PortalAuthError } from './identity';
import { MemoryCtxError, memoryCtx } from './memoryCtx.testkit';
import {
  AI_CANNOT_DECIDE,
  AI_LOCKED,
  HUMAN_CONTENT_LOCKED,
  attachTaskDecision,
  buildRoadmap,
  writeMilestoneActivity,
  clientMaySeeLinkedResource,
  clientMaySeeMilestone,
  contentEditDecision,
  MILESTONE_OBJECTIVE_LIMIT,
  OBJECTIVE_TOO_LONG,
  createMilestoneDecision,
  detachTaskDecision,
  nextMilestoneOrder,
  normalizeGoals,
  publishDecision,
  resourceEditDecision,
  resourceLinkDecision,
  taskLinkPatch,
  type RoadmapTaskInput,
} from './milestones';
import { transitionMilestone } from './milestoneStatus';
import { seedMilestone, seedMilestoneWorld, seedOrg, seedProject, seedTask } from './seedRows.testkit';

const schemaError = (pattern: RegExp) => (error: unknown) => error instanceof MemoryCtxError && pattern.test(error.message);
const without = (row: Record<string, unknown> | null, ...keys: string[]) =>
  Object.fromEntries(Object.entries(row ?? {}).filter(([key]) => !keys.includes(key)));

const projectOpen = {
  name: 'Northwind site',
  types: [] as string[],
  publishToWarehaus: true,
  archive: false,
  hidden: false,
  orgVisible: true,
};

function task(extra: Partial<RoadmapTaskInput> = {}): RoadmapTaskInput {
  return {
    id: 'task-1',
    name: 'Build the page',
    status: 'In Progress',
    isDone: false,
    stage: 'Building',
    pullRequestUrl: 'https://github.com/warehauscollective/warehaus/pull/83',
    parentTaskId: null,
    milestoneId: 'm-1',
    milestoneOrder: 0,
    resourceCount: 2,
    publishToWarehaus: true,
    hidden: false,
    ...extra,
  };
}

describe('milestone create', () => {
  it('starts unpublished and unreviewed', () => {
    const created = createMilestoneDecision({
      actor: 'ai',
      name: ' Launch ',
      objective: ' The homepage is up ',
      goals: [' Hero ', '', ' Menu '],
      status: 'Ready to Ship',
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    assert.equal(created.milestone.publishToWarehaus, false);
    assert.equal(created.milestone.approval, 'unreviewed');
    assert.deepEqual(created.milestone.goals, ['Hero', 'Menu']);
    assert.equal(created.activityType, 'milestone.ready');
  });

  it('rejects an empty or missing objective over the staff API and through the portal mutation', async () => {
    const bodies: Array<{ name: string; objective?: string }> = [
      { name: 'Launch' },
      { name: 'Launch', objective: '' },
      { name: 'Launch', objective: '   ' },
    ];
    for (const body of bodies) {
      const objective = String(body.objective ?? '');
      assert.deepEqual(
        createMilestoneDecision({ actor: 'human', name: body.name, objective, goals: [] }),
        { ok: false, reason: 'Objective is required' },
      );
    }

    const t = memoryCtx();
    const orgId = seedOrg(t);
    const projectId = seedProject(t, orgId);
    const tokenId = t.seed('apiTokens', {
      name: 'grok',
      tokenHash: 'hash',
      tokenPrefix: 'wh_',
      scope: 'read-write',
      createdAt: 0,
      rateLimit: 100,
      rateWindowMs: 60_000,
      windowStartedAt: 0,
      windowCount: 0,
    });
    // The REST route sends a missing objective as '' (String(body.objective ?? '')).
    for (const [index, objective] of ['', '   '].entries()) {
      const result = await t.call(createMilestone, {
        tokenId,
        key: `key-${index}`,
        requestHash: `hash-${index}`,
        projectId,
        name: 'Launch',
        objective,
        goals: [],
      });
      assert.deepEqual(result, { status: 400, body: { error: 'Objective is required' } });
    }
    await assert.rejects(
      t.call(create, { projectId, name: 'Launch', objective: '  ', goals: [] }, { as: 'staff' }),
      (error: unknown) => error instanceof PortalAuthError && error.message === 'Objective is required',
    );
    assert.deepEqual(t.rows('milestones'), []);
  });

  it('caps the objective at the card brief length', () => {
    const objective = 'x'.repeat(MILESTONE_OBJECTIVE_LIMIT + 1);
    assert.deepEqual(createMilestoneDecision({ actor: 'human', name: 'Launch', objective, goals: [] }), {
      ok: false,
      reason: OBJECTIVE_TOO_LONG,
    });
    assert.equal(
      contentEditDecision({ actor: 'human', approval: 'unreviewed', patch: { objective } }).ok,
      false,
    );
    assert.equal(
      createMilestoneDecision({ actor: 'human', name: 'Launch', objective: 'x'.repeat(MILESTONE_OBJECTIVE_LIMIT), goals: [] }).ok,
      true,
    );
  });

  it('refuses an approval or a publish flag on create', () => {
    assert.equal(
      createMilestoneDecision({
        actor: 'ai',
        name: 'Launch',
        objective: 'Live',
        goals: [],
        approval: 'approved',
      }).ok,
      false,
    );
    assert.equal(
      createMilestoneDecision({
        actor: 'human',
        name: 'Launch',
        objective: 'Live',
        goals: [],
        publishToWarehaus: true,
      }).ok,
      false,
    );
  });
});

describe('goals stay text', () => {
  it('keeps checkbox marks as text', () => {
    assert.deepEqual(normalizeGoals(['[ ] Ship it', '[x] Done line', '  ']), ['[ ] Ship it', '[x] Done line']);
  });
});

describe('who may edit', () => {
  it('lets AI edit while the milestone is not approved', () => {
    const edited = contentEditDecision({
      actor: 'ai',
      approval: 'changes_requested',
      patch: { name: 'Launch', objective: 'Live', goals: ['Hero'] },
    });
    assert.equal(edited.ok, true);
  });

  it('stops AI from setting approval or editing an approved milestone', () => {
    const approval = contentEditDecision({
      actor: 'ai',
      approval: 'unreviewed',
      patch: { approval: 'approved' },
    });
    assert.equal(approval.ok, false);
    if (approval.ok) return;
    assert.equal(approval.reason, AI_CANNOT_DECIDE);

    const locked = contentEditDecision({
      actor: 'ai',
      approval: 'approved',
      patch: { name: 'Renamed' },
    });
    assert.equal(locked.ok, false);
    if (locked.ok) return;
    assert.equal(locked.reason, AI_LOCKED);
    assert.equal(
      transitionMilestone({ from: 'Ready to Ship', cause: 'set', to: 'Building', actor: 'ai', approval: 'approved' }).ok,
      false,
    );
    assert.equal(resourceEditDecision({ actor: 'ai', approval: 'approved' }).ok, false);
    assert.equal(publishDecision({ actor: 'ai', publishToWarehaus: true }).ok, false);
  });

  it('stops a human from editing the objective while it is approved', () => {
    const locked = contentEditDecision({
      actor: 'human',
      approval: 'approved',
      patch: { objective: 'Something else' },
    });
    assert.equal(locked.ok, false);
    if (locked.ok) return;
    assert.equal(locked.reason, HUMAN_CONTENT_LOCKED);
    assert.equal(resourceEditDecision({ actor: 'human', approval: 'approved' }).ok, false);
  });

  it('lets a human move the status, including after approval', () => {
    const moved = transitionMilestone({
      from: 'Building',
      cause: 'set',
      to: 'Ready to Ship',
      actor: 'human',
      approval: 'approved',
    });
    assert.deepEqual(moved, { ok: true, from: 'Building', status: 'Ready to Ship', wrote: true });
    const again = transitionMilestone({ from: 'Ready to Ship', cause: 'set', to: 'Ready to Ship' });
    assert.deepEqual(again, { ok: true, from: 'Ready to Ship', status: 'Ready to Ship', wrote: false });
  });

  it('starts a new milestone at Planning and never at Shipped', () => {
    const base = { actor: 'human' as const, name: 'Launch', objective: 'Up', goals: [] };
    const plain = createMilestoneDecision(base);
    assert.equal(plain.ok && plain.milestone.status, 'Planning');
    assert.equal(plain.ok && plain.activityType, null);
    const idea = createMilestoneDecision({ ...base, status: 'Idea' });
    assert.equal(idea.ok && idea.milestone.status, 'Idea');
    assert.deepEqual(createMilestoneDecision({ ...base, status: 'Shipped' }), {
      ok: false,
      reason: 'Staff set Shipped when every task that is not Parked is Done. A task reaches Shipped only after its pull request is verified merged.',
    });
    assert.deepEqual(createMilestoneDecision({ ...base, status: 'ready' }), { ok: false, reason: 'Unknown status' });
  });

  it('lets a human publish without changing approval', () => {
    const published = publishDecision({ actor: 'human', publishToWarehaus: true });
    assert.deepEqual(published, { ok: true, publishToWarehaus: true });
  });
});

describe('tasks on a milestone', () => {
  const milestone = { id: 'm-1', orgId: 'org-1', projectId: 'p-1', approval: 'unreviewed' as const };

  it('attaches a same-project subtask and does not treat that as linking the parent', () => {
    const top = attachTaskDecision({
      actor: 'ai',
      milestone,
      task: { id: 't-1', orgId: 'org-1', projectId: 'p-1', parentTaskId: null, milestoneId: null },
    });
    assert.deepEqual(top, { ok: true, alreadyAttached: false });
    const child = attachTaskDecision({
      actor: 'human',
      milestone,
      task: { id: 't-2', orgId: 'org-1', projectId: 'p-1', parentTaskId: 't-1', milestoneId: null },
    });
    assert.deepEqual(child, { ok: true, alreadyAttached: false });
    assert.deepEqual(taskLinkPatch('m-1', 0), { milestoneId: 'm-1', milestoneOrder: 0 });
    const again = attachTaskDecision({
      actor: 'human',
      milestone,
      task: { id: 't-2', orgId: 'org-1', projectId: 'p-1', parentTaskId: 't-1', milestoneId: 'm-1' },
    });
    assert.deepEqual(again, { ok: true, alreadyAttached: true });
    const taken = attachTaskDecision({
      actor: 'human',
      milestone,
      task: { id: 't-2', orgId: 'org-1', projectId: 'p-1', parentTaskId: 't-1', milestoneId: 'm-2' },
    });
    assert.deepEqual(taken, {
      ok: false,
      reason: 'Task is already on a milestone',
      code: 'already_attached',
    });
    const otherProject = attachTaskDecision({
      actor: 'ai',
      milestone,
      task: { id: 't-3', orgId: 'org-1', projectId: 'p-2', parentTaskId: 't-1', milestoneId: null },
    });
    assert.deepEqual(otherProject, { ok: false, reason: 'Task is on another project', code: 'wrong_project' });
    const otherOrg = attachTaskDecision({
      actor: 'ai',
      milestone,
      task: { id: 't-4', orgId: 'org-2', projectId: 'p-1', parentTaskId: null, milestoneId: null },
    });
    assert.deepEqual(otherOrg, { ok: false, reason: 'Task belongs to another client', code: 'permission' });
  });

  it('lets a human add or remove tasks while approved, and stops AI', () => {
    const approved = { ...milestone, approval: 'approved' as const };
    const link = {
      id: 't-1',
      orgId: 'org-1',
      projectId: 'p-1',
      parentTaskId: null,
      milestoneId: null,
    };
    const denied = attachTaskDecision({ actor: 'ai', milestone: approved, task: link });
    assert.deepEqual(denied, { ok: false, reason: AI_LOCKED, code: 'permission' });
    assert.equal(attachTaskDecision({ actor: 'human', milestone: approved, task: link }).ok, true);
    assert.equal(
      detachTaskDecision({
        actor: 'ai',
        milestone: approved,
        task: { milestoneId: 'm-1' },
      }).ok,
      false,
    );
    assert.equal(
      detachTaskDecision({
        actor: 'human',
        milestone: approved,
        task: { milestoneId: 'm-1' },
      }).ok,
      true,
    );
  });

  it('writes only the link fields', async () => {
    const patch = taskLinkPatch('m-1', nextMilestoneOrder([0, null]));
    assert.deepEqual(patch, { milestoneId: 'm-1', milestoneOrder: 1 });
    assert.equal('isDone' in patch, false);
    assert.equal('status' in patch, false);
    assert.equal('stage' in patch, false);

    const t = memoryCtx();
    const world = seedMilestoneWorld(t);
    world.task({ milestoneOrder: 0 });
    const parent = seedTask(t, world.orgId, world.projectId, { status: 'In Progress' });
    const child = seedTask(t, world.orgId, world.projectId, { parentTaskId: parent, stage: 'Building' });
    const sibling = seedTask(t, world.orgId, world.projectId, { parentTaskId: parent });
    const before = { parent: t.row(parent), child: t.row(child), sibling: t.row(sibling) };

    assert.deepEqual(await t.call(attachTask, { milestoneId: world.milestoneId, taskId: child }, { as: 'staff' }), { ok: true });
    assert.equal(t.row(child)?.milestoneId, world.milestoneId);
    assert.equal(t.row(child)?.milestoneOrder, 1);
    assert.deepEqual(without(t.row(child), 'milestoneId', 'milestoneOrder'), without(before.child, 'milestoneId', 'milestoneOrder'));
    // Attaching a subtask does not write its parent or its siblings.
    assert.deepEqual(t.row(parent), before.parent);
    assert.deepEqual(t.row(sibling), before.sibling);
  });
});

describe('resources', () => {
  it('keeps a link in the same org', () => {
    assert.equal(resourceLinkDecision('org-1', 'org-1').ok, true);
    assert.equal(resourceLinkDecision('org-1', 'org-2').ok, false);
    assert.equal(resourceLinkDecision('org-1', null).ok, false);
  });

  it('hides unpublished resources from clients', () => {
    assert.equal(
      clientMaySeeLinkedResource({
        publishToWarehaus: false,
        archive: false,
        hidden: false,
        granolaOk: true,
        project: null,
      }),
      false,
    );
    assert.equal(
      clientMaySeeLinkedResource({
        publishToWarehaus: true,
        archive: false,
        hidden: false,
        granolaOk: true,
        project: null,
      }),
      true,
    );
  });
});

describe('client visibility', () => {
  it('hides an unpublished milestone', () => {
    assert.equal(clientMaySeeMilestone({ publishToWarehaus: false, project: projectOpen }), false);
    assert.equal(clientMaySeeMilestone({ publishToWarehaus: true, project: projectOpen }), true);
    assert.equal(
      clientMaySeeMilestone({
        publishToWarehaus: true,
        project: { ...projectOpen, publishToWarehaus: false },
      }),
      false,
    );
  });

  it('keeps milestone activity off the client feed', () => {
    assert.equal(isClientVisibleActivityType('milestone.ready'), false);
    assert.equal(isClientVisibleActivityType('milestone.approved'), false);
    assert.equal(isClientVisibleActivityType('milestone.changes_requested'), false);
  });
});

describe('roadmap', () => {
  const tasks: RoadmapTaskInput[] = [
    task({ id: 'parent', name: 'Build the page', milestoneOrder: 1, isDone: false, resourceCount: 3 }),
    task({
      id: 'child',
      name: 'Check the type',
      parentTaskId: 'parent',
      milestoneId: null,
      milestoneOrder: null,
      status: 'To Do',
      isDone: false,
      resourceCount: 0,
      pullRequestUrl: null,
    }),
    task({
      id: 'done',
      name: 'Approve the type',
      milestoneOrder: 0,
      status: 'Done',
      isDone: true,
      stage: null,
      resourceCount: 1,
      pullRequestUrl: null,
    }),
    task({ id: 'other', name: 'Not on this milestone', milestoneId: null, milestoneOrder: null }),
    task({ id: 'secret', name: 'Hidden draft', publishToWarehaus: false, milestoneOrder: 2 }),
  ];

  it('lists the milestone tasks with open work as context', () => {
    const roadmap = buildRoadmap({
      audience: 'staff',
      milestoneId: 'm-1',
      tasks,
      projectVisibleToClient: true,
    });
    assert.deepEqual(
      roadmap.rows.map((row) => row.name),
      ['Approve the type', 'Build the page', 'Hidden draft'],
    );
    assert.deepEqual(
      roadmap.rows[1]?.children.map((child) => child.name),
      ['Check the type'],
    );
    assert.equal(roadmap.rows[1]?.resourceCount, 3);
    assert.equal(roadmap.rows[1]?.pullRequestUrl, 'https://github.com/warehauscollective/warehaus/pull/83');
    assert.equal(roadmap.rows[1]?.status, 'In Progress');
    assert.equal(roadmap.rows[1]?.stage, 'Building');
    assert.equal(roadmap.openCount, 3);
    assert.equal(roadmap.doneCount, 1);
    assert.equal(roadmap.countIsDecision, false);
    assert.equal('percentComplete' in roadmap, false);
    assert.equal('percent' in roadmap, false);
  });

  it('omits unpublished tasks and pull requests for a client', () => {
    const roadmap = buildRoadmap({
      audience: 'client',
      milestoneId: 'm-1',
      tasks,
      projectVisibleToClient: true,
    });
    assert.deepEqual(
      roadmap.rows.map((row) => row.name),
      ['Approve the type', 'Build the page'],
    );
    assert.equal('pullRequestUrl' in (roadmap.rows[1] ?? {}), false);
    assert.equal(roadmap.openCount, 2);
    assert.equal(roadmap.doneCount, 1);
  });

  it('leaves Parked and archived tasks out of both counts, and counts a Done status as done', () => {
    const roadmap = buildRoadmap({
      audience: 'staff',
      milestoneId: 'm-1',
      tasks: [
        task({ id: 'a', status: 'Done', isDone: false }),
        task({ id: 'parked', stage: 'Parked', milestoneOrder: 1 }),
        task({ id: 'old', archived: true, milestoneOrder: 2 }),
      ],
      projectVisibleToClient: true,
    });
    assert.deepEqual(roadmap.rows.map((row) => row.id), ['a', 'parked', 'old']);
    assert.deepEqual([roadmap.openCount, roadmap.doneCount], [0, 1]);
    assert.equal(roadmap.canClose, true);
  });

  it('works out canClose for staff from the whole set, and gives clients none', () => {
    const tasks = [
      task({ id: 'a', status: 'Done', isDone: true }),
      task({ id: 'draft', publishToWarehaus: false, milestoneOrder: 1 }),
    ];
    const staff = buildRoadmap({ audience: 'staff', milestoneId: 'm-1', tasks, projectVisibleToClient: true });
    assert.equal(staff.canClose, false);
    const client = buildRoadmap({ audience: 'client', milestoneId: 'm-1', tasks, projectVisibleToClient: true });
    assert.equal('canClose' in client, false);
    // A client counts only what it can see.
    assert.deepEqual([client.openCount, client.doneCount], [0, 1]);
  });

  it('shows an attached subtask once and does not pull its parent or siblings', () => {
    const alone = buildRoadmap({
      audience: 'staff',
      milestoneId: 'm-1',
      tasks: [
        task({ id: 'plan', name: 'Plan', milestoneId: null, milestoneOrder: null, parentTaskId: null }),
        task({ id: 'rollup', name: 'Rollup', milestoneId: null, milestoneOrder: null, parentTaskId: 'plan' }),
        task({
          id: 'sub',
          name: 'Ship the header',
          parentTaskId: 'plan',
          milestoneId: 'm-1',
          milestoneOrder: 0,
          isDone: false,
        }),
        task({
          id: 'sib',
          name: 'Ship the footer',
          parentTaskId: 'plan',
          milestoneId: null,
          milestoneOrder: null,
        }),
      ],
      projectVisibleToClient: true,
    });
    assert.deepEqual(
      alone.rows.map((row) => row.id),
      ['sub'],
    );
    assert.deepEqual(alone.rows[0]?.children, []);
    assert.equal(alone.openCount, 1);
    assert.equal(alone.doneCount, 0);

    const both = buildRoadmap({
      audience: 'staff',
      milestoneId: 'm-1',
      tasks: [
        task({ id: 'plan', name: 'Plan', milestoneId: 'm-1', milestoneOrder: 0, isDone: false }),
        task({
          id: 'sub',
          name: 'Ship the header',
          parentTaskId: 'plan',
          milestoneId: 'm-1',
          milestoneOrder: 1,
          isDone: true,
        }),
        task({
          id: 'sib',
          name: 'Ship the footer',
          parentTaskId: 'plan',
          milestoneId: null,
          milestoneOrder: null,
          isDone: false,
        }),
      ],
      projectVisibleToClient: true,
    });
    assert.deepEqual(
      both.rows.map((row) => row.id),
      ['plan'],
    );
    assert.deepEqual(
      both.rows[0]?.children.map((child) => child.id),
      ['sib', 'sub'],
    );
    assert.equal(both.rows[0]?.children.find((child) => child.id === 'sib')?.onMilestone, false);
    assert.equal(both.rows[0]?.children.find((child) => child.id === 'sub')?.onMilestone, true);
    const shown = both.rows.flatMap((row) => [row.id, ...row.children.map((child) => child.id)]);
    assert.equal(new Set(shown).size, shown.length);
    assert.equal(both.openCount, 2);
    assert.equal(both.doneCount, 1);

    const elsewhere = buildRoadmap({
      audience: 'staff',
      milestoneId: 'm-1',
      tasks: [
        task({ id: 'plan', name: 'Plan', milestoneId: 'm-1', milestoneOrder: 0 }),
        task({
          id: 'sub',
          name: 'Ship the header',
          parentTaskId: 'plan',
          milestoneId: 'm-2',
          milestoneOrder: 0,
        }),
      ],
      projectVisibleToClient: true,
    });
    assert.deepEqual(elsewhere.rows[0]?.children, []);
    assert.equal(elsewhere.openCount, 1);
  });
});

describe('schema slice', () => {
  it('stores milestones in the portal schema without a Notion page id', async () => {
    const t = memoryCtx();
    const orgId = seedOrg(t);
    const projectId = seedProject(t, orgId);
    const { id } = await t.call<{ id: string }>(create, { projectId, name: 'Launch', objective: 'Up', goals: [' Hero ', ''] }, { as: 'staff' });
    const row = t.row(id);
    assert.equal(row?.publishToWarehaus, false);
    assert.deepEqual(row?.goals, ['Hero']);
    assert.equal('notionPageId' in (row ?? {}), false);
    assert.throws(() => seedMilestone(t, orgId, projectId, { notionPageId: 'page-1' }), schemaError(/milestones\.notionPageId: not in the validator/));
    assert.throws(() => seedMilestone(t, orgId, projectId, { publishToWarehaus: 'yes' }), schemaError(/milestones\.publishToWarehaus: expected boolean/));

    // A task may have no milestone, and tasks are read by org and milestone.
    const loose = seedTask(t, orgId, projectId);
    const linked = seedTask(t, orgId, projectId, { milestoneId: id });
    assert.equal('milestoneId' in (t.row(loose) ?? {}), false);
    const onMilestone = await t.db.query('tasks').withIndex('by_orgId_milestoneId', (q) => q.eq('orgId', orgId).eq('milestoneId', id)).take(10);
    assert.deepEqual(onMilestone.map((task) => task._id), [linked]);

    // Resource links are portal rows too.
    const resourceId = t.seed('sharedResources', { orgId, notionPageId: 'res-1', lastSyncedAt: 0, title: 'Brief', publishToWarehaus: true, archive: false });
    t.seed('milestoneResources', { orgId, milestoneId: id, resourceId, sortOrder: 0 });
    assert.throws(
      () => t.seed('milestoneResources', { orgId, milestoneId: id, resourceId, sortOrder: 1, notionPageId: 'page-2' }),
      schemaError(/milestoneResources\.notionPageId: not in the validator/),
    );
  });

  it('patches only the attached task and skips a task that is already linked', async () => {
    const t = memoryCtx();
    const world = seedMilestoneWorld(t);
    world.task({ milestoneOrder: 0 });
    const linked = world.task({ milestoneOrder: 5 });
    const before = t.row(linked);
    // A rewrite would move it to the next order, 6.
    assert.deepEqual(await t.call(attachTask, { milestoneId: world.milestoneId, taskId: linked }, { as: 'staff' }), { ok: true });
    assert.deepEqual(t.row(linked), before);
  });

  it('does not let the milestone mutations close tasks or write task responses', async () => {
    // Absence guards: no milestone mutation closes a task, writes a task response, or takes an approval.
    const source = readFileSync(new URL('../milestones.ts', import.meta.url), 'utf8');
    assert.doesNotMatch(source, /taskResponses/);
    assert.doesNotMatch(source, /isDone:\s*(true|false)/);
    assert.doesNotMatch(source, /patch\([^)]*isDone/);
    assert.doesNotMatch(source, /approval: v\.literal\('approved'\)/);
  });

  it('stops the AI mutations on an approved milestone', async () => {
    const t = memoryCtx();
    const world = seedMilestoneWorld(t, { approval: 'approved', name: 'Launch' });
    const loose = seedTask(t, world.orgId, world.projectId);
    const before = { milestone: t.row(world.milestoneId), task: t.row(loose) };
    await assert.rejects(t.call(saveFromAi, { milestoneId: world.milestoneId, name: 'Renamed' }), (error: unknown) => error instanceof PortalAuthError && error.message === AI_LOCKED);
    await assert.rejects(t.call(saveFromAi, { milestoneId: world.milestoneId, status: 'Planning' }), PortalAuthError);
    await assert.rejects(t.call(attachTaskFromAi, { milestoneId: world.milestoneId, taskId: loose }), (error: unknown) => error instanceof PortalAuthError && error.message === AI_LOCKED);
    assert.deepEqual({ milestone: t.row(world.milestoneId), task: t.row(loose) }, before);
    assert.deepEqual(t.rows('activity'), []);
  });
});

describe('milestone activity rows', () => {
  it('stores milestoneId so two milestones with the same name stay separate', async () => {
    const t = memoryCtx();
    const orgId = seedOrg(t);
    const projectId = seedProject(t, orgId);
    const launch = seedMilestone(t, orgId, projectId, { name: 'Launch' });
    const billing = seedMilestone(t, orgId, projectId, { name: 'Launch' });
    await writeMilestoneActivity(t, { _id: launch, orgId, projectId, name: 'Launch' }, 'milestone.approved', 5);
    await writeMilestoneActivity(t, { _id: billing, orgId, projectId, name: 'Launch' }, 'milestone.changes_requested', 6);
    const rows = t.rows('activity');
    assert.deepEqual(rows.map((row) => row.milestoneId), [launch, billing]);
    assert.deepEqual(rows.map((row) => row.name), ['Launch', 'Launch']);
    assert.deepEqual(rows.map((row) => row.type), ['milestone.approved', 'milestone.changes_requested']);
  });
});
