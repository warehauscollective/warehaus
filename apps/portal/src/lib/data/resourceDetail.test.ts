import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { notionNotesHref, resourceMeta, usedInTasksSubtitle } from './resourceDetail';

describe('resource detail', () => {
  it('opens Notion only for a real page id', () => {
    assert.equal(notionNotesHref(null), null);
    assert.equal(notionNotesHref('portal:task:1'), null);
    assert.equal(notionNotesHref('pending:wh_res_1'), null);
    assert.equal(notionNotesHref('notion-resource-notes'), null);
    assert.equal(
      notionNotesHref('0123456789abcdef0123456789abcdef'),
      'https://www.notion.so/0123456789abcdef0123456789abcdef',
    );
  });

  it('counts used-in-tasks without inventing a recap', () => {
    assert.equal(usedInTasksSubtitle(0), 'Not linked to any task yet');
    assert.equal(usedInTasksSubtitle(1), '1 task · click to open the task');
    assert.equal(usedInTasksSubtitle(2), '2 tasks · click to open the task');
    assert.equal(resourceMeta('Meeting notes', Date.parse('2026-09-29T00:00:00Z')), 'Meeting notes · Sep 29');
    assert.equal(resourceMeta(null, null), 'Resource');
  });
});
