/**
 * Staff reads for clients and projects. Pages are at most 50.
 * Concealed clients (trash, archive, quarantine) are omitted.
 * Unpublished projects stay, because staff can see drafts.
 */

import { clientIsStaffVisible } from '@warehaus/portal-sync';
import { v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import { internalQuery } from './_generated/server';

const PAGE_CAP = 50;

function fail(status: number, error: string) {
  return { status, body: { error } };
}

function staffClient(row: Doc<'clients'>) {
  return {
    id: row._id,
    companyName: row.companyName,
    slug: row.slug,
    status: row.status,
    portalAccess: row.portalAccess,
    primaryEmail: row.primaryEmail ?? null,
    phone: row.phone ?? null,
    notionPageId: row.notionPageId,
    source: row.source ?? null,
  };
}

function staffProject(row: Doc<'projects'>) {
  return {
    id: row._id,
    orgId: row.orgId,
    name: row.name,
    description: row.description ?? null,
    status: row.status,
    publishToWarehaus: row.publishToWarehaus,
    archive: row.archive,
    type: row.type,
    syncHidden: row.syncHiddenAt != null,
    notionPageId: row.notionPageId,
    externalId: row.externalId ?? null,
  };
}

export const readSession = internalQuery({
  args: { tokenHash: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query('apiTokens')
      .withIndex('by_tokenHash', (q) => q.eq('tokenHash', args.tokenHash))
      .unique();
    if (!row || row.revokedAt != null) return { ok: false as const, status: 401, error: 'Unauthorized' };
    return { ok: true as const, name: row.name, scope: row.scope };
  },
});

export const tokenHomeOrg = internalQuery({
  args: { tokenId: v.id('apiTokens') },
  handler: async (ctx, args) => {
    const token = await ctx.db.get(args.tokenId);
    if (!token) return null;
    if (token.homeOrgId) return token.homeOrgId;
    if (!token.createdByContactId) return null;
    const contact = await ctx.db.get(token.createdByContactId);
    return contact?.orgId ?? null;
  },
});

export const listClients = internalQuery({
  args: { cursor: v.union(v.string(), v.null()), limit: v.number() },
  handler: async (ctx, args) => {
    const page = await ctx.db.query('clients').paginate({
      numItems: Math.min(args.limit, PAGE_CAP),
      cursor: args.cursor,
    });
    const items = [];
    for (const row of page.page) {
      if (!clientIsStaffVisible(row)) continue;
      items.push(staffClient(row));
    }
    return {
      status: 200,
      body: {
        items,
        nextCursor: page.isDone ? null : page.continueCursor,
        hasMore: !page.isDone,
      },
    };
  },
});

export const getClient = internalQuery({
  args: { clientId: v.id('clients') },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.clientId);
    if (!row || !clientIsStaffVisible(row)) return fail(404, 'Client not found');
    return { status: 200, body: staffClient(row) };
  },
});

export const listProjects = internalQuery({
  args: {
    orgId: v.optional(v.id('clients')),
    cursor: v.union(v.string(), v.null()),
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    if (args.orgId) {
      const client = await ctx.db.get(args.orgId);
      if (!client || !clientIsStaffVisible(client)) return fail(404, 'Client not found');
    }
    const page = await (args.orgId
      ? ctx.db.query('projects').withIndex('by_orgId', (q) => q.eq('orgId', args.orgId as Id<'clients'>))
      : ctx.db.query('projects')
    ).paginate({ numItems: Math.min(args.limit, PAGE_CAP), cursor: args.cursor });
    const items = [];
    for (const row of page.page) {
      if (args.orgId) {
        items.push(staffProject(row));
        continue;
      }
      const client = await ctx.db.get(row.orgId);
      if (!clientIsStaffVisible(client)) continue;
      items.push(staffProject(row));
    }
    return {
      status: 200,
      body: {
        items,
        nextCursor: page.isDone ? null : page.continueCursor,
        hasMore: !page.isDone,
      },
    };
  },
});

export const getProject = internalQuery({
  args: { projectId: v.id('projects') },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.projectId);
    if (!row) return fail(404, 'Project not found');
    const client = await ctx.db.get(row.orgId);
    if (!clientIsStaffVisible(client)) return fail(404, 'Project not found');
    return { status: 200, body: staffProject(row) };
  },
});
