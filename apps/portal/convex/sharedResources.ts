import { v } from 'convex/values';
import { clientQuery } from './_lib/wrappers';
import { PortalAuthError } from './_lib/identity';

/**
 * CLIENT serializer for Notion Shared Resources.
 * Never emit sourceNotionUrl — only Blob URL or curated URL field.
 */
function toClientResource(
  row: {
    _id: string;
    orgId: string;
    projectId?: string;
    title: string;
    description?: string;
    type?: string;
    url?: string;
    mimeType?: string;
    byteSize?: number;
    blobUrl?: string;
    externalId?: string;
    lastSyncedAt: number;
  },
  projectName: string | null,
) {
  const downloadUrl = row.blobUrl ?? row.url ?? null;
  return {
    id: row._id,
    orgId: row.orgId,
    projectId: row.projectId ?? null,
    projectName,
    name: row.title,
    description: row.description ?? null,
    type: row.type ?? null,
    /** Durable portal/Blob link — never a Notion S3 URL */
    url: downloadUrl,
    hasFile: Boolean(row.blobUrl || row.mimeType),
    mimeType: row.mimeType ?? null,
    byteSize: row.byteSize ?? null,
    externalId: row.externalId ?? null,
    lastSyncedAt: row.lastSyncedAt,
  };
}

export const listForClient = clientQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query('sharedResources')
      .withIndex('by_orgId', (q) => q.eq('orgId', ctx.orgId))
      .collect();

    const published = rows.filter((r) => r.publishToWarehaus && !r.archive);
    const out = [];
    for (const row of published) {
      const project = row.projectId ? await ctx.db.get(row.projectId) : null;
      out.push(toClientResource(row, project?.name ?? null));
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const getForClient = clientQuery({
  args: { resourceId: v.id('sharedResources') },
  handler: async (ctx, { resourceId }) => {
    const row = await ctx.db.get(resourceId);
    if (!row || row.orgId !== ctx.orgId || !row.publishToWarehaus || row.archive) {
      throw new PortalAuthError('Resource not found', 'FORBIDDEN');
    }
    const project = row.projectId ? await ctx.db.get(row.projectId) : null;
    return toClientResource(row, project?.name ?? null);
  },
});
