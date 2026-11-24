import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

describe('shipping on a merged pull request', () => {
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
