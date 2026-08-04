import { v } from 'convex/values';
import { adminMutation, adminQuery, clientMutation, clientQuery } from './_lib/wrappers';
import { PortalAuthError } from './_lib/identity';
import type { Id } from './_generated/dataModel';

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB v1 soft cap per file
const MAX_UPLOADS_PER_DAY = 40;

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

/** Phase 1 stub: mint a Convex storage upload URL for the caller's org. */
export const generateUploadUrl = clientMutation({
  args: {},
  handler: async (ctx) => {
    const url = await ctx.storage.generateUploadUrl();
    return { uploadUrl: url, orgId: ctx.orgId, contactId: ctx.identity.contactId };
  },
});

/**
 * Finalize after the client POSTs bytes to the upload URL.
 * Defaults: needsReview=true, scanStatus=pending.
 */
export const finalizeUpload = clientMutation({
  args: {
    storageId: v.id('_storage'),
    filename: v.string(),
    mimeType: v.optional(v.string()),
    byteSize: v.number(),
    projectId: v.optional(v.id('projects')),
  },
  handler: async (ctx, args) => {
    if (args.byteSize <= 0 || args.byteSize > MAX_BYTES) {
      throw new PortalAuthError(
        `File size must be between 1 byte and ${MAX_BYTES} bytes`,
        'FORBIDDEN',
      );
    }

    if (args.projectId) {
      const project = await ctx.db.get(args.projectId);
      if (!project || project.orgId !== ctx.orgId) {
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
      throw new PortalAuthError('Daily upload quota exceeded', 'FORBIDDEN');
    }

    const id = await ctx.db.insert('clientUploads', {
      orgId: ctx.orgId,
      uploadedByContactId: ctx.identity.contactId as Id<'contacts'>,
      storageId: args.storageId,
      filename: args.filename,
      mimeType: args.mimeType,
      byteSize: args.byteSize,
      scanStatus: 'pending',
      needsReview: true,
      projectId: args.projectId,
      createdAt: Date.now(),
    });

    return { id };
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
    await ctx.db.patch(uploadId, {
      needsReview: false,
      scanStatus: row.scanStatus === 'pending' ? 'clean' : row.scanStatus,
      reviewedBy: ctx.identity.contactId as Id<'contacts'>,
      reviewedAt: Date.now(),
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
