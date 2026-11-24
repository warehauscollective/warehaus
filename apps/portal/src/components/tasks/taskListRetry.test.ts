import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

describe('task list retry and quick-add', () => {
  it('retries staff task queries by remounting the page that owns them', () => {
    const projects = readFileSync(new URL('../pages/ProjectsContent.tsx', import.meta.url), 'utf8');
    const shell = readFileSync(new URL('../layout/PortalShell.tsx', import.meta.url), 'utf8');
    const swipe = readFileSync(new URL('../layout/PortalSwipeWorkspace.tsx', import.meta.url), 'utf8');
    const pageData = readFileSync(new URL('../../lib/data/projectsPage.ts', import.meta.url), 'utf8');
    // The page's data hook owns the staff queries, so remounting the page retries them.
    assert.match(projects, /useProjectsPage\(/);
    assert.match(pageData, /useStaffCrossOrg\(/);
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
    assert.equal(projects.includes('<TaskBoard'), false);
    assert.equal(projects.includes('renderTasks='), false);
  });

  it('keeps the open project in the URL while its milestones load', () => {
    const projects = readFileSync(new URL('../pages/ProjectsContent.tsx', import.meta.url), 'utf8');
    assert.match(projects, /keepProjectWhileLoading\(/);
    assert.match(projects, /readTaskListView\(params\.get\('taskView'\)\)/);
    assert.match(projects, /setSearchParams\(\{ project: project\.id, taskView: 'board' \}\)/);
    assert.equal(projects.includes('projectsLoading && deepLink'), false);
    assert.equal(projects.includes('<h2 style={{ fontSize: 18, fontWeight: 600, lineHeight: \'26px\' }}>Tasks</h2>'), false);
  });

  it('no longer keeps stage-move state on the project page', () => {
    const projects = readFileSync(new URL('../pages/ProjectsContent.tsx', import.meta.url), 'utf8');
    // The milestone checklist replaced the board, so the page holds no move mutation or rules query.
    assert.equal(projects.includes('retryQueuedStage'), false);
    assert.equal(projects.includes('api.tasks.moveStage'), false);
    assert.equal(projects.includes('api.tasks.moveRules'), false);
  });
});
