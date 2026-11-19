import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { taskSheetOpen } from './TaskDetailModal';

describe('task detail attach swap', () => {
  const source = readFileSync(new URL('./TaskDetailModal.tsx', import.meta.url), 'utf8');

  it('shows the attach picker in place of the task detail, with one stack', () => {
    assert.match(source, /PortalModalStack/);
    assert.match(source, /key: 'detail'/);
    assert.match(source, /keep: true/);
    assert.match(source, /hidden=\{!sheets\.detail\}/);
    assert.match(source, /open: sheets\.detail/);
    assert.match(source, /key: 'stage'/);
    assert.match(source, /open: sheets\.stage/);
    assert.match(source, /onClose=\{cancelStage\}/);
    assert.match(source, /key: 'attach'/);
    assert.match(source, /open: attach && Boolean\(task\)/);
    const picker = source.slice(source.indexOf('function AttachPicker'), source.indexOf('const inputStyle'));
    assert.equal(picker.includes('portal-modal-scrim'), false);
    assert.equal(picker.includes('data-portal-scrim'), false);
    assert.equal(picker.includes('zIndex: 90'), false);
  });

  it('keeps the webkit blur beside the scrim token', () => {
    const css = readFileSync(new URL('../../styles/global.css', import.meta.url), 'utf8');
    const rule = css.slice(css.indexOf('.ds-scope.portal-modal-scrim'), css.indexOf('.ds-scope .portal-modal-panel'));
    assert.match(rule, /-webkit-backdrop-filter:\s*blur\(var\(--scrim-blur\)\)/);
    assert.match(rule, /backdrop-filter:\s*blur\(var\(--scrim-blur\)\)/);
    assert.match(rule, /-webkit-backdrop-filter:\s*none/);
  });

  it('swaps the stage confirm in place of the task sheet and returns on cancel', () => {
    assert.deepEqual(taskSheetOpen({ attach: false, stage: false }), { detail: true, stage: false, attach: false });
    assert.deepEqual(taskSheetOpen({ attach: false, stage: true }), { detail: false, stage: true, attach: false });
    assert.deepEqual(taskSheetOpen({ attach: false, stage: false }), { detail: true, stage: false, attach: false });
    assert.match(source, /const cancelStage = \(\) => setStageConfirm\(null\)/);
    assert.match(source, /onCancel=\{cancelStage\}/);
    const css = readFileSync(new URL('../../styles/global.css', import.meta.url), 'utf8');
    assert.match(css, /body:has\(\[data-sheet-layer='viewport'\]\) \[data-testid='portal-dock'\]/);
    assert.match(css, /padding-bottom: env\(safe-area-inset-bottom, 0px\)/);
  });
});
