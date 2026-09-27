import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  SYNC_EVENT_RETENTION_MS,
  SYNC_EVENT_TABLE,
  isExpiredProcessedSyncEvent,
  processedSyncEventPatch,
} from './syncEventRetention';

const now = Date.parse('2026-09-27T00:00:00.000Z');

describe('syncEvents retention', () => {
  it('deletes processed webhook rows only after 30 days', () => {
    assert.equal(SYNC_EVENT_TABLE, 'syncEvents');

    const done = processedSyncEventPatch('done', now - SYNC_EVENT_RETENTION_MS - 1);
    assert.equal(
      isExpiredProcessedSyncEvent(
        { status: done.status, processedAt: done.processedAt, receivedAt: done.processedAt - 50 },
        now,
      ),
      true,
    );

    const errored = processedSyncEventPatch(
      'error',
      now - SYNC_EVENT_RETENTION_MS,
      'notion unavailable',
    );
    assert.equal(
      isExpiredProcessedSyncEvent(
        {
          status: errored.status,
          processedAt: errored.processedAt,
          receivedAt: errored.processedAt - 50,
        },
        now,
      ),
      true,
    );

    const recent = processedSyncEventPatch('done', now - 24 * 60 * 60 * 1000);
    assert.equal(
      isExpiredProcessedSyncEvent(
        {
          status: recent.status,
          processedAt: recent.processedAt,
          receivedAt: recent.processedAt - 10,
        },
        now,
      ),
      false,
    );
  });

  it('never selects queued or unprocessed rows, including old ones', () => {
    assert.equal(
      isExpiredProcessedSyncEvent(
        { status: 'queued', receivedAt: 0 },
        now,
      ),
      false,
    );
    assert.equal(
      isExpiredProcessedSyncEvent(
        { status: 'done', receivedAt: 0 },
        now,
      ),
      false,
    );
    assert.equal(
      isExpiredProcessedSyncEvent(
        { status: 'error', receivedAt: 0, processedAt: undefined },
        now,
      ),
      false,
    );
  });

  it('records processedAt when a webhook finishes so retention can see it', () => {
    const success = processedSyncEventPatch('done', now);
    const failure = processedSyncEventPatch('error', now, 'pull failed');
    assert.equal(success.processedAt, now);
    assert.equal(success.error, undefined);
    assert.equal(failure.status, 'error');
    assert.equal(failure.error, 'pull failed');
    assert.equal(
      isExpiredProcessedSyncEvent(
        { status: failure.status, processedAt: failure.processedAt, receivedAt: now },
        now,
      ),
      false,
    );
  });
});
