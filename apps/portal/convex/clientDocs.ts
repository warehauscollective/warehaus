import { clientMaySeeProject, compareDocsByOrder, isClientSurfaceVisible, isOrgVisibleToClients } from '@warehaus/portal-sync';
import { v } from 'convex/values';
import { adminQuery, clientQuery } from './_lib/wrappers';
import { PortalAuthError } from './_lib/identity';

/**
 * CLIENT serializer. Order, publish state, sync status, and notionPageId stay
 * on the staff payload. `updatedAt` is the display date only.
 */
function toClientDoc(row: {
  _id: string;
  orgId: string;
  projectId?: string;
  title: string;
  summary?: string;
  docType: string;
  body?: string;
  lastSyncedAt: number;
}) {
  return {
    id: row._id,
    orgId: row.orgId,
    projectId: row.projectId ?? null,
    title: row.title,
    summary: row.summary ?? null,
    docType: row.docType,
    body: row.body ?? null,
    updatedAt: row.lastSyncedAt,
  };
}

function projectVisibleToClient(
  project: {
    name: string;
    type: string[];
    publishToWarehaus: boolean;
    archive: boolean;
    syncHiddenAt?: number;
  } | null,
  orgVisible: boolean,
  projectId?: string | null,
): boolean {
  if (!project) return !projectId;
  return clientMaySeeProject({
    name: project.name,
    types: project.type,
    publishToWarehaus: project.publishToWarehaus,
    archive: project.archive,
    hidden: project.syncHiddenAt != null,
    orgVisible,
  });
}

export const listForClient = clientQuery({
  args: {},
  handler: async (ctx) => {
    const org = await ctx.db.get(ctx.orgId);
    const orgVisible = isOrgVisibleToClients(org);
    if (!orgVisible) return [];
    const rows = await ctx.db
      .query('clientDocs')
      .withIndex('by_orgId_status', (q) => q.eq('orgId', ctx.orgId).eq('status', 'Published'))
      .collect();

    const visible = [];
    for (const row of rows) {
      if (!isClientSurfaceVisible(row) || !row.publishToWarehaus) continue;
      const project = row.projectId ? await ctx.db.get(row.projectId) : null;
      if (!projectVisibleToClient(project, orgVisible, row.projectId)) continue;
      visible.push(row);
    }
    return visible.sort(compareDocsByOrder).map(toClientDoc);
  },
});

export const getForClient = clientQuery({
  args: { docId: v.id('clientDocs') },
  handler: async (ctx, { docId }) => {
    const row = await ctx.db.get(docId);
    const org = await ctx.db.get(ctx.orgId);
    const orgVisible = isOrgVisibleToClients(org);
    const project = row?.projectId ? await ctx.db.get(row.projectId) : null;
    if (
      !row ||
      !orgVisible ||
      !isClientSurfaceVisible(row) ||
      row.orgId !== ctx.orgId ||
      row.status !== 'Published' ||
      !row.publishToWarehaus ||
      !projectVisibleToClient(project, orgVisible, row?.projectId)
    ) {
      throw new PortalAuthError('Doc not found', 'FORBIDDEN');
    }
    return toClientDoc(row);
  },
});

/** Staff docs, including drafts. Filtered in the UI by client or project. */
export const listForStaff = adminQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query('clientDocs').collect();
    return rows
      .map((row) => ({
        ...toClientDoc(row),
        order: row.order ?? null,
        status: row.status,
        publishToWarehaus: row.publishToWarehaus,
        notionPageId: row.notionPageId,
        lastSyncedAt: row.lastSyncedAt,
        syncHidden: row.syncHiddenAt != null,
      }))
      .sort(compareDocsByOrder);
  },
});
