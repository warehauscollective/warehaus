/**
 * B1 calls this internal mutation from an adminMutation.
 * Staff-only: the public wrapper must be adminMutation, and this enqueue
 * records actor staff. It does not change the task row and it does not call Notion.
 * The outbox worker does that after the row is queued.
 */

import {
  taskStatusIdempotencyKey,
  validateTaskStatusUpdate,
} from '@warehaus/portal-sync';
import { v } from 'convex/values';
import { internal } from '../_generated/api';
import type { Id } from '../_generated/dataModel';
import { internalMutation } from '../_generated/server';

type EnqueueStatusResult =
  | { ok: false; error: string }
  | { ok: true; outboxId: Id<'notionOutbox'>; duplicate: boolean };

export const enqueueStatus = internalMutation({
  args: {
    taskId: v.id('tasks'),
    status: v.string(),
    expectedLastEditedTime: v.string(),
    idempotencyKey: v.optional(v.string()),
    actorId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<EnqueueStatusResult> => {
    const validated = validateTaskStatusUpdate(args.status);
    if (!validated.ok) return { ok: false as const, error: validated.errors.join('; ') };
    if (!args.expectedLastEditedTime) {
      return { ok: false as const, error: 'Updates require the last read time' };
    }

    const task = await ctx.db.get(args.taskId);
    if (!task) return { ok: false as const, error: 'Task not found' };

    const idempotencyKey =
      args.idempotencyKey ??
      taskStatusIdempotencyKey(task.notionPageId, args.status, args.expectedLastEditedTime);

    return ctx.runMutation(internal.sync.outbox.enqueue, {
      idempotencyKey,
      kind: 'task-status',
      orgId: task.orgId,
      database: 'tasks',
      notionPageId: task.notionPageId,
      expectedLastEditedTime: args.expectedLastEditedTime,
      payload: JSON.stringify({ properties: { Status: args.status } }),
      actor: 'staff' as const,
      actorId: args.actorId,
      schedule: true,
    });
  },
});
