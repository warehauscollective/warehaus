import type { Doc, Id } from './_generated/dataModel';
import { isStaff } from './_lib/identity';
import {
  defaultProjectListView,
  normalizeProjectListView,
  sameProjectListView,
  type ProjectListView,
} from './_lib/projectListView';
import { projectListViewFields } from './_lib/projectListViewFields';
import { clientMutation, clientQuery } from './_lib/wrappers';

/**
 * The signed-in contact's saved project list view, or null when none is
 * saved (the list then shows the default). One indexed read. The stored row
 * is normalised for the caller's role on the way out, so a contact who is no
 * longer staff never gets a staff-only filter back.
 */
export const getMine = clientQuery({
  args: {},
  handler: async (ctx): Promise<ProjectListView | null> => {
    const contactId = ctx.identity.contactId as Id<'contacts'>;
    const row = await ctx.db
      .query('projectListPrefs')
      .withIndex('by_contactId', (q) => q.eq('contactId', contactId))
      .unique();
    return row ? normalizeProjectListView(row, isStaff(ctx.identity)) : null;
  },
});

/**
 * Save the view for the signed-in contact only. There is no contact argument.
 *
 * The view is normalised first: staff-only filters are stripped for a client,
 * picked lists are capped, bad dates are dropped. A view equal to the default
 * is stored as no row. A save that matches what is stored writes nothing.
 * Portal only: no Notion outbox row and no scheduled call.
 */
export const saveMine = clientMutation({
  args: projectListViewFields,
  handler: async (ctx, args): Promise<ProjectListView> => {
    const contactId = ctx.identity.contactId as Id<'contacts'>;
    const next = normalizeProjectListView(args, isStaff(ctx.identity));
    const existing: Doc<'projectListPrefs'> | null = await ctx.db
      .query('projectListPrefs')
      .withIndex('by_contactId', (q) => q.eq('contactId', contactId))
      .unique();

    if (sameProjectListView(next, defaultProjectListView())) {
      if (existing) await ctx.db.delete(existing._id);
      return next;
    }
    if (existing) {
      // Compare with the row as stored, not as normalised for this role, so a
      // row holding values this caller may not keep is rewritten clean.
      if (sameProjectListView(next, existing)) return next;
      await ctx.db.patch(existing._id, { ...next, updatedAt: Date.now() });
      return next;
    }
    await ctx.db.insert('projectListPrefs', { contactId, ...next, updatedAt: Date.now() });
    return next;
  },
});
