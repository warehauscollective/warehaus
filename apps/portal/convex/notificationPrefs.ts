import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import { isStaff } from './_lib/identity';
import {
  DEFAULT_NOTIFICATION_PREFS,
  mergeNotificationPrefs,
  normalizeNotificationPrefs,
  notificationKeysFor,
  NOTIFICATION_PREF_KEYS,
  type NotificationPrefKey,
  type NotificationPrefs,
} from './_lib/notificationPrefs';
import { clientMutation, clientQuery } from './_lib/wrappers';

const prefArgs = {
  awaitingGo: v.optional(v.boolean()),
  syncProblems: v.optional(v.boolean()),
  draftRecaps: v.optional(v.boolean()),
  inviteNotices: v.optional(v.boolean()),
  needsAttention: v.optional(v.boolean()),
  sharedRecaps: v.optional(v.boolean()),
  weeklySummary: v.optional(v.boolean()),
};

/**
 * Keep the signed-in audience's keys. A client must not write staff toggles,
 * and staff must not write client ones. Reject before the merge.
 */
export function audienceNotificationPatch(
  staff: boolean,
  args: Partial<Record<NotificationPrefKey, boolean | undefined>>,
): Partial<NotificationPrefs> {
  const allowed = new Set<NotificationPrefKey>(notificationKeysFor(staff));
  const foreign = NOTIFICATION_PREF_KEYS.filter((key) => args[key] !== undefined && !allowed.has(key));
  if (foreign.length > 0) {
    const who = staff ? 'Staff' : 'Clients';
    const other = staff ? 'client' : 'staff';
    throw new Error(`${who} cannot set ${other} notification settings: ${foreign.join(', ')}`);
  }
  const patch: Partial<NotificationPrefs> = {};
  for (const key of notificationKeysFor(staff)) {
    if (typeof args[key] === 'boolean') patch[key] = args[key];
  }
  return patch;
}

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
      ...toPrefs(row ?? DEFAULT_NOTIFICATION_PREFS),
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
    const patch = audienceNotificationPatch(isStaff(ctx.identity), args);
    const existing = await ctx.db
      .query('notificationPrefs')
      .withIndex('by_contactId', (q) => q.eq('contactId', contactId))
      .unique();
    const next = mergeNotificationPrefs(existing, patch);
    const updatedAt = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { ...next, updatedAt });
    } else {
      await ctx.db.insert('notificationPrefs', { contactId, ...next, updatedAt });
    }
    return next;
  },
});
