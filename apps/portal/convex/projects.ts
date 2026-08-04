import { v } from 'convex/values';
import { clientQuery, adminQuery } from './_lib/wrappers';

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

/** List published projects for the caller's org. */
export const listForClient = clientQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query('projects')
      .withIndex('by_orgId', (q) => q.eq('orgId', ctx.orgId))
      .collect();

    return rows
      .filter((row) => row.publishToWarehaus && !row.archive && !row.type.includes('Internal'))
      .map(toClientProject);
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
