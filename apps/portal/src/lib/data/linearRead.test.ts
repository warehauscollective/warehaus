import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { LinearOrgRead, MilestoneSeam } from '@warehaus/portal-sync';
import { applyLinearRead } from './linearRead';
import type { PortalSnapshot } from './view-models';

const milestone: MilestoneSeam = {
  id: 'ms-1',
  projectId: 'lin-proj',
  name: 'Launch',
  objective: 'One objective',
  goals: [],
  workStatus: 'active',
  approval: 'unreviewed',
};

function snapshot(): PortalSnapshot {
  return {
    clients: [],
    projects: [],
    tasks: [
      {
        id: 'notion-task',
        name: 'Homepage',
        status: 'To Do',
        isDone: false,
        date: null,
        projectId: 'proj-1',
        projectName: 'Site',
        projectStatus: 'Active',
        projectEndDate: null,
      },
    ],
    activity: [],
    syncMeta: { lastSyncedAt: null, lastError: null, mode: 'convex' },
    taskPlatform: {
      platform: 'linear',
      canChange: false,
      tasks: { ok: false, platform: 'linear', reason: 'remote' },
      milestones: { ok: false, platform: 'linear', reason: 'remote' },
    },
    tenant: { mode: 'client', slug: 'acme', clientExternalId: null, clientName: 'Acme', ok: true },
  };
}

describe('applyLinearRead', () => {
  it('replaces the task read with Linear issues and leaves the input snapshot', () => {
    const input = snapshot();
    const result: LinearOrgRead = {
      ok: true,
      platform: 'linear',
      orgId: 'org-1',
      tasks: [
        {
          id: 'issue-1',
          name: 'Homepage',
          status: 'In Progress',
          isDone: false,
          date: '2026-12-01',
          stage: null,
          lastEditedTime: '2026-11-01T00:00:00.000Z',
          projectId: 'lin-proj',
          projectName: 'Site',
          projectStatus: null,
          projectEndDate: null,
          description: 'Ship it',
          orgId: 'org-1',
          source: 'linear',
        },
      ],
      milestones: [milestone],
      milestonesUnavailable: false,
    };
    const next = applyLinearRead(input, result);
    assert.equal(input.tasks[0]?.id, 'notion-task');
    assert.equal(next.tasks[0]?.id, 'issue-1');
    assert.equal(next.tasks[0]?.status, 'In Progress');
    assert.equal(next.tasks[0]?.source, 'linear');
    assert.equal(next.tasks[0]?.stage, null);
    assert.equal(next.milestones?.[0]?.approval, 'unreviewed');
    assert.deepEqual(next.milestones?.[0]?.goals, []);
    assert.equal(next.taskPlatform?.tasks.ok, true);
  });

  it('keeps Notion rows on the snapshot when Linear cannot be read', () => {
    const input = snapshot();
    const next = applyLinearRead(input, { ok: false, platform: 'linear', reason: 'unavailable' });
    assert.equal(next.tasks[0]?.id, 'notion-task');
    assert.equal(next.taskPlatform?.tasks.ok, false);
    if (next.taskPlatform?.tasks.ok) return;
    assert.equal(next.taskPlatform?.tasks.reason, 'unavailable');
    assert.equal(next.milestones, undefined);
  });
});
