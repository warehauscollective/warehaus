import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { revertAllowed, revertIdempotencyKey } from './revertLimit';

describe('revert rate limit', () => {
  it('allows three reverts in the window and stops on the fourth', () => {
    assert.equal(revertAllowed(0), true);
    assert.equal(revertAllowed(2), true);
    assert.equal(revertAllowed(3), false);
    assert.equal(revertAllowed(4), false);
  });

  it('keys a revert by page, field, and the observed edit time', () => {
    assert.equal(
      revertIdempotencyKey('page', 'Portal Access', '2026-09-27T00:00:00.000Z'),
      'revert:page:Portal Access:2026-09-27T00:00:00.000Z',
    );
  });
});
