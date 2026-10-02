import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  PREVIEW_ACTIVITY,
  PREVIEW_CONTACTS,
  PREVIEW_ORGS,
  PREVIEW_PROJECTS,
  PREVIEW_RESOURCES,
  PREVIEW_TASKS,
  previewTaskStatuses,
} from './localPreviewCatalog';

describe('local preview catalog', () => {
  it('uses fake clients, a staff admin, and one contact per client', () => {
    const clientOrgs = PREVIEW_ORGS.filter((org) => org.slug !== 'warehaus-internal');
    assert.equal(clientOrgs.length, 3);
    assert.ok(clientOrgs.every((org) => org.notionPageId.startsWith('seed-local-')));
    assert.equal(
      PREVIEW_CONTACTS.filter((contact) => contact.role === 'Warehaus Staff').length,
      1,
    );
    for (const org of clientOrgs) {
      assert.equal(
        PREVIEW_CONTACTS.filter((contact) => contact.orgSlug === org.slug).length,
        1,
      );
    }
    assert.ok(PREVIEW_CONTACTS.every((contact) => contact.email.endsWith('.test')));
  });

  it('includes Internal Warehaus plus tasks across board statuses', () => {
    assert.ok(PREVIEW_PROJECTS.some((project) => project.name === 'Internal Warehaus'));
    assert.ok(PREVIEW_PROJECTS.every((project) => !project.type.includes('Internal')));
    assert.deepEqual(previewTaskStatuses().sort(), [
      'Blocked',
      'Done',
      'In Progress',
      'Inbox',
      'To Do',
    ]);
    assert.ok(PREVIEW_RESOURCES.length >= 2);
    assert.ok(PREVIEW_ACTIVITY.length >= 3);
  });
});
