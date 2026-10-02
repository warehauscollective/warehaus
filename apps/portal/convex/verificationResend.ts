import { v } from 'convex/values';
import type { MutationCtx } from './_generated/server';
import { internalMutation } from './_generated/server';
import { normalizeEmail } from './_lib/contactJoin';
import { decideResendCooldown } from './_lib/resendCooldown';

function resendRow(ctx: MutationCtx, email: string) {
  return ctx.db
    .query('verificationResend')
    .withIndex('by_email', (q) => q.eq('email', email))
    .unique();
}

/** Force the cooldown window to start now. Used when a verification attempt is made. */
export const stamp = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const normalized = normalizeEmail(email);
    if (!normalized.includes('@')) return { stamped: false as const };
    const existing = await resendRow(ctx, normalized);
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { lastAttemptAt: now });
    } else {
      await ctx.db.insert('verificationResend', { email: normalized, lastAttemptAt: now });
    }
    return { stamped: true as const };
  },
});

/**
 * Claim a resend slot for any address. A repeat inside the window does not send
 * and does not say whether a user exists. The caller returns the same success either way.
 */
export const claim = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const normalized = normalizeEmail(email);
    const now = Date.now();
    if (!normalized.includes('@')) {
      return { allowed: true as const, retryAfterMs: 0 };
    }
    const existing = await resendRow(ctx, normalized);
    const decision = decideResendCooldown({
      now,
      lastAttemptAt: existing?.lastAttemptAt ?? null,
    });
    if (!decision.allowed) return decision;
    if (existing) {
      await ctx.db.patch(existing._id, { lastAttemptAt: now });
    } else {
      await ctx.db.insert('verificationResend', { email: normalized, lastAttemptAt: now });
    }
    return decision;
  },
});
