import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PORTAL_TABS, getPortalTabsForMode } from '../../../../packages/logic/src/portal';
import {
  TASK_BOARD_COLUMNS,
  attachKnownSync,
  clientDirectoryMeta,
  pickActiveProject,
  pullSyncWords,
  rowHasSyncFields,
  rowSyncChip,
  taskBoardColumnKey,
  type PortalTask,
} from '../../src/lib/data/view-models';

function task(partial: Partial<PortalTask> & Pick<PortalTask, 'status' | 'isDone'>): PortalTask {
  return {
    id: 't1',
    name: 'Test',
    date: null,
    projectId: null,
    projectName: null,
    projectStatus: null,
    projectEndDate: null,
    ...partial,
  };
}

describe('portal dock', () => {
  it('is the same five tabs for staff and client', () => {
    const labels = ['DASHBOARD', 'PROJECTS', 'RESOURCES', 'ACTIVITY', 'ACCOUNT'];
    assert.deepEqual(PORTAL_TABS.map((tab) => tab.label), labels);
    assert.deepEqual(getPortalTabsForMode('team').map((tab) => tab.label), labels);
    assert.deepEqual(getPortalTabsForMode('client').map((tab) => tab.label), labels);
    assert.equal(PORTAL_TABS.some((tab) => tab.label === 'CLIENTS' || tab.label === 'ITEMS'), false);
  });
});

describe('status kanban', () => {
  it('uses live status order and leaves unknown statuses off the board', () => {
    assert.deepEqual(
      TASK_BOARD_COLUMNS.map((col) => col.label),
      ['Inbox', 'To Do', 'Blocked', 'In Progress', 'Done'],
    );
    assert.equal(taskBoardColumnKey(task({ status: 'Blocked', isDone: false })), 'blocked');
    assert.equal(taskBoardColumnKey(task({ status: 'Planning', isDone: false })), null);
    assert.equal(taskBoardColumnKey(task({ status: 'In review', isDone: false })), null);
  });
});

describe('row sync chip', () => {
  it('never paints a hidden or unconfirmed row as synced', () => {
    assert.equal(rowSyncChip({ notionPageId: 'notion-1' }), 'synced');
    assert.equal(rowSyncChip({ notionPageId: 'portal:task:1' }), 'syncing');
    assert.equal(rowSyncChip({ notionPageId: 'pending:wh_tsk_1' }), 'syncing');
    assert.equal(rowSyncChip({ notionPageId: 'notion-1', syncHidden: true }), 'failed');
    assert.equal(
      rowSyncChip({ notionPageId: 'notion-1', syncState: 'failed' }),
      'failed',
    );
    assert.equal(rowSyncChip({ syncState: 'syncing', notionPageId: 'notion-1' }), 'syncing');
    assert.equal(rowSyncChip({ notionPageId: null }), 'syncing');
    assert.equal(rowSyncChip({}), 'syncing');
    assert.equal(rowHasSyncFields({}), false);
    assert.equal(rowHasSyncFields({ notionPageId: null }), true);
    assert.equal(rowHasSyncFields({ syncHidden: false }), true);
  });
});

describe('dashboard project pick', () => {
  it('uses an in-progress project when the list is not empty', () => {
    const picked = pickActiveProject([
      { name: 'Shipped site', status: 'Done' },
      { name: 'North Bay Portal', status: 'In progress' },
      { name: 'Warehaus Website', status: 'In progress' },
    ]);
    assert.equal(picked?.name, 'North Bay Portal');
    assert.equal(pickActiveProject([]), null);
  });
});

describe('client directory meta', () => {
  it('omits a missing people count and does not invent a stage', () => {
    const line = clientDirectoryMeta({ projectCount: 1, openTaskCount: 0 });
    assert.equal(line, '1 project');
    assert.equal(line.includes('—'), false);
    assert.equal(line.toLowerCase().includes('awaiting'), false);
    assert.equal(
      clientDirectoryMeta({ contactCount: 2, projectCount: 1, openTaskCount: 3 }),
      '2 people · 1 project · 3 open items',
    );
    assert.equal(clientDirectoryMeta({ projectCount: 0 }), 'No projects yet');
  });
});

describe('pull sync words', () => {
  it('uses the same labels as a row chip', () => {
    assert.deepEqual(pullSyncWords({ lastSyncedAt: '2026-10-05T00:00:00Z' }), {
      value: 'In sync',
      hint: 'Notion pull',
    });
    assert.equal(pullSyncWords({ lastError: 'timeout' }).value, 'Failed');
    assert.equal(pullSyncWords({}).value, 'Syncing');
  });
});

describe('known sync attach', () => {
  it('copies a snapshot notion id and leaves unknown rows unmarked', () => {
    const rows = attachKnownSync(
      [
        { id: 'a', name: 'North Bay Portal' },
        { id: 'b', name: 'Warehaus Website' },
      ],
      [{ id: 'b', notionPageId: 'notion-b' }],
    );
    assert.equal(rows[0].notionPageId, undefined);
    assert.equal(rows[1].notionPageId, 'notion-b');
    assert.equal(rowHasSyncFields(rows[0]), false);
    assert.equal(rowSyncChip(rows[1]), 'synced');
  });
});
