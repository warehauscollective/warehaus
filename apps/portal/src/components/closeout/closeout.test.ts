import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

Object.assign(globalThis, { React });
const { PortalToast } = await import('@/components/ui/PortalToast');
const { OverflowMenu, OverflowSheetItems, overflowMenuBox, OVERFLOW_MENU_WIDTH } = await import('./OverflowMenu');
const { CloseoutConfirm, confirmContent } = await import('./CloseoutConfirm');
const { ArchivedChip, RestoreButton } = await import('./CloseoutControls');
const { ArchivedMilestoneRow, ArchivedTaskRow } = await import('@/components/projects/ArchivedView');
const copy = await import('./closeoutCopy');
const toast = await import('./closeoutToast');

const noop = () => undefined;
const source = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8');

describe('close-out copy', () => {
  it('matches the approved copy exactly', () => {
    assert.equal(copy.MENU_MARK_COMPLETE, 'Mark complete');
    assert.equal(copy.MENU_ARCHIVE, 'Archive');
    assert.equal(copy.MENU_RESTORE, 'Restore');
    assert.equal(copy.MILESTONE_MENU_HINT, 'Marks this milestone Shipped, even if nothing has been merged.');
    assert.equal(copy.MARK_COMPLETE_TITLE, 'Mark this milestone complete?');
    assert.equal(
      copy.MARK_COMPLETE_EMPTY_BODY,
      'No tasks in this milestone. It will be marked Shipped. You can do this even if nothing has been merged.',
    );
    assert.equal(copy.MARK_COMPLETE_BODY, 'This milestone will be marked Shipped. You can do this even if nothing has been merged.');
    assert.equal(
      copy.markCompleteOpenBody(3),
      '3 open tasks are still on this milestone. It will be marked Shipped even if they aren’t merged.',
    );
    assert.equal(copy.LEFTOVERS_LABEL, 'What should happen to those leftovers?');
    assert.equal(copy.ARCHIVE_TASK_TITLE, 'Archive this task?');
    assert.equal(copy.ARCHIVE_MILESTONE_TITLE, 'Archive this milestone?');
    assert.equal(copy.ARCHIVE_BODY, 'It will be hidden from the board and lists, not deleted. You can restore it from Archived.');
    assert.equal(copy.ARCHIVE_TASKS_LABEL, 'What should happen to its open tasks?');
    assert.equal(copy.TOAST_TASK_DONE, 'Task marked Done');
    assert.equal(copy.TOAST_MILESTONE_DONE, 'Milestone marked complete');
    assert.equal(copy.TOAST_MILESTONE_ARCHIVED, 'Milestone archived');
    assert.equal(copy.TOAST_TASK_ARCHIVED, 'Task archived');
    assert.equal(copy.TOAST_MILESTONE_RESTORED, 'Milestone restored');
    assert.equal(copy.TOAST_TASK_RESTORED, 'Task restored');
    assert.equal(copy.ARCHIVED_CHIP, 'Archived');
    assert.equal(copy.ARCHIVED_OPACITY, 0.55);
  });

  it('uses typographic apostrophes and no straight ones', () => {
    const text = source('./closeoutCopy.ts');
    const strings = [...text.matchAll(/'((?:[^'\\\n]|\\.)*)'/g)].map((match) => match[1] ?? '');
    assert.ok(text.includes('’'));
    for (const value of strings) assert.equal(value.includes("\\'"), false, value);
  });

  it('offers Mark them Done first, and names Parked for later only when the project has it', () => {
    assert.deepEqual(copy.leftoverOptions(true), [
      { value: 'done', label: 'Mark them Done' },
      { value: 'archive', label: 'Archive them' },
      { value: 'park', label: 'Move them to Parked for later' },
    ]);
    assert.equal(copy.leftoverOptions(false)[2]?.label, 'Park them');
    assert.deepEqual(copy.ARCHIVE_TASK_OPTIONS, [
      { value: 'archive', label: 'Archive them too' },
      { value: 'detach', label: 'Move them to No milestone' },
    ]);
  });

  it('picks the confirm from the task counts', () => {
    assert.equal(copy.markCompleteKind({ total: 0, open: 0 }), 'mark-complete-empty');
    assert.equal(copy.markCompleteKind({ total: 4, open: 0 }), 'mark-complete');
    assert.equal(copy.markCompleteKind({ total: 4, open: 3 }), 'mark-complete-open');
  });
});

