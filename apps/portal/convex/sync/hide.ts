import { v } from 'convex/values';
import { internalMutation, internalQuery } from '../_generated/server';
import type { Id } from '../_generated/dataModel';

const hideReason = v.union(v.literal('gate'), v.literal('ancestor'), v.literal('trashed'));

const syncedTable = v.union(
  v.literal('clients'),
  v.literal('contacts'),
  v.literal('projects'),
  v.literal('tasks'),
  v.literal('sharedResources'),
  v.literal('clientDocs'),
);

type HideReasonName = 'gate' | 'ancestor' | 'trashed';

/**
 * Soft-hide one synced row that already exists. Does not insert.
 * Contacts that fail their own gate (or are trashed) lose Portal Access.
 * Clients that fail the gate are marked Disabled so login cannot continue.
 */
export const hideSyncedPage = internalMutation({
  args: {
    table: syncedTable,
    notionPageId: v.string(),
    reason: hideReason,
    detail: v.string(),
  },
  handler: async (ctx, args) => {
    void args.detail;
    const now = Date.now();
    const stamp = {
      syncHiddenAt: now,
      syncHiddenReason: args.reason as HideReasonName,
      lastSyncedAt: now,
    };
    const empty = {
      hidden: false,
      authUserIds: [] as string[],
      orgId: undefined as Id<'clients'> | undefined,
      projectId: undefined as Id<'projects'> | undefined,
    };

    if (args.table === 'clients') {
      const existing = await ctx.db
        .query('clients')
        .withIndex('by_notionPageId', (q) => q.eq('notionPageId', args.notionPageId))
        .unique();
      if (!existing) return empty;
      await ctx.db.patch(existing._id, { ...stamp, portalAccess: 'Disabled' as const });
      return { hidden: true, authUserIds: [], orgId: existing._id, projectId: undefined };
    }

    if (args.table === 'contacts') {
      const existing = await ctx.db
        .query('contacts')
        .withIndex('by_notionPageId', (q) => q.eq('notionPageId', args.notionPageId))
        .unique();
      if (!existing) return empty;
      await ctx.db.patch(existing._id, {
        ...stamp,
        portalAccess: 'Disabled' as const,
      });
      return {
        hidden: true,
        authUserIds: existing.authUserId ? [existing.authUserId] : [],
        orgId: existing.orgId,
        projectId: undefined,
      };
    }

    if (args.table === 'projects') {
      const existing = await ctx.db
        .query('projects')
        .withIndex('by_notionPageId', (q) => q.eq('notionPageId', args.notionPageId))
        .unique();
      if (!existing) return empty;
      await ctx.db.patch(existing._id, stamp);
      return { hidden: true, authUserIds: [], orgId: existing.orgId, projectId: existing._id };
    }

    if (args.table === 'tasks') {
      const existing = await ctx.db
        .query('tasks')
        .withIndex('by_notionPageId', (q) => q.eq('notionPageId', args.notionPageId))
        .unique();
      if (!existing) return empty;
      await ctx.db.patch(existing._id, stamp);
      return { hidden: true, authUserIds: [], orgId: existing.orgId, projectId: existing.projectId };
    }

    if (args.table === 'sharedResources') {
      const existing = await ctx.db
        .query('sharedResources')
        .withIndex('by_notionPageId', (q) => q.eq('notionPageId', args.notionPageId))
        .unique();
      if (!existing) return empty;
      await ctx.db.patch(existing._id, stamp);
      return { hidden: true, authUserIds: [], orgId: existing.orgId, projectId: undefined };
    }

    const existing = await ctx.db
      .query('clientDocs')
      .withIndex('by_notionPageId', (q) => q.eq('notionPageId', args.notionPageId))
      .unique();
    if (!existing) return empty;
    await ctx.db.patch(existing._id, stamp);
    return { hidden: true, authUserIds: [], orgId: existing.orgId, projectId: undefined };
  },
});

