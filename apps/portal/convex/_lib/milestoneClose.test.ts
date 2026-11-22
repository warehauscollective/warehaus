import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

describe('milestone close wiring', () => {
  it('uses one indexed read of linked tasks and their children', () => {
    const source = readFileSync(new URL('./milestoneClose.ts', import.meta.url), 'utf8');
    assert.match(source, /by_orgId_milestoneId/);
    assert.match(source, /by_parentTaskId/);
    assert.match(source, /archivedAt/);
    assert.match(source, /closeTasksForMilestone/);
    assert.match(source, /take\(MILESTONE_CLOSE_CAP \+ 1\)/);
    assert.doesNotMatch(source, /\.collect\(/);
  });

  it('calls the gate from the portal status write and the staff API', () => {
    const portal = readFileSync(new URL('../milestones.ts', import.meta.url), 'utf8');
    const setStatus = portal.slice(portal.indexOf('export const setStatus'), portal.indexOf('export const advance'));
    assert.match(setStatus, /milestoneCloseGate\(ctx, milestone\)/);
    const api = readFileSync(new URL('../portalApi.ts', import.meta.url), 'utf8');
    const update = api.slice(api.indexOf('export const updateMilestone'), api.indexOf('export const addComment'));
    assert.match(update, /milestoneCloseGate\(ctx, milestone\)/);
  });

  it('reads a public pull request and does not use the review token', () => {
    const tasks = readFileSync(new URL('../tasks.ts', import.meta.url), 'utf8');
    const commit = tasks.slice(tasks.indexOf('export const commitShipped'), tasks.indexOf('export const createTask'));
    assert.match(commit, /verifyPullMerged\(\{ link: prepared\.link \}\)/);
    assert.doesNotMatch(commit, /REVIEW_PREVIEW_GITHUB_TOKEN/);
    const api = readFileSync(new URL('../portalApi.ts', import.meta.url), 'utf8');
    const dispatch = api.slice(api.indexOf('async function dispatchWrite'), api.indexOf('if (path === \'/api/v1/milestones\')'));
    assert.match(dispatch, /verifyPullMerged\(\{ link: resolved\.link \}\)/);
    assert.doesNotMatch(dispatch, /REVIEW_PREVIEW_GITHUB_TOKEN/);
  });
});
