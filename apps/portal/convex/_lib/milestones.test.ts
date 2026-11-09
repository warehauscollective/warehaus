import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { isClientVisibleActivityType } from '@warehaus/portal-sync';
import {
  AI_CANNOT_DECIDE,
  AI_LOCKED,
  HUMAN_CONTENT_LOCKED,
  applyHumanDecision,
  attachTaskDecision,
  buildRoadmap,
  writeMilestoneActivity,
  clientMaySeeLinkedResource,
  clientMaySeeMilestone,
  contentEditDecision,
  createMilestoneDecision,
  detachTaskDecision,
  nextMilestoneOrder,
  normalizeGoals,
  publishDecision,
  resourceEditDecision,
  resourceLinkDecision,
  taskLinkPatch,
  workStatusDecision,
  type RoadmapTaskInput,
} from './milestones';

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
      workStatus: 'ready',
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    assert.equal(created.milestone.publishToWarehaus, false);
    assert.equal(created.milestone.approval, 'unreviewed');
    assert.deepEqual(created.milestone.goals, ['Hero', 'Menu']);
    assert.equal(created.activityType, 'milestone.ready');
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
    assert.equal(workStatusDecision({ actor: 'ai', approval: 'approved', from: 'ready', to: 'active' }).ok, false);
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

  it('lets a human move work status, including after approval', () => {
    const moved = workStatusDecision({
      actor: 'human',
      approval: 'approved',
      from: 'active',
      to: 'ready',
    });
    assert.equal(moved.ok, true);
    if (!moved.ok) return;
    assert.equal(moved.workStatus, 'ready');
    assert.equal(moved.activityType, 'milestone.ready');
    assert.equal(
      workStatusDecision({ actor: 'human', approval: 'approved', from: 'ready', to: 'ready' }).ok &&
        workStatusDecision({ actor: 'human', approval: 'approved', from: 'ready', to: 'ready' }).ok,
      true,
    );
    const again = workStatusDecision({ actor: 'human', approval: 'unreviewed', from: 'ready', to: 'ready' });
    assert.equal(again.ok, true);
    if (!again.ok) return;
    assert.equal(again.activityType, null);
  });

  it('lets a human publish without changing approval', () => {
    const published = publishDecision({ actor: 'human', publishToWarehaus: true });
    assert.deepEqual(published, { ok: true, publishToWarehaus: true });
  });
});

