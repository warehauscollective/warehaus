import { v } from 'convex/values';
import { clientMutation, clientQuery } from './_lib/wrappers';
import { PortalAuthError } from './_lib/identity';
import type { Id } from './_generated/dataModel';

const responseType = v.union(
  v.literal('approve'),
  v.literal('request-change'),
  v.literal('comment'),
);

async function assertTaskInOrg(
  ctx: { db: { get: (id: Id<'tasks'>) => Promise<{ orgId: Id<'clients'>; publishToWarehaus: boolean } | null> } },
  orgId: Id<'clients'>,
  taskId: Id<'tasks'>,
) {
  const task = await ctx.db.get(taskId);
  if (!task || task.orgId !== orgId) {
    throw new PortalAuthError('Task not in session org', 'FORBIDDEN');
  }
  if (!task.publishToWarehaus) {
    throw new PortalAuthError('Task is not client-visible', 'FORBIDDEN');
  }
  return task;
}

/** List responses for a task (same org only). */
export const listForTask = clientQuery({
  args: { taskId: v.id('tasks') },
  handler: async (ctx, { taskId }) => {
    await assertTaskInOrg(ctx, ctx.orgId, taskId);
    const rows = await ctx.db
      .query('taskResponses')
      .withIndex('by_orgId_taskId', (q) => q.eq('orgId', ctx.orgId).eq('taskId', taskId))
      .collect();

    const sorted = [...rows].sort((a, b) => b.createdAt - a.createdAt);
    const out = [];
    for (const row of sorted) {
      const contact = await ctx.db.get(row.contactId);
      out.push({
        id: row._id,
        taskId: row.taskId,
        type: row.type,
        body: row.body ?? null,
        createdAt: row.createdAt,
        contactName: contact?.name ?? 'Client',
      });
    }
    return out;
  },
});

/**
 * Client-only write path for tasks: never mutates the task row / Notion.
 * Types: approve | request-change | comment.
 */
export const create = clientMutation({
  args: {
    taskId: v.id('tasks'),
    type: responseType,
    body: v.optional(v.string()),
  },
  handler: async (ctx, { taskId, type, body }) => {
    await assertTaskInOrg(ctx, ctx.orgId, taskId);

    const trimmed = body?.trim() ?? '';
    if (type === 'comment' && !trimmed) {
      throw new PortalAuthError('Comment requires a message', 'FORBIDDEN');
    }
    if (type === 'request-change' && !trimmed) {
      throw new PortalAuthError('Request change requires a reason', 'FORBIDDEN');
    }

    const id = await ctx.db.insert('taskResponses', {
      orgId: ctx.orgId,
      taskId,
      contactId: ctx.identity.contactId as Id<'contacts'>,
      type,
      body: trimmed || undefined,
      createdAt: Date.now(),
    });

    // Optional native activity breadcrumb (client-visible type = project)
    await ctx.db.insert('activity', {
      orgId: ctx.orgId,
      projectId: (await ctx.db.get(taskId))?.projectId,
      name:
        type === 'approve'
          ? 'Task approved'
          : type === 'request-change'
            ? 'Change requested'
            : 'Task comment',
      summary: trimmed || undefined,
      type: 'project',
      tone: type === 'approve' ? 'success' : type === 'request-change' ? 'warn' : 'muted',
      timestamp: Date.now(),
    });

    return { id };
  },
});
