/**
 * One-off migration: open notes written before the Ask rename carry the old
 * `needsPeter: 'open'` flag and are in none of the open lists. This turns each
 * into an Ask waiting on Peter (`open: true`, `waitingOn` Peter) and clears
 * the old flag.
 *
 * It reads the old open index only, `by_needsPeter`, at most one batch a call.
 * A migrated row leaves that index, so the next call starts on the rest and a
 * finished migration reads nothing. Answered notes never carried the flag
 * (it was cleared on answer), so they are not read and not changed.
 *
 * Delete this file, the `needsPeter` field and `by_needsPeter` once it has run
 * on production.
 */

import type { MutationCtx } from '../_generated/server';
import { peterContactId } from './askStore';

/** Rows one call moves, and the most a caller may ask for. */
export const ASK_MIGRATION_BATCH = 100;

export const NO_PETER_CONTACT = 'No staff contact for Peter on this deployment. Nothing was migrated.';

export type AskMigrationResult = {
  dryRun: boolean;
  wrote: boolean;
  /** Rows carrying the old flag in this batch. */
  found: number;
  /** Rows turned into Asks by this call. 0 on a dry run. */
  migrated: number;
  /** True when the batch was full: run it again. */
  more: boolean;
};

export async function migrateNeedsPeterBatch(
  ctx: MutationCtx,
  input: { apply: boolean; limit?: number },
): Promise<AskMigrationResult> {
  const limit = Math.max(1, Math.min(Math.floor(input.limit ?? ASK_MIGRATION_BATCH), ASK_MIGRATION_BATCH));
  const rows = await ctx.db
    .query('milestoneNotes')
    .withIndex('by_needsPeter', (q) => q.eq('needsPeter', 'open'))
    .take(limit);
  const more = rows.length === limit;
  if (!input.apply || rows.length === 0) {
    return { dryRun: !input.apply, wrote: false, found: rows.length, migrated: 0, more };
  }

  // These notes all waited on Peter. Without his contact they would become
  // Asks waiting on no one, so stop and leave them for a later run.
  const peter = await peterContactId(ctx);
  if (!peter) throw new Error(NO_PETER_CONTACT);

  for (const row of rows) {
    await ctx.db.patch(row._id, {
      open: true,
      // A row already written as an Ask keeps the person it names.
      waitingOn: row.waitingOn ?? peter,
      needsPeter: undefined,
    });
  }
  return { dryRun: false, wrote: true, found: rows.length, migrated: rows.length, more };
}
