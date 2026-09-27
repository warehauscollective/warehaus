import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyPullPass,
  decidePullWatermark,
  parsePullRetries,
  selectPagesForPull,
  type SyncPage,
} from './pull-cursor';

const watermark = Date.parse('2026-09-01T00:00:00.000Z');
const editedAt = Date.parse('2026-09-03T12:00:00.000Z');
const pulledAt = Date.parse('2026-09-05T15:00:00.000Z');

const editedPage: SyncPage = {
  id: 'page-1',
  database: 'projects',
  editedAtMs: editedAt,
  body: 'renamed project',
};

describe('notion pull cursor', () => {
  it('applies an edit after a failed pull once a later run succeeds', () => {
    const source = [editedPage];
    const stored = new Map<string, SyncPage>();

    const failed = applyPullPass({
      source,
      stored,
      lastSyncedAtMs: watermark,
      nowMs: pulledAt,
      failIds: new Set(['page-1']),
    });

    assert.equal(stored.has('page-1'), false);
    assert.ok(failed.lastSyncedAtMs != null);
    assert.ok(failed.lastSyncedAtMs < editedAt);
    assert.equal(failed.retries.length, 1);
    assert.ok(failed.retries[0].nextRetryAt > pulledAt);

    const bugWatermark = pulledAt;
    const missed = selectPagesForPull({
      pages: source,
      lastSyncedAtMs: bugWatermark,
    });
    assert.equal(missed.length, 0);
    const stillDue = selectPagesForPull({
      pages: source,
      lastSyncedAtMs: failed.lastSyncedAtMs,
    });
    assert.equal(stillDue.length, 1);

    const tooSoon = applyPullPass({
      source,
      stored,
      lastSyncedAtMs: failed.lastSyncedAtMs,
      nowMs: pulledAt + 1000,
      failIds: new Set(),
      priorRetries: failed.retries,
    });
    assert.equal(stored.has('page-1'), false);
    assert.ok(tooSoon.lastSyncedAtMs != null && tooSoon.lastSyncedAtMs < editedAt);

    const succeeded = applyPullPass({
      source,
      stored,
      lastSyncedAtMs: tooSoon.lastSyncedAtMs,
      nowMs: failed.retries[0].nextRetryAt + 1,
      failIds: new Set(),
      priorRetries: tooSoon.retries,
    });

    assert.equal(stored.get('page-1')?.body, 'renamed project');
    assert.deepEqual(succeeded.appliedIds, ['page-1']);
    assert.equal(succeeded.retries.length, 0);
    assert.equal(succeeded.lastSyncedAtMs, failed.retries[0].nextRetryAt + 1);
  });

  it('does not advance the cursor past an earlier failure when a later page succeeds', () => {
    const laterEdited = editedAt + 60 * 60 * 1000;
    const source: SyncPage[] = [
      editedPage,
      {
        id: 'page-2',
        database: 'projects',
        editedAtMs: laterEdited,
        body: 'later edit',
      },
    ];
    const stored = new Map<string, SyncPage>();
    const failed = applyPullPass({
      source,
      stored,
      lastSyncedAtMs: watermark,
      nowMs: pulledAt,
      failIds: new Set(['page-1']),
    });

    assert.equal(stored.get('page-2')?.body, 'later edit');
    assert.equal(stored.has('page-1'), false);
    assert.ok(failed.lastSyncedAtMs != null && failed.lastSyncedAtMs < editedAt);

    const watermarkDecision = decidePullWatermark({
      previousWatermarkMs: watermark,
      nowMs: pulledAt,
      outcomes: [
        { id: 'page-1', editedAtMs: editedAt, ok: false },
        { id: 'page-2', editedAtMs: laterEdited, ok: true },
      ],
    });
    assert.equal(watermarkDecision, editedAt - 1);
  });

  it('keeps the previous cursor when the pull dies before any page is processed', () => {
    assert.equal(
      decidePullWatermark({
        previousWatermarkMs: watermark,
        nowMs: pulledAt,
        outcomes: [],
        fatal: true,
      }),
      watermark,
    );
  });

  it('backs off a missing retry without moving the cursor past it', () => {
    const stored = new Map<string, SyncPage>();
    const prior = applyPullPass({
      source: [editedPage],
      stored,
      lastSyncedAtMs: watermark,
      nowMs: pulledAt,
      failIds: new Set(['page-1']),
    }).retries;

    const missing = applyPullPass({
      source: [],
      stored,
      lastSyncedAtMs: editedAt - 1,
      nowMs: prior[0].nextRetryAt + 1,
      failIds: new Set(),
      priorRetries: prior,
    });

    assert.equal(stored.has('page-1'), false);
    assert.equal(missing.retries.length, 1);
    assert.ok(missing.retries[0].nextRetryAt > prior[0].nextRetryAt);
    assert.ok(missing.lastSyncedAtMs != null && missing.lastSyncedAtMs < editedAt);
  });

  it('reads retry rows from sync details and ignores corrupt payloads', () => {
    const retries = parsePullRetries(
      JSON.stringify({
        stats: { skipped: 1 },
        retries: [
          {
            id: 'page-1',
            database: 'tasks',
            editedAtMs: editedAt,
            attempts: 2,
            nextRetryAt: pulledAt,
            error: 'notion 500',
          },
        ],
      }),
    );
    assert.equal(retries.length, 1);
    assert.equal(retries[0].database, 'tasks');
    assert.deepEqual(parsePullRetries('not-json'), []);
    assert.deepEqual(parsePullRetries(JSON.stringify({ upserted: 3 })), []);
  });
});