describe('tasks on a milestone', () => {
  const milestone = { id: 'm-1', orgId: 'org-1', projectId: 'p-1', approval: 'unreviewed' as const };

  it('attaches only a top-level task on the same project', () => {
    assert.equal(
      attachTaskDecision({
        actor: 'ai',
        milestone,
        task: { id: 't-1', orgId: 'org-1', projectId: 'p-1', parentTaskId: null, milestoneId: null },
      }).ok,
      true,
    );
    const child = attachTaskDecision({
      actor: 'human',
      milestone,
      task: { id: 't-2', orgId: 'org-1', projectId: 'p-1', parentTaskId: 't-1', milestoneId: null },
    });
    assert.equal(child.ok, false);
    const otherProject = attachTaskDecision({
      actor: 'ai',
      milestone,
      task: { id: 't-3', orgId: 'org-1', projectId: 'p-2', parentTaskId: null, milestoneId: null },
    });
    assert.equal(otherProject.ok, false);
    const otherOrg = attachTaskDecision({
      actor: 'ai',
      milestone,
      task: { id: 't-4', orgId: 'org-2', projectId: 'p-1', parentTaskId: null, milestoneId: null },
    });
    assert.equal(otherOrg.ok, false);
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
    assert.equal(attachTaskDecision({ actor: 'ai', milestone: approved, task: link }).ok, false);
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

  it('writes only the link fields', () => {
    const patch = taskLinkPatch('m-1', nextMilestoneOrder([0, null]));
    assert.deepEqual(patch, { milestoneId: 'm-1', milestoneOrder: 1 });
    assert.equal('isDone' in patch, false);
    assert.equal('status' in patch, false);
    assert.equal('stage' in patch, false);
  });
});

describe('human decision', () => {
  const tasks = [{ id: 't-1', isDone: false, status: 'In Progress', stage: 'Building' }];

  it('approves without closing tasks', () => {
    const decided = applyHumanDecision({
      actor: 'human',
      decision: 'approved',
      note: ' The homepage matches the frame ',
      approverContactId: 'contact-1',
      at: 100,
      tasks,
    });
    assert.equal(decided.ok, true);
    if (!decided.ok) return;
    assert.equal(decided.patch.approval, 'approved');
    assert.equal(decided.patch.note, 'The homepage matches the frame');
    assert.equal(decided.patch.approverContactId, 'contact-1');
    assert.equal(decided.patch.decidedAt, 100);
    assert.equal(decided.patch.workStatus, undefined);
    assert.deepEqual(decided.taskWrites, []);
    assert.equal(decided.tasks[0]?.isDone, false);
    assert.equal(decided.tasks[0]?.status, 'In Progress');
    assert.equal(decided.activityType, 'milestone.approved');
  });

  it('sends the milestone back to active work', () => {
    const decided = applyHumanDecision({
      actor: 'human',
      decision: 'changes_requested',
      note: 'The menu is still two columns',
      approverContactId: 'contact-1',
      at: 200,
      tasks,
    });
    assert.equal(decided.ok, true);
    if (!decided.ok) return;
    assert.equal(decided.patch.workStatus, 'active');
    assert.equal(decided.activityType, 'milestone.changes_requested');
    assert.equal(decided.tasks[0]?.isDone, false);
  });

  it('refuses an AI decision and an empty note', () => {
    const ai = applyHumanDecision({
      actor: 'ai',
      decision: 'approved',
      note: 'Looks good',
      approverContactId: 'contact-1',
      at: 1,
      tasks,
    });
    assert.equal(ai.ok, false);
    if (ai.ok) return;
    assert.equal(ai.reason, AI_CANNOT_DECIDE);
    assert.equal(
      applyHumanDecision({
        actor: 'human',
        decision: 'approved',
        note: '   ',
        approverContactId: 'contact-1',
        at: 1,
        tasks,
      }).ok,
      false,
    );
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
});

describe('schema slice', () => {
  it('stores milestones in the portal schema without a Notion page id', () => {
    const schema = readFileSync(new URL('../schema.ts', import.meta.url), 'utf8');
    const start = schema.indexOf('milestones: defineTable');
    const end = schema.indexOf('milestoneResources: defineTable');
    const block = schema.slice(start, end);
    assert.ok(start > 0 && end > start);
    assert.match(block, /publishToWarehaus: v\.boolean\(\)/);
    assert.match(block, /goals: v\.array\(v\.string\(\)\)/);
    assert.doesNotMatch(block, /notionPageId/);
    assert.match(schema, /milestoneId: v\.optional\(v\.id\('milestones'\)\)/);
    assert.match(schema, /\.index\('by_orgId_milestoneId', \['orgId', 'milestoneId'\]\)/);
    assert.match(schema, /milestoneResources: defineTable/);
    assert.doesNotMatch(schema.slice(end, schema.indexOf('contacts: defineTable')), /notionPageId/);
  });

  it('does not let the milestone mutations close tasks or write task responses', () => {
    const source = readFileSync(new URL('../milestones.ts', import.meta.url), 'utf8');
    assert.doesNotMatch(source, /taskResponses/);
    assert.doesNotMatch(source, /isDone:\s*(true|false)/);
    assert.doesNotMatch(source, /patch\([^)]*isDone/);
    assert.match(source, /writeMilestoneActivity/);
    assert.match(source, /applyHumanDecision/);
    assert.match(source, /actor: 'ai'/);
    assert.doesNotMatch(source, /approval: v\.literal\('approved'\)/);
  });
});

describe('milestone activity rows', () => {
  it('stores milestoneId so two milestones with the same name stay separate', async () => {
    const inserted: Array<{ table: string; row: { milestoneId: string; name: string; type: string } }> = [];
    const ctx = {
      db: {
        insert: async (table: string, row: { milestoneId: string; name: string; type: string }) => {
          inserted.push({ table, row });
        },
      },
    };
    await writeMilestoneActivity(ctx, { _id: 'm-launch', orgId: 'org', projectId: 'p-site', name: 'Launch' }, 'milestone.approved', 5);
    await writeMilestoneActivity(ctx, { _id: 'm-billing', orgId: 'org', projectId: 'p-site', name: 'Launch' }, 'milestone.changes_requested', 6);
    assert.deepEqual(
      inserted.map((entry) => entry.row.milestoneId),
      ['m-launch', 'm-billing'],
    );
    assert.equal(inserted[0]?.table, 'activity');
    assert.equal(inserted[0]?.row.name, 'Launch');
    assert.equal(inserted[1]?.row.name, 'Launch');
    assert.equal(inserted[0]?.row.type, 'milestone.approved');
    assert.notEqual(inserted[0]?.row.milestoneId, inserted[1]?.row.milestoneId);
  });
});
