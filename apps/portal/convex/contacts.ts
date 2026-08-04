import { v } from 'convex/values';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { internalMutation, mutation, query } from './_generated/server';
import { authComponent } from './auth';
import {
  assertJoinClient,
  ensureContactExternalId,
  normalizeEmail,
  selectContactForJoin,
} from './_lib/contactJoin';
import { PortalAuthError } from './_lib/identity';
import { adminMutation } from './_lib/wrappers';

/**
 * Public pre-check for first-time password creation.
 * Returns only a boolean — does not leak contact details.
 */
export const canRegister = query({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const normalized = normalizeEmail(email);
    if (!normalized.includes('@')) return { ok: false as const };

    const contacts = await ctx.db.query('contacts').withIndex('by_email', (q) => q.eq('email', normalized)).collect();

    // Also scan if emails were stored with different casing before normalize backfill
    const all =
      contacts.length > 0
        ? contacts
        : (await ctx.db.query('contacts').collect()).filter(
            (c) => normalizeEmail(c.email) === normalized,
          );

    const enabled = all.filter((c) => c.portalAccess === 'Enabled');
    return { ok: enabled.length === 1 };
  },
});

/**
 * After Better Auth sign-in / sign-up: bind session user → Contact by email.
 * Optionally schedules Notion `Auth User ID` write (single-field exception).
 */
export const linkSession = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new PortalAuthError('Not authenticated', 'UNAUTHENTICATED');
    }

    const user = await authComponent.getAuthUser(ctx);
    if (!user?.email) {
      throw new PortalAuthError('Auth user missing email', 'UNAUTHENTICATED');
    }

    const authUserId = identity.subject;
    const email = normalizeEmail(user.email);

    const byEmail = await ctx.db
      .query('contacts')
      .withIndex('by_email', (q) => q.eq('email', email))
      .collect();

    const contacts =
      byEmail.length > 0
        ? byEmail
        : (await ctx.db.query('contacts').collect()).filter(
            (c) => normalizeEmail(c.email) === email,
          );

    const contact = selectContactForJoin({
      email,
      authUserId,
      contacts: contacts.map((c) => ({
        _id: c._id,
        orgId: c.orgId,
        email: c.email,
        name: c.name,
        role: c.role,
        portalAccess: c.portalAccess,
        authUserId: c.authUserId,
        notionPageId: c.notionPageId,
        externalId: c.externalId,
      })),
    });

    const clientDoc = await ctx.db.get(contact.orgId as Id<'clients'>);
    const client = assertJoinClient(
      clientDoc
        ? {
            _id: clientDoc._id,
            slug: clientDoc.slug,
            portalAccess: clientDoc.portalAccess,
          }
        : null,
      contact.role,
    );

    const externalId = ensureContactExternalId(contact.externalId, contact._id);
    const alreadyLinked = contact.authUserId === authUserId;
    const contactId = contact._id as Id<'contacts'>;

    if (!alreadyLinked || contact.externalId !== externalId || normalizeEmail(contact.email) !== email) {
      await ctx.db.patch(contactId, {
        authUserId,
        externalId,
        email,
      });
    }

    // One legitimate Notion write from auth — Auth User ID (+ External ID if missing).
    await ctx.scheduler.runAfter(0, internal.notionAuth.pushContactAuthFields, {
      notionPageId: contact.notionPageId,
      authUserId,
      externalId,
    });

    return {
      contactId: contact._id,
      orgId: contact.orgId,
      orgSlug: client.slug,
      role: contact.role,
      name: contact.name,
      email,
      isStaff: contact.role === 'Warehaus Staff',
      linked: true as const,
      alreadyLinked,
    };
  },
});

/** Soft status for UI — does not throw when unlinked. */
export const getLinkStatus = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { state: 'anonymous' as const };
    }

    const contact = await ctx.db
      .query('contacts')
      .withIndex('by_authUserId', (q) => q.eq('authUserId', identity.subject))
      .unique();

    if (!contact) {
      return { state: 'unlinked' as const, authUserId: identity.subject };
    }

    const client = await ctx.db.get(contact.orgId);
    return {
      state: 'linked' as const,
      contactId: contact._id,
      orgId: contact.orgId,
      orgSlug: client?.slug ?? null,
      role: contact.role,
      name: contact.name,
      email: contact.email,
      isStaff: contact.role === 'Warehaus Staff',
    };
  },
});

/** Normalize email on write (used by seed / sync later). */
export const normalizeContactEmail = internalMutation({
  args: { contactId: v.id('contacts') },
  handler: async (ctx, { contactId }) => {
    const row = await ctx.db.get(contactId);
    if (!row) return;
    const email = normalizeEmail(row.email);
    if (email !== row.email) {
      await ctx.db.patch(contactId, { email });
    }
  },
});

/**
 * Staff ops: re-push Auth User ID + External ID to Notion for every linked Contact.
 * Ownership: Convex Contact is SoT after join; Notion fields are a mirror.
 */
export const scheduleAuthBackfill = adminMutation({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query('contacts').collect();
    const linked = all.filter(
      (c) =>
        Boolean(c.authUserId) &&
        Boolean(c.externalId) &&
        !c.notionPageId.startsWith('seed-') &&
        !c.notionPageId.startsWith('fixture-'),
    );
    let scheduled = 0;
    for (const c of linked) {
      await ctx.scheduler.runAfter(0, internal.notionAuth.pushContactAuthFields, {
        notionPageId: c.notionPageId,
        authUserId: c.authUserId!,
        externalId: c.externalId!,
      });
      scheduled += 1;
    }
    return { scheduled, totalContacts: all.length };
  },
});
