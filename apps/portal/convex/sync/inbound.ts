/**
 * GitHub and Vercel webhooks. Signature checks happen before any read.
 * A delivery with no Portal-Task line never reaches the mutation.
 * Check and workflow events match an existing pull-request link by head sha.
 *
 * Claims are inserted in this mutation before any link or stage write.
 * Convex OCC retries the loser of a conflicting index read, and that retry
 * sees the claim. Lookups use .first() so a leftover duplicate cannot 5xx.
 */

import { planTaskStageWrite, takeRateLimit } from '@warehaus/portal-sync';
import { v } from 'convex/values';
import { internal } from '../_generated/api';
import type { Doc } from '../_generated/dataModel';
import { httpAction, internalMutation, type MutationCtx } from '../_generated/server';
import {
  INBOUND_LINK_CAP,
  INBOUND_MAX_TASKS,
  INBOUND_RATE_KEY,
  INBOUND_RATE_LIMIT,
  INBOUND_RATE_WINDOW_MS,
  MERGE_REVIEW_STAGE,
  decideGitHubWebhook,
  decideVercelWebhook,
  deliveryClaimId,
  linkWriteAction,
  notionIdVariants,
  snapshotClaimId,
  stageMoveForMerge,
  type InboundItem,
  type WebhookDecision,
} from '../_lib/inboundWebhook';
import { processedSyncEventPatch } from '../_lib/syncEventRetention';

const itemValidator = v.object({
  notionPageId: v.string(),
  kind: v.union(v.literal('PR'), v.literal('deploy')),
  url: v.string(),
  state: v.string(),
  sha: v.string(),
  title: v.optional(v.string()),
  moveStage: v.boolean(),
});

type ApplyResult = {
  ok: true;
  wrote: boolean;
  duplicate?: boolean;
  unmatched?: boolean;
  limited?: boolean;
  links: number;
  stageMoves: number;
};

type ApplyArgs = {
  source: 'github' | 'vercel';
  deliveryId?: string;
  contentKey?: string;
  matchSha?: string;
  checkState?: string;
  items: InboundItem[];
};

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function findTask(ctx: MutationCtx, notionPageId: string): Promise<Doc<'tasks'> | null> {
  for (const id of notionIdVariants(notionPageId)) {
    const task = await ctx.db
      .query('tasks')
      .withIndex('by_notionPageId', (q) => q.eq('notionPageId', id))
      .first();
    if (task) return task;
  }
  return null;
}

async function existingClaim(ctx: MutationCtx, eventId: string): Promise<Doc<'syncEvents'> | null> {
  if (!eventId) return null;
  return ctx.db
    .query('syncEvents')
    .withIndex('by_eventId', (q) => q.eq('eventId', eventId))
    .first();
}

async function insertClaim(ctx: MutationCtx, eventId: string, now: number) {
  if (!eventId) return;
  await ctx.db.insert('syncEvents', {
    eventId,
    receivedAt: now,
    ...processedSyncEventPatch('done', now),
  });
}

async function takeRate(
  ctx: MutationCtx,
  now: number,
): Promise<{ ok: true; windowStartedAt: number; windowCount: number; row: Doc<'syncMeta'> | null } | { ok: false }> {
  const row = await ctx.db
    .query('syncMeta')
    .withIndex('by_key', (q) => q.eq('key', INBOUND_RATE_KEY))
    .first();
  let windowStartedAt = now;
  let windowCount = 0;
  if (row?.details) {
    try {
      const parsed = JSON.parse(row.details) as { windowStartedAt?: unknown; windowCount?: unknown };
      if (typeof parsed.windowStartedAt === 'number' && typeof parsed.windowCount === 'number') {
        windowStartedAt = parsed.windowStartedAt;
        windowCount = parsed.windowCount;
      }
    } catch {
      windowStartedAt = now;
      windowCount = 0;
    }
  }
  const rate = takeRateLimit({
    windowStartedAt,
    windowCount,
    limit: INBOUND_RATE_LIMIT,
    windowMs: INBOUND_RATE_WINDOW_MS,
    now,
  });
  if (!rate.ok) return { ok: false };
  return { ok: true, windowStartedAt: rate.windowStartedAt, windowCount: rate.windowCount, row };
}

async function rememberRate(
  ctx: MutationCtx,
  row: Doc<'syncMeta'> | null,
  windowStartedAt: number,
  windowCount: number,
  now: number,
) {
  const details = JSON.stringify({ windowStartedAt, windowCount });
  if (row) {
    await ctx.db.patch(row._id, { details, lastSyncedAt: now });
    return;
  }
  await ctx.db.insert('syncMeta', {
    key: INBOUND_RATE_KEY,
    details,
    lastSyncedAt: now,
  });
}

