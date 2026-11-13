import {
  buildClientCreateProperties,
  clientCreateConvexFields,
  clientCreateIdempotencyKey,
  clientCreateStaffAllowed,
  companyNameKey,
  isNotionWritebackEnabled,
  planClientCreateDispatch,
  type ClientCreateField,
  type ClientCreateProperties,
} from '@warehaus/portal-sync';
import { v } from 'convex/values';
import { internal } from './_generated/api';
import { action, internalQuery } from './_generated/server';
import type { Id } from './_generated/dataModel';
import {
  PortalAuthError,
  assertHostMatchesOrg,
  resolveIdentityFromContact,
} from './_lib/identity';
import { userFacingErrorMessage } from './_lib/userFacingError';

type PrepareResult =
  | {
      ok: true;
      reused: true;
      clientId: Id<'clients'>;
      notionPageId: string;
    }
  | {
      ok: true;
      reused: false;
      orgId: Id<'clients'>;
      properties: ClientCreateProperties;
    }
  | { ok: false; error: string; field?: ClientCreateField };

/**
 * Staff creates one client through the Notion outbox, then upserts that page
 * into Convex. No contact, invite, or email.
 * Write-back off returns before any Notion call. The pull gate is unchanged:
 * Portal access Disabled is concealed on the next pull.
 */
export const prepare = internalQuery({
  args: {
    authUserId: v.string(),
    hostSlug: v.optional(v.string()),
    companyName: v.string(),
    primaryEmail: v.optional(v.string()),
    phone: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<PrepareResult> => {
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
    if (!clientCreateStaffAllowed(identity.role)) {
      throw new PortalAuthError('Staff role required', 'FORBIDDEN');
    }

    const built = buildClientCreateProperties({
      companyName: args.companyName,
      primaryEmail: args.primaryEmail,
      phone: args.phone,
    });
    if (!built.ok) return { ok: false, error: built.error, field: built.field };

    const named = await ctx.db
      .query('clients')
      .withIndex('by_nameKey', (q) => q.eq('nameKey', companyNameKey(built.properties['Company Name'])))
      .take(2);
    const slugged = named[0]
      ? []
      : await ctx.db
          .query('clients')
          .withIndex('by_slug', (q) => q.eq('slug', built.properties.Slug))
          .take(2);
    const external = named[0] || slugged[0]
      ? []
      : await ctx.db
          .query('clients')
          .withIndex('by_externalId', (q) => q.eq('externalId', built.properties['External ID']))
          .take(2);
    const existing = named[0] ?? slugged[0] ?? external[0];
    if (existing) {
      return {
        ok: true,
        reused: true,
        clientId: existing._id,
        notionPageId: existing.notionPageId,
      };
    }

    return {
      ok: true,
      reused: false,
      orgId: contact!.orgId,
      properties: built.properties,
    };
  },
});

export const findByNotionPage = internalQuery({
  args: { notionPageId: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query('clients')
      .withIndex('by_notionPageId', (q) => q.eq('notionPageId', args.notionPageId))
      .unique();
    if (!row) return null;
    return { id: row._id };
  },
});

export const createInNotion = action({
  args: {
    hostSlug: v.optional(v.string()),
    companyName: v.string(),
    primaryEmail: v.optional(v.string()),
    phone: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<
    | { ok: true; clientId: string; notionPageId: string; reused: boolean }
    | { ok: false; error: string; field?: ClientCreateField }
  > => {
    const auth = await ctx.auth.getUserIdentity();
    if (!auth) return { ok: false, error: 'Not authenticated' };

    let prepared: PrepareResult;
    try {
      prepared = await ctx.runQuery(internal.clientCreate.prepare, {
        authUserId: auth.subject,
        hostSlug: args.hostSlug,
        companyName: args.companyName,
        primaryEmail: args.primaryEmail,
        phone: args.phone,
      });
    } catch (err) {
      return { ok: false, error: userFacingErrorMessage(err, 'Could not create the client') };
    }
    if (!prepared.ok) return prepared;
    if (prepared.reused) {
      return {
        ok: true,
        clientId: prepared.clientId,
        notionPageId: prepared.notionPageId,
        reused: true,
      };
    }

    const gate = planClientCreateDispatch({
      writebackEnabled: isNotionWritebackEnabled(process.env.NOTION_WRITEBACK_ENABLED),
    });
    if (!gate.ok) return gate;

    const queued = await ctx.runMutation(internal.sync.outbox.enqueue, {
      idempotencyKey: clientCreateIdempotencyKey(prepared.properties['External ID']),
      kind: 'client-create',
      orgId: prepared.orgId,
      database: 'clients',
      payload: JSON.stringify({ properties: prepared.properties }),
      actor: 'staff',
      schedule: false,
    });
    if (!queued.ok) return queued;

    const processed = await ctx.runAction(internal.sync.outboxWork.processOne, {
      id: queued.outboxId,
    });
    if (!processed.ok) return processed;
    if (processed.clientId) {
      return {
        ok: true,
        clientId: processed.clientId,
        notionPageId: processed.notionPageId,
        reused: processed.reused,
      };
    }

    const existing = await ctx.runQuery(internal.clientCreate.findByNotionPage, {
      notionPageId: processed.notionPageId,
    });
    if (existing) {
      return { ok: true, clientId: existing.id, notionPageId: processed.notionPageId, reused: true };
    }
    if (processed.reused) {
      return {
        ok: false,
        error: 'That client already exists in Notion, but it is not in the portal yet.',
      };
    }

    const fields = clientCreateConvexFields(prepared.properties);
    const clientId = await ctx.runMutation(internal.sync.upsert.upsertClient, {
      notionPageId: processed.notionPageId,
      companyName: fields.companyName,
      slug: fields.slug,
      status: fields.status,
      portalAccess: 'Disabled',
      externalId: fields.externalId,
      source: 'portal',
      ...(fields.primaryEmail ? { primaryEmail: fields.primaryEmail } : {}),
      ...(fields.phone ? { phone: fields.phone } : {}),
    });
    return {
      ok: true,
      clientId,
      notionPageId: processed.notionPageId,
      reused: false,
    };
  },
});
