/**
 * Staff read model. One module for what staff can read and in what shape,
 * shared by the staff UI queries and the staff API (`/api/v1`, MCP).
 *
 * Concealment: rows on a concealed client (trash, archive, quarantine) are
 * left out everywhere staff read. Portal access Disabled does not conceal.
 * Unpublished rows stay, because staff can see drafts.
 *
 * Reads are indexed per staff-visible client, never a whole-table scan of
 * projects or tasks.
 */
import { taskKind } from './designGate';
import { clientIsStaffVisible } from '@warehaus/portal-sync';
import type { Doc, Id } from '../_generated/dataModel';
import type { QueryCtx } from '../_generated/server';
import { isPortalOwnedTask } from './milestoneTasks';

type ReadCtx = Pick<QueryCtx, 'db'>;

/** Per-query cache of which orgs staff may read. */
export function staffOrgs(ctx: ReadCtx) {
  const seen = new Map<Id<'clients'>, Doc<'clients'> | null>();
  const client = async (orgId: Id<'clients'>) => {
    if (!seen.has(orgId)) seen.set(orgId, await ctx.db.get(orgId));
    return seen.get(orgId) ?? null;
  };
  return {
    client,
    visible: async (orgId: Id<'clients'>) => clientIsStaffVisible(await client(orgId)),
  };
}

/** One-off check that staff may read rows on this org. */
export async function staffMayReadOrg(ctx: ReadCtx, orgId: Id<'clients'>): Promise<boolean> {
  return clientIsStaffVisible(await ctx.db.get(orgId));
}

/** Every client staff may read. The clients table is small and read whole. */
export async function staffVisibleClients(ctx: ReadCtx): Promise<Doc<'clients'>[]> {
  const clients = await ctx.db.query('clients').collect();
  return clients.filter((client) => clientIsStaffVisible(client));
}

/** Rows of one org-scoped table for the given clients, read by `by_orgId`. */
export async function staffRowsFor<T extends 'projects' | 'tasks'>(
  ctx: ReadCtx,
  table: T,
  clients: readonly Doc<'clients'>[],
): Promise<Doc<T>[]> {
  const out: Doc<T>[] = [];
  for (const client of clients) {
    const rows =
      table === 'projects'
        ? await ctx.db.query('projects').withIndex('by_orgId', (q) => q.eq('orgId', client._id)).collect()
        : await ctx.db.query('tasks').withIndex('by_orgId', (q) => q.eq('orgId', client._id)).collect();
    out.push(...(rows as unknown as Doc<T>[]));
  }
  return out;
}

export function staffClient(row: Doc<'clients'>) {
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

export function staffProject(row: Doc<'projects'>) {
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

/**
 * A task as the staff API shows it. A Portal-only task (`portalOwned: true`)
 * has no Notion page: its stored `portal-milestone:` / `portal-review:`
 * placeholder is not a Notion id, so `notionPageId` is null for it.
 */
export function staffTask(row: Doc<'tasks'>) {
  const portalOwned = isPortalOwnedTask(row);
  return {
    id: row._id,
    orgId: row.orgId,
    projectId: row.projectId,
    name: row.name,
    status: row.status,
    stage: row.stage ?? null,
    priority: row.priority ?? null,
    nextAction: row.nextAction ?? null,
    isDone: row.isDone,
    updatedAt: row.updatedAt ?? null,
    lastEditedTime: row.lastEditedTime ?? null,
    notionPageId: portalOwned ? null : row.notionPageId,
    source: row.source ?? null,
    portalOwned,
    publishToWarehaus: row.publishToWarehaus,
    milestoneId: row.milestoneId ?? null,
    kind: taskKind(row),
    description: row.description ?? null,
    fieldStamps: row.fieldStamps ?? null,
  };
}
