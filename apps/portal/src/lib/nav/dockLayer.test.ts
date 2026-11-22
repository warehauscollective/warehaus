import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { DOCK_Z, TASK_DIALOG_DOCK_Z, dockZForOpenScrims } from './dockLayer';

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
});
