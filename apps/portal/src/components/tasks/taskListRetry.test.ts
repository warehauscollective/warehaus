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

  it('does not mount a task board or create tasks on the project page', () => {
    const projects = readFileSync(new URL('../pages/ProjectsContent.tsx', import.meta.url), 'utf8');
    const details = projects.slice(projects.indexOf('details='));
    assert.equal(details.includes('<TaskBoard'), false);
    assert.equal(details.includes('StatusTable'), false);
    assert.equal(projects.includes('api.tasks.createTask'), false);
    assert.equal(projects.includes('quickAddEnabled={writebackEnabled}'), false);
    assert.match(projects, /showQuickAdd=\{false\}/);
    assert.match(projects, /renderTasks=/);
  });

  it('keeps the open project in the URL while its milestones load', () => {
    const projects = readFileSync(new URL('../pages/ProjectsContent.tsx', import.meta.url), 'utf8');
    assert.match(projects, /keepProjectWhileLoading\(/);
    assert.match(projects, /readTaskListView\(params\.get\('taskView'\)\)/);
    assert.match(projects, /setSearchParams\(\{ project: project\.id, taskView: 'board' \}\)/);
    assert.equal(projects.includes('projectsLoading && deepLink'), false);
    assert.equal(projects.includes('<h2 style={{ fontSize: 18, fontWeight: 600, lineHeight: \'26px\' }}>Tasks</h2>'), false);
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
