import { v } from 'convex/values';
import { adminMutation, adminQuery, clientMutation, clientQuery } from './_lib/wrappers';
import { PortalAuthError } from './_lib/identity';
import {
  ORPHAN_UPLOAD_BLOB_MIN_AGE_MS,
  isSweepableUploadBlob,
  shouldDiscardUnreferencedBlob,
  verifyFinalizedUpload,
} from './_lib/uploadBlob';
import type { Id } from './_generated/dataModel';
import { internalMutation } from './_generated/server';

const MAX_UPLOADS_PER_DAY = 40;
const ORPHAN_GC_BATCH = 50;

/** CLIENT-safe view — never returns raw storageId to the browser. */
async function toClientView(
  ctx: { storage: { getUrl: (id: Id<'_storage'>) => Promise<string | null> } },
  row: {
    _id: Id<'clientUploads'>;
    orgId: Id<'clients'>;
    filename: string;
    mimeType?: string;
    byteSize: number;
    scanStatus: string;
    needsReview: boolean;
    projectId?: Id<'projects'>;
    createdAt: number;
    storageId: Id<'_storage'>;
  },
) {
  const downloadUrl =
    row.scanStatus === 'infected' ? null : await ctx.storage.getUrl(row.storageId);
  return {
    id: row._id,
    orgId: row.orgId,
    filename: row.filename,
    mimeType: row.mimeType ?? null,
    byteSize: row.byteSize,
    scanStatus: row.scanStatus,
    needsReview: row.needsReview,
    projectId: row.projectId ?? null,
    createdAt: row.createdAt,
    downloadUrl,
  };
}

async function discardUnreferencedUpload(
  ctx: { storage: { delete: (id: Id<'_storage'>) => Promise<void> } },
  input: {
    ownsIntent: boolean;
    referenced: boolean;
    metadataExists: boolean;
    storageId: Id<'_storage'>;
  },
) {
  if (!input.ownsIntent) return;
  if (
    !shouldDiscardUnreferencedBlob({
      referenced: input.referenced,
      metadataExists: input.metadataExists,
    })
  ) {
    return;
  }
  try {
    await ctx.storage.delete(input.storageId);
  } catch {
    // Sweeper deletes anything still unreferenced after a day.
  }
}

/** Phase 1 stub: mint a Convex storage upload URL for the caller's org. */
export const generateUploadUrl = clientMutation({
  args: {},
  handler: async (ctx) => {
    const intentId = await ctx.db.insert('uploadIntents', {
      orgId: ctx.orgId,
      contactId: ctx.identity.contactId as Id<'contacts'>,
      createdAt: Date.now(),
    });
    const url = await ctx.storage.generateUploadUrl();
    return { uploadUrl: url, orgId: ctx.orgId, contactId: ctx.identity.contactId, intentId };
  },
});

/**
 * Finalize after the client POSTs bytes to the upload URL.
 * Size, type, and owner are taken from Convex storage plus the upload intent,
 * not from the browser's claimed byteSize/mimeType alone.
 * Defaults: needsReview=true, scanStatus=pending.
 */
export const finalizeUpload = clientMutation({
  args: {
    intentId: v.id('uploadIntents'),
    storageId: v.id('_storage'),
    filename: v.string(),
    mimeType: v.optional(v.string()),
    byteSize: v.number(),
    projectId: v.optional(v.id('projects')),
  },
  handler: async (ctx, args) => {
    const intent = await ctx.db.get(args.intentId);
    const metadata = await ctx.db.system.get('_storage', args.storageId);
    const existing = await ctx.db
      .query('clientUploads')
      .withIndex('by_storageId', (q) => q.eq('storageId', args.storageId))
      .unique();

    let verified: { byteSize: number; mimeType?: string };
    try {
      verified = verifyFinalizedUpload({
        metadata: metadata
          ? { size: metadata.size, contentType: metadata.contentType }
          : null,
        claimedByteSize: args.byteSize,
        claimedMimeType: args.mimeType,
        intent: intent
          ? {
              orgId: intent.orgId,
              contactId: intent.contactId,
              createdAt: intent.createdAt,
              consumedAt: intent.consumedAt,
            }
          : null,
        callerOrgId: ctx.orgId,
        callerContactId: ctx.identity.contactId,
        alreadyClaimed: Boolean(existing),
        nowMs: Date.now(),
      });
    } catch (err) {
      await discardUnreferencedUpload(ctx, {
        ownsIntent:
          intent?.orgId === ctx.orgId &&
          String(intent.contactId) === ctx.identity.contactId,
        referenced: Boolean(existing),
        metadataExists: Boolean(metadata),
        storageId: args.storageId,
      });
      throw err;
    }

    if (args.projectId) {
      const project = await ctx.db.get(args.projectId);
      if (!project || project.orgId !== ctx.orgId) {
        await discardUnreferencedUpload(ctx, {
          ownsIntent: true,
          referenced: false,
          metadataExists: Boolean(metadata),
          storageId: args.storageId,
        });
        throw new PortalAuthError('Project not in session org', 'FORBIDDEN');
      }
    }

    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const recent = await ctx.db
      .query('clientUploads')
      .withIndex('by_orgId_createdAt', (q) => q.eq('orgId', ctx.orgId))
      .collect();
    const todayCount = recent.filter((r) => r.createdAt >= dayAgo).length;
    if (todayCount >= MAX_UPLOADS_PER_DAY) {
      await discardUnreferencedUpload(ctx, {
        ownsIntent: true,
        referenced: false,
        metadataExists: Boolean(metadata),
        storageId: args.storageId,
      });
      throw new PortalAuthError('Daily upload quota exceeded', 'FORBIDDEN');
    }

    const now = Date.now();
    const id = await ctx.db.insert('clientUploads', {
      orgId: ctx.orgId,
      uploadedByContactId: ctx.identity.contactId as Id<'contacts'>,
      storageId: args.storageId,
      filename: args.filename,
      mimeType: verified.mimeType,
      byteSize: verified.byteSize,
      scanStatus: 'pending',
      needsReview: true,
      projectId: args.projectId,
      createdAt: now,
    });

    await ctx.db.patch(args.intentId, {
      consumedAt: now,
      storageId: args.storageId,
    });

    await ctx.db.insert('activity', {
      orgId: ctx.orgId,
      projectId: args.projectId,
      name: 'File uploaded',
      summary: args.filename,
      type: 'project',
      tone: 'muted',
      timestamp: now,
    });

    return { id };
  },
});

