/**
 * GitHub and Vercel webhooks. Signature checks happen before any read.
 * A delivery with no Portal-Task line reaches the mutation only when it is for
 * a `milestone/<slug>` branch. That one is matched to its milestone by branch.
 * Check and workflow events match an existing pull-request link by head sha.
 *
 * Claims are inserted in this mutation before any link or stage write.
 * Convex OCC retries the loser of a conflicting index read, and that retry
 * sees the claim. Lookups use .first() so a leftover duplicate cannot 5xx.
 */

import { takeRateLimit } from '@warehaus/portal-sync';
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
  inboundRepoMatches,
  deliveryClaimId,
  linkWriteAction,
  notionIdVariants,
  snapshotClaimId,
  stageMoveForMerge,
  type InboundItem,
  type MilestoneInbound,
  type WebhookDecision,
} from '../_lib/inboundWebhook';
import { changeMilestoneStatus } from '../_lib/milestoneLifecycle';
import { assertStaffPreviewLink } from '../_lib/previewLink';
import { processedSyncEventPatch } from '../_lib/syncEventRetention';
import { applyTaskChanges } from '../_lib/taskChange';

const itemValidator = v.object({
  notionPageId: v.string(),
  kind: v.union(v.literal('PR'), v.literal('deploy')),
  url: v.string(),
  state: v.string(),
  sha: v.string(),
  title: v.optional(v.string()),
  moveStage: v.boolean(),
});

const milestoneValidator = v.union(
  v.object({
    kind: v.literal('pull'),
    branch: v.string(),
    repo: v.string(),
    prUrl: v.string(),
    prNumber: v.number(),
    prTitle: v.optional(v.string()),
    sha: v.string(),
    merged: v.boolean(),
  }),
  v.object({
    kind: v.literal('deploy'),
    branch: v.string(),
    url: v.string(),
    sha: v.string(),
    repo: v.optional(v.string()),
  }),
);

