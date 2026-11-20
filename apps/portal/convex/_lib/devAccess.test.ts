import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { authMirrorAllowed, devMailboxKeyAccepted } from './devAccess';

const KEY = 'k'.repeat(32);

describe('dev mailbox key', () => {
  it('opens only for the exact configured key', () => {
    assert.equal(devMailboxKeyAccepted(KEY, KEY), true);
    assert.equal(devMailboxKeyAccepted(KEY, `${KEY}x`), false);
    assert.equal(devMailboxKeyAccepted(KEY, 'k'.repeat(31)), false);
  });

  it('stays closed when no key is configured or none is sent', () => {
    assert.equal(devMailboxKeyAccepted(undefined, KEY), false);
    assert.equal(devMailboxKeyAccepted('', ''), false);
    assert.equal(devMailboxKeyAccepted('   ', '   '), false);
    assert.equal(devMailboxKeyAccepted(KEY, undefined), false);
    assert.equal(devMailboxKeyAccepted(KEY, ''), false);
  });

  it('refuses a short configured key even when it matches', () => {
    assert.equal(devMailboxKeyAccepted('short-key', 'short-key'), false);
  });
});

describe('auth mirror write to Notion', () => {
  it('is allowed on production without the write-back flag', () => {
    assert.equal(
      authMirrorAllowed({
        cloudUrl: 'https://unique-turtle-383.convex.cloud',
        writebackFlag: undefined,
      }),
      true,
    );
  });

  it('is refused on shared dev while write-back is off', () => {
    for (const writebackFlag of [undefined, '', 'false', '1', 'TRUE']) {
      assert.equal(
        authMirrorAllowed({
          cloudUrl: 'https://graceful-mastiff-960.convex.cloud',
          writebackFlag,
        }),
        false,
      );
    }
  });

  it('is allowed on shared dev once write-back is switched on', () => {
    assert.equal(
      authMirrorAllowed({
        cloudUrl: 'https://graceful-mastiff-960.convex.cloud',
        writebackFlag: 'true',
      }),
      true,
    );
  });

  it('is refused when the deployment URL is missing or only looks like production', () => {
    assert.equal(authMirrorAllowed({ cloudUrl: undefined, writebackFlag: undefined }), false);
    assert.equal(authMirrorAllowed({ cloudUrl: 'not a url', writebackFlag: undefined }), false);
    assert.equal(
      authMirrorAllowed({
        cloudUrl: 'https://unique-turtle-383.convex.cloud.example.com',
        writebackFlag: undefined,
      }),
      false,
    );
  });
});
