import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { safeRedirectPath } from './safeRedirect';

describe('safeRedirectPath', () => {
  it('allows same-origin relative paths', () => {
    assert.equal(safeRedirectPath('/projects'), '/projects');
    assert.equal(safeRedirectPath('/projects?tab=1'), '/projects?tab=1');
    assert.equal(safeRedirectPath('/account#profile'), '/account#profile');
    assert.equal(safeRedirectPath('  /login  '), '/login');
  });

  it('falls back when the value is empty', () => {
    assert.equal(safeRedirectPath(null), '/');
    assert.equal(safeRedirectPath(''), '/');
    assert.equal(safeRedirectPath('   '), '/');
  });

  it('rejects protocol-relative, backslash, and absolute URLs', () => {
    for (const bad of [
      '//evil.com',
      '///evil.com',
      '/\\evil.com',
      '/\\\\evil.com',
      '\\evil.com',
      'https://evil.com',
      'http://evil.com',
      'HTTPS://evil.com/phish',
      'javascript:alert(1)',
      'https://warehaus-portal.vercel.app/projects',
    ]) {
      assert.equal(safeRedirectPath(bad), '/', bad);
    }
  });

  it('rejects encoded variants', () => {
    for (const bad of [
      '%2F%2Fevil.com',
      '%2f%2fevil.com',
      '/%2Fevil.com',
      '/%2fevil.com',
      '/%5Cevil.com',
      '/%5cevil.com',
      '%2F%5Cevil.com',
      '%5C%5Cevil.com',
      '%252F%252Fevil.com',
      '%252f%252fevil.com',
      '/%252Fevil.com',
      '/%255Cevil.com',
    ]) {
      assert.equal(safeRedirectPath(bad), '/', bad);
    }
  });

  it('rejects control characters and whitespace tricks', () => {
    assert.equal(safeRedirectPath('/foo\nbar'), '/');
    assert.equal(safeRedirectPath('/foo bar'), '/');
    assert.equal(safeRedirectPath('/\t/evil.com'), '/');
  });
});
