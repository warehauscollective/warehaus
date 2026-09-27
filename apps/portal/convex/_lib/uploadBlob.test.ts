import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PortalAuthError } from './identity';
import {
  isOrphanedUploadBlob,
  shouldDiscardUnreferencedBlob,
  verifyFinalizedUpload,
  type UploadIntentClaim,
} from './uploadBlob';

const now = Date.parse('2026-09-27T00:00:00.000Z');

const intent: UploadIntentClaim = {
  orgId: 'org_1',
  contactId: 'con_1',
  createdAt: now - 1000,
};

describe('verifyFinalizedUpload', () => {
  it('uses stored size and type and requires the minting owner', () => {
    const verified = verifyFinalizedUpload({
      metadata: { size: 1200, contentType: 'image/png' },
      claimedByteSize: 1200,
      claimedMimeType: 'image/png',
      intent,
      callerOrgId: 'org_1',
      callerContactId: 'con_1',
      alreadyClaimed: false,
      nowMs: now,
    });
    assert.equal(verified.byteSize, 1200);
    assert.equal(verified.mimeType, 'image/png');
  });

  it('rejects a browser size or type that does not match the blob', () => {
    assert.throws(
      () =>
        verifyFinalizedUpload({
          metadata: { size: 50, contentType: 'application/pdf' },
          claimedByteSize: 5,
          claimedMimeType: 'application/pdf',
          intent,
          callerOrgId: 'org_1',
          callerContactId: 'con_1',
          alreadyClaimed: false,
          nowMs: now,
        }),
      (err: unknown) => err instanceof PortalAuthError,
    );
    assert.throws(
      () =>
        verifyFinalizedUpload({
          metadata: { size: 50, contentType: 'application/pdf' },
          claimedByteSize: 50,
          claimedMimeType: 'image/png',
          intent,
          callerOrgId: 'org_1',
          callerContactId: 'con_1',
          alreadyClaimed: false,
          nowMs: now,
        }),
      (err: unknown) =>
        err instanceof PortalAuthError && /type/.test(err.message),
    );
  });

  it('rejects an intent owned by someone else', () => {
    assert.throws(
      () =>
        verifyFinalizedUpload({
          metadata: { size: 50, contentType: 'text/plain' },
          claimedByteSize: 50,
          intent,
          callerOrgId: 'org_other',
          callerContactId: 'con_1',
          alreadyClaimed: false,
          nowMs: now,
        }),
      (err: unknown) =>
        err instanceof PortalAuthError && /owner/.test(err.message),
    );
  });
});

describe('orphaned upload blobs', () => {
  it('discards an unreferenced blob after a failed finalize', () => {
    assert.equal(
      shouldDiscardUnreferencedBlob({ referenced: false, metadataExists: true }),
      true,
    );
    assert.equal(
      shouldDiscardUnreferencedBlob({ referenced: true, metadataExists: true }),
      false,
    );
  });

  it('sweeps only unreferenced blobs that have aged out', () => {
    const day = 24 * 60 * 60 * 1000;
    assert.equal(
      isOrphanedUploadBlob({
        creationTime: now - day - 1,
        nowMs: now,
        referenced: false,
      }),
      true,
    );
    assert.equal(
      isOrphanedUploadBlob({
        creationTime: now - 1000,
        nowMs: now,
        referenced: false,
      }),
      false,
    );
    assert.equal(
      isOrphanedUploadBlob({
        creationTime: now - day - 1,
        nowMs: now,
        referenced: true,
      }),
      false,
    );
  });
});
