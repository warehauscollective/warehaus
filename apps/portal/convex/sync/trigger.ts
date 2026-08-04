import { v } from 'convex/values';
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
