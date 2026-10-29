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

  it('does not call createTask from the project task list', () => {
    const projects = readFileSync(new URL('../pages/ProjectsContent.tsx', import.meta.url), 'utf8');
    assert.equal(projects.includes('api.tasks.createTask'), false);
    assert.equal(projects.includes('createTask('), false);
    assert.match(projects, /quickAddEnabled=\{false\}/);
    assert.match(projects, /showTaskListFilters\(itemView\.region\)/);
  });
});
