import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { VERIFICATION_EXPIRES_IN_SECONDS } from './resendCooldown';
import { SESSION_EXPIRES_IN_SECONDS, portalSessionConfig } from './sessionLifetime';

describe('portal session lifetime', () => {
  it('keeps a signed-in session for 90 days', () => {
    assert.equal(SESSION_EXPIRES_IN_SECONDS, 7_776_000);
    assert.equal(SESSION_EXPIRES_IN_SECONDS, 90 * 24 * 60 * 60);
    assert.deepEqual(portalSessionConfig(), { expiresIn: 7_776_000 });
  });

  it('leaves verification links at 30 minutes', () => {
    assert.equal(VERIFICATION_EXPIRES_IN_SECONDS, 1_800);
    assert.ok(SESSION_EXPIRES_IN_SECONDS > VERIFICATION_EXPIRES_IN_SECONDS);
  });
});
