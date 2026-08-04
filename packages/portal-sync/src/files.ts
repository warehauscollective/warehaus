/**
 * File metadata contracts for dual storage:
 * - Vercel Blob: Notion → Shared Resources / Client Doc images
 * - Convex `_storage`: ClientUpload inbound path
 *
 * Source: docs/planning/portal-convex/MIGRATION-PLAN.md §5
 */

export type ScanStatus = 'pending' | 'clean' | 'infected' | 'error';

/** Team-published file synced from Notion Shared Resources → Vercel Blob. */
export type SharedResourceFile = {
  orgId: string;
  notionPageId: string;
  externalId: string | null;
  title: string;
  mimeType: string | null;
  byteSize: number | null;
  checksum: string | null;
  /** Vercel Blob pathname under portal/{orgId}/shared/... */
  blobPathname: string;
  /** URL safe to mint signed downloads from — never a Notion S3 URL */
  blobUrl: string;
  /** SERVER only — retained for re-sync / debugging, never serialize to client */
  sourceNotionUrl?: string;
  published: boolean;
  archive: boolean;
  lastSyncedAt: string;
};

/** Image copied from a Client Doc body block into Vercel Blob. */
export type ClientDocImage = {
  orgId: string;
  docId: string;
  blobPathname: string;
  blobUrl: string;
  alt: string | null;
  width?: number | null;
  checksum: string | null;
  lastSyncedAt: string;
};

/**
 * Client-originated upload stored in Convex `_storage`.
 * Separate from Shared Resources — different trust + review requirements.
 */
export type ClientUpload = {
  orgId: string;
  uploadedByContactId: string;
  /** Convex Id<"_storage"> as string at the contract layer */
  storageId: string;
  filename: string;
  mimeType: string | null;
  byteSize: number;
  scanStatus: ScanStatus;
  /** Default true until team admin approves */
  needsReview: boolean;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  projectId?: string | null;
  createdAt: string;
};

/** CLIENT-safe Shared Resource payload (no sourceNotionUrl). */
export type SharedResourceFileClientView = Omit<SharedResourceFile, 'sourceNotionUrl'>;

export function toSharedResourceClientView(
  row: SharedResourceFile,
): SharedResourceFileClientView {
  const { sourceNotionUrl: _drop, ...rest } = row;
  return rest;
}

/** CLIENT-safe upload view (storageId may be omitted in favor of a short-lived URL). */
export type ClientUploadClientView = Omit<ClientUpload, 'storageId'> & {
  downloadUrl?: string | null;
  storageId?: never;
};

export function toClientUploadClientView(
  row: ClientUpload,
  downloadUrl?: string | null,
): ClientUploadClientView {
  const { storageId: _drop, ...rest } = row;
  return { ...rest, downloadUrl: downloadUrl ?? null };
}

/** Pathname helper for Blob puts — keep unguessable + org-scoped. */
export function blobPathname(input: {
  orgId: string;
  kind: 'shared' | 'doc-image';
  notionPageId: string;
  checksum: string;
  safeName: string;
}): string {
  const safe = input.safeName.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120);
  return `portal/${input.orgId}/${input.kind}/${input.notionPageId}/${input.checksum}-${safe}`;
}
