import {
  buildClientCreateProperties,
  clientCreateConvexFields,
  clientCreateIdempotencyKey,
  clientCreateStaffAllowed,
  companyNameKey,
  IDEMPOTENCY_IN_PROGRESS_ERROR,
  isNotionWritebackEnabled,
  planClientCreateDispatch,
  planCreateResume,
  type ClientCreateField,
  type ClientCreateProperties,
} from '@warehaus/portal-sync';
import { v } from 'convex/values';
import { internal } from './_generated/api';
import { action, internalAction, internalQuery, type ActionCtx, type QueryCtx } from './_generated/server';
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

async function findExistingClient(db: QueryCtx['db'], properties: ClientCreateProperties) {
  const named = await db
    .query('clients')
    .withIndex('by_nameKey', (q) => q.eq('nameKey', companyNameKey(properties['Company Name'])))
    .take(2);
  const slugged = named[0]
    ? []
    : await db
        .query('clients')
        .withIndex('by_slug', (q) => q.eq('slug', properties.Slug))
        .take(2);
  const external = named[0] || slugged[0]
    ? []
    : await db
        .query('clients')
        .withIndex('by_externalId', (q) => q.eq('externalId', properties['External ID']))
        .take(2);
  const existing = named[0] ?? slugged[0] ?? external[0];
  if (!existing) return null;
  return { clientId: existing._id, notionPageId: existing.notionPageId };
}

/**
 * Staff creates one client through the Notion outbox, then upserts that page
 * into Convex. No contact, invite, or email.
 * Write-back off returns before any Notion call. A well-formed Disabled
 * client stays in Convex for staff. Trash, archive, and quarantine still conceal.
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

    const existing = await findExistingClient(ctx.db, built.properties);
    if (existing) {
      return {
        ok: true,
        reused: true,
        clientId: existing.clientId,
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

export const findByExternalId = internalQuery({
  args: { externalId: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query('clients')
      .withIndex('by_externalId', (q) => q.eq('externalId', args.externalId))
      .take(2);
    const row = rows[0];
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
    | { ok: false; error: string; status?: 409; field?: ClientCreateField }
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
    return finishClientCreate(ctx, prepared);
  },
});

type ClientCreateOk = { ok: true; clientId: string; notionPageId: string; reused: boolean };

async function finishClientCreate(
  ctx: ActionCtx,
  prepared: { orgId: Id<'clients'>; properties: ClientCreateProperties },
): Promise<ClientCreateOk | { ok: false; error: string; status?: 409; field?: ClientCreateField }> {
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
  if (queued.duplicate) {
    const resume = planCreateResume({ status: queued.status, resultJson: queued.resultJson });
    if (resume.action === 'busy') {
      return { ok: false, status: 409, error: IDEMPOTENCY_IN_PROGRESS_ERROR };
    }
    if (resume.action === 'replay' && resume.clientId) {
      return {
        ok: true,
        clientId: resume.clientId,
        notionPageId: resume.notionPageId,
        reused: true,
      };
    }
    if (resume.action === 'replay') {
      const existing = await ctx.runQuery(internal.clientCreate.findByNotionPage, {
        notionPageId: resume.notionPageId,
      });
      if (existing) {
        return { ok: true, clientId: existing.id, notionPageId: resume.notionPageId, reused: true };
      }
      return { ok: false, status: 409, error: IDEMPOTENCY_IN_PROGRESS_ERROR };
    }
  }

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
  const byExternal = await ctx.runQuery(internal.clientCreate.findByExternalId, {
    externalId: prepared.properties['External ID'],
  });
  if (byExternal) {
    return { ok: true, clientId: byExternal.id, notionPageId: processed.notionPageId, reused: true };
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
}

/** Same property builder and outbox path as the staff form. The caller is a staff API token. */
export const prepareForToken = internalQuery({
  args: {
    orgId: v.id('clients'),
    companyName: v.string(),
    primaryEmail: v.optional(v.string()),
    phone: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<PrepareResult> => {
    const home = await ctx.db.get(args.orgId);
    if (!home) return { ok: false, error: 'Home org was not found' };
    const built = buildClientCreateProperties({
      companyName: args.companyName,
      primaryEmail: args.primaryEmail,
      phone: args.phone,
    });
    if (!built.ok) return { ok: false, error: built.error, field: built.field };
    const existing = await findExistingClient(ctx.db, built.properties);
    if (existing) {
      return { ok: true, reused: true, clientId: existing.clientId, notionPageId: existing.notionPageId };
    }
    return { ok: true, reused: false, orgId: home._id, properties: built.properties };
  },
});

export const createForToken = internalAction({
  args: {
    orgId: v.id('clients'),
    companyName: v.string(),
    primaryEmail: v.optional(v.string()),
    phone: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<ClientCreateOk | { ok: false; error: string; status?: 409; field?: ClientCreateField }> => {
    const prepared = await ctx.runQuery(internal.clientCreate.prepareForToken, args);
    if (!prepared.ok) return prepared;
    if (prepared.reused) {
      return {
        ok: true,
        clientId: prepared.clientId,
        notionPageId: prepared.notionPageId,
        reused: true,
      };
    }
    return finishClientCreate(ctx, prepared);
  },
});
