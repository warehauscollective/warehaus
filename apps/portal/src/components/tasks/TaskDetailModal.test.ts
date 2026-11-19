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
    const closed = { detail: true, stage: false, attach: false, archive: false, project: false, menu: false };
    assert.deepEqual(taskSheetOpen({ attach: false, stage: false }), closed);
    assert.deepEqual(taskSheetOpen({ attach: false, stage: true }), { ...closed, detail: false, stage: true });
    assert.deepEqual(taskSheetOpen({ attach: false, stage: false }), closed);
    assert.deepEqual(taskSheetOpen({ attach: false, stage: false, archive: true }), { ...closed, detail: false, archive: true });
    assert.match(source, /data-testid="task-archive"/);
    assert.match(source, /data-confirm-kind="archive"/);
    assert.match(source, /testId="task-due"/);
    assert.match(source, /testId="task-project"/);
    assert.match(source, /data-testid="task-copy-link"/);
    assert.match(source, /data-testid="task-breadcrumb"/);
    assert.equal(source.includes('Coming soon'), false);
    assert.match(source, /returnStageFocus\.current = stageConfirm/);
    assert.match(source, /onCancel=\{cancelStage\}/);
    assert.match(source, /data-stage-chip=\{stage\}/);
    assert.match(source, /\[data-stage-chip\]/);
    assert.match(source, /phone \? null : \([\s\S]*data-testid="task-esc-hint"/);
    const css = readFileSync(new URL('../../styles/global.css', import.meta.url), 'utf8');
    assert.match(css, /body:has\(\[data-sheet-layer='viewport'\]\) \[data-testid='portal-dock'\]/);
    assert.match(css, /padding-bottom: env\(safe-area-inset-bottom, 0px\)/);
    assert.equal(css.includes('portal-confirm-hint'), false);
    const chrome = readFileSync(new URL('../projects/milestoneChrome.tsx', import.meta.url), 'utf8');
    const sheet = chrome.slice(chrome.indexOf('export function StageConfirmSheet'), chrome.indexOf('export function MilestoneDialog'));
    assert.match(sheet, /Move to \$\{stage\}/);
    assert.match(sheet, /flex flex-nowrap items-center justify-end gap-2 border-t/);
    assert.equal(sheet.includes('flex flex-col gap-2'), false);
    assert.equal(sheet.includes("border: '1px solid var(--border-2)'"), false);
    assert.equal(sheet.includes('>Confirm<'), false);
  });
});
