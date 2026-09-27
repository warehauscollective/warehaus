import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BLOCKED_SIGNUP_BODY,
  BLOCKED_SIGNUP_SUBJECT,
  blockedSignupDelivery,
  rewriteVerificationCallback,
  verificationEmail,
} from './email';

describe('verification email', () => {
  it('rewrites the callback onto the portal verify page', () => {
    const raw = 'https://portal.example/api/auth/verify-email?token=abc&callbackURL=%2F%2Fevil.com';
    const next = rewriteVerificationCallback(raw);
    const url = new URL(next);
    assert.equal(url.searchParams.get('callbackURL'), '/verify-email');
    assert.equal(url.searchParams.get('token'), 'abc');
  });

  it('includes the verify link in text and html', () => {
    const content = verificationEmail({
      name: 'Ada',
      verifyUrl: 'https://portal.example/api/auth/verify-email?token=abc',
    });
    assert.match(content.subject, /Verify/);
    assert.match(content.text, /token=abc/);
    assert.match(content.html, /token=abc/);
    assert.match(content.text, /30 minutes/);
    assert.match(content.html, /30 minutes/);
  });

  it('schedules the blocked-signup notice on the same mail path', () => {
    const delivery = blockedSignupDelivery('team@warehaus.co');
    assert.equal(delivery.delayMs, 0);
    assert.equal(delivery.to, 'team@warehaus.co');
    assert.equal(delivery.subject, BLOCKED_SIGNUP_SUBJECT);
    assert.equal(delivery.subject, 'About your Warehaus portal sign-up');
    assert.match(delivery.text, new RegExp(BLOCKED_SIGNUP_BODY.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(delivery.html, /This email can&#39;t register here\. Contact your Warehaus team\./);
    assert.equal(BLOCKED_SIGNUP_BODY, "This email can't register here. Contact your Warehaus team.");
  });
});
