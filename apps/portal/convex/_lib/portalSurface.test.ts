import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PORTAL_TABS, getPortalTabsForMode } from '../../../../packages/logic/src/portal';
import {
  TASK_BOARD_COLUMNS,
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
    assert.equal(rowSyncChip({}), 'syncing');
  });
});
