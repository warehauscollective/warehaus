import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CHECK_EMAIL_BODY,
  RESEND_COOLDOWN_MS,
  VERIFICATION_EXPIRES_IN_SECONDS,
  decideResendCooldown,
  formatResendCountdown,
} from './resendCooldown';

describe('verification resend cooldown', () => {
  it('expires verification links in 30 minutes', () => {
    assert.equal(VERIFICATION_EXPIRES_IN_SECONDS, 1800);
  });

  it('uses one 45 second window', () => {
    assert.equal(RESEND_COOLDOWN_MS, 45_000);
    assert.equal(formatResendCountdown(RESEND_COOLDOWN_MS), 'Resend in 0:45');
    assert.equal(formatResendCountdown(1_000), 'Resend in 0:01');
    assert.equal(formatResendCountdown(0), 'Resend in 0:00');
  });

  it('allows the first attempt and blocks until the window elapses', () => {
    const now = 1_700_000_000_000;
    assert.deepEqual(decideResendCooldown({ now, lastAttemptAt: null }), {
      allowed: true,
      retryAfterMs: 0,
    });
    assert.deepEqual(decideResendCooldown({ now, lastAttemptAt: now }), {
      allowed: false,
      retryAfterMs: RESEND_COOLDOWN_MS,
    });
    assert.equal(
      decideResendCooldown({ now: now + 1_000, lastAttemptAt: now }).retryAfterMs,
      44_000,
    );
    assert.deepEqual(
      decideResendCooldown({ now: now + RESEND_COOLDOWN_MS, lastAttemptAt: now }),
      { allowed: true, retryAfterMs: 0 },
    );
  });

  it('does not take an account or contact input', () => {
    const keys = Object.keys(decideResendCooldown({ now: 0, lastAttemptAt: null }));
    assert.deepEqual(keys.sort(), ['allowed', 'retryAfterMs']);
    assert.match(CHECK_EMAIL_BODY, /30 minutes/);
  });
});
