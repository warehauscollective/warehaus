import {
  customMutation,
  customQuery,
} from 'convex-helpers/server/customFunctions';
import { v } from 'convex/values';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import { mutation, query } from '../_generated/server';
import type { Id } from '../_generated/dataModel';
import {
  PortalAuthError,
  assertHostMatchesOrg,
  isStaff,
  resolveIdentityFromContact,
  type PortalIdentity,
} from './identity';

type Ctx = QueryCtx | MutationCtx;

async function loadIdentity(
  ctx: Ctx,
  hostSlug?: string | null,
): Promise<PortalIdentity> {
  const auth = await ctx.auth.getUserIdentity();
  if (!auth) {
    throw new PortalAuthError('Not authenticated', 'UNAUTHENTICATED');
  }

  const authUserId = auth.subject;
  const contact = await ctx.db
    .query('contacts')
    .withIndex('by_authUserId', (q) => q.eq('authUserId', authUserId))
    .unique();

  const client = contact
    ? await ctx.db.get(contact.orgId)
    : null;

  const identity = resolveIdentityFromContact({
    authUserId,
    contact: contact
      ? {
          _id: contact._id,
          orgId: contact.orgId,
          name: contact.name,
          email: contact.email,
          authUserId: contact.authUserId,
          role: contact.role,
          portalAccess: contact.portalAccess,
        }
      : null,
    client: client
      ? {
          _id: client._id,
          slug: client.slug,
          portalAccess: client.portalAccess,
        }
      : null,
  });

  assertHostMatchesOrg(identity, hostSlug);
  return identity;
}

const hostArgs = {
  hostSlug: v.optional(v.string()),
};

/**
 * Client-scoped query. Resolves Contact → orgId; hostSlug must match org.
 * Handlers receive `ctx.identity` and must lead queries with orgId.
 */
export const clientQuery = customQuery(query, {
  args: hostArgs,
  input: async (ctx, { hostSlug }) => {
    const identity = await loadIdentity(ctx, hostSlug);
    if (isStaff(identity)) {
      // Staff may use clientQuery when browsing a client host — scoped to that host's org
      // if hostSlug provided; otherwise still get their staff contact org.
    }
    return {
      ctx: { ...ctx, identity, orgId: identity.orgId as Id<'clients'> },
      args: {},
    };
  },
});

export const clientMutation = customMutation(mutation, {
  args: hostArgs,
  input: async (ctx, { hostSlug }) => {
    const identity = await loadIdentity(ctx, hostSlug);
    return {
      ctx: { ...ctx, identity, orgId: identity.orgId as Id<'clients'> },
      args: {},
    };
  },
});

/**
 * Admin-scoped — Warehaus Staff only. Cross-org reads allowed.
 */
export const adminQuery = customQuery(query, {
  args: hostArgs,
  input: async (ctx, { hostSlug }) => {
    const identity = await loadIdentity(ctx, hostSlug);
    if (!isStaff(identity)) {
      throw new PortalAuthError('Staff role required', 'FORBIDDEN');
    }
    return { ctx: { ...ctx, identity }, args: {} };
  },
});

export const adminMutation = customMutation(mutation, {
  args: hostArgs,
  input: async (ctx, { hostSlug }) => {
    const identity = await loadIdentity(ctx, hostSlug);
    if (!isStaff(identity)) {
      throw new PortalAuthError('Staff role required', 'FORBIDDEN');
    }
    return { ctx: { ...ctx, identity }, args: {} };
  },
});