/** Hide every child of a client except Warehaus Staff contacts, which keep their login. */
export const hideClientChildren = internalMutation({
  args: { orgId: v.id('clients') },
  handler: async (ctx, { orgId }) => {
    const now = Date.now();
    const stamp = { syncHiddenAt: now, syncHiddenReason: 'ancestor' as const, lastSyncedAt: now };
    const authUserIds: string[] = [];

    const projects = await ctx.db
      .query('projects')
      .withIndex('by_orgId', (q) => q.eq('orgId', orgId))
      .collect();
    for (const row of projects) {
      if (row.syncHiddenReason === 'gate' || row.syncHiddenReason === 'trashed') continue;
      await ctx.db.patch(row._id, stamp);
    }

    const tasks = await ctx.db
      .query('tasks')
      .withIndex('by_orgId', (q) => q.eq('orgId', orgId))
      .collect();
    for (const row of tasks) {
      if (row.syncHiddenReason === 'gate' || row.syncHiddenReason === 'trashed') continue;
      await ctx.db.patch(row._id, stamp);
    }

    const resources = await ctx.db
      .query('sharedResources')
      .withIndex('by_orgId', (q) => q.eq('orgId', orgId))
      .collect();
    for (const row of resources) {
      if (row.syncHiddenReason === 'gate' || row.syncHiddenReason === 'trashed') continue;
      await ctx.db.patch(row._id, stamp);
    }

    const docs = await ctx.db
      .query('clientDocs')
      .withIndex('by_orgId', (q) => q.eq('orgId', orgId))
      .collect();
    for (const row of docs) {
      if (row.syncHiddenReason === 'gate' || row.syncHiddenReason === 'trashed') continue;
      await ctx.db.patch(row._id, stamp);
    }

    const contacts = await ctx.db
      .query('contacts')
      .withIndex('by_orgId', (q) => q.eq('orgId', orgId))
      .collect();
    for (const row of contacts) {
      if (row.role === 'Warehaus Staff') continue;
      if (row.syncHiddenReason === 'gate' || row.syncHiddenReason === 'trashed') {
        if (row.authUserId) authUserIds.push(row.authUserId);
        continue;
      }
      await ctx.db.patch(row._id, stamp);
      if (row.authUserId) authUserIds.push(row.authUserId);
    }

    return { authUserIds };
  },
});

export const hideProjectTasks = internalMutation({
  args: { projectId: v.id('projects') },
  handler: async (ctx, { projectId }) => {
    const project = await ctx.db.get(projectId);
    if (!project) return;
    const now = Date.now();
    const tasks = await ctx.db
      .query('tasks')
      .withIndex('by_orgId_projectId', (q) => q.eq('orgId', project.orgId).eq('projectId', projectId))
      .collect();
    for (const row of tasks) {
      if (row.syncHiddenReason === 'gate' || row.syncHiddenReason === 'trashed') continue;
      await ctx.db.patch(row._id, {
        syncHiddenAt: now,
        syncHiddenReason: 'ancestor' as const,
        lastSyncedAt: now,
      });
    }
  },
});

/** When a client is enabled again, reveal children that were hidden only because of it. */
export const clearAncestorHides = internalMutation({
  args: { orgId: v.id('clients') },
  handler: async (ctx, { orgId }) => {
    const tables = ['projects', 'tasks', 'sharedResources', 'clientDocs', 'contacts'] as const;
    for (const table of tables) {
      const rows = await ctx.db
        .query(table)
        .withIndex('by_orgId', (q) => q.eq('orgId', orgId))
        .collect();
      for (const row of rows) {
        if (row.syncHiddenReason !== 'ancestor') continue;
        await ctx.db.patch(row._id, { syncHiddenAt: undefined, syncHiddenReason: undefined });
      }
    }
  },
});

