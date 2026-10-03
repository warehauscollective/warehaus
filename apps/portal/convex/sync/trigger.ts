import { v } from 'convex/values';
import { releaseQuarantinedPageFromDetails } from '@warehaus/portal-sync';
import { internal } from '../_generated/api';
import { adminMutation } from '../_lib/wrappers';

/** Staff-only: schedule an immediate Notion → Convex pull. */
export const schedulePull = adminMutation({
  args: { forceFull: v.optional(v.boolean()) },
  handler: async (ctx, { forceFull }) => {
    await ctx.scheduler.runAfter(0, internal.sync.pull.pullAll, {
      forceFull: forceFull ?? false,
    });
    return { scheduled: true as const, forceFull: Boolean(forceFull) };
  },
});

/** Staff-only: drop one page from the released list so the next pull retries it. */
export const releaseQuarantinedPage = adminMutation({
  args: { notionPageId: v.string() },
  handler: async (ctx, { notionPageId }) => {
    const meta = await ctx.db
      .query('syncMeta')
      .withIndex('by_key', (q) => q.eq('key', 'notion-pull'))
      .unique();
    if (!meta) return { released: false as const };
    await ctx.db.patch(meta._id, {
      details: releaseQuarantinedPageFromDetails(meta.details, notionPageId),
    });
    return { released: true as const, notionPageId };
  },
});
