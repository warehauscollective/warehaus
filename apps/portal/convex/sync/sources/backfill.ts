/**
 * One-off: set taskSource = 'notion' on tasks that have none.
 * Cosmetic — readers already treat a missing taskSource as notion — so it can
 * run at any time, any number of times. Batched; schedules itself until done.
 * Touches only `taskSource`: no lastSyncedAt or other field changes.
 *
 *   npx convex run sync/sources/backfill:backfillTaskSource '{}'
 */

import { v } from 'convex/values';
import { internal } from '../../_generated/api';
import { internalMutation } from '../../_generated/server';

const DEFAULT_BATCH = 200;

export const backfillTaskSource = internalMutation({
  args: {
    cursor: v.optional(v.union(v.string(), v.null())),
    batchSize: v.optional(v.number()),
    /** Count only; patch nothing and do not reschedule. */
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const numItems = Math.max(1, Math.min(args.batchSize ?? DEFAULT_BATCH, 1000));
    const page = await ctx.db
      .query('tasks')
      .paginate({ cursor: args.cursor ?? null, numItems });
    let patched = 0;
    for (const row of page.page) {
      if (row.taskSource) continue;
      if (!args.dryRun) await ctx.db.patch(row._id, { taskSource: 'notion' });
      patched += 1;
    }
    if (!page.isDone && !args.dryRun) {
      await ctx.scheduler.runAfter(0, internal.sync.sources.backfill.backfillTaskSource, {
        cursor: page.continueCursor,
        batchSize: numItems,
      });
    }
    return {
      scanned: page.page.length,
      patched,
      done: page.isDone,
      continueCursor: page.isDone ? null : page.continueCursor,
    };
  },
});
