import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { staffQuarantineActivity } from './quarantineActivity';

describe('staff quarantine activity', () => {
  it('raises this org and unscoped rows as exceptions', () => {
    const rows = staffQuarantineActivity(
      [
        {
          id: 'q1',
          notionPageId: 'page-1',
          database: 'projects',
          reason: 'Stopped after 8 failed attempts: notion 500',
          createdAt: Date.parse('2026-09-05T15:00:00.000Z'),
          orgId: 'org_a',
        },
        {
          id: 'q2',
          notionPageId: 'page-2',
          database: 'tasks',
          reason: 'Stopped after 8 failed attempts: missing',
          createdAt: Date.parse('2026-09-05T16:00:00.000Z'),
        },
        {
          id: 'q3',
          notionPageId: 'page-3',
          database: 'clients',
          reason: 'other org',
          createdAt: Date.parse('2026-09-05T17:00:00.000Z'),
          orgId: 'org_b',
        },
      ],
      'org_a',
    );

    assert.deepEqual(
      rows.map((row) => row.id),
      ['q1', 'q2'],
    );
    assert.equal(rows[0].type, 'exception');
    assert.equal(rows[0].tone, 'danger');
    assert.match(rows[0].summary, /projects page-1/);
    assert.match(rows[1].summary, /tasks page-2/);
  });
});