import { adminQuery } from './_lib/wrappers';

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
      const publishedProjects = projects.filter(
        (p) => p.publishToWarehaus && !p.archive && !p.type.includes('Internal'),
      );

      const tasks = await ctx.db
        .query('tasks')
        .withIndex('by_orgId', (q) => q.eq('orgId', client._id))
        .collect();
      const openTaskCount = tasks.filter(
        (t) => t.publishToWarehaus && !t.isDone,
      ).length;

      const resources = await ctx.db
        .query('sharedResources')
        .withIndex('by_orgId', (q) => q.eq('orgId', client._id))
        .collect();
      const resourceCount = resources.filter(
        (r) => r.publishToWarehaus && !r.archive,
      ).length;

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

      out.push({
        id: client._id,
        name: client.companyName,
        slug: client.slug,
        status: client.status,
        portalAccess: client.portalAccess,
        projectCount: publishedProjects.length,
        openTaskCount,
        resourceCount,
        uploadNeedsReview,
        lastActivityAt: latestActivity[0]?.timestamp ?? null,
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
      if (client.portalAccess === 'Enabled') portalEnabled += 1;
      const projects = await ctx.db
        .query('projects')
        .withIndex('by_orgId', (q) => q.eq('orgId', client._id))
        .collect();
      projectCount += projects.filter(
        (p) => p.publishToWarehaus && !p.archive && !p.type.includes('Internal'),
      ).length;
      const tasks = await ctx.db
        .query('tasks')
        .withIndex('by_orgId', (q) => q.eq('orgId', client._id))
        .collect();
      openTaskCount += tasks.filter((t) => t.publishToWarehaus && !t.isDone).length;
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
