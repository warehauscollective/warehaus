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

  it('swaps a confirm in place of the task sheet, and shows no stage or Notion-era fields', () => {
    const closed = { detail: true, attach: false, archive: false, project: false, menu: false, stop: false };
    assert.deepEqual(taskSheetOpen({ attach: false, stop: true }), { ...closed, detail: false, stop: true });
    assert.deepEqual(taskSheetOpen({ attach: false }), closed);
    assert.deepEqual(taskSheetOpen({ attach: false, archive: true }), { ...closed, detail: false, archive: true });
    assert.deepEqual(taskSheetOpen({ attach: true }), { ...closed, detail: false, attach: true });
    assert.equal(source.includes('data-stage-chip'), false);
    assert.equal(source.includes('StaffLiveFields'), false);
    assert.equal(source.includes('label="Stage"'), false);
    assert.equal(source.includes('Syncs to Notion'), false);
    assert.match(source, /data-testid="task-archive"/);
    assert.match(source, /data-confirm-kind="archive"/);
    assert.match(source, /testId="task-due"/);
    const due = source.slice(source.indexOf('testId="task-due"'), source.indexOf('testId="task-project"'));
    assert.match(due, /<Popover onClose=\{closeFieldMenu\}>/);
    assert.equal(due.includes('<Popover up'), false);
    assert.match(source, /testId="task-project"/);
    assert.match(source, /data-testid="task-copy-link"/);
    assert.match(source, /data-testid="task-breadcrumb"/);
    assert.equal(source.includes('Coming soon'), false);
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
