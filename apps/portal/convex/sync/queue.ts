import { v } from 'convex/values';
import { internal } from '../_generated/api';
import { httpAction, internalMutation } from '../_generated/server';
import {
  SYNC_EVENT_RETENTION_MS,
  isExpiredProcessedSyncEvent,
  processedSyncEventPatch,
} from '../_lib/syncEventRetention';

/**
 * Dedupe + enqueue Notion webhook deliveries.
 * Returns whether this event should schedule a pull.
 */
export const enqueueWebhookEvent = internalMutation({
  args: {
    eventId: v.string(),
    payload: v.optional(v.string()),
  },
  handler: async (ctx, { eventId, payload }) => {
    const existing = await ctx.db
      .query('syncEvents')
      .withIndex('by_eventId', (q) => q.eq('eventId', eventId))
      .unique();
    if (existing) {
      return { scheduled: false as const, reason: 'duplicate' as const };
    }
    await ctx.db.insert('syncEvents', {
      eventId,
      receivedAt: Date.now(),
      status: 'queued',
      payload,
    });
    return { scheduled: true as const, reason: 'enqueued' as const };
  },
});

export const markWebhookProcessed = internalMutation({
  args: {
    eventId: v.string(),
    status: v.union(v.literal('done'), v.literal('error')),
    error: v.optional(v.string()),
  },
  handler: async (ctx, { eventId, status, error }) => {
    const row = await ctx.db
      .query('syncEvents')
      .withIndex('by_eventId', (q) => q.eq('eventId', eventId))
      .unique();
    if (!row) return;
    await ctx.db.patch(row._id, processedSyncEventPatch(status, Date.now(), error));
  },
});

const SYNC_EVENT_DELETE_BATCH = 200;

/**
 * Delete processed Notion webhook bookkeeping older than 30 days.
 * Only `syncEvents` rows with status done or error. Queued rows and every
 * other table are left alone.
 */
export const deleteExpiredSyncEvents = internalMutation({
  args: { nowMs: v.optional(v.number()) },
  handler: async (ctx, { nowMs }) => {
    const now = nowMs ?? Date.now();
    const cutoff = now - SYNC_EVENT_RETENTION_MS;
    const rows = await ctx.db
      .query('syncEvents')
      .withIndex('by_processedAt', (q) => q.lt('processedAt', cutoff))
      .take(SYNC_EVENT_DELETE_BATCH);
    let deleted = 0;
    for (const row of rows) {
      if (!isExpiredProcessedSyncEvent(row, now)) continue;
      await ctx.db.delete(row._id);
      deleted += 1;
    }
    return { deleted, scanned: rows.length };
  },
});

/** HTTP entry: Notion automation / webhook → enqueue → schedule pull. */
export const notionWebhook = httpAction(async (ctx, req) => {
  const secret = process.env.NOTION_WEBHOOK_SECRET?.trim();
  if (secret) {
    const header =
      req.headers.get('x-notion-signature') ||
      req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    if (header !== secret) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  // Notion URL verification challenge
  if (typeof body.challenge === 'string') {
    return new Response(JSON.stringify({ challenge: body.challenge }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const eventId =
    (typeof body.id === 'string' && body.id) ||
    (typeof body.event_id === 'string' && body.event_id) ||
    `evt_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  const result = await ctx.runMutation(internal.sync.queue.enqueueWebhookEvent, {
    eventId,
    payload: JSON.stringify(body).slice(0, 4000),
  });

  if (result.scheduled) {
    await ctx.scheduler.runAfter(0, internal.sync.pull.pullAll, { eventId });
  }

  return new Response(
    JSON.stringify({ received: true, eventId, ...result }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
});
