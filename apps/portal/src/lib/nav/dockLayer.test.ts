import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  DOCK_Z,
  TASK_DIALOG_DOCK_Z,
  TASK_DIALOG_MAX_HEIGHT,
  centeredTaskPanelHeight,
  dockZForOpenScrims,
  leaveTaskForSearch,
  openSearchFromDock,
} from './dockLayer';

const css = readFileSync(new URL('../../styles/global.css', import.meta.url), 'utf8');
const taskDialog = readFileSync(new URL('../../components/tasks/TaskDetailModal.tsx', import.meta.url), 'utf8');

describe('dock under modal scrims', () => {
  it('lifts the dock for the task dialog only', () => {
    assert.equal(dockZForOpenScrims([{ dockLayer: 'task' }]), TASK_DIALOG_DOCK_Z);
    assert.equal(TASK_DIALOG_DOCK_Z, 81);
    assert.ok(TASK_DIALOG_DOCK_Z > DOCK_Z);
    assert.ok(TASK_DIALOG_DOCK_Z < 85);
  });

  it('keeps the dock under every other modal scrim', () => {
    const under = [
      { name: 'no dialog', scrims: [] },
      { name: 'approval confirm', scrims: [{ dockLayer: null }] },
      { name: 'clear-repository confirm', scrims: [{ dockLayer: null }] },
      { name: 'search', scrims: [{ dockLayer: null }] },
      { name: 'archive confirm', scrims: [{ dockLayer: null }] },
      { name: 'task dialog plus a confirm', scrims: [{ dockLayer: 'task' }, { dockLayer: null }] },
    ] as const;
    for (const entry of under) {
      assert.equal(dockZForOpenScrims(entry.scrims), DOCK_Z, entry.name);
    }
    assert.match(
      css,
      /body:has\(\[data-dock-layer='task'\]\):not\(:has\(\.portal-modal-scrim:not\(\[data-dock-layer='task'\]\)\)\) \[data-testid='portal-dock'\] \{\s*z-index: 81;/,
    );
    assert.equal(css.includes('body:has(.portal-modal-scrim)'), false);
    assert.equal(taskDialog.includes('dockLayer="task"'), true);
    const detail = taskDialog.slice(taskDialog.indexOf('testId="task-detail"'), taskDialog.indexOf("key: 'stage'"));
    assert.match(detail, /dockLayer="task"/);
    const confirms = taskDialog.slice(taskDialog.indexOf("key: 'stage'"));
    assert.equal(confirms.includes('dockLayer='), false);
  });

  it('shortens only the centered task dialog so it clears the dock', () => {
    assert.equal(centeredTaskPanelHeight(900), 712);
    assert.equal((900 - centeredTaskPanelHeight(900)) / 2, 94);
    assert.equal(
      TASK_DIALOG_MAX_HEIGHT,
      'calc(100dvh - 2 * (82px + 12px + env(safe-area-inset-bottom, 0px)))',
    );
    const detail = taskDialog.slice(taskDialog.indexOf('testId="task-detail"'), taskDialog.indexOf("key: 'stage'"));
    assert.match(detail, /maxHeight=\{phone \? undefined : TASK_DIALOG_MAX_HEIGHT\}/);
    assert.equal(detail.includes('dockClearance'), false);
    const confirms = taskDialog.slice(taskDialog.indexOf("key: 'stage'"));
    assert.equal(confirms.includes('TASK_DIALOG_MAX_HEIGHT'), false);
  });

  it('closes the task dialog before search opens', () => {
    const order: string[] = [];
    openSearchFromDock({
      taskOpen: true,
      closeTask: () => order.push('close'),
      openSearch: () => order.push('search'),
    });
    assert.deepEqual(order, ['close', 'search']);
    openSearchFromDock({
      taskOpen: false,
      closeTask: () => order.push('close'),
      openSearch: () => order.push('search'),
    });
    assert.deepEqual(order, ['close', 'search', 'search']);
    assert.equal(leaveTaskForSearch({ pathname: '/tasks/t-doing', search: '', projectId: 'p-site' }), '/projects/p-site');
    assert.equal(leaveTaskForSearch({ pathname: '/tasks/t-doing', search: '', projectId: null }), '/projects');
    assert.equal(leaveTaskForSearch({ pathname: '/projects/p-site', search: '', projectId: 'p-site' }), null);
    assert.equal(leaveTaskForSearch({ pathname: '/projects', search: '?task=t-doing', projectId: null }), '/projects');
    const search = readFileSync(new URL('../../components/search/PortalSearch.tsx', import.meta.url), 'utf8');
    const projects = readFileSync(new URL('../../components/pages/ProjectsContent.tsx', import.meta.url), 'utf8');
    assert.match(search, /openSearchFromDock\(/);
    assert.match(projects, /leaveTaskForSearch\(/);
    assert.match(taskDialog, /CLOSE_TASK_FOR_SEARCH/);
  });
});
