import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fixtureResourcesPage } from './resourcesPage';

describe('resources page fixture adapter', () => {
  it('gives staff every fixture resource, drafts included', () => {
    const page = fixtureResourcesPage(true);
    assert.deepEqual(page.rows.map((row) => row.id), ['r-notes', 'r-file', 'r-draft-recap']);
    assert.equal(page.loading, false);
    assert.equal(page.error, null);
  });

  it('gives a client only what they may open, without staff fields', () => {
    const page = fixtureResourcesPage(false);
    assert.deepEqual(page.rows.map((row) => row.id), ['r-notes']);
    assert.equal('notionPageId' in page.rows[0]!, false);
  });

  it('counts and names linked tasks the way the viewer sees them', () => {
    const staff = fixtureResourcesPage(true);
    const client = fixtureResourcesPage(false);
    const notes = staff.rows.find((row) => row.id === 'r-notes')!;
    assert.ok((staff.attachmentCount(notes) ?? 0) >= (client.attachmentCount(notes) ?? 0));
    assert.equal(staff.tasksFor('r-notes').loading, false);
    assert.match(staff.attachmentCopy(notes), /\S/);
  });
});
