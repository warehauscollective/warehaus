import { GRANOLA_IMPORT_FAILED, importGranolaNote, readGranolaSource } from '@warehaus/portal-sync';
import { v } from 'convex/values';
import { internal } from '../_generated/api';
import { internalAction, internalMutation, type MutationCtx } from '../_generated/server';
import type { Id } from '../_generated/dataModel';
import { adminMutation } from '../_lib/wrappers';

const GRANOLA_META_KEY = 'granola-import';

const noteValidator = v.object({
  id: v.string(),
  title: v.string(),
  transcript: v.optional(v.string()),
  summary: v.optional(v.string()),
  decisions: v.optional(v.string()),
  actionItems: v.optional(v.string()),
  notionUrl: v.optional(v.string()),
  clientSlug: v.optional(v.string()),
});

/**
 * Record a Granola run. Notes are optional so the cron can mark the key as
 * missing without writing fixture recaps. Transcript text on a note is an
 * input only; the row stores the recap, with publish left false.
 */
export const applyImport = internalMutation({
  args: {
    configured: v.boolean(),
    notes: v.optional(v.array(noteValidator)),
  },
  handler: async (ctx, args) => {
    if (!args.notes) {
      await writeStatus(ctx, { details: JSON.stringify({ configured: args.configured }) });
      return { configured: args.configured, imported: 0, failed: 0 };
    }

    const now = Date.now();
    const clients = await ctx.db.query('clients').collect();
    let imported = 0;
    let failed = 0;

    for (const note of args.notes) {
      const draft = importGranolaNote(note);
      if (draft.status !== 'imported' || !draft.description || !draft.clientSlug) {
        failed += 1;
        continue;
      }
      const client = clients.find((row) => row.slug === draft.clientSlug);
      if (!client) {
        failed += 1;
        continue;
      }
      const existing = await ctx.db
        .query('sharedResources')
        .withIndex('by_notionPageId', (q) => q.eq('notionPageId', draft.notionPageId))
        .unique();
      if (existing && existing.orgId !== client._id) {
        failed += 1;
        continue;
      }
      const fields = {
        title: draft.title,
        description: draft.description,
        type: draft.type,
        source: draft.source,
        externalId: draft.externalId,
        sourceNotionUrl: draft.notesUrl ?? undefined,
        lastSyncedAt: now,
      };
      if (existing) {
        await ctx.db.patch(existing._id, fields);
      } else {
        await ctx.db.insert('sharedResources', {
          orgId: client._id as Id<'clients'>,
          notionPageId: draft.notionPageId,
          publishToWarehaus: false,
          archive: false,
          ...fields,
        });
      }
      imported += 1;
    }

    await writeStatus(ctx, {
      lastSyncedAt: now,
      lastError: failed > 0 ? GRANOLA_IMPORT_FAILED : undefined,
      details: JSON.stringify({ configured: true, imported, failed }),
    });
    return { configured: true, imported, failed };
  },
});

/**
 * Scheduled import. Without GRANOLA_API_KEY this records that the source is
 * not configured and does not write notes. A key does not call Granola.
 */
export const runImport = internalAction({
  args: {},
  handler: async (ctx): Promise<{ configured: boolean; imported: number; failed: number }> => {
    const source = readGranolaSource(process.env);
    return ctx.runMutation(internal.sync.granola.applyImport, { configured: source.configured });
  },
});

/** Staff-only. Schedules the same import the cron runs. */
export const retryImport = adminMutation({
  args: {},
  handler: async (ctx) => {
    await ctx.scheduler.runAfter(0, internal.sync.granola.runImport, {});
    return { scheduled: true as const };
  },
});

async function writeStatus(
  ctx: MutationCtx,
  row: { lastSyncedAt?: number; lastError?: string; details: string },
) {
  const existing = await ctx.db
    .query('syncMeta')
    .withIndex('by_key', (q) => q.eq('key', GRANOLA_META_KEY))
    .unique();
  const patch = {
    details: row.details,
    ...(row.lastSyncedAt != null ? { lastSyncedAt: row.lastSyncedAt } : {}),
    ...('lastError' in row || row.lastSyncedAt != null ? { lastError: row.lastError } : {}),
  };
  if (existing) {
    await ctx.db.patch(existing._id, patch);
    return;
  }
  await ctx.db.insert('syncMeta', { key: GRANOLA_META_KEY, ...patch });
}
