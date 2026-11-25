/**
 * Runner registry and pairing (ADR-0005, amendment of 2026-11-24).
 *
 * Staff set a runner up from the RunnerStatus modal: the runner CLI starts a
 * pairing through `/agent/pair/start`, staff confirm its code here, and the
 * CLI learns the result through `/agent/pair/poll`. Staff see and revoke
 * registered runners here too. Everything public in this module is staff only.
 */

import { v } from 'convex/values';
import type { QueryCtx } from './_generated/server';
import { internalMutation, internalQuery } from './_generated/server';
import { writeEvent } from './agent';
import { PRODUCTION_DEPLOYMENT } from './_lib/reviewPreview';
import {
  PAIRING_BAD_REQUEST,
  PAIRING_MAX_OPEN,
  PAIRING_NOT_FOUND,
  PAIRING_SCAN,
  PAIRING_TOO_MANY,
  PAIRING_TTL_MS,
  RUNNER_ID_TAKEN,
  RUNNER_NOT_REGISTERED,
  formatPairingCode,
  isSha256Hex,
  normalizePairingCode,
  normalizeRunnerId,
  pairingOpen,
  pairingPoll,
  proposedRunnerIdFrom,
} from './_lib/runnerRegistry';
import { adminMutation, adminQuery } from './_lib/wrappers';

/** Runs one revoke releases. A runner holds one run at a time; this is a cap, not a page. */
const REVOKE_RUN_SCAN = 5;

function isProduction(): boolean {
  return (process.env.CONVEX_CLOUD_URL ?? '').includes(PRODUCTION_DEPLOYMENT);
}

async function runnerRow(ctx: QueryCtx, runnerId: string) {
  return ctx.db
    .query('agentRunners')
    .withIndex('by_runnerId', (q) => q.eq('runnerId', runnerId))
    .unique();
}

async function pairingByCode(ctx: QueryCtx, code: string) {
  return ctx.db
    .query('agentRunnerPairings')
    .withIndex('by_code', (q) => q.eq('code', code))
    .unique();
}

/**
 * A runner CLI asking to pair. The code comes from the httpAction, which has
 * real randomness. Returns `retry` when the code is already in use.
 */
export const startPairing = internalMutation({
  args: {
    code: v.string(),
    proposedRunnerId: v.string(),
    tokenHash: v.string(),
    pollKeyHash: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const code = normalizePairingCode(args.code);
    if (!code || !isSha256Hex(args.tokenHash) || !isSha256Hex(args.pollKeyHash) || args.tokenHash === args.pollKeyHash) {
      return { ok: false as const, status: 400 as const, error: PAIRING_BAD_REQUEST };
    }
    const live = await ctx.db
      .query('agentRunnerPairings')
      .withIndex('by_expiresAt', (q) => q.gt('expiresAt', now))
      .take(PAIRING_SCAN);
    if (live.filter((row) => row.status === 'open').length >= PAIRING_MAX_OPEN) {
      return { ok: false as const, status: 429 as const, error: PAIRING_TOO_MANY };
    }
    if (await pairingByCode(ctx, code)) return { ok: false as const, status: 409 as const, error: 'retry' };
    const expiresAt = now + PAIRING_TTL_MS;
    const proposedRunnerId = proposedRunnerIdFrom(args.proposedRunnerId);
    await ctx.db.insert('agentRunnerPairings', {
      code,
      pollKeyHash: args.pollKeyHash,
      tokenHash: args.tokenHash,
      proposedRunnerId,
      status: 'open',
      createdAt: now,
      expiresAt,
    });
    return { ok: true as const, code: formatPairingCode(code), proposedRunnerId, expiresAt, production: isProduction() };
  },
});

/** The CLI's poll. A read only: waiting for staff writes nothing. */
export const pairingStatus = internalQuery({
  args: { code: v.string(), pollKeyHash: v.string() },
  handler: async (ctx, args) => {
    const code = normalizePairingCode(args.code);
    if (!code || !isSha256Hex(args.pollKeyHash)) return { status: 'expired' as const };
    const row = await pairingByCode(ctx, code);
    // A wrong poll key reads exactly like a missing pairing.
    if (!row || row.pollKeyHash !== args.pollKeyHash) return { status: 'expired' as const };
    return pairingPoll(row, Date.now());
  },
});

/** Staff typed a code into the modal. What the Confirm pairing state shows, or null. */
export const findPairing = adminQuery({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const code = normalizePairingCode(args.code);
    if (!code) return null;
    const row = await pairingByCode(ctx, code);
    if (!row || !pairingOpen(row, Date.now())) return null;
    return {
      code: formatPairingCode(row.code),
      proposedRunnerId: row.proposedRunnerId,
      expiresAt: row.expiresAt,
      production: isProduction(),
    };
  },
});

