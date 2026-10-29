import { isOrgVisibleToClients } from '@warehaus/portal-sync';
import { v } from 'convex/values';
import { adminQuery, clientQuery } from './_lib/wrappers';
import { searchCatalog, type SearchGroups } from './_lib/portalSearch';

const SEARCH_QUERY_MAX = 100;
/** Bound the staff table scan until a search index exists. Not a schema change. */
const STAFF_SCAN = 200;

function cappedQuery(q: string): string {
  return q.trim().slice(0, SEARCH_QUERY_MAX);
}

function emptyGroups(): SearchGroups {
  return { projects: [], tasks: [], docs: [], resources: [] };
}

/** Client search. Own org, published surface only. */
export const forClient = clientQuery({
  args: { q: v.string() },
  handler: async (ctx, args) => {
    const query = cappedQuery(args.q);
    if (!query) return emptyGroups();
    const org = await ctx.db.get(ctx.orgId);
    const orgVisible = isOrgVisibleToClients(org);
    const orgNames = org?.companyName ? { [ctx.orgId]: org.companyName } : {};
    const [projects, tasks, docs, resources] = await Promise.all([
      ctx.db.query('projects').withIndex('by_orgId', (row) => row.eq('orgId', ctx.orgId)).collect(),
      ctx.db.query('tasks').withIndex('by_orgId', (row) => row.eq('orgId', ctx.orgId)).collect(),
      ctx.db.query('clientDocs').withIndex('by_orgId', (row) => row.eq('orgId', ctx.orgId)).collect(),
      ctx.db.query('sharedResources').withIndex('by_orgId', (row) => row.eq('orgId', ctx.orgId)).collect(),
    ]);
    return searchCatalog({
      audience: 'client',
      query,
      orgId: ctx.orgId,
      orgVisible,
      orgNames,
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
    const query = cappedQuery(q);
    if (!query) return emptyGroups();
    const [projects, tasks, docs, resources] = await Promise.all([
      ctx.db.query('projects').order('desc').take(STAFF_SCAN),
      ctx.db.query('tasks').order('desc').take(STAFF_SCAN),
      ctx.db.query('clientDocs').order('desc').take(STAFF_SCAN),
      ctx.db.query('sharedResources').order('desc').take(STAFF_SCAN),
    ]);
    const orgNames: Record<string, string> = {};
    await Promise.all(
      [...new Set(projects.map((project) => project.orgId))].map(async (orgId) => {
        const org = await ctx.db.get(orgId);
        if (org?.companyName) orgNames[orgId] = org.companyName;
      }),
    );
    return searchCatalog({
      audience: 'staff',
      query,
      orgId: ctx.identity.orgId,
      orgVisible: true,
      orgNames,
      projects,
      tasks,
      docs,
      resources,
    });
  },
});
