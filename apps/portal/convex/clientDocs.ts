import { v } from 'convex/values';
import { clientQuery } from './_lib/wrappers';
import { PortalAuthError } from './_lib/identity';

/** CLIENT serializer — never leak Notion hosts or draft rows. */
function toClientDoc(row: {
  _id: string;
  orgId: string;
  projectId?: string;
  title: string;
  summary?: string;
  docType: string;
  order?: number;
  body?: string;
  status: string;
}) {
  return {
    id: row._id,
    orgId: row.orgId,
    projectId: row.projectId ?? null,
    title: row.title,
    summary: row.summary ?? null,
    docType: row.docType,
    order: row.order ?? null,
    body: row.body ?? null,
  };
}

export const listForClient = clientQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query('clientDocs')
      .withIndex('by_orgId_status', (q) => q.eq('orgId', ctx.orgId).eq('status', 'Published'))
      .collect();

    return rows
      .filter((r) => r.publishToWarehaus)
      .sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || a.title.localeCompare(b.title))
      .map(toClientDoc);
  },
});

export const getForClient = clientQuery({
  args: { docId: v.id('clientDocs') },
  handler: async (ctx, { docId }) => {
    const row = await ctx.db.get(docId);
    if (
      !row ||
      row.orgId !== ctx.orgId ||
      row.status !== 'Published' ||
      !row.publishToWarehaus
    ) {
      throw new PortalAuthError('Doc not found', 'FORBIDDEN');
    }
    return toClientDoc(row);
  },
});
