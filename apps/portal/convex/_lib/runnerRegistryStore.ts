/** Reads and sweeps for runner registrations, shared by the agent and runner modules. */

import type { Doc } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import { PAIRING_SWEEP, REGISTERED_RUNNER_SCAN } from './runnerRegistry';

/** Live registrations, oldest first, at most 10. Revoked rows have no `registeredAt`, so they are not read. */
export async function registeredRunners(ctx: QueryCtx): Promise<Doc<'agentRunners'>[]> {
  return ctx.db
    .query('agentRunners')
    .withIndex('by_registeredAt', (q) => q.gt('registeredAt', 0))
    .take(REGISTERED_RUNNER_SCAN);
}

/** Deletes expired pairings, at most 50. Called from the stuck-run cron. */
export async function sweepExpiredPairings(ctx: MutationCtx, now: number): Promise<number> {
  const expired = await ctx.db
    .query('agentRunnerPairings')
    .withIndex('by_expiresAt', (q) => q.lte('expiresAt', now))
    .take(PAIRING_SWEEP);
  for (const row of expired) await ctx.db.delete(row._id);
  return expired.length;
}

