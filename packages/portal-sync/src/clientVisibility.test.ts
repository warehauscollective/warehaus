import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { clientSeesProject, clientSeesProjectItem, clientSeesTask } from './clientVisibility';

const project = { name: 'Northwind site', type: ['Website'], publishToWarehaus: true, archive: false, syncHiddenAt: null };
const task = { publishToWarehaus: true, syncHiddenAt: null };
const item = { publishToWarehaus: true, archive: false, syncHiddenAt: null, projectId: 'p1' };

describe('clientSeesProject', () => {
  const cases: Array<[string, Parameters<typeof clientSeesProject>[0], boolean, boolean]> = [
    ['published project, org visible', project, true, true],
    ['org gate closed', project, false, false],
    ['missing project', null, true, false],
    ['unpublished', { ...project, publishToWarehaus: false }, true, false],
    ['archived', { ...project, archive: true }, true, false],
    ['sync-hidden', { ...project, syncHiddenAt: 1 }, true, false],
    ['Internal type', { ...project, type: ['Internal'] }, true, false],
    ['Warehaus Studio by name', { ...project, name: ' Warehaus.Studio ', type: [] }, true, false],
    ['optional fields absent', { name: 'Site' }, true, false],
  ];
  for (const [label, row, orgVisible, expected] of cases) {
    it(label, () => assert.equal(clientSeesProject(row, orgVisible), expected));
  }
});

describe('clientSeesTask', () => {
  it('needs its own publish flag, no sync-hide, and a visible project', () => {
    assert.equal(clientSeesTask(task, project, true), true);
    assert.equal(clientSeesTask({ ...task, publishToWarehaus: false }, project, true), false);
    assert.equal(clientSeesTask({ ...task, syncHiddenAt: 5 }, project, true), false);
    assert.equal(clientSeesTask(task, null, true), false);
    assert.equal(clientSeesTask(task, project, false), false);
    assert.equal(clientSeesTask(undefined, project, true), false);
    assert.equal(clientSeesTask(task, { ...project, type: ['Internal'] }, true), false);
  });
});

describe('clientSeesProjectItem', () => {
  it('gates an item on its own flags and its project', () => {
    assert.equal(clientSeesProjectItem(item, project, true), true);
    assert.equal(clientSeesProjectItem({ ...item, archive: true }, project, true), false);
    assert.equal(clientSeesProjectItem({ ...item, syncHiddenAt: 1 }, project, true), false);
    assert.equal(clientSeesProjectItem({ ...item, publishToWarehaus: false }, project, true), false);
    assert.equal(clientSeesProjectItem(item, { ...project, archive: true }, true), false);
  });

  it('keeps an org-level item visible with only the org gate', () => {
    const orgItem = { ...item, projectId: null };
    assert.equal(clientSeesProjectItem(orgItem, null, true), true);
    assert.equal(clientSeesProjectItem(orgItem, null, false), false);
  });

  it('hides an item whose project row is missing', () => {
    assert.equal(clientSeesProjectItem(item, null, true), false);
  });
});
