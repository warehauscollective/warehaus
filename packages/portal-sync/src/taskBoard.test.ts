import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { classifyProperty } from './tiers';
import { findUnmappedProperties } from './tiers';
import { LIVE_TASK_PROPERTY_NAMES } from './fixtures/sugar-shark';
import {
  boardColumns,
  clientMaySeeTask,
  compareBoardCards,
  decideResourceLink,
  planTaskCreate,
  planTaskResourceWrite,
  planTaskStageWrite,
  planTaskStatusWrite,
  readOptionalStage,
  readParentItem,
  resolveParentLink,
  stageMoveRule,
  visibleChildIds,
  WAREHAUS_STUDIO_PROJECT_NAME,
} from './taskBoard';

const clientProject = {
  name: 'Northwind site',
  types: ['Website'],
  publishToWarehaus: true,
  archive: false,
  hidden: false,
  orgVisible: true,
};

describe('task property tiers', () => {
  it('maps Stage, Parent item, and Resources and fails closed on unknown names', () => {
    assert.equal(classifyProperty('tasks', 'Stage'), 'CLIENT');
    assert.equal(classifyProperty('tasks', 'Parent item'), 'SERVER');
    assert.equal(classifyProperty('tasks', 'Resources'), 'SERVER');
    assert.equal(classifyProperty('tasks', 'Status'), 'CLIENT');
    assert.equal(classifyProperty('tasks', 'Invite Secret'), 'NEVER');
    assert.deepEqual(findUnmappedProperties('tasks', LIVE_TASK_PROPERTY_NAMES), []);
  });

  it('tolerates a missing stage and parent and rejects unknown values', () => {
    assert.deepEqual(readOptionalStage(null), { ok: true, stage: null });
    assert.deepEqual(readOptionalStage('Idea'), { ok: true, stage: 'Idea' });
    const unknown = readOptionalStage('Brainstorm');
    assert.equal(unknown.ok, false);
    assert.deepEqual(readParentItem([]), { ok: true, parentNotionId: null });
    assert.deepEqual(readParentItem(['parent-1']), { ok: true, parentNotionId: 'parent-1' });
    assert.equal(readParentItem(['a', 'b']).ok, false);
  });
});

describe('internal project visibility', () => {
  it('keeps warehaus.studio and its tasks off every client view', () => {
    const internal = clientMaySeeTask({
      publishToWarehaus: true,
      hidden: false,
      project: {
        name: WAREHAUS_STUDIO_PROJECT_NAME,
        types: ['Internal'],
        publishToWarehaus: true,
        archive: false,
        hidden: false,
        orgVisible: true,
      },
    });
    assert.equal(internal, false);
    const otherInternal = clientMaySeeTask({
      publishToWarehaus: true,
      hidden: false,
      project: { ...clientProject, name: 'Side project', types: ['Internal'] },
    });
    assert.equal(otherInternal, false);
    assert.equal(
      clientMaySeeTask({ publishToWarehaus: true, hidden: false, project: clientProject }),
      true,
    );
    assert.equal(
      clientMaySeeTask({ publishToWarehaus: false, hidden: false, project: clientProject }),
      false,
    );
  });

  it('filters each sub-task by its own publish flag', () => {
    assert.deepEqual(
      visibleChildIds([
        { id: 'published', publishToWarehaus: true },
        { id: 'draft', publishToWarehaus: false },
        { id: 'hidden', publishToWarehaus: true, hidden: true },
      ]),
      ['published'],
    );
  });
});

describe('resource links', () => {
  it('stores a same-org link and quarantines a mismatch', () => {
    assert.equal(decideResourceLink('org-a', 'org-a'), 'store');
    assert.equal(decideResourceLink('org-a', 'org-b'), 'quarantine');
    assert.equal(decideResourceLink('org-a', null), 'skip');
  });

  it('rejects a parent in another org or a second level', () => {
    assert.deepEqual(
      resolveParentLink({ parentNotionId: null, taskOrgId: 'org-a', parent: null }),
      { link: false },
    );
    assert.equal(
      resolveParentLink({
        parentNotionId: 'p',
        taskOrgId: 'org-a',
        parent: { orgId: 'org-b', hasParent: false },
      }).quarantine,
      'Parent item belongs to another client',
    );
    assert.equal(
      resolveParentLink({
        parentNotionId: 'p',
        taskOrgId: 'org-a',
        parent: { orgId: 'org-a', hasParent: true },
      }).quarantine,
      'Parent item is more than one level deep',
    );
    assert.equal(
      resolveParentLink({
        parentNotionId: 'p',
        taskOrgId: 'org-a',
        parent: { orgId: 'org-a', hasParent: false },
      }).link,
      true,
    );
  });
});

