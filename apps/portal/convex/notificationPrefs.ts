import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import {
  mergeNotificationPrefs,
  normalizeNotificationPrefs,
  type NotificationPrefs,
} from './_lib/notificationPrefs';
import { clientMutation, clientQuery } from './_lib/wrappers';

const prefArgs = {
  awaitingGo: v.boolean(),
  syncProblems: v.boolean(),
  draftRecaps: v.boolean(),
  inviteNotices: v.boolean(),
  needsAttention: v.boolean(),
  sharedRecaps: v.boolean(),
  weeklySummary: v.boolean(),
};

function toPrefs(row: NotificationPrefs): NotificationPrefs {
  return normalizeNotificationPrefs(row);
}

/**
 * The signed-in contact's toggles. Missing row returns defaults.
 * Does not send email.
 */
export const getMine = clientQuery({
  args: {},
  handler: async (ctx) => {
    const contactId = ctx.identity.contactId as Id<'contacts'>;
    const row = await ctx.db
      .query('notificationPrefs')
      .withIndex('by_contactId', (q) => q.eq('contactId', contactId))
      .unique();
    return {
      ...toPrefs(
        row ?? {
          awaitingGo: true,
          syncProblems: true,
          draftRecaps: true,
          inviteNotices: false,
          needsAttention: true,
          sharedRecaps: true,
          weeklySummary: false,
        },
      ),
      persisted: Boolean(row),
    };
  },
});

/**
 * Upsert toggles for the signed-in contact only.
 * Email stays off: this mutation does not call Resend or Notion.
 */
export const saveMine = clientMutation({
  args: prefArgs,
  handler: async (ctx, args) => {
    const contactId = ctx.identity.contactId as Id<'contacts'>;
    const existing = await ctx.db
      .query('notificationPrefs')
      .withIndex('by_contactId', (q) => q.eq('contactId', contactId))
      .unique();
    const next = mergeNotificationPrefs(existing, args);
    const updatedAt = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { ...next, updatedAt });
    } else {
      await ctx.db.insert('notificationPrefs', { contactId, ...next, updatedAt });
    }
    return next;
  },
});
