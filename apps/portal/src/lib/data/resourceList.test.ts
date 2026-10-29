import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FIXTURE_RESOURCES } from './fixtures';
import { recapSections } from './resourceDetail';
import {
  attachedHint,
  isDraftRecap,
  resourceAttachmentMeta,
  resourceListStats,
  resourceMatchesFilter,
  resourceSourceLabel,
  resourceTitleLine,
} from './resourceList';

describe('resource list', () => {
  it('counts meetings, drafts, and published recaps from rows already loaded', () => {
    const stats = resourceListStats(
      [
        { type: 'Meeting notes', publishToWarehaus: true, attachedCount: 2 },
        { type: 'Meeting notes', publishToWarehaus: false, attachedCount: 1 },
        { type: 'File', publishToWarehaus: false, attachedCount: 1 },
      ],
      true,
    );
    assert.equal(stats.meetings, 2);
    assert.equal(stats.drafts, 1);
    assert.equal(stats.published, 1);
    assert.equal(stats.files, 1);
    assert.equal(stats.attached, 2);
    assert.equal(attachedHint(2, true), '2 attached to items');
  });

  it('does not invent a draft count for a client list', () => {
    const stats = resourceListStats(
      [{ type: 'Meeting notes', publishToWarehaus: true, attachedCount: 2 }],
      false,
    );
    assert.equal(stats.drafts, 0);
    assert.equal(stats.published, 1);
    assert.equal(isDraftRecap({ type: 'Meeting notes', publishToWarehaus: true }), false);
  });

  it('builds the row title and source meta from the type, date, and attachment', () => {
    assert.equal(resourceSourceLabel('Meeting notes'), 'Granola');
    assert.equal(resourceSourceLabel('File'), 'File');
    assert.equal(
      resourceTitleLine('Kickoff recap', Date.parse('2026-09-29T00:00:00Z')),
      'Kickoff recap · Sep 29',
    );
    assert.equal(
      resourceAttachmentMeta('Granola', 'Write the launch checklist', 1),
      'Granola · Write the launch checklist +1',
    );
    assert.equal(resourceMatchesFilter({ type: 'File', publishToWarehaus: false }, 'files-links'), true);
    assert.equal(resourceMatchesFilter({ type: 'Meeting notes', publishToWarehaus: false }, 'draft-recap'), true);
  });

  it('reads the kickoff recap from the description, not from new columns', () => {
    const notes = FIXTURE_RESOURCES.find((row) => row.id === 'r-notes');
    const sections = recapSections(notes?.description);
    assert.match(sections.summary ?? '', /wireframes/);
    assert.match(sections.decisions ?? '', /single-column menu page/);
    assert.match(sections.actionItems ?? '', /Maya: update menu wireframe/);
  });
});
