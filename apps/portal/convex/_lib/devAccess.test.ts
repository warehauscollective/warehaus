import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { authMirrorAllowed, devMailboxKeyAccepted, pulledAuthUserId } from './devAccess';

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

describe('auth mirror with Notion', () => {
  it('is allowed on production', () => {
    assert.equal(authMirrorAllowed({ cloudUrl: 'https://unique-turtle-383.convex.cloud' }), true);
  });

  it('is refused on shared dev, whatever the write-back flag says', () => {
    assert.equal(authMirrorAllowed({ cloudUrl: 'https://graceful-mastiff-960.convex.cloud' }), false);
  });

  it('is refused when the deployment URL is missing or only looks like production', () => {
    assert.equal(authMirrorAllowed({ cloudUrl: undefined }), false);
    assert.equal(authMirrorAllowed({ cloudUrl: 'not a url' }), false);
    assert.equal(
      authMirrorAllowed({ cloudUrl: 'https://unique-turtle-383.convex.cloud.example.com' }),
      false,
    );
  });
});

describe('auth id kept on a pulled contact', () => {
  it('keeps the local link on shared dev and ignores the id in Notion', () => {
    assert.equal(
      pulledAuthUserId({ notionValue: 'prod-id', localValue: 'dev-id', mirrorAllowed: false }),
      'dev-id',
    );
  });

  it('does not import an id from Notion on shared dev when nothing is linked', () => {
    assert.equal(
      pulledAuthUserId({ notionValue: 'prod-id', localValue: undefined, mirrorAllowed: false }),
      undefined,
    );
    assert.equal(
      pulledAuthUserId({ notionValue: 'prod-id', localValue: '', mirrorAllowed: false }),
      undefined,
    );
  });

  it('lets Notion win where the mirror is allowed, with the local link as fallback', () => {
    assert.equal(
      pulledAuthUserId({ notionValue: 'notion-id', localValue: 'local-id', mirrorAllowed: true }),
      'notion-id',
    );
    assert.equal(
      pulledAuthUserId({ notionValue: undefined, localValue: 'local-id', mirrorAllowed: true }),
      'local-id',
    );
    assert.equal(
      pulledAuthUserId({ notionValue: '', localValue: undefined, mirrorAllowed: true }),
      undefined,
    );
  });
});
