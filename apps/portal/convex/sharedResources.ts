import { clientMaySeeProject, clientMaySeeTask, isClientSurfaceVisible, isOrgVisibleToClients } from '@warehaus/portal-sync';
import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import type { QueryCtx } from './_generated/server';
import { adminQuery, clientQuery } from './_lib/wrappers';
import { PortalAuthError } from './_lib/identity';

async function attachmentLinks(ctx: QueryCtx, orgId: Id<'clients'>, resourceId: Id<'sharedResources'>) {
  return ctx.db
    .query('taskResources')
    .withIndex('by_orgId_resourceId', (q) => q.eq('orgId', orgId).eq('resourceId', resourceId))
    .collect();
}

/** Staff count: every link in the org, including hidden and unpublished tasks. */
async function attachmentCount(ctx: QueryCtx, orgId: Id<'clients'>, resourceId: Id<'sharedResources'>) {
  const links = await attachmentLinks(ctx, orgId, resourceId);
  return links.length;
}

/**
 * Client count: only links whose task the client may see, including that task's project gate.
 * A hidden or unpublished task must not change the number a client sees.
 */
async function clientAttachmentCount(
  ctx: QueryCtx,
  orgId: Id<'clients'>,
  resourceId: Id<'sharedResources'>,
  orgVisible: boolean,
) {
  const links = await attachmentLinks(ctx, orgId, resourceId);
  let count = 0;
  for (const link of links) {
    if (link.orgId !== orgId) continue;
    const linked = await ctx.db.get(link.taskId);
    if (!linked || linked.orgId !== orgId) continue;
    const project = linked.projectId ? await ctx.db.get(linked.projectId) : null;
    const visible = clientMaySeeTask({
      publishToWarehaus: linked.publishToWarehaus,
      hidden: linked.syncHiddenAt != null,
      project: {
        name: project?.name,
        types: project?.type,
        publishToWarehaus: project?.publishToWarehaus ?? false,
        archive: project?.archive ?? false,
        hidden: project?.syncHiddenAt != null,
        orgVisible,
      },
    });
    if (visible) count += 1;
  }
  return count;
}

/**
 * CLIENT serializer for Notion Shared Resources.
 * Never emit sourceNotionUrl — only Blob URL or curated URL field.
 * Client payloads use `updatedAt` (the sync time), matching docs, and omit `lastSyncedAt`.
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
    notionPageId: string;
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
    updatedAt: row.lastSyncedAt,
  };
}

function projectVisibleToClient(
  project: {
    name?: string | null;
    type?: string[] | null;
    publishToWarehaus?: boolean;
    archive?: boolean;
    syncHiddenAt?: number | null;
  } | null,
  orgVisible: boolean,
  projectId?: string | null,
): boolean {
  if (!project) return !projectId;
  return clientMaySeeProject({
    name: project.name,
    types: project.type,
    publishToWarehaus: project.publishToWarehaus ?? false,
    archive: project.archive ?? false,
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
      .query('sharedResources')
      .withIndex('by_orgId', (q) => q.eq('orgId', ctx.orgId))
      .collect();

    const published = rows.filter((r) => isClientSurfaceVisible(r) && r.publishToWarehaus && !r.archive);
    const out = [];
    for (const row of published) {
      const project = row.projectId ? await ctx.db.get(row.projectId) : null;
      if (!projectVisibleToClient(project, orgVisible, row.projectId)) continue;
      out.push(toClientResource(row, project?.name ?? null));
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const getForClient = clientQuery({
  args: { resourceId: v.id('sharedResources') },
  handler: async (ctx, { resourceId }) => {
    const row = await ctx.db.get(resourceId);
    const org = await ctx.db.get(ctx.orgId);
    const orgVisible = isOrgVisibleToClients(org);
    if (!row || row.orgId !== ctx.orgId || !orgVisible || !isClientSurfaceVisible(row) || !row.publishToWarehaus || row.archive) {
      throw new PortalAuthError('Resource not found', 'FORBIDDEN');
    }
    const project = row.projectId ? await ctx.db.get(row.projectId) : null;
    if (!projectVisibleToClient(project, orgVisible, row.projectId)) {
      throw new PortalAuthError('Resource not found', 'FORBIDDEN');
    }
    return toClientResource(row, project?.name ?? null);
  },
});

/** Staff resource list. Unpublished rows stay visible with a publish flag. */
export const listForStaff = adminQuery({
  args: {},
  handler: async (ctx) => {
    const clients = await ctx.db.query('clients').collect();
    const clientById = new Map(clients.map((c) => [c._id, c] as const));
    const rows = await ctx.db.query('sharedResources').collect();
    const out = [];
    for (const row of rows) {
      const project = row.projectId ? await ctx.db.get(row.projectId) : null;
      const client = clientById.get(row.orgId);
      out.push({
        ...toClientResource(row, project?.name ?? null),
        clientName: client?.companyName ?? null,
        externalId: row.externalId ?? null,
        publishToWarehaus: row.publishToWarehaus,
        notionPageId: row.notionPageId,
        lastSyncedAt: row.lastSyncedAt,
        syncHidden: row.syncHiddenAt != null,
      });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  },
});

/** Published resources linked to a task. Same gate as listForClient, one row at a time. */
export const listAttachedForClient = clientQuery({
  args: { taskId: v.id('tasks') },
  handler: async (ctx, { taskId }) => {
    const task = await ctx.db.get(taskId);
    const org = await ctx.db.get(ctx.orgId);
    const orgVisible = isOrgVisibleToClients(org);
    const project = task ? await ctx.db.get(task.projectId) : null;
    const visible =
      task &&
      task.orgId === ctx.orgId &&
      clientMaySeeTask({
        publishToWarehaus: task.publishToWarehaus,
        hidden: task.syncHiddenAt != null,
        project: {
          name: project?.name,
          types: project?.type,
          publishToWarehaus: project?.publishToWarehaus ?? false,
          archive: project?.archive ?? false,
          hidden: project?.syncHiddenAt != null,
          orgVisible,
        },
      });
    if (!visible || !task) return [];
    const links = await ctx.db
      .query('taskResources')
      .withIndex('by_orgId_taskId', (q) => q.eq('orgId', ctx.orgId).eq('taskId', task._id))
      .collect();
    const out = [];
    for (const link of links) {
      if (link.orgId !== task.orgId) continue;
      const row = await ctx.db.get(link.resourceId);
      if (!row || row.orgId !== task.orgId || row.archive || !row.publishToWarehaus || !isClientSurfaceVisible(row)) {
        continue;
      }
      const resourceProject = row.projectId ? await ctx.db.get(row.projectId) : null;
      if (!projectVisibleToClient(resourceProject, orgVisible, row.projectId)) continue;
      out.push({
        ...toClientResource(row, resourceProject?.name ?? null),
        attachedCount: await clientAttachmentCount(ctx, task.orgId, row._id, orgVisible),
      });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const listAttachedForStaff = adminQuery({
  args: { taskId: v.id('tasks') },
  handler: async (ctx, { taskId }) => {
    const task = await ctx.db.get(taskId);
    if (!task) return [];
    const links = await ctx.db
      .query('taskResources')
      .withIndex('by_orgId_taskId', (q) => q.eq('orgId', task.orgId).eq('taskId', task._id))
      .collect();
    const out = [];
    for (const link of links) {
      if (link.orgId !== task.orgId) continue;
      const row = await ctx.db.get(link.resourceId);
      if (!row || row.orgId !== task.orgId) continue;
      const project = row.projectId ? await ctx.db.get(row.projectId) : null;
      out.push({
        ...toClientResource(row, project?.name ?? null),
        publishToWarehaus: row.publishToWarehaus,
        notionPageId: row.notionPageId,
        lastSyncedAt: row.lastSyncedAt,
        attachedCount: await attachmentCount(ctx, task.orgId, row._id),
      });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  },
});

/** Staff-only. Tasks that link this resource. */
export const usedInTasks = adminQuery({
  args: { resourceId: v.id('sharedResources') },
  handler: async (ctx, { resourceId }) => {
    const resource = await ctx.db.get(resourceId);
    if (!resource) return [];
    const links = await ctx.db
      .query('taskResources')
      .withIndex('by_orgId_resourceId', (q) => q.eq('orgId', resource.orgId).eq('resourceId', resource._id))
      .collect();
    const out = [];
    for (const link of links) {
      if (link.orgId !== resource.orgId) continue;
      const task = await ctx.db.get(link.taskId);
      if (!task || task.orgId !== resource.orgId) continue;
      out.push({
        id: task._id,
        name: task.name,
        status: task.status,
        stage: task.stage ?? null,
        projectId: task.projectId,
      });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  },
});
