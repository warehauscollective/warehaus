import { v } from 'convex/values';
import { internal } from '../_generated/api';
import {
  internalAction,
  internalMutation,
  internalQuery,
} from '../_generated/server';

export type BlobGcStats = {
  scanned: number;
  deleted: number;
  cleared: number;
  skippedNoToken: boolean;
  errors: string[];
};

/**
 * List Shared Resources that should not keep a Blob copy.
 */
export const listGcCandidates = internalQuery({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const rows = await ctx.db.query('sharedResources').take(limit ?? 200);
    return rows
      .filter(
        (r) =>
          Boolean(r.blobPathname) && (!r.publishToWarehaus || r.archive),
      )
      .map((r) => ({
        id: r._id,
        blobPathname: r.blobPathname!,
        orgId: r.orgId,
      }));
  },
});

export const clearBlobFields = internalMutation({
  args: { resourceId: v.id('sharedResources') },
  handler: async (ctx, { resourceId }) => {
    await ctx.db.patch(resourceId, {
      blobUrl: undefined,
      blobPathname: undefined,
      mimeType: undefined,
      byteSize: undefined,
      checksum: undefined,
      sourceNotionUrl: undefined,
    });
  },
});

/**
 * Delete Vercel Blob objects for unpublished/archived Shared Resources.
 * Safe no-op without BLOB_READ_WRITE_TOKEN.
 */
export const gcUnpublishedSharedBlobs = internalAction({
  args: {},
  handler: async (ctx): Promise<BlobGcStats> => {
    const stats: BlobGcStats = {
      scanned: 0,
      deleted: 0,
      cleared: 0,
      skippedNoToken: false,
      errors: [],
    };

    const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
    if (!token) {
      stats.skippedNoToken = true;
      return stats;
    }

    const candidates = await ctx.runQuery(
      internal.sync.blobGc.listGcCandidates,
      { limit: 200 },
    );
    stats.scanned = candidates.length;

    const { del } = await import('@vercel/blob');

    for (const row of candidates) {
      try {
        await del(row.blobPathname, { token });
        stats.deleted += 1;
      } catch (err) {
        // Missing blob is fine — still clear Convex fields.
        const message = err instanceof Error ? err.message : String(err);
        if (!/not found|404/i.test(message)) {
          stats.errors.push(`${row.id}: ${message}`);
        }
      }
      try {
        await ctx.runMutation(internal.sync.blobGc.clearBlobFields, {
          resourceId: row.id,
        });
        stats.cleared += 1;
      } catch (err) {
        stats.errors.push(
          `clear ${row.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return stats;
  },
});