/** Staff confirm a code and the runner id. The runner is registered with the hash its CLI sent. */
export const confirmPairing = adminMutation({
  args: { code: v.string(), runnerId: v.string() },
  handler: async (ctx, args) => {
    const now = Date.now();
    const code = normalizePairingCode(args.code);
    const pairing = code ? await pairingByCode(ctx, code) : null;
    if (!pairing || !pairingOpen(pairing, now)) return { ok: false as const, error: PAIRING_NOT_FOUND };
    const runnerId = normalizeRunnerId(args.runnerId);
    if (!runnerId) return { ok: false as const, error: 'Runner id must be 2 to 40 lowercase letters, digits or hyphens' };
    const existing = await runnerRow(ctx, runnerId);
    if (existing?.registeredAt != null) return { ok: false as const, error: RUNNER_ID_TAKEN };
    const registeredBy = ctx.identity.name ?? ctx.identity.email ?? 'staff';
    const registration = { tokenHash: pairing.tokenHash, registeredAt: now, registeredBy, revokedAt: undefined };
    if (existing) await ctx.db.patch(existing._id, registration);
    else await ctx.db.insert('agentRunners', { runnerId, windowStart: 0, count: 0, ...registration });
    await ctx.db.patch(pairing._id, { status: 'confirmed', runnerId, confirmedAt: now, confirmedBy: registeredBy });
    return { ok: true as const, runnerId };
  },
});

/**
 * Staff revoke a runner. Its next call is refused. A task or planning run it
 * holds goes back to the queue. A Cursor build keeps running in the cloud and
 * the stuck-run cron handles it like any quiet runner.
 */
export const revokeRunner = adminMutation({
  args: { runnerId: v.string() },
  handler: async (ctx, args) => {
    const now = Date.now();
    const runnerId = normalizeRunnerId(args.runnerId);
    const row = runnerId ? await runnerRow(ctx, runnerId) : null;
    if (!row || row.registeredAt == null || !runnerId) return { ok: false as const, error: RUNNER_NOT_REGISTERED };
    await ctx.db.patch(row._id, { tokenHash: undefined, registeredAt: undefined, revokedAt: now });
    const running = await ctx.db
      .query('agentRuns')
      .withIndex('by_runner_status', (q) => q.eq('runnerId', runnerId).eq('status', 'running'))
      .take(REVOKE_RUN_SCAN);
    let released = 0;
    for (const run of running) {
      if (run.kind === 'build') continue;
      const milestone = await ctx.db.get(run.milestoneId);
      await ctx.db.patch(run._id, { status: 'cancelled', endedAt: now, settledAt: now, blockedReason: 'Runner revoked' });
      if (run.kind === 'task' && run.taskId) {
        const task = await ctx.db.get(run.taskId);
        if (task && !task.isDone && task.claimedBy === runnerId) {
          await ctx.db.patch(task._id, { status: 'To Do', claimedBy: undefined, claimedAt: undefined, updatedAt: now });
        }
      } else if (milestone?.planning === 'running') {
        await ctx.db.patch(milestone._id, { planning: 'queued', loopChangedAt: now });
      }
      await writeEvent(ctx, {
        orgId: run.orgId,
        milestoneId: run.milestoneId,
        runId: run._id,
        type: 'note',
        summary: `Runner ${runnerId} revoked · run back in the queue`,
        at: now,
      });
      released += 1;
    }
    return { ok: true as const, released };
  },
});

/** Queued planning flags cleared per call. Run again until `cleared` is 0. */
const QUEUE_CLEAR_BATCH = 25;

/**
 * ADR-0005, detail 3: production starts from an empty queue. Run once by hand
 * when production is switched on, after the deploy Peter asks for:
 *
 *   npx convex run --prod runners:clearQueuedPlanning '{"confirm":"clear the planning queue"}'
 *
 * Clears `planning: 'queued'` so no old milestone starts planning by surprise.
 * Indexed and bounded; a milestone already planning or blocked is left alone.
 * Internal: no client or staff call reaches it.
 */
export const clearQueuedPlanning = internalMutation({
  args: { confirm: v.literal('clear the planning queue') },
  handler: async (ctx) => {
    const now = Date.now();
    const queued = await ctx.db
      .query('milestones')
      .withIndex('by_planning', (q) => q.eq('planning', 'queued'))
      .take(QUEUE_CLEAR_BATCH);
    for (const milestone of queued) {
      await ctx.db.patch(milestone._id, { planning: undefined, planningReplace: undefined, loopChangedAt: now });
    }
    return { cleared: queued.length, names: queued.map((milestone) => milestone.name) };
  },
});