describe('OverflowMenu', () => {
  it('renders a closed 28px trigger named for its item', () => {
    const html = renderToStaticMarkup(
      createElement(OverflowMenu, { target: 'milestone', state: 'open', label: 'Launch the homepage', onAction: noop }),
    );
    assert.match(html, /class="overflow-trigger /);
    assert.match(html, /aria-haspopup="menu"/);
    assert.match(html, /aria-expanded="false"/);
    assert.match(html, /aria-label="More actions for Launch the homepage"/);
    assert.match(html, /data-open="false"/);
    // Closed: no panel and no sheet.
    assert.equal(html.includes('role="menu"'), false);
    const css = source('../../styles/global.css');
    const rule = css.slice(css.indexOf('.ds-scope .overflow-trigger'), css.indexOf('.overflow-menu-item:hover'));
    assert.match(rule, /width: 28px/);
    assert.match(rule, /height: 28px/);
    assert.match(rule, /border: 1px solid var\(--border\)/);
    assert.match(rule, /color: var\(--muted\)/);
    assert.match(rule, /\.overflow-trigger:hover,\s*\.overflow-trigger\[data-open='true'\] \{\s*background: var\(--surface-2\);\s*color: var\(--fg\)/);
  });

  it('offers Mark complete and Archive on an open item, and Restore alone otherwise', () => {
    const items = (target: 'milestone' | 'task', state: 'open' | 'complete' | 'archived') =>
      renderToStaticMarkup(createElement(OverflowSheetItems, { target, state, onAction: noop }));
    for (const target of ['milestone', 'task'] as const) {
      const open = items(target, 'open');
      assert.match(open, />Mark complete</);
      assert.match(open, />Archive</);
      assert.equal(open.includes('>Restore<'), false);
      for (const state of ['complete', 'archived'] as const) {
        const closed = items(target, state);
        assert.match(closed, />Restore</);
        assert.equal(closed.includes('Mark complete'), false);
        assert.equal(closed.includes('>Archive<'), false);
        assert.equal(closed.includes('Marks this milestone Shipped'), false);
      }
    }
    assert.match(items('milestone', 'open'), /Marks this milestone Shipped, even if nothing has been merged\./);
    assert.equal(items('task', 'open').includes('Marks this milestone Shipped'), false);
  });

  it('right-aligns the panel to the trigger and keeps it on screen', () => {
    const viewport = { width: 1440, height: 900 };
    const menu = { width: OVERFLOW_MENU_WIDTH, height: 140 };
    const below = overflowMenuBox({ trigger: { top: 100, bottom: 128, right: 1300 }, menu, viewport });
    assert.deepEqual(below, { top: 136, left: 1300 - OVERFLOW_MENU_WIDTH, placement: 'down' });
    const flipped = overflowMenuBox({ trigger: { top: 820, bottom: 848, right: 1300 }, menu, viewport });
    assert.equal(flipped.placement, 'up');
    assert.equal(flipped.top, 820 - 8 - 140);
    const edge = overflowMenuBox({ trigger: { top: 100, bottom: 128, right: 120 }, menu, viewport });
    assert.equal(edge.left, 8);
  });

  it('is a popover on desktop and a PortalModal bottom sheet on a phone', () => {
    const text = source('./OverflowMenu.tsx');
    assert.match(text, /useMaxWidth\(767\)/);
    assert.match(text, /const popover = open && !phone/);
    const sheet = text.slice(text.indexOf('export function OverflowSheet('), text.indexOf('export function OverflowSheetItems'));
    assert.match(sheet, /<PortalModal/);
    assert.match(sheet, /narrow\s+sheet="bottom"/);
  });
});

describe('CloseoutConfirm', () => {
  it('writes each confirm kind from the approved copy', () => {
    assert.deepEqual(confirmContent({ kind: 'mark-complete-empty', open: 0, parkedMilestone: false }), {
      title: 'Mark this milestone complete?',
      body: 'No tasks in this milestone. It will be marked Shipped. You can do this even if nothing has been merged.',
      choiceLabel: null,
      options: [],
      action: 'Mark complete',
      danger: false,
    });
    const done = confirmContent({ kind: 'mark-complete', open: 0, parkedMilestone: true });
    assert.equal(done.body, 'This milestone will be marked Shipped. You can do this even if nothing has been merged.');
    assert.equal(done.choiceLabel, null);
    const open = confirmContent({ kind: 'mark-complete-open', open: 3, parkedMilestone: true });
    assert.equal(open.choiceLabel, 'What should happen to those leftovers?');
    assert.deepEqual(open.options.map((option) => option.label), ['Mark them Done', 'Archive them', 'Move them to Parked for later']);
    assert.equal(open.danger, false);
    const archive = confirmContent({ kind: 'archive-milestone', open: 2, parkedMilestone: false });
    assert.equal(archive.title, 'Archive this milestone?');
    assert.equal(archive.choiceLabel, 'What should happen to its open tasks?');
    assert.deepEqual(archive.options.map((option) => option.label), ['Archive them too', 'Move them to No milestone']);
    assert.equal(archive.action, 'Archive');
    assert.equal(archive.danger, true);
    // No open tasks leaves nothing to choose.
    assert.equal(confirmContent({ kind: 'archive-milestone', open: 0, parkedMilestone: false }).choiceLabel, null);
    const task = confirmContent({ kind: 'archive', open: 0, parkedMilestone: false });
    assert.equal(task.title, 'Archive this task?');
    assert.equal(task.action, 'Archive');
    assert.equal(task.danger, true);
  });

  it('renders the leftovers choice with Mark them Done checked', () => {
    const html = renderToStaticMarkup(
      createElement(CloseoutConfirm, { kind: 'mark-complete-open', open: 3, parkedMilestone: true, onCancel: noop, onConfirm: noop }),
    );
    assert.match(html, /data-confirm-kind="mark-complete-open"/);
    assert.match(html, />Mark this milestone complete\?</);
    assert.match(html, /3 open tasks are still on this milestone\. It will be marked Shipped even if they aren’t merged\./);
    assert.match(html, /role="radiogroup" aria-label="What should happen to those leftovers\?"/);
    const option = (value: string) => html.match(new RegExp(`<button[^>]*data-testid="closeout-option-${value}"[^>]*>[\\s\\S]*?</button>`))?.[0] ?? '';
    assert.match(option('done'), /aria-checked="true"/);
    assert.match(option('done'), /docs-check\.svg/);
    assert.match(option('archive'), /aria-checked="false"/);
    assert.equal(option('archive').includes('docs-check.svg'), false);
    assert.match(option('park'), />Move them to Parked for later</);
    assert.match(html, />Cancel</);
    assert.match(html, />Mark complete</);
    // One PortalModal with the compact confirm header.
    assert.equal(html.split('role="dialog"').length - 1, 1);
    assert.match(html, /data-modal-header="compact"/);
  });

  it('renders the archive confirms with a danger Archive button', () => {
    const milestone = renderToStaticMarkup(
      createElement(CloseoutConfirm, { kind: 'archive-milestone', open: 2, onCancel: noop, onConfirm: noop }),
    );
    assert.match(milestone, />Archive this milestone\?</);
    assert.match(milestone, /It will be hidden from the board and lists, not deleted\. You can restore it from Archived\./);
    assert.match(milestone, /data-testid="closeout-option-archive"[^>]*aria-checked="true"|aria-checked="true"[^>]*data-testid="closeout-option-archive"/);
    assert.match(milestone, />Move them to No milestone</);
    assert.match(milestone, /data-tone="danger"[^>]*>Archive</);
    const task = renderToStaticMarkup(createElement(CloseoutConfirm, { kind: 'archive', onCancel: noop, onConfirm: noop }));
    assert.match(task, />Archive this task\?</);
    assert.match(task, /data-tone="danger"[^>]*>Archive</);
    assert.equal(task.includes('Archive task'), false);
    assert.equal(task.includes('role="radiogroup"'), false);
  });

  it('shows the empty-milestone confirm with no choice', () => {
    const html = renderToStaticMarkup(
      createElement(CloseoutConfirm, { kind: 'mark-complete-empty', onCancel: noop, onConfirm: noop }),
    );
    assert.match(html, /No tasks in this milestone\. It will be marked Shipped\. You can do this even if nothing has been merged\./);
    assert.equal(html.includes('role="radiogroup"'), false);
  });
});

describe('close-out toasts', () => {
  it('adds done, archived and restored, each with Undo', () => {
    for (const [kind, message] of [
      ['done', 'Task marked Done'],
      ['archived', 'Milestone archived'],
      ['restored', 'Milestone restored'],
    ] as const) {
      const html = renderToStaticMarkup(createElement(PortalToast, { kind, placement: 'flow', autoHideMs: 0, onUndo: noop }));
      assert.match(html, new RegExp(`>${message}<`));
      assert.match(html, new RegExp(`data-kind="${kind}"`));
      assert.match(html, /data-testid="portal-toast-undo"[^>]*>Undo</);
      assert.equal(html.includes('role="alert"'), false);
    }
    const override = renderToStaticMarkup(
      createElement(PortalToast, { kind: 'done', message: 'Milestone marked complete', placement: 'flow', autoHideMs: 0, onUndo: noop }),
    );
    assert.match(override, />Milestone marked complete</);
    // Undo is only drawn when there is something to undo.
    const plain = renderToStaticMarkup(createElement(PortalToast, { kind: 'archived', placement: 'flow', autoHideMs: 0 }));
    assert.equal(plain.includes('portal-toast-undo'), false);
  });

  it('holds one toast at a time, and a new one replaces the last', () => {
    toast.showCloseoutToast({ kind: 'done', message: 'Task marked Done' });
    const first = toast.currentCloseoutToast();
    toast.showCloseoutToast({ kind: 'archived', message: 'Task archived', undo: async () => undefined });
    const second = toast.currentCloseoutToast();
    assert.equal(second?.message, 'Task archived');
    assert.notEqual(first?.id, second?.id);
    // A stale dismiss from the replaced toast leaves the new one up.
    toast.dismissCloseoutToast(first?.id);
    assert.equal(toast.currentCloseoutToast()?.message, 'Task archived');
    toast.dismissCloseoutToast(second?.id);
    assert.equal(toast.currentCloseoutToast(), null);
  });
});

describe('Archived view', () => {
  it('draws the Archived chip with its count', () => {
    const active = renderToStaticMarkup(createElement(ArchivedChip, { active: true, count: 2, onClick: noop }));
    assert.match(active, /aria-pressed="true"/);
    assert.match(active, />Archived</);
    assert.match(active, /data-testid="archived-filter-count"[^>]*>2</);
    assert.match(active, /background:var\(--surface-2\)/);
    const idle = renderToStaticMarkup(createElement(ArchivedChip, { active: false, count: 2, onClick: noop }));
    assert.match(idle, /aria-pressed="false"/);
  });

  const actions = { markComplete: async () => null, archive: async () => null, restore: async () => null };
  const taskActions = { markDone: async () => null, archive: async () => null, restore: async () => null };
  const milestone = {
    id: 'm-old',
    name: 'Old launch',
    objective: 'Shipped last year.',
    goals: [],
    status: 'Building',
    approval: 'unreviewed',
    publishToWarehaus: false,
    resources: [],
    openCount: 1,
    doneCount: 1,
    countIsDecision: false,
    rows: [
      { id: 't1', name: 'One', status: 'To Do', isDone: false, stage: null, resourceCount: 0, children: [] },
      { id: 't2', name: 'Two', status: 'Done', isDone: true, stage: null, resourceCount: 0, children: [] },
    ],
  } as unknown as Parameters<typeof ArchivedMilestoneRow>[0]['milestone'];

  it('mutes an archived milestone to 0.55 with a Ghost Restore and a Restore-only menu', () => {
    const html = renderToStaticMarkup(createElement(ArchivedMilestoneRow, { milestone, actions }));
    assert.match(html, /data-archived="true"/);
    assert.match(html, /data-testid="archived-muted"[^>]*style="opacity:0\.55"/);
    assert.match(html, />Old launch</);
    assert.match(html, /Building · 2 tasks/);
    assert.match(html, /data-testid="archived-restore"[^>]*aria-label="Restore Old launch"|aria-label="Restore Old launch"[^>]*data-testid="archived-restore"/);
    assert.match(html, />Restore</);
    assert.match(html, /class="overflow-trigger /);
    // No status control and no way to open it from the archived row.
    assert.equal(html.includes('milestone-status-control'), false);
    assert.equal(html.includes('Open milestone'), false);
  });

  it('mutes an archived task the same way', () => {
    const html = renderToStaticMarkup(
      createElement(ArchivedTaskRow, { task: { id: 't9', name: 'Old task', status: 'To Do' }, actions: taskActions, first: true }),
    );
    assert.match(html, /data-testid="archived-muted"[^>]*style="opacity:0\.55"/);
    assert.match(html, />Old task</);
    const ghost = renderToStaticMarkup(createElement(RestoreButton, { label: 'Old task', onClick: noop }));
    assert.match(ghost, /background:transparent/);
    assert.match(ghost, /border:0/);
  });
});

describe('close-out wiring', () => {
  it('puts the menu on milestone cards, the milestone header, task rows and the task dialog, for staff only', () => {
    const card = source('../projects/MilestoneListCard.tsx');
    assert.match(card, /\{staff && closeout \? \(/);
    const roadmap = source('../projects/ProjectRoadmap.tsx');
    assert.match(roadmap, /closeout=\{staff \? closeoutControl\(milestone\) : null\}/);
    assert.match(roadmap, /closeout=\{staff \? closeoutControl\(selected\) : null\}/);
    assert.match(roadmap, /live && staff \? \{ projectId, hostSlug \} : 'skip'/);
    assert.match(roadmap, /\{staff && archivedCount > 0 \? \(/);
    const detail = source('../projects/MilestoneDetailView.tsx');
    assert.match(detail, /action=\{staff && closeout \?/);
    const checklist = source('../projects/MilestoneChecklist.tsx');
    assert.match(checklist, /if \(!staff\) return null;/);
    assert.match(checklist, /\{staff && archivedList\.length > 0 \? \(/);
    const dialog = source('../tasks/TaskDetailModal.tsx');
    const header = dialog.slice(dialog.indexOf('data-testid="task-copy-link"'), dialog.indexOf('aria-label="Close"'));
    // In the header, left of Esc and Close.
    assert.ok(header.indexOf('<OverflowMenu') > 0);
    assert.ok(header.indexOf('<OverflowMenu') < header.indexOf('task-esc-hint'));
    assert.match(header, /\{staff \? \(\s*<OverflowMenu/);
    // The phone menu takes the task sheet's place: one modal at a time.
    assert.match(dialog, /archive: archiveOpen \|\| \(phone && overflowOpen\)/);
    assert.match(dialog, /renderSheet=\{false\}/);
  });

  it('adds no right-side drawer and no theme control', () => {
    for (const file of ['./OverflowMenu.tsx', './CloseoutConfirm.tsx', './CloseoutControls.tsx', '../projects/ArchivedView.tsx']) {
      const text = source(file);
      assert.equal(/drawer/i.test(text), false, file);
      assert.equal(/ThemeControl|theme toggle/i.test(text), false, file);
      assert.equal(/sheet="(right|side)"/.test(text), false, file);
    }
  });
});