type ApplyResult = {
  ok: true;
  wrote: boolean;
  /** True when a milestone was matched by its branch and something on it changed. */
  milestone?: boolean;
  /** True when this delivery moved the milestone to Shipped. */
  shipped?: boolean;
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
  milestone?: MilestoneInbound;
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

/**
 * What a delivery for a `milestone/<slug>` branch writes on that milestone.
 * A pull request stores its link, number, title and head commit. A merge into
 * the default branch moves Status to Shipped through the Status change (`changeMilestoneStatus`).
 * A finished Vercel build stores the branch preview. Every write is skipped
 * when the stored value already matches, so a replay changes nothing.
 */
async function applyMilestoneInbound(
  ctx: MutationCtx,
  inbound: MilestoneInbound,
  now: number,
): Promise<{ wrote: boolean; shipped: boolean }> {
  const milestone = await ctx.db
    .query('milestones')
    .withIndex('by_branch', (q) => q.eq('branch', inbound.branch))
    .first();
  if (!milestone) return { wrote: false, shipped: false };
  // The same branch name in another repository is not this milestone.
  const project = await ctx.db.get(milestone.projectId);
  if (!inboundRepoMatches(project?.agentRepo, inbound.repo)) return { wrote: false, shipped: false };

  if (inbound.kind === 'deploy') {
    const checked = assertStaffPreviewLink(inbound.url);
    if (!checked.ok) return { wrote: false, shipped: false };
    // An approved or shipped milestone keeps no preview.
    if (milestone.status === 'Shipped' || milestone.approval === 'approved') return { wrote: false, shipped: false };
    if (milestone.previewUrl === checked.href && milestone.previewCommit === inbound.sha) {
      return { wrote: false, shipped: false };
    }
    await ctx.db.patch(milestone._id, {
      previewUrl: checked.href,
      previewCommit: inbound.sha,
      previewBranch: inbound.branch,
      previewBuiltAt: now,
      ...(milestone.previewBuild ? { previewBuild: undefined } : {}),
    });
    await ctx.db.insert('agentEvents', {
      orgId: milestone.orgId,
      milestoneId: milestone._id,
      type: 'note',
      summary: `Vercel preview ready · ${inbound.sha.slice(0, 7)}`,
      key: `vercel:${inbound.sha}`,
      at: now,
    });
    return { wrote: true, shipped: false };
  }

  const patch: Record<string, unknown> = {};
  if (milestone.prUrl !== inbound.prUrl) patch.prUrl = inbound.prUrl;
  if (milestone.previewPrNumber !== inbound.prNumber) patch.previewPrNumber = inbound.prNumber;
  if (inbound.prTitle && milestone.previewPrTitle !== inbound.prTitle) patch.previewPrTitle = inbound.prTitle;
  if (milestone.previewBranch !== inbound.branch) patch.previewBranch = inbound.branch;
  if (milestone.previewCommit !== inbound.sha && milestone.status !== 'Shipped') patch.previewCommit = inbound.sha;

  if (Object.keys(patch).length > 0) await ctx.db.patch(milestone._id, patch);
  let shipped = false;
  if (inbound.merged) {
    // A merge ships only when every task that is not Parked is Done. The pull
    // request fields above are stored either way.
    const current = (await ctx.db.get(milestone._id)) ?? milestone;
    const moved = await changeMilestoneStatus(ctx, current, {
      cause: 'merge',
      actorName: 'GitHub',
      at: now,
      prUrl: inbound.prUrl,
      event: {
        type: 'note',
        summary: `Pull request #${inbound.prNumber} merged · milestone is Shipped`,
        key: `merged:${inbound.prNumber}`,
      },
    });
    shipped = moved.ok && moved.wrote && moved.status === 'Shipped';
  }
  if (Object.keys(patch).length === 0 && !shipped) return { wrote: false, shipped: false };
  return { wrote: true, shipped };
}

export const applyInbound = internalMutation({
  args: {
    source: v.union(v.literal('github'), v.literal('vercel')),
    deliveryId: v.optional(v.string()),
    contentKey: v.optional(v.string()),
    matchSha: v.optional(v.string()),
    checkState: v.optional(v.string()),
    milestone: v.optional(milestoneValidator),
    items: v.array(itemValidator),
  },
  handler: async (ctx, args): Promise<ApplyResult> => {
    const none: ApplyResult = { ok: true, wrote: false, links: 0, stageMoves: 0 };
    const items = args.items.slice(0, INBOUND_MAX_TASKS);
    const matchSha = args.matchSha?.trim().toLowerCase() ?? '';
    const checkState = args.checkState?.trim() ?? '';
    if (items.length === 0 && !matchSha && !args.milestone) return none;

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

    // The milestone branch is handled first and on its own. Task links below
    // still apply when the same delivery also names a Portal task.
    let milestoneWrote = false;
    let shipped = false;
    if (args.milestone) {
      const applied = await applyMilestoneInbound(ctx, args.milestone, now);
      milestoneWrote = applied.wrote;
      shipped = applied.shipped;
      if (items.length === 0) {
        if (!milestoneWrote) return none;
        const rate = await takeRate(ctx, now);
        if (!rate.ok) return { ...none, limited: true };
        await insertClaim(ctx, deliveryKey, now);
        await insertClaim(ctx, snapshotKey, now);
        await rememberRate(ctx, rate.row, rate.windowStartedAt, rate.windowCount, now);
        return { ok: true, wrote: true, milestone: true, ...(shipped ? { shipped: true } : {}), links: 0, stageMoves: 0 };
      }
    }
    const withMilestone = (result: ApplyResult): ApplyResult =>
      milestoneWrote ? { ...result, wrote: true, milestone: true, ...(shipped ? { shipped: true } : {}) } : result;

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

    if (matched === 0) return withMilestone({ ...none, unmatched: true });
    const writable = changes.filter((change) => !change.atCap);
    if (writable.length === 0) return withMilestone(none);

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
      if (!stage.ok || stage.stage !== MERGE_REVIEW_STAGE) continue;
      // Re-read: an earlier item in this delivery may have moved the same task.
      const current = await ctx.db.get(task._id);
      if (!current) continue;
      const moved = await applyTaskChanges(
        ctx,
        current,
        [{ field: 'stage', stage: stage.stage, pullRequestLink: item.url, allowReviewStage: true }],
        { actor: 'webhook', actorId: 'github-webhook', at: now },
      );
      if (moved.ok && moved.wrote) stageMoves += 1;
    }

    await rememberRate(ctx, rate.row, rate.windowStartedAt, rate.windowCount, now);
    return withMilestone({ ok: true, wrote: true, links, stageMoves });
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
    ...(plan.milestone ? { milestone: plan.milestone } : {}),
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
