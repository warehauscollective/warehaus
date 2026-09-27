import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { rewriteVerificationCallback, verificationEmail } from './email';

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
  });
});
