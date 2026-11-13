import {
  buildProjectCreateProperties,
  clientIsStaffVisible,
  isNotionWritebackEnabled,
  planProjectCreateDispatch,
  projectCreateConvexFields,
  projectCreateIdempotencyKey,
  projectCreateStaffAllowed,
  type ProjectCreateProperties,
} from '@warehaus/portal-sync';
import { v } from 'convex/values';
import { internal } from './_generated/api';
import { action, internalAction, internalQuery, type ActionCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import {
  PortalAuthError,
  assertHostMatchesOrg,
  resolveIdentityFromContact,
} from './_lib/identity';
import { userFacingErrorMessage } from './_lib/userFacingError';

/**
 * Staff creates one project through the Notion outbox, then upserts that page
 * into Convex. No tasks, resources, or activity rows.
 * Write-back off returns before any Notion call. There is no second create flag.
 */
export const prepare = internalQuery({
  args: {
    authUserId: v.string(),
    hostSlug: v.optional(v.string()),
    orgId: v.id('clients'),
    name: v.string(),
    externalId: v.string(),
    publish: v.boolean(),
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
    if (!projectCreateStaffAllowed(identity.role)) {
      throw new PortalAuthError('Staff role required', 'FORBIDDEN');
    }

    const client = await ctx.db.get(args.orgId);
    if (!client) {
      throw new PortalAuthError('Client not found', 'FORBIDDEN');
    }

    const built = buildProjectCreateProperties({
      name: args.name,
      clientNotionPageId: client.notionPageId,
      externalId: args.externalId,
      publish: args.publish,
    });
    if (!built.ok) {
      return { ok: false as const, error: built.errors.join(' ') };
    }
    return { ok: true as const, orgId: client._id, properties: built.properties };
  },
});

export const createInNotion = action({
  args: {
    hostSlug: v.optional(v.string()),
    orgId: v.id('clients'),
    name: v.string(),
    externalId: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<
    | { ok: true; projectId: string; notionPageId: string; reused: boolean }
    | { ok: false; error: string }
  > => {
    const auth = await ctx.auth.getUserIdentity();
    if (!auth) {
      return { ok: false, error: 'Not authenticated' };
    }

    let prepared: {
      ok: true;
      orgId: typeof args.orgId;
      properties: ProjectCreateProperties;
    } | { ok: false; error: string };
    try {
      prepared = await ctx.runQuery(internal.projectCreate.prepare, {
        authUserId: auth.subject,
        hostSlug: args.hostSlug,
        orgId: args.orgId,
        name: args.name,
        externalId: args.externalId,
        publish: true,
      });
    } catch (err) {
      const message = userFacingErrorMessage(err, 'Could not create the project');
      return { ok: false, error: message };
    }
    if (!prepared.ok) return prepared;
    return finishProjectCreate(ctx, prepared);
  },
});

type ProjectCreateOk = { ok: true; projectId: string; notionPageId: string; reused: boolean };

async function finishProjectCreate(
  ctx: ActionCtx,
  prepared: { orgId: Id<'clients'>; properties: ProjectCreateProperties },
): Promise<ProjectCreateOk | { ok: false; error: string }> {
  const gate = planProjectCreateDispatch({
    writebackEnabled: isNotionWritebackEnabled(process.env.NOTION_WRITEBACK_ENABLED),
  });
  if (!gate.ok) return gate;

  const queued = await ctx.runMutation(internal.sync.outbox.enqueue, {
    idempotencyKey: projectCreateIdempotencyKey(prepared.properties['External ID']),
    kind: 'project-create',
    orgId: prepared.orgId,
    database: 'projects',
    payload: JSON.stringify({ properties: prepared.properties }),
    actor: 'staff',
    schedule: false,
  });
  if (!queued.ok) return queued;

  const processed = await ctx.runAction(internal.sync.outboxWork.processOne, {
    id: queued.outboxId,
  });
  if (!processed.ok) return processed;
  if (processed.projectId) {
    return {
      ok: true,
      projectId: processed.projectId,
      notionPageId: processed.notionPageId,
      reused: processed.reused,
    };
  }

  const fields = projectCreateConvexFields(prepared.properties);
  const projectId = await ctx.runMutation(internal.sync.upsert.upsertProject, {
    notionPageId: processed.notionPageId,
    orgId: prepared.orgId,
    name: fields.name,
    status: fields.status,
    type: fields.type,
    archive: fields.archive,
    publishToWarehaus: fields.publishToWarehaus,
    externalId: fields.externalId,
    source: fields.source,
  });

  return {
    ok: true,
    projectId,
    notionPageId: processed.notionPageId,
    reused: processed.reused,
  };
}

/** Same property builder and outbox path as the staff form. The caller is a staff API token. Publish stays off unless the caller opts in. */
export const prepareForToken = internalQuery({
  args: {
    orgId: v.id('clients'),
    name: v.string(),
    externalId: v.string(),
    publishToWarehaus: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const client = await ctx.db.get(args.orgId);
    if (!client || !clientIsStaffVisible(client)) {
      return { ok: false as const, error: 'Client not found' };
    }
    const built = buildProjectCreateProperties({
      name: args.name,
      clientNotionPageId: client.notionPageId,
      externalId: args.externalId,
      publish: args.publishToWarehaus === true,
    });
    if (!built.ok) return { ok: false as const, error: built.errors.join(' ') };
    return { ok: true as const, orgId: client._id, properties: built.properties };
  },
});

export const createForToken = internalAction({
  args: {
    orgId: v.id('clients'),
    name: v.string(),
    externalId: v.string(),
    publishToWarehaus: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<ProjectCreateOk | { ok: false; error: string }> => {
    const prepared = await ctx.runQuery(internal.projectCreate.prepareForToken, args);
    if (!prepared.ok) return prepared;
    return finishProjectCreate(ctx, prepared);
  },
});