async function deleteOtherStageRows(ctx: MutationCtx, notionPageId: string, keepKey: string) {
  const rows = await ctx.db
    .query('notionOutbox')
    .withIndex('by_notionPageId', (q) => q.eq('notionPageId', notionPageId))
    .take(20);
  for (const row of rows) {
    if (row.kind !== 'task-stage') continue;
    if (row.status !== 'queued' && row.status !== 'failed') continue;
    if (row.idempotencyKey === keepKey) continue;
    await ctx.db.delete(row._id);
  }
}

async function linkForTaskUrl(
  ctx: MutationCtx,
  taskId: Doc<'tasks'>['_id'],
  url: string,
): Promise<Doc<'taskLinks'> | null> {
  return ctx.db
    .query('taskLinks')
    .withIndex('by_taskId_url', (q) => q.eq('taskId', taskId).eq('url', url))
    .first();
}

export const applyInbound = internalMutation({
  args: {
    source: v.union(v.literal('github'), v.literal('vercel')),
    deliveryId: v.optional(v.string()),
    contentKey: v.optional(v.string()),
    matchSha: v.optional(v.string()),
    checkState: v.optional(v.string()),
    items: v.array(itemValidator),
  },
  handler: async (ctx, args): Promise<ApplyResult> => {
    const none: ApplyResult = { ok: true, wrote: false, links: 0, stageMoves: 0 };
    const items = args.items.slice(0, INBOUND_MAX_TASKS);
    const matchSha = args.matchSha?.trim().toLowerCase() ?? '';
    const checkState = args.checkState?.trim() ?? '';
    if (items.length === 0 && !matchSha) return none;

    const deliveryKey = args.deliveryId?.trim()
      ? deliveryClaimId(args.source, args.deliveryId.trim())
      : '';
    const snapshotKey = args.contentKey?.trim()
      ? snapshotClaimId(args.source, args.contentKey.trim())
      : '';
    if (deliveryKey && (await existingClaim(ctx, deliveryKey))) return { ...none, duplicate: true };
    if (snapshotKey && (await existingClaim(ctx, snapshotKey))) return { ...none, duplicate: true };

    const now = Date.now();
    const addedBy = args.source === 'github' ? 'github-webhook' : 'vercel-webhook';

    if (matchSha) {
      if (!checkState) return none;
      const rows = await ctx.db
        .query('taskLinks')
        .withIndex('by_sha', (q) => q.eq('sha', matchSha))
        .take(INBOUND_MAX_TASKS);
      const writable = rows.filter((row) => {
        if (row.kind !== 'PR' || row.sha !== matchSha) return false;
        return linkWriteAction(row, { url: row.url, sha: matchSha, state: checkState }) === 'patch';
      });
      if (writable.length === 0) return none;
      const rate = await takeRate(ctx, now);
      if (!rate.ok) return { ...none, limited: true };
      await insertClaim(ctx, deliveryKey, now);
      await insertClaim(ctx, snapshotKey, now);
      for (const row of writable) {
        await ctx.db.patch(row._id, { state: checkState, updatedAt: now, addedBy });
      }
      await rememberRate(ctx, rate.row, rate.windowStartedAt, rate.windowCount, now);
      return { ok: true, wrote: true, links: writable.length, stageMoves: 0 };
    }

    let matched = 0;
    const changes: Array<{
      task: Doc<'tasks'>;
      item: InboundItem;
      existing: Doc<'taskLinks'> | null;
      atCap: boolean;
    }> = [];

    for (const item of items) {
      const task = await findTask(ctx, item.notionPageId);
      if (!task) continue;
      matched += 1;
      const existing = await linkForTaskUrl(ctx, task._id, item.url);
      if (existing && existing.kind !== item.kind) continue;
      const action = linkWriteAction(existing, item);
      if (action === 'noop') continue;
      let atCap = false;
      if (action === 'insert') {
        const held = await ctx.db
          .query('taskLinks')
          .withIndex('by_taskId', (q) => q.eq('taskId', task._id))
          .take(INBOUND_LINK_CAP);
        atCap = held.length >= INBOUND_LINK_CAP;
      }
      changes.push({ task, item, existing, atCap });
    }

    if (matched === 0) return { ...none, unmatched: true };
    const writable = changes.filter((change) => !change.atCap);
    if (writable.length === 0) return none;

    const rate = await takeRate(ctx, now);
    if (!rate.ok) return { ...none, limited: true };

    await insertClaim(ctx, deliveryKey, now);
    await insertClaim(ctx, snapshotKey, now);

    let links = 0;
    let stageMoves = 0;
    for (const change of writable) {
      const { task, item, existing } = change;
      if (existing) {
        await ctx.db.patch(existing._id, {
          state: item.state,
          sha: item.sha,
          updatedAt: now,
          addedBy,
          ...(item.title ? { title: item.title } : {}),
        });
      } else {
        await ctx.db.insert('taskLinks', {
          orgId: task.orgId,
          taskId: task._id,
          kind: item.kind,
          url: item.url,
          ...(item.title ? { title: item.title } : {}),
          addedBy,
          createdAt: now,
          state: item.state,
          sha: item.sha,
          updatedAt: now,
        });
      }
      links += 1;

      const wantStage = item.kind === 'PR' && item.moveStage;
      const stage = stageMoveForMerge({
        moveStage: wantStage,
        status: task.status,
        isDone: task.isDone,
        stage: task.stage,
        stamp: task.fieldStamps?.stage ?? null,
        lastEditedTime: task.lastEditedTime,
        now,
      });
      if (!stage.ok) continue;
      const edited = task.lastEditedTime?.trim() ?? '';
      const planned = planTaskStageWrite({
        actor: 'staff',
        stage: stage.stage,
        pullRequestLink: item.url,
        notionPageId: task.notionPageId,
        expectedLastEditedTime: edited,
      });
      if (!planned.ok) continue;
      if ('Status' in planned.properties || planned.properties.Stage !== MERGE_REVIEW_STAGE) continue;
      const queued = await ctx.runMutation(internal.sync.outbox.enqueue, {
        idempotencyKey: planned.idempotencyKey,
        kind: 'task-stage',
        orgId: task.orgId,
        database: 'tasks',
        notionPageId: task.notionPageId,
        expectedLastEditedTime: edited,
        payload: JSON.stringify({ properties: planned.properties }),
        actor: 'staff',
        actorId: 'github-webhook',
        schedule: true,
      });
      if (!queued.ok) continue;
      await deleteOtherStageRows(ctx, task.notionPageId, planned.idempotencyKey);
      const alreadyPending = typeof task.stagePendingAt === 'number';
      const currentStage = typeof task.stage === 'string' && task.stage.trim() ? task.stage : null;
      await ctx.db.patch(task._id, {
        stage: MERGE_REVIEW_STAGE,
        stagePendingAt: alreadyPending ? task.stagePendingAt : now,
        stagePendingBaseEditedTime: edited,
        ...(alreadyPending ? {} : { stageSynced: currentStage }),
        stagePendingPullRequest: item.url,
        fieldStamps: {
          ...(task.fieldStamps ?? {}),
          stage: stage.stamp,
        },
      });
      stageMoves += 1;
    }

    await rememberRate(ctx, rate.row, rate.windowStartedAt, rate.windowCount, now);
    return { ok: true, wrote: true, links, stageMoves };
  },
});

