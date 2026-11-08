import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

describe('task list retry and quick-add', () => {
  it('retries staff task queries by remounting the page that owns them', () => {
    const projects = readFileSync(new URL('../pages/ProjectsContent.tsx', import.meta.url), 'utf8');
    const shell = readFileSync(new URL('../layout/PortalShell.tsx', import.meta.url), 'utf8');
    const swipe = readFileSync(new URL('../layout/PortalSwipeWorkspace.tsx', import.meta.url), 'utf8');
    assert.match(projects, /useStaffCrossOrg\(/);
    assert.match(projects, /retryPortalData\(\)/);
    assert.match(shell, /<PortalDataRetryProvider>/);
    assert.match(swipe, /<ProjectsContent \/>/);
    const providerAt = shell.indexOf('<PortalDataRetryProvider>');
    const chromeAt = shell.indexOf('<PortalChrome>');
    assert.ok(providerAt >= 0 && chromeAt > providerAt);
  });

  it('calls createTask from the project task list when write-back is on', () => {
    const projects = readFileSync(new URL('../pages/ProjectsContent.tsx', import.meta.url), 'utf8');
    assert.match(projects, /api\.tasks\.createTask/);
    assert.match(projects, /createTask\(/);
    assert.match(projects, /quickAddEnabled=\{writebackEnabled\}/);
    assert.equal(projects.includes('quickAddEnabled={false}'), false);
    assert.match(projects, /if \(!writebackEnabled\) return \{ ok: false, error: WRITEBACK_OFF_ERROR \}/);
    assert.match(projects, /showTaskListFilters\(itemView\.region\)/);
  });

  it('restores the open project and task view from the URL after Try again', () => {
    const projects = readFileSync(new URL('../pages/ProjectsContent.tsx', import.meta.url), 'utf8');
    const retryStart = projects.indexOf('const retryTasks');
    const retryEnd = projects.indexOf('const clearTaskFilters');
    const retry = projects.slice(retryStart, retryEnd);
    assert.match(retry, /setSearchParams\(remembered\)/);
    assert.match(retry, /taskView/);
    assert.match(retry, /projectId/);
    const writeAt = retry.indexOf('setSearchParams(remembered)');
    const remountAt = retry.indexOf('retryPortalData()');
    assert.ok(writeAt >= 0 && remountAt > writeAt);
    assert.match(projects, /keepProjectWhileLoading\(/);
    assert.match(projects, /readTaskListView\(params\.get\('taskView'\)\)/);
    assert.equal(projects.includes('projectsLoading && deepLink'), false);
  });

  it('catches a queued stage retry once and still records the failure', () => {
    const projects = readFileSync(new URL('../pages/ProjectsContent.tsx', import.meta.url), 'utf8');
    const fnStart = projects.indexOf('const retryQueuedStage');
    const fnEnd = projects.indexOf('if (openProject)', fnStart);
    const fn = projects.slice(fnStart, fnEnd);
    assert.match(fn, /catch \(err\)/);
    assert.match(fn, /Could not retry the stage change\./);
    assert.equal(fn.includes('.catch('), false);
    const handlerStart = projects.indexOf('onRetry={queuedStage');
    const handlerEnd = projects.indexOf(': undefined}', handlerStart);
    const handler = projects.slice(handlerStart, handlerEnd);
    assert.match(handler, /retryQueuedStage\(\)/);
    assert.equal(handler.includes('.catch'), false);
    assert.equal(handler.includes('void '), false);
  });
});
