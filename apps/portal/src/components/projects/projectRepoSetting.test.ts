import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  CLEAR_BODY,
  CLEAR_CANCEL_HINT,
  CLEAR_ERROR,
  CLEAR_TITLE,
  ProjectRepoSettingView,
  REPO_FIELD_HELP,
  REPO_HELP_SET,
  REPO_HELP_UNSET,
  REPO_STAFF_ONLY,
  REPO_UNSET,
  SAVE_CANCEL_HINT,
  repoDraftDecision,
} from './ProjectRepoSetting';

// The test runner compiles JSX to React.createElement, so React has to be in scope.
Object.assign(globalThis, { React });

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const shown = (text: string) => new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/'/g, "(?:'|&#x27;)"));

describe('project repository setting', () => {
  it('saves a new repository in owner/name form, lower case', () => {
    assert.deepEqual(repoDraftDecision(null, ' WarehausCollective/warehaus '), {
      ok: true,
      changed: true,
      repo: 'warehauscollective/warehaus',
    });
    assert.deepEqual(repoDraftDecision(null, 'https://github.com/warehauscollective/warehaus.git'), {
      ok: true,
      changed: true,
      repo: 'warehauscollective/warehaus',
    });
  });

  it('writes nothing for the stored value, and does not clear on empty', () => {
    assert.deepEqual(repoDraftDecision('a/b', 'A/B'), { ok: true, changed: false });
    assert.deepEqual(repoDraftDecision(null, '   '), { ok: true, changed: false });
    assert.deepEqual(repoDraftDecision('a/b', ''), { ok: true, changed: false });
  });

  it('refuses anything that is not owner/name', () => {
    for (const typed of ['warehaus', 'a/b/c', '../x', 'a b/c', 'https://gitlab.com/a/b']) {
      const decision = repoDraftDecision(null, typed);
      assert.equal(decision.ok, false, typed);
    }
  });

  it('says what an unset repository means, and shows the stored one', () => {
    const save = async () => undefined;
    const unset = renderToStaticMarkup(createElement(ProjectRepoSettingView, { repo: null, onSave: save }));
    assert.match(unset, new RegExp(REPO_UNSET));
    assert.match(unset, /Set repository/);
    assert.equal(unset.includes(REPO_HELP_UNSET.replace('’', '&#x27;')) || unset.includes(REPO_HELP_UNSET), true);
    assert.match(unset, new RegExp(REPO_STAFF_ONLY));
    const set = renderToStaticMarkup(
      createElement(ProjectRepoSettingView, { repo: 'warehauscollective/warehaus', onSave: save }),
    );
    assert.match(set, /warehauscollective\/warehaus/);
    assert.match(set, /Change repository/);
    assert.equal(set.includes(REPO_HELP_SET.replace('’', '&#x27;')) || set.includes(REPO_HELP_SET), true);
  });

  it('is shown to staff only, and only the staff query carries the field', () => {
    const page = read('../pages/ProjectsContent.tsx');
    assert.match(page, /\{isStaff \? \(\s*<div style=\{\{ marginTop: 24 \}\}>\s*<ProjectRepoSetting/);
    const projects = read('../../../convex/projects.ts');
    const clientShape = projects.slice(projects.indexOf('function toClientProject'), projects.indexOf('export const'));
    assert.equal(clientShape.includes('agentRepo'), false);
    const staffList = projects.slice(projects.indexOf('export const listForStaff'), projects.indexOf('export const createForStaff'));
    assert.match(staffList, /agentRepo: row\.agentRepo \?\? null/);
    // No client query in the module returns it.
    for (const block of projects.split('export const ').filter((part) => part.includes('= clientQuery('))) {
      assert.equal(block.includes('agentRepo'), false);
    }
    assert.match(projects, /export const setAgentRepo = adminMutation/);
  });

  const save = async () => undefined;
  const view = (preview: 'edit' | 'confirm' | 'clearing' | 'clear-error' | 'saving' | 'helper', narrow?: boolean) =>
    renderToStaticMarkup(
      createElement(ProjectRepoSettingView, { repo: 'warehauscollective/warehaus', onSave: save, preview, narrow }),
    );

  it('shows a clear button while editing, and the helper', () => {
    const edit = view('edit');
    assert.match(edit, /data-testid="project-repo-clear"[^>]*class="w-fit"/);
    assert.match(edit, /Clear repository/);
    assert.match(edit, /flex flex-col gap-2 md:flex-row md:items-center/);
    const clearAt = edit.indexOf('data-testid="project-repo-clear"');
    const cancelAt = edit.indexOf('data-testid="project-repo-cancel"');
    assert.ok(clearAt > 0 && clearAt < cancelAt);
    const helper = view('helper');
    assert.match(helper, new RegExp(REPO_FIELD_HELP.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.equal(helper.includes('Leave it empty'), false);
  });

  it('the 390 fixture forces the phone sheet, and 1440 stays a centered dialog', () => {
    const source = read('./ProjectRepoSetting.tsx');
    assert.match(source, /narrow=\{size === '390'\}/);
    assert.match(source, /sheet=\{narrow \? 'bottom' : 'center'\}/);
    assert.match(source, /width=\{520\}/);
    assert.match(source, /sheetClearance=\{narrow \? '67px' : undefined\}/);
  });

  it('confirms a clear in a bottom sheet on the phone and a centered dialog on desktop', () => {
    const desktop = view('confirm', false);
    assert.match(desktop, /portal-modal-scrim/);
    assert.equal(desktop.includes('portal-modal-sheet'), false);
    assert.equal(desktop.includes('data-testid="modal-grabber"'), false);
    assert.match(desktop, new RegExp(CLEAR_TITLE.replace('?', '\\?')));
    assert.match(desktop, new RegExp(CLEAR_BODY.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(desktop, /data-testid="clear-repo-cancel"/);
    assert.match(desktop, /data-testid="clear-repo-confirm"/);
    const phone = view('confirm', true);
    assert.match(phone, /portal-modal-sheet/);
    assert.match(phone, /data-testid="modal-grabber"/);
    assert.match(phone, /padding:0 0 67px 0/);
    assert.match(phone, /flex w-full min-w-0 flex-col items-start gap-2/);
    assert.match(phone, /flex justify-start gap-2/);
    const confirmAt = phone.indexOf('data-testid="clear-repo-cancel"');
    const rowAt = phone.lastIndexOf('flex justify-start gap-2', confirmAt);
    assert.ok(rowAt > 0 && rowAt < confirmAt);
  });

  it('disables cancel while clearing and names the reason', () => {
    const html = view('clearing');
    assert.match(html, /Clearing…/);
    assert.match(html, /aria-disabled="true"/);
    assert.match(html, /aria-describedby="clear-repo-cancel-hint"/);
    assert.match(html, shown(CLEAR_CANCEL_HINT));
    assert.match(html, /id="clear-repo-cancel-hint"/);
  });

  it('shows the clear error and keeps the retry', () => {
    const html = view('clear-error');
    assert.match(html, /data-testid="clear-repo-error"/);
    assert.match(html, shown(CLEAR_ERROR));
    assert.match(html, /data-testid="clear-repo-confirm"/);
    assert.match(html, /Clear repository/);
    assert.equal(html.includes('Clearing…'), false);
  });

  it('disables cancel while a new value is saving', () => {
    const html = view('saving');
    assert.match(html, /Saving…/);
    assert.match(html, /aria-disabled="true"/);
    assert.match(html, /aria-describedby="project-repo-save-hint"/);
    assert.match(html, shown(SAVE_CANCEL_HINT));
    assert.equal(html.includes('data-testid="project-repo-clear"'), false);
    assert.match(html, new RegExp(REPO_FIELD_HELP.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  });
});
