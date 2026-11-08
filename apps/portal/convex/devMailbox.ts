import { v } from 'convex/values';
import { internalMutation, query } from './_generated/server';

const MAX_KEPT = 20;
const MAX_AGE_MS = 60 * 60 * 1000;

function mailboxOpen(): boolean {
  return process.env.DEV_MAILBOX_ENABLED === 'true' && !process.env.RESEND_API_KEY?.trim();
}

/** Stores one outbound message for the local portal inbox. */
export const record = internalMutation({
  args: {
    to: v.string(),
    subject: v.string(),
    text: v.string(),
    html: v.string(),
  },
  handler: async (ctx, args) => {
    if (!mailboxOpen()) return null;
    const createdAt = Date.now();
    const id = await ctx.db.insert('devMailbox', { ...args, createdAt });
    const rows = await ctx.db
      .query('devMailbox')
      .withIndex('by_createdAt')
      .order('desc')
      .take(MAX_KEPT + 10);
    const cutoff = createdAt - MAX_AGE_MS;
    await Promise.all(
      rows
        .filter((row, index) => row._id !== id && (index >= MAX_KEPT || row.createdAt < cutoff))
        .map((row) => ctx.db.delete(row._id)),
    );
    return id;
  },
});

/** Removes setup checks so they are not left in the local inbox. */
export const clear = internalMutation({
  args: {},
  handler: async (ctx) => {
    if (!mailboxOpen()) return 0;
    const rows = await ctx.db.query('devMailbox').withIndex('by_createdAt').take(MAX_KEPT + 10);
    await Promise.all(rows.map((row) => ctx.db.delete(row._id)));
    return rows.length;
  },
});

/**
 * Recent local mail. Returns nothing unless the shared-dev mailbox flag is on
 * and Resend is unset, so a production deploy of this code stays empty.
 */
export const latest = query({
  args: {},
  handler: async (ctx) => {
    if (!mailboxOpen()) return [];
    const cutoff = Date.now() - MAX_AGE_MS;
    const rows = await ctx.db.query('devMailbox').withIndex('by_createdAt').order('desc').take(MAX_KEPT);
    return rows
      .filter((row) => row.createdAt >= cutoff)
      .map((row) => ({
        to: row.to,
        subject: row.subject,
        text: row.text,
        createdAt: row.createdAt,
      }));
  },
});
