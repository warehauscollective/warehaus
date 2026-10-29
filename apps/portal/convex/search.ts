import { isOrgVisibleToClients } from '@warehaus/portal-sync';
import { v } from 'convex/values';
import { adminQuery, clientQuery } from './_lib/wrappers';
import { searchCatalog } from './_lib/portalSearch';

/** Client search. Own org, published surface only. */
export const forClient = clientQuery({
  args: { q: v.string() },
  handler: async (ctx, args) => {
    const org = await ctx.db.get(ctx.orgId);
    const orgVisible = isOrgVisibleToClients(org);
    const [projects, tasks, docs, resources] = await Promise.all([
      ctx.db.query('projects').withIndex('by_orgId', (row) => row.eq('orgId', ctx.orgId)).collect(),
      ctx.db.query('tasks').withIndex('by_orgId', (row) => row.eq('orgId', ctx.orgId)).collect(),
      ctx.db.query('clientDocs').withIndex('by_orgId', (row) => row.eq('orgId', ctx.orgId)).collect(),
      ctx.db.query('sharedResources').withIndex('by_orgId', (row) => row.eq('orgId', ctx.orgId)).collect(),
    ]);
    return searchCatalog({
      audience: 'client',
      query: args.q,
      orgId: ctx.orgId,
      orgVisible,
      projects,
      tasks,
      docs,
      resources,
    });
  },
});

/** Staff search across orgs, including unpublished rows. */
export const forStaff = adminQuery({
  args: { q: v.string() },
  handler: async (ctx, { q }) => {
    const [projects, tasks, docs, resources] = await Promise.all([
      ctx.db.query('projects').collect(),
      ctx.db.query('tasks').collect(),
      ctx.db.query('clientDocs').collect(),
      ctx.db.query('sharedResources').collect(),
    ]);
    return searchCatalog({
      audience: 'staff',
      query: q,
      orgId: ctx.identity.orgId,
      orgVisible: true,
      projects,
      tasks,
      docs,
      resources,
    });
  },
});
