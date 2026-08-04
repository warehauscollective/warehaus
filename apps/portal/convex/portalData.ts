import { clientQuery } from './_lib/wrappers';
import { isStaff } from './_lib/identity';
import { isClientVisibleActivityType } from '@warehaus/portal-sync';

function isActivityVisible(type: string, staff: boolean): boolean {
  if (type === 'shipment') return false;
  if (staff) return true;
  return isClientVisibleActivityType(type);
}

/**
 * CLIENT-tier org snapshot for the signed-in portal UI.
 * Field set matches packages/portal-sync allowlist CLIENT columns only.
 * Staff see sync/exception activity; clients see project events only.
 */
export const getSnapshot = clientQuery({
  args: {},
  handler: async (ctx) => {
    const orgId = ctx.orgId;
    const staff = isStaff(ctx.identity);
    const client = await ctx.db.get(orgId);
    const projects = await ctx.db
      .query('projects')
      .withIndex('by_orgId', (q) => q.eq('orgId', orgId))
      .collect();
    const tasks = await ctx.db
      .query('tasks')
      .withIndex('by_orgId', (q) => q.eq('orgId', orgId))
      .collect();
    const activity = await ctx.db
      .query('activity')
      .withIndex('by_orgId_timestamp', (q) => q.eq('orgId', orgId))
      .order('desc')
      .take(50);
    const syncMeta = await ctx.db
      .query('syncMeta')
      .withIndex('by_key', (q) => q.eq('key', 'notion-pull'))
      .unique();

    const publishedProjects = projects
      .filter((p) => p.publishToWarehaus && !p.archive && !p.type.includes('Internal'))
      .sort((a, b) => {
        // Active / in-progress first, then highest progress, then name.
        const score = (p: (typeof projects)[number]) => {
          const s = p.status.toLowerCase();
          if (s.includes('progress')) return 3;
          if (s.includes('plan')) return 2;
          if (s.includes('inbox')) return 1;
          return 0;
        };
        const byStatus = score(b) - score(a);
        if (byStatus !== 0) return byStatus;
        return (b.progress ?? 0) - (a.progress ?? 0) || a.name.localeCompare(b.name);
      });
    const publishedProjectIds = new Set(publishedProjects.map((p) => p._id));
    const projectById = new Map(publishedProjects.map((p) => [p._id, p] as const));

    return {
      clients: client
        ? [
            {
              id: client._id,
              name: client.companyName,
              slug: client.slug,
            },
          ]
        : [],
      projects: publishedProjects.map((p) => ({
        id: p._id,
        name: p.name,
        description: p.description ?? null,
        status: p.status,
        progress: p.progress ?? null,
        startDate: p.startDate ?? null,
        endDate: p.endDate ?? null,
        liveUrl: p.liveUrl ?? null,
        figmaLink: p.figmaLink ?? null,
        docsUrl: p.docsUrl ?? null,
        stack: p.stack ?? [],
      })),
      tasks: tasks
        .filter((t) => t.publishToWarehaus && publishedProjectIds.has(t.projectId))
        .map((t) => {
          const project = projectById.get(t.projectId);
          return {
            id: t._id,
            name: t.name,
            status: t.status,
            isDone: t.isDone,
            date: t.date ?? null,
            projectId: t.projectId,
            projectName: project?.name ?? null,
            projectStatus: project?.status ?? null,
            projectEndDate: project?.endDate ?? null,
          };
        }),
      activity: activity
        .filter((a) => isActivityVisible(a.type, staff))
        .map((a) => ({
          id: a._id,
          name: a.name,
          type: a.type,
          summary: a.summary ?? '',
          timestamp: new Date(a.timestamp).toISOString(),
          tone: a.tone ?? 'muted',
          projectId: a.projectId ?? null,
        })),
      syncMeta: {
        lastSyncedAt: syncMeta?.lastSyncedAt
          ? new Date(syncMeta.lastSyncedAt).toISOString()
          : null,
        lastError: syncMeta?.lastError ?? null,
        mode: 'convex' as const,
      },
      tenant: {
        mode: staff ? ('team' as const) : ('client' as const),
        slug: client?.slug ?? null,
        clientExternalId: client?.externalId ?? client?._id ?? null,
        clientName: client?.companyName ?? null,
        ok: true as const,
      },
    };
  },
});