describe('move rules and outbox enqueue', () => {
  it('changes stage without touching status, and locks Building and Shipped', () => {
    const planning = planTaskStageWrite({
      actor: 'staff',
      stage: 'Planning',
      notionPageId: 'page-1',
      expectedLastEditedTime: '2026-10-28T00:00:00.000Z',
    });
    assert.equal(planning.ok, true);
    if (planning.ok) {
      assert.deepEqual(planning.properties, { Stage: 'Planning' });
      assert.equal('Status' in planning.properties, false);
      assert.match(planning.idempotencyKey, /^task-stage:page-1:Planning:/);
    }
    assert.equal(stageMoveRule('staff', 'Building').kind, 'locked');
    assert.equal(stageMoveRule('staff', 'Shipped').kind, 'locked');
    assert.equal(
      planTaskStageWrite({
        actor: 'staff',
        stage: 'Building',
        notionPageId: 'page-1',
        expectedLastEditedTime: '2026-10-28T00:00:00.000Z',
      }).ok,
      false,
    );
  });

  it('requires a pull request before Ready to Ship', () => {
    const missing = planTaskStageWrite({
      actor: 'staff',
      stage: 'Ready to Ship',
      notionPageId: 'page-1',
      expectedLastEditedTime: '2026-10-28T00:00:00.000Z',
    });
    assert.equal(missing.ok, false);
    const ready = planTaskStageWrite({
      actor: 'staff',
      stage: 'Ready to Ship',
      pullRequestLink: 'github.com/warehauscollective/warehaus/pull/38',
      notionPageId: 'page-1',
      expectedLastEditedTime: '2026-10-28T00:00:00.000Z',
    });
    assert.equal(ready.ok, true);
    if (ready.ok) {
      assert.equal(ready.properties.Stage, 'Ready to Ship');
      assert.equal(ready.properties['GitHub Issue/PR'], 'github.com/warehauscollective/warehaus/pull/38');
      assert.equal('Status' in ready.properties, false);
    }
  });

  it('lets staff enqueue a status move and refuses clients', () => {
    const moved = planTaskStatusWrite({
      actor: 'staff',
      status: 'In Progress',
      notionPageId: 'page-1',
      expectedLastEditedTime: '2026-10-28T00:00:00.000Z',
    });
    assert.equal(moved.ok, true);
    if (moved.ok) {
      assert.deepEqual(moved.properties, { Status: 'In Progress' });
      assert.match(moved.idempotencyKey, /^task-status:/);
    }
    assert.equal(
      planTaskStatusWrite({
        actor: 'client',
        status: 'Done',
        notionPageId: 'page-1',
        expectedLastEditedTime: '2026-10-28T00:00:00.000Z',
      }).ok,
      false,
    );
    assert.equal(
      planTaskStageWrite({
        actor: 'client',
        stage: 'Idea',
        notionPageId: 'page-1',
        expectedLastEditedTime: '2026-10-28T00:00:00.000Z',
      }).ok,
      false,
    );
  });

  it('enqueues quick-add and resource attach without a silent date', () => {
    const created = planTaskCreate({
      actor: 'staff',
      name: 'Menu board',
      status: 'To Do',
      projectNotionId: 'project-1',
      externalId: 'wh_tsk_menu',
    });
    assert.equal(created.ok, true);
    if (created.ok) {
      assert.equal(created.properties.Name, 'Menu board');
      assert.equal('Date' in created.properties, false);
      assert.equal(created.properties['Publish to Warehaus'], false);
      assert.match(created.idempotencyKey, /^task-create:/);
    }
    const attached = planTaskResourceWrite({
      actor: 'staff',
      resourceNotionIds: ['res-b', 'res-a'],
      notionPageId: 'page-1',
      expectedLastEditedTime: '2026-10-28T00:00:00.000Z',
    });
    assert.equal(attached.ok, true);
    if (attached.ok) assert.deepEqual(attached.properties.Resources, ['res-b', 'res-a']);
  });
});

describe('board sort', () => {
  it('sorts by due date, then last edited, and gives unknown statuses a lane', () => {
    const columns = boardColumns(
      [
        { name: 'Later', status: 'To Do', isDone: false, date: '2026-12-01', lastEditedTime: '2' },
        { name: 'Soon', status: 'To Do', isDone: false, date: '2026-11-01', lastEditedTime: '1' },
        { name: 'Edited', status: 'To Do', isDone: false, date: '2026-11-01', lastEditedTime: '9' },
        { name: 'Odd', status: 'Planning', isDone: false, date: null, lastEditedTime: null },
      ],
      'status',
    );
    const todo = columns.find((column) => column.key === 'To Do');
    assert.deepEqual(todo?.tasks.map((task) => task.name), ['Edited', 'Soon', 'Later']);
    assert.equal(columns.some((column) => column.key === 'unknown:Planning' && column.tasks.length === 1), true);
    assert.equal(compareBoardCards({ name: 'a', date: '2026-01-01' }, { name: 'b', date: '2026-02-01' }) < 0, true);
  });
});
