import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  ProjectRepoSettingView,
  REPO_HELP_SET,
  REPO_HELP_UNSET,
  REPO_STAFF_ONLY,
  REPO_UNSET,
  repoDraftDecision,
} from './ProjectRepoSetting';

// The test runner compiles JSX to React.createElement, so React has to be in scope.
Object.assign(globalThis, { React });

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

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

  it('writes nothing for the stored value, and clears on empty', () => {
    assert.deepEqual(repoDraftDecision('a/b', 'A/B'), { ok: true, changed: false });
    assert.deepEqual(repoDraftDecision(null, '   '), { ok: true, changed: false });
    assert.deepEqual(repoDraftDecision('a/b', ''), { ok: true, changed: true, repo: null });
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
});