/**
 * Delete abandoned client-upload bytes in Convex `_storage`.
 *
 * Can delete a `_storage` object only when all of these are true:
 * - it is older than 24 hours
 * - its id is not `clientUploads.storageId`
 * - its id is not `uploadIntents.storageId`
 *
 * Those are the only portal tables that store a Convex `_storage` id.
 * Shared Resources, doc images, and other files are Vercel Blob pathnames
 * and are never candidates. Old upload-intent rows are bookkeeping and are
 * removed only after the file check, so a file an intent still points at
 * is kept.
 */
export const gcOrphanedUploadBlobs = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const referenced = new Set<string>();
    for (const row of await ctx.db.query('clientUploads').collect()) {
      referenced.add(row.storageId);
    }
    for (const intent of await ctx.db.query('uploadIntents').collect()) {
      if (intent.storageId) referenced.add(intent.storageId);
    }

    const files = await ctx.db.system.query('_storage').collect();
    let deleted = 0;
    for (const file of files) {
      if (deleted >= ORPHAN_GC_BATCH) break;
      if (
        !isSweepableUploadBlob({
          storageId: file._id,
          creationTime: file._creationTime,
          nowMs: now,
          referencedStorageIds: referenced,
        })
      ) {
        continue;
      }
      await ctx.storage.delete(file._id);
      deleted += 1;
    }

    const staleIntents = await ctx.db
      .query('uploadIntents')
      .withIndex('by_createdAt', (q) =>
        q.lt('createdAt', now - ORPHAN_UPLOAD_BLOB_MIN_AGE_MS),
      )
      .take(ORPHAN_GC_BATCH);
    let intentsDeleted = 0;
    for (const intent of staleIntents) {
      await ctx.db.delete(intent._id);
      intentsDeleted += 1;
    }

    return { deleted, intentsDeleted };
  },
});

/** Client lists uploads for their org (including pending review). */
export const listMine = clientQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query('clientUploads')
      .withIndex('by_orgId', (q) => q.eq('orgId', ctx.orgId))
      .collect();
    return Promise.all(rows.map((row) => toClientView(ctx, row)));
  },
});

/** Team review queue. */
export const listNeedsReview = adminQuery({
  args: {
    orgId: v.optional(v.id('clients')),
  },
  handler: async (ctx, { orgId }) => {
    const rows = orgId
      ? await ctx.db
          .query('clientUploads')
          .withIndex('by_orgId_needsReview', (q) =>
            q.eq('orgId', orgId).eq('needsReview', true),
          )
          .collect()
      : (await ctx.db.query('clientUploads').collect()).filter((r) => r.needsReview);

    return Promise.all(rows.map((row) => toClientView(ctx, row)));
  },
});

export const approveUpload = adminMutation({
  args: { uploadId: v.id('clientUploads') },
  handler: async (ctx, { uploadId }) => {
    const row = await ctx.db.get(uploadId);
    if (!row) throw new PortalAuthError('Upload not found', 'FORBIDDEN');
    if (row.scanStatus === 'infected') {
      throw new PortalAuthError('Cannot approve infected upload', 'FORBIDDEN');
    }
    const now = Date.now();
    await ctx.db.patch(uploadId, {
      needsReview: false,
      scanStatus: row.scanStatus === 'pending' ? 'clean' : row.scanStatus,
      reviewedBy: ctx.identity.contactId as Id<'contacts'>,
      reviewedAt: now,
    });
    await ctx.db.insert('activity', {
      orgId: row.orgId,
      projectId: row.projectId,
      name: 'Upload approved',
      summary: row.filename,
      type: 'project',
      tone: 'success',
      timestamp: now,
    });
    return { ok: true as const };
  },
});

export const rejectUpload = adminMutation({
  args: { uploadId: v.id('clientUploads') },
  handler: async (ctx, { uploadId }) => {
    const row = await ctx.db.get(uploadId);
    if (!row) throw new PortalAuthError('Upload not found', 'FORBIDDEN');
    await ctx.storage.delete(row.storageId);
    await ctx.db.delete(uploadId);
    return { ok: true as const };
  },
});
