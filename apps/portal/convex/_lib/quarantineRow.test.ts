import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { matchingQuarantineId } from './quarantineRow';

describe('quarantine row identity', () => {
  it('does not insert a second row for the same page and edit time', () => {
    const editedAtMs = Date.parse('2026-09-03T12:00:00.000Z');
    const first = matchingQuarantineId([], {
      notionPageId: 'page-1',
      editedAtMs,
    });
    assert.equal(first, null);

    const rows = [{ id: 'q1', notionPageId: 'page-1', editedAtMs }];
    assert.equal(
      matchingQuarantineId(rows, { notionPageId: 'page-1', editedAtMs }),
      'q1',
    );
    assert.equal(
      matchingQuarantineId(rows, { notionPageId: 'page-1', editedAtMs: editedAtMs + 1 }),
      null,
    );
    assert.equal(
      matchingQuarantineId(rows, { notionPageId: 'page-2', editedAtMs }),
      null,
    );
  });
});
