import { isClientSurfaceVisible, toTaskPlatformView } from '@warehaus/portal-sync';
import { v } from 'convex/values';
import { isStaff } from './_lib/identity';
import { linearEnv, serveTasks } from './_lib/taskPlatformRead';
import { adminMutation, adminQuery, clientQuery } from './_lib/wrappers';

export type ClientDirectoryRow = {
  id: string;
  name: string;
  slug: string | null;
  status: string;
  portalAccess: 'Enabled' | 'Disabled';
  projectCount: number;
  openTaskCount: number;
  resourceCount: number;
  uploadNeedsReview: number;
  lastActivityAt: number | null;
  contactCount: number;
  awaitingGoCount: number;
  syncHidden: boolean;
  notionPageId: string;
  lastSyncedAt: number;
  internal: boolean;
};

/**
 * Staff cross-org directory with live counts (read-time aggregation).
 * Denormalised counters can replace this later if volume grows.
 */
export const listDirectory = adminQuery({
  args: {},
  handler: async (ctx): Promise<ClientDirectoryRow[]> => {
    const clients = await ctx.db.query('clients').collect();
    const out: ClientDirectoryRow[] = [];

    for (const client of clients) {
      const projects = await ctx.db
        .query('projects')
        .withIndex('by_orgId', (q) => q.eq('orgId', client._id))
        .collect();
      const staffProjects = projects.filter((p) => p.syncHiddenAt == null);

      const tasks = await ctx.db
        .query('tasks')
        .withIndex('by_orgId', (q) => q.eq('orgId', client._id))
        .collect();
      const openTasks = serveTasks(
        client.taskPlatform,
        tasks.filter((t) => t.syncHiddenAt == null && !t.isDone),
      );
      const openTaskCount = openTasks.length;
      const awaitingGoCount = openTasks.filter((t) => t.stage === 'Awaiting Go').length;

      const resources = await ctx.db
        .query('sharedResources')
        .withIndex('by_orgId', (q) => q.eq('orgId', client._id))
        .collect();
      const resourceCount = resources.filter((r) => r.syncHiddenAt == null && !r.archive).length;

      const uploads = await ctx.db
        .query('clientUploads')
        .withIndex('by_orgId', (q) => q.eq('orgId', client._id))
        .collect();
      const uploadNeedsReview = uploads.filter((u) => u.needsReview).length;

      const latestActivity = await ctx.db
        .query('activity')
        .withIndex('by_orgId_timestamp', (q) => q.eq('orgId', client._id))
        .order('desc')
        .take(1);

      const contacts = await ctx.db
        .query('contacts')
        .withIndex('by_orgId', (q) => q.eq('orgId', client._id))
        .collect();

      out.push({
        id: client._id,
        name: client.companyName,
        slug: client.slug,
        status: client.status,
        portalAccess: client.portalAccess,
        projectCount: staffProjects.length,
        openTaskCount,
        resourceCount,
        uploadNeedsReview,
        lastActivityAt: latestActivity[0]?.timestamp ?? null,
        contactCount: contacts.filter((c) => c.syncHiddenAt == null).length,
        awaitingGoCount,
        syncHidden: client.syncHiddenAt != null,
        notionPageId: client.notionPageId,
        lastSyncedAt: client.lastSyncedAt,
        internal:
          client.slug === 'warehaus' ||
          client.slug.startsWith('warehaus-') ||
          client.companyName.startsWith('Warehaus'),
      });
    }

    return out.sort((a, b) => a.name.localeCompare(b.name));
  },
});

/** Aggregate totals across all orgs for team dashboard / Account overview. */
export const getTeamStats = adminQuery({
  args: {},
  handler: async (ctx) => {
    const clients = await ctx.db.query('clients').collect();
    let projectCount = 0;
    let openTaskCount = 0;
    let uploadNeedsReview = 0;
    let portalEnabled = 0;

    for (const client of clients) {
      if (client.portalAccess === 'Enabled' && isClientSurfaceVisible(client)) portalEnabled += 1;
      const projects = await ctx.db
        .query('projects')
        .withIndex('by_orgId', (q) => q.eq('orgId', client._id))
        .collect();
      projectCount += projects.filter(
        (p) => isClientSurfaceVisible(p) && p.publishToWarehaus && !p.archive && !p.type.includes('Internal'),
      ).length;
      const tasks = await ctx.db
        .query('tasks')
        .withIndex('by_orgId', (q) => q.eq('orgId', client._id))
        .collect();
      openTaskCount += serveTasks(
        client.taskPlatform,
        tasks.filter((t) => isClientSurfaceVisible(t) && t.publishToWarehaus && !t.isDone),
      ).length;
      const uploads = await ctx.db
        .query('clientUploads')
        .withIndex('by_orgId', (q) => q.eq('orgId', client._id))
        .collect();
      uploadNeedsReview += uploads.filter((u) => u.needsReview).length;
    }

    return {
      clientCount: clients.length,
      portalEnabled,
      projectCount,
      openTaskCount,
      uploadNeedsReview,
    };
  },
});

/** Signed-in org. Clients can read the choice. Staff can read it for their own org too. */
export const getMyTaskPlatform = clientQuery({
  args: {},
  handler: async (ctx) => {
    const client = await ctx.db.get(ctx.orgId);
    return toTaskPlatformView({
      platform: client?.taskPlatform,
      tasks: [],
      canChange: isStaff(ctx.identity),
      env: linearEnv(),
    });
  },
});

/** Staff read for the client open in Account. */
export const getTaskPlatform = adminQuery({
  args: { orgId: v.id('clients') },
  handler: async (ctx, args) => {
    const client = await ctx.db.get(args.orgId);
    if (!client) throw new Error('Client not found');
    return toTaskPlatformView({
      platform: client.taskPlatform,
      tasks: [],
      canChange: true,
      env: linearEnv(),
    });
  },
});

/**
 * Staff set the platform on one client.
 * The patch is only `taskPlatform`. Task rows stay as they are.
 */
export const setTaskPlatform = adminMutation({
  args: {
    orgId: v.id('clients'),
    platform: v.union(v.literal('notion'), v.literal('linear')),
  },
  handler: async (ctx, args) => {
    const client = await ctx.db.get(args.orgId);
    if (!client) throw new Error('Client not found');
    await ctx.db.patch(args.orgId, { taskPlatform: args.platform });
    return { orgId: args.orgId, platform: args.platform };
  },
});