export const clearProjectTaskAncestors = internalMutation({
  args: { projectId: v.id('projects') },
  handler: async (ctx, { projectId }) => {
    const project = await ctx.db.get(projectId);
    if (!project) return;
    const tasks = await ctx.db
      .query('tasks')
      .withIndex('by_orgId_projectId', (q) => q.eq('orgId', project.orgId).eq('projectId', projectId))
      .collect();
    for (const row of tasks) {
      if (row.syncHiddenReason !== 'ancestor') continue;
      await ctx.db.patch(row._id, { syncHiddenAt: undefined, syncHiddenReason: undefined });
    }
  },
});

/**
 * Full-pull only: a page that was not returned by the live or archived query
 * is treated as trashed. Does not insert rows.
 */
export const hideUnseen = internalMutation({
  args: {
    table: syncedTable,
    seenNotionPageIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const seen = new Set(args.seenNotionPageIds);
    const now = Date.now();
    const stamp = {
      syncHiddenAt: now,
      syncHiddenReason: 'trashed' as const,
      lastSyncedAt: now,
    };
    let concealed = 0;
    const authUserIds: string[] = [];
    const clientIds: Id<'clients'>[] = [];
    const projectIds: Id<'projects'>[] = [];

    if (args.table === 'clients') {
      const rows = await ctx.db.query('clients').collect();
      for (const row of rows) {
        if (seen.has(row.notionPageId) || row.syncHiddenReason === 'trashed') continue;
        await ctx.db.patch(row._id, { ...stamp, portalAccess: 'Disabled' });
        concealed += 1;
        clientIds.push(row._id);
      }
      return { concealed, authUserIds, clientIds, projectIds };
    }

    if (args.table === 'contacts') {
      const rows = await ctx.db.query('contacts').collect();
      for (const row of rows) {
        if (seen.has(row.notionPageId) || row.syncHiddenReason === 'trashed') continue;
        if (row.role === 'Warehaus Staff') continue;
        await ctx.db.patch(row._id, { ...stamp, portalAccess: 'Disabled' as const });
        concealed += 1;
        if (row.authUserId) authUserIds.push(row.authUserId);
      }
      return { concealed, authUserIds, clientIds, projectIds };
    }

    if (args.table === 'projects') {
      const rows = await ctx.db.query('projects').collect();
      for (const row of rows) {
        if (seen.has(row.notionPageId) || row.syncHiddenReason === 'trashed') continue;
        await ctx.db.patch(row._id, stamp);
        concealed += 1;
        projectIds.push(row._id);
      }
      return { concealed, authUserIds, clientIds, projectIds };
    }

    if (args.table === 'tasks') {
      const rows = await ctx.db.query('tasks').collect();
      for (const row of rows) {
        if (seen.has(row.notionPageId) || row.syncHiddenReason === 'trashed') continue;
        await ctx.db.patch(row._id, stamp);
        concealed += 1;
      }
      return { concealed, authUserIds, clientIds, projectIds };
    }

    if (args.table === 'sharedResources') {
      const rows = await ctx.db.query('sharedResources').collect();
      for (const row of rows) {
        if (seen.has(row.notionPageId) || row.syncHiddenReason === 'trashed') continue;
        await ctx.db.patch(row._id, stamp);
        concealed += 1;
      }
      return { concealed, authUserIds, clientIds, projectIds };
    }

    const rows = await ctx.db.query('clientDocs').collect();
    for (const row of rows) {
      if (seen.has(row.notionPageId) || row.syncHiddenReason === 'trashed') continue;
      await ctx.db.patch(row._id, stamp);
      concealed += 1;
    }
    return { concealed, authUserIds, clientIds, projectIds };
  },
});

export const contactAuthUserId = internalQuery({
  args: { notionPageId: v.string() },
  handler: async (ctx, { notionPageId }) => {
    const row = await ctx.db
      .query('contacts')
      .withIndex('by_notionPageId', (q) => q.eq('notionPageId', notionPageId))
      .unique();
    return row?.authUserId ?? null;
  },
});