async function finish(
  decision: WebhookDecision,
  run: (args: ApplyArgs) => Promise<ApplyResult>,
): Promise<Response> {
  if (!decision.ok) {
    if (decision.status === 413) return json({ error: 'payload_too_large' }, 413);
    return json({ error: 'unauthorized' }, 401);
  }
  if (decision.plan.action === 'ignore') return json({ ok: true, ignored: decision.plan.reason });
  const plan = decision.plan;
  const result = await run({
    source: plan.source,
    ...(plan.deliveryId ? { deliveryId: plan.deliveryId } : {}),
    ...(plan.contentKey ? { contentKey: plan.contentKey } : {}),
    ...(plan.matchSha ? { matchSha: plan.matchSha } : {}),
    ...(plan.checkState ? { checkState: plan.checkState } : {}),
    items: plan.items,
  });
  if (result.limited) return json({ error: 'rate_limited' }, 429);
  return json(result);
}

export const githubWebhook = httpAction(async (ctx, req) => {
  try {
    const rawBody = await req.text();
    const decision = await decideGitHubWebhook({
      rawBody,
      signatureHeader: req.headers.get('x-hub-signature-256'),
      eventHeader: req.headers.get('x-github-event'),
      deliveryHeader: req.headers.get('x-github-delivery'),
      contentLength: req.headers.get('content-length'),
      secret: process.env.GITHUB_WEBHOOK_SECRET,
    });
    return await finish(decision, (args) => ctx.runMutation(internal.sync.inbound.applyInbound, args));
  } catch {
    console.error('[inbound-webhook] github failed');
    return json({ error: 'internal' }, 500);
  }
});

export const vercelWebhook = httpAction(async (ctx, req) => {
  try {
    const rawBody = await req.text();
    const decision = await decideVercelWebhook({
      rawBody,
      signatureHeader: req.headers.get('x-vercel-signature'),
      contentLength: req.headers.get('content-length'),
      secret: process.env.VERCEL_WEBHOOK_SECRET,
    });
    return await finish(decision, (args) => ctx.runMutation(internal.sync.inbound.applyInbound, args));
  } catch {
    console.error('[inbound-webhook] vercel failed');
    return json({ error: 'internal' }, 500);
  }
});
