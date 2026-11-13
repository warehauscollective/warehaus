/**
 * One-shot nameKey fill for clients created before the index existed.
 * Indexed by creation time and bounded with take. Not a cron.
 * Run on shared dev only until Peter passes a production deploy.
 */

import { companyNameKey } from '@warehaus/portal-sync';
import { v } from 'convex/values';
import { internalMutation } from '../_generated/server';

const BATCH = 25;

export const backfillClientNameKeys = internalMutation({
  args: {
    cursor: v.optional(v.number()),
    numItems: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const numItems = Math.min(Math.max(args.numItems ?? BATCH, 1), 50);
    const lower = args.cursor ?? -1;
    const rows = await ctx.db
      .query('clients')
      .withIndex('by_creation_time', (q) => q.gt('_creationTime', lower))
      .take(numItems);
    let updated = 0;
    let unchanged = 0;
    for (const row of rows) {
      const nameKey = companyNameKey(row.companyName);
      if (row.nameKey === nameKey) {
        unchanged += 1;
        continue;
      }
      await ctx.db.patch(row._id, { nameKey });
      updated += 1;
    }
    const last = rows[rows.length - 1];
    return {
      updated,
      unchanged,
      scanned: rows.length,
      isDone: rows.length < numItems,
      continueCursor: last ? last._creationTime : lower,
    };
  },
});
