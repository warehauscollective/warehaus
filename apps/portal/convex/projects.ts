import { v } from 'convex/values';
import { adminMutation, adminQuery, clientQuery } from './_lib/wrappers';
import { PortalAuthError } from './_lib/identity';
import type { Id } from './_generated/dataModel';

/** CLIENT fields only — never emit SERVER gate inputs. */
function toClientProject(row: {
  _id: string;
  orgId: string;
  name: string;
  description?: string;
  status: string;
  progress?: number;
  startDate?: string;
  endDate?: string;
  liveUrl?: string;
  figmaLink?: string;
  docsUrl?: string;
  stack?: string[];
  externalId?: string;
}) {
  return {
    id: row._id,
    orgId: row.orgId,
    name: row.name,
    description: row.description ?? null,
    status: row.status,
    progress: row.progress ?? null,
    startDate: row.startDate ?? null,
    endDate: row.endDate ?? null,
    liveUrl: row.liveUrl ?? null,
    figmaLink: row.figmaLink ?? null,
    docsUrl: row.docsUrl ?? null,
    stack: row.stack ?? [],
  };
}

function isPublishedProject(row: {
  publishToWarehaus: boolean;
  archive: boolean;
  type: string[];
}) {
  return row.publishToWarehaus && !row.archive && !row.type.includes('Internal');
}

/** List published projects for the caller's org. */
export const listForClient = clientQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query('projects')
      .withIndex('by_orgId', (q) => q.eq('orgId', ctx.orgId))
      .collect();

    return rows.filter(isPublishedProject).map(toClientProject);
  },
});

/** Admin: list projects for any org (explicit orgId arg). */
export const listForOrgAdmin = adminQuery({
  args: { orgId: v.id('clients') },
  handler: async (ctx, { orgId }) => {
    const rows = await ctx.db
      .query('projects')
      .withIndex('by_orgId', (q) => q.eq('orgId', orgId))
      .collect();
    return rows.map(toClientProject);
  },
});

/**
 * Staff: all published projects across clients (team Projects tab).
 * Includes clientName for detail/pipeline grouping.
 */
export const listPublishedForStaff = adminQuery({
  args: {},
  handler: async (ctx) => {
    const clients = await ctx.db.query('clients').collect();
    const clientById = new Map(clients.map((c) => [c._id, c] as const));
    const rows = await ctx.db.query('projects').collect();

    return rows
      .filter(isPublishedProject)
      .map((row) => {
        const client = clientById.get(row.orgId);
        return {
          ...toClientProject(row),
          clientName: client?.companyName ?? null,
          clientSlug: client?.slug ?? null,
        };
      })
      .sort((a, b) => {
        const score = (status: string) => {
          const s = status.toLowerCase();
          if (s.includes('progress')) return 3;
          if (s.includes('plan')) return 2;
          if (s.includes('inbox')) return 1;
          return 0;
        };
        const byStatus = score(b.status) - score(a.status);
        if (byStatus !== 0) return byStatus;
        return (
          (b.progress ?? 0) - (a.progress ?? 0) || a.name.localeCompare(b.name)
        );
      });
  },
});

/**
 * Staff creates a Convex-native project (Notion bridge later via synthetic page id).
 * Marks publishToWarehaus so it surfaces in the portal immediately.
 */
export const createForStaff = adminMutation({
  args: {
    orgId: v.id('clients'),
    name: v.string(),
    description: v.optional(v.string()),
    status: v.optional(v.string()),
    endDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const name = args.name.trim();
    if (!name) {
      throw new PortalAuthError('Project name is required', 'FORBIDDEN');
    }

    const client = await ctx.db.get(args.orgId);
    if (!client) {
      throw new PortalAuthError('Client not found', 'FORBIDDEN');
    }

    const now = Date.now();
    const notionPageId = `portal:project:${now}:${Math.random().toString(36).slice(2, 10)}`;

    const projectId = await ctx.db.insert('projects', {
      orgId: args.orgId as Id<'clients'>,
      notionPageId,
      name,
      description: args.description?.trim() || undefined,
      status: args.status?.trim() || 'Inbox',
      progress: 0,
      endDate: args.endDate || undefined,
      type: ['Website'],
      archive: false,
      publishToWarehaus: true,
      source: 'portal',
      lastSyncedAt: now,
    });

    await ctx.db.insert('activity', {
      orgId: args.orgId as Id<'clients'>,
      projectId,
      name: 'Project created',
      summary: `${name} · ${client.companyName}`,
      type: 'project',
      tone: 'accent',
      timestamp: now,
    });

    return { id: projectId, notionPageId };
  },
});
