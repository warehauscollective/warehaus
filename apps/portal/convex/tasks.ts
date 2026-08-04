import { v } from 'convex/values';
import { clientQuery } from './_lib/wrappers';
import { PortalAuthError } from './_lib/identity';

/** CLIENT serializer — never emit Priority, Estimate, Owner, Description. */
function toClientTask(row: {
  _id: string;
  orgId: string;
  projectId: string;
  name: string;
  status: string;
  isDone: boolean;
  date?: string;
}) {
  return {
    id: row._id,
    orgId: row.orgId,
    projectId: row.projectId,
    name: row.name,
    status: row.status,
    isDone: row.isDone,
    date: row.date ?? null,
  };
}

export const listForClient = clientQuery({
  args: {},
  handler: async (ctx) => {
    const projects = await ctx.db
      .query('projects')
      .withIndex('by_orgId', (q) => q.eq('orgId', ctx.orgId))
      .collect();
    const publishedProjectIds = new Set(
      projects
        .filter((p) => p.publishToWarehaus && !p.archive && !p.type.includes('Internal'))
        .map((p) => p._id),
    );

    const rows = await ctx.db
      .query('tasks')
      .withIndex('by_orgId', (q) => q.eq('orgId', ctx.orgId))
      .collect();

    return rows
      .filter((t) => t.publishToWarehaus && publishedProjectIds.has(t.projectId))
      .map(toClientTask);
  },
});

export const getForClient = clientQuery({
  args: { taskId: v.id('tasks') },
  handler: async (ctx, { taskId }) => {
    const row = await ctx.db.get(taskId);
    if (!row || row.orgId !== ctx.orgId || !row.publishToWarehaus) {
      throw new PortalAuthError('Task not found', 'FORBIDDEN');
    }
    const project = await ctx.db.get(row.projectId);
    if (
      !project ||
      project.orgId !== ctx.orgId ||
      !project.publishToWarehaus ||
      project.archive ||
      project.type.includes('Internal')
    ) {
      throw new PortalAuthError('Task not found', 'FORBIDDEN');
    }
    return {
      ...toClientTask(row),
      projectName: project.name,
      projectStatus: project.status,
      projectEndDate: project.endDate ?? null,
    };
  },
});
