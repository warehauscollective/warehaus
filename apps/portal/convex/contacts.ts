import { v } from 'convex/values';
import { components, internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { internalMutation, internalQuery, mutation, query } from './_generated/server';
import { authComponent } from './auth';
import {
  assertJoinClient,
  ensureContactExternalId,
  normalizeEmail,
  selectContactForJoin,
} from './_lib/contactJoin';
import { PortalAuthError } from './_lib/identity';
import {
  decideSelfServeRegistration,
  staffManualLinkError,
} from './_lib/registration';
import { adminMutation } from './_lib/wrappers';

type DbCtx = QueryCtx | MutationCtx;

async function contactsForEmail(ctx: DbCtx, email: string): Promise<Doc<'contacts'>[]> {
  const normalized = normalizeEmail(email);
  const byEmail = await ctx.db
    .query('contacts')
    .withIndex('by_email', (q) => q.eq('email', normalized))
    .collect();
  if (byEmail.length > 0) return byEmail;
  return (await ctx.db.query('contacts').collect()).filter(
    (contact) => normalizeEmail(contact.email) === normalized,
  );
}

/**
 * Internal gate for self-serve signup. Not callable from the browser.
 * The public signup screen is chosen in `prepareRegistration`.
 */
export const selfServeEligibility = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const contacts = await contactsForEmail(ctx, email);
    const only = contacts.length === 1 ? contacts[0] : null;
    const client = only ? await ctx.db.get(only.orgId) : null;
    return decideSelfServeRegistration({
      email,
      contacts: contacts.map((contact) => ({
        _id: contact._id,
        orgId: contact.orgId,
        email: contact.email,
        name: contact.name,
        role: contact.role,
        portalAccess: contact.portalAccess,
        authUserId: contact.authUserId,
        notionPageId: contact.notionPageId,
        externalId: contact.externalId,
      })),
      clientPortalAccess: client?.portalAccess ?? null,
    });
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
    if (user.emailVerified !== true) {
      throw new PortalAuthError('Verify your email before continuing.', 'FORBIDDEN');
    }

    const authUserId = identity.subject;
    const email = normalizeEmail(user.email);
    const contacts = await contactsForEmail(ctx, email);

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

/** Contact row used by `staffProvision.provisionStaffUser`. Not callable from the browser. */
export const staffContactForProvision = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const contacts = await contactsForEmail(ctx, email);
    const contact = contacts.length === 1 ? contacts[0] : null;
    if (!contact) return null;
    return {
      _id: contact._id,
      orgId: contact.orgId,
      email: contact.email,
      name: contact.name,
      role: contact.role,
      portalAccess: contact.portalAccess,
      authUserId: contact.authUserId ?? null,
      notionPageId: contact.notionPageId,
      externalId: contact.externalId ?? null,
    };
  },
});

/**
 * Hand link for a Warehaus Staff contact. Not callable from the browser.
 * Prefer `staffProvision.provisionStaffUser`, which creates the verified user and calls this.
 */
export const linkStaffContact = internalMutation({
  args: {
    email: v.string(),
    authUserId: v.string(),
  },
  handler: async (ctx, { email, authUserId }) => {
    const contacts = await contactsForEmail(ctx, email);
    const contact = contacts.length === 1 ? contacts[0] : null;
    const authUser = (await ctx.runQuery(components.betterAuth.adapter.findOne, {
      model: 'user',
      where: [{ field: '_id', value: authUserId }],
    })) as { _id: string; email?: string; emailVerified?: boolean } | null;

    const error = staffManualLinkError({
      contact: contact
        ? {
            _id: contact._id,
            orgId: contact.orgId,
            email: contact.email,
            name: contact.name,
            role: contact.role,
            portalAccess: contact.portalAccess,
            authUserId: contact.authUserId,
            notionPageId: contact.notionPageId,
            externalId: contact.externalId,
          }
        : null,
      authUser: authUser?.email
        ? {
            id: authUser._id,
            email: authUser.email,
            emailVerified: authUser.emailVerified === true,
          }
        : null,
    });
    if (error || !contact) {
      throw new Error(error ?? 'No contact for that email');
    }

    const externalId = ensureContactExternalId(contact.externalId, contact._id);
    const normalized = normalizeEmail(contact.email);
    await ctx.db.patch(contact._id, {
      authUserId,
      externalId,
      email: normalized,
    });

    await ctx.scheduler.runAfter(0, internal.notionAuth.pushContactAuthFields, {
      notionPageId: contact.notionPageId,
      authUserId,
      externalId,
    });

    return {
      contactId: contact._id,
      authUserId,
      email: normalized,
      linked: true as const,
    };
  },
});

/**
 * Read-only review list: contacts already linked to a Better Auth user
 * whose email was never verified. Does not unlink anyone.
 *
 * `npx convex run contacts:listLinkedUnverifiedContacts`
 */
export const listLinkedUnverifiedContacts = internalQuery({
  args: {},
  handler: async (ctx) => {
    const contacts = await ctx.db.query('contacts').collect();
    const rows = [];
    for (const contact of contacts) {
      if (!contact.authUserId) continue;
      const authUser = (await ctx.runQuery(components.betterAuth.adapter.findOne, {
        model: 'user',
        where: [{ field: '_id', value: contact.authUserId }],
      })) as { _id: string; email?: string; emailVerified?: boolean } | null;
      if (!authUser || authUser.emailVerified === true) continue;
      rows.push({
        contactId: contact._id,
        email: contact.email,
        name: contact.name,
        role: contact.role,
        authUserId: contact.authUserId,
        authEmail: authUser.email ?? null,
        emailVerified: false as const,
      });
    }
    return rows;
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
