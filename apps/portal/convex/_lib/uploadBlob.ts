import { PortalAuthError } from './identity';

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const UPLOAD_INTENT_TTL_MS = 60 * 60 * 1000;
export const ORPHAN_UPLOAD_BLOB_MIN_AGE_MS = 24 * 60 * 60 * 1000;

export type UploadIntentClaim = {
  orgId: string;
  contactId: string;
  createdAt: number;
  consumedAt?: number;
};

export type StoredBlobMetadata = {
  size: number;
  contentType?: string | null;
};

function baseMime(value: string | null | undefined): string | undefined {
  const mime = value?.split(';')[0]?.trim();
  return mime || undefined;
}

/**
 * Server-side check for a client upload. Size and type come from Convex
 * `_storage` metadata. The intent binds the blob to the org and contact that
 * minted the upload URL.
 */
export function verifyFinalizedUpload(input: {
  metadata: StoredBlobMetadata | null;
  claimedByteSize: number;
  claimedMimeType?: string | null;
  intent: UploadIntentClaim | null;
  callerOrgId: string;
  callerContactId: string;
  alreadyClaimed: boolean;
  nowMs: number;
}): { byteSize: number; mimeType?: string } {
  if (!input.intent) {
    throw new PortalAuthError('Upload intent not found', 'FORBIDDEN');
  }
  if (
    input.intent.orgId !== input.callerOrgId ||
    input.intent.contactId !== input.callerContactId
  ) {
    throw new PortalAuthError('Upload intent owner mismatch', 'FORBIDDEN');
  }
  if (input.intent.consumedAt != null) {
    throw new PortalAuthError('Upload intent already used', 'FORBIDDEN');
  }
  if (input.nowMs - input.intent.createdAt > UPLOAD_INTENT_TTL_MS) {
    throw new PortalAuthError('Upload intent expired', 'FORBIDDEN');
  }
  if (input.alreadyClaimed) {
    throw new PortalAuthError('Blob already finalized', 'FORBIDDEN');
  }
  if (!input.metadata) {
    throw new PortalAuthError('Uploaded blob not found', 'FORBIDDEN');
  }

  const byteSize = input.metadata.size;
  if (byteSize <= 0 || byteSize > MAX_UPLOAD_BYTES) {
    throw new PortalAuthError(
      `File size must be between 1 byte and ${MAX_UPLOAD_BYTES} bytes`,
      'FORBIDDEN',
    );
  }
  if (input.claimedByteSize !== byteSize) {
    throw new PortalAuthError('Declared size does not match stored blob', 'FORBIDDEN');
  }

  const storedType = baseMime(input.metadata.contentType);
  const claimedType = baseMime(input.claimedMimeType);
  if (claimedType && storedType && claimedType !== storedType) {
    throw new PortalAuthError('Declared type does not match stored blob', 'FORBIDDEN');
  }

  return { byteSize, mimeType: storedType };
}

/** Drop an unreferenced storage object when finalize rejects it. */
export function shouldDiscardUnreferencedBlob(input: {
  referenced: boolean;
  metadataExists: boolean;
}): boolean {
  return input.metadataExists && !input.referenced;
}

/** Unreferenced Convex storage older than a day is an abandoned upload. */
export function isOrphanedUploadBlob(input: {
  creationTime: number;
  nowMs: number;
  referenced: boolean;
  minAgeMs?: number;
}): boolean {
  if (input.referenced) return false;
  const minAge = input.minAgeMs ?? ORPHAN_UPLOAD_BLOB_MIN_AGE_MS;
  return input.nowMs - input.creationTime >= minAge;
}
