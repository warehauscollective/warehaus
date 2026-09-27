import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { sessionDeleteArgs, sessionDeleteCursor } from './sessionRevoke';

describe('session revoke', () => {
  it('deletes only the session model rows for that user', () => {
    assert.deepEqual(sessionDeleteArgs('user_1'), {
      model: 'session',
      where: [{ field: 'userId', operator: 'eq', value: 'user_1' }],
    });
  });

  it('stops when the adapter page is done and rejects a short page', () => {
    assert.equal(sessionDeleteCursor({ isDone: true, continueCursor: 'more' }), null);
    assert.equal(sessionDeleteCursor({ isDone: false, continueCursor: 'cursor-2' }), 'cursor-2');
    assert.throws(
      () => sessionDeleteCursor({ isDone: false, continueCursor: null }),
      /did not finish/,
    );
  });
});
