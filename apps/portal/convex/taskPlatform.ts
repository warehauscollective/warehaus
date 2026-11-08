import { linearOrgRead, readLinearPlatform, type LinearOrgRead } from '@warehaus/portal-sync';
import { v } from 'convex/values';
import { internal } from './_generated/api';
import { action, internalQuery } from './_generated/server';
import type { Id } from './_generated/dataModel';
import {
  PortalAuthError,
  assertHostMatchesOrg,
  isStaff,
  resolveIdentityFromContact,
} from './_lib/identity';
import { linearEnv } from './_lib/taskPlatformRead';

/**
 * Auth for the Linear read. The action is the only caller that fetches.
 */
export const prepare = internalQuery({
  args: {
    authUserId: v.string(),
    hostSlug: v.optional(v.string()),
    orgId: v.optional(v.id('clients')),
  },
  handler: async (ctx, args) => {
    const contact = await ctx.db
      .query('contacts')
      .withIndex('by_authUserId', (q) => q.eq('authUserId', args.authUserId))
      .unique();
    const staffOrg = contact ? await ctx.db.get(contact.orgId) : null;
    const identity = resolveIdentityFromContact({
      authUserId: args.authUserId,
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
      client: staffOrg
        ? {
            _id: staffOrg._id,
            slug: staffOrg.slug,
            portalAccess: staffOrg.portalAccess,
          }
        : null,
    });
    assertHostMatchesOrg(identity, args.hostSlug);
    const orgId = (args.orgId ?? identity.orgId) as Id<'clients'>;
    if (!isStaff(identity) && orgId !== identity.orgId) {
      throw new PortalAuthError('Cross-org access denied', 'FORBIDDEN');
    }
    const client = await ctx.db.get(orgId);
    if (!client) throw new PortalAuthError('Client not found', 'FORBIDDEN');
    return {
      orgId: client._id,
      platform: client.taskPlatform === 'linear' ? ('linear' as const) : ('notion' as const),
    };
  },
});

const unavailable = {
  ok: false as const,
  platform: 'linear' as const,
  reason: 'unavailable' as const,
};

/**
 * Reads Linear issues and project milestones for one client.
 * Queries stay fetch-free. This action is the only Linear caller.
 * The key stays in the action env and is not returned.
 */
export const readForOrg = action({
  args: {
    hostSlug: v.optional(v.string()),
    orgId: v.optional(v.id('clients')),
  },
  handler: async (ctx, args): Promise<LinearOrgRead> => {
    const auth = await ctx.auth.getUserIdentity();
    if (!auth) return unavailable;

    let prepared: { orgId: Id<'clients'>; platform: 'notion' | 'linear' };
    try {
      prepared = await ctx.runQuery(internal.taskPlatform.prepare, {
        authUserId: auth.subject,
        hostSlug: args.hostSlug,
        orgId: args.orgId,
      });
    } catch {
      return unavailable;
    }
    if (prepared.platform !== 'linear') {
      return { ok: true, platform: 'notion', tasks: [], milestones: [], milestonesUnavailable: false };
    }
    const read = await readLinearPlatform(linearEnv());
    return linearOrgRead(prepared.orgId, read);
  },
});
