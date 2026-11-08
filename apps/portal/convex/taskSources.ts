/**
 * Task-source config lookups. SERVER only: internal functions, never exposed
 * to clients. No row means Notion, so every existing project resolves to
 * `notion` until staff add a config.
 */

import {
  resolveTaskSourceConfig,
  type ResolvedTaskSourceConfig,
  type TaskSourceConfigRow,
} from '@warehaus/portal-sync';
import { v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import { internalQuery, type QueryCtx } from './_generated/server';

function toConfigRow(row: Doc<'taskSourceConfigs'>): TaskSourceConfigRow {
  return {
    id: row._id,
    projectId: row.projectId ?? null,
    source: row.source,
    syncDirection: row.syncDirection,
    enabled: row.enabled,
    credentialId: row.credentialId ?? null,
    linear: row.linear ?? null,
  };
}

/** Project override → client default → notion. */
export async function resolveTaskSourceForProject(
  ctx: QueryCtx,
  orgId: Id<'clients'>,
  projectId: Id<'projects'> | null,
): Promise<ResolvedTaskSourceConfig> {
  const clientRow = await ctx.db
    .query('taskSourceConfigs')
    .withIndex('by_orgId_projectId', (q) => q.eq('orgId', orgId).eq('projectId', undefined))
    .first();
  const projectRow = projectId
    ? await ctx.db
        .query('taskSourceConfigs')
        .withIndex('by_orgId_projectId', (q) => q.eq('orgId', orgId).eq('projectId', projectId))
        .first()
    : null;
  return resolveTaskSourceConfig({
    projectConfig: projectRow ? toConfigRow(projectRow) : null,
    clientConfig: clientRow ? toConfigRow(clientRow) : null,
  });
}

export const resolveForProject = internalQuery({
  args: {
    orgId: v.id('clients'),
    projectId: v.optional(v.id('projects')),
  },
  handler: async (ctx, { orgId, projectId }) =>
    resolveTaskSourceForProject(ctx, orgId, projectId ?? null),
});
