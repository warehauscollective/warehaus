/**
 * Runner app releases: CI publishes, the app and staff download (decision 0005).
 *
 *   POST /runner-app/upload-url  CI, with RUNNER_APP_PUBLISH_TOKEN: a one-time storage upload URL
 *   POST /runner-app/release     CI, with the same token: records the uploaded zip as the latest build
 *   POST /agent/app-release      the runner app, with its runner secret (agentHttp): the latest build
 *
 * Staff read the latest build with `latestDownload` for the Set up runner modal.
 * The token lives only in Convex env and GitHub secrets. It is never logged.
 */

import { v } from 'convex/values';
import { internal } from './_generated/api';
import type { QueryCtx } from './_generated/server';
import { httpAction, internalMutation, internalQuery } from './_generated/server';
import { timingSafeEqualUtf8 } from './_lib/constantTime';
import {
  parseRunnerAppRelease,
  RUNNER_APP_KEEP,
  RUNNER_APP_PRUNE_SCAN,
  RUNNER_APP_PUBLISH_PATHS,
  runnerAppPublishDecision,
  type RunnerAppReleaseView,
} from './_lib/runnerApp';
import { adminQuery } from './_lib/wrappers';

async function latestView(ctx: QueryCtx): Promise<RunnerAppReleaseView | null> {
  const row = await ctx.db.query('runnerAppReleases').withIndex('by_build').order('desc').first();
  if (!row) return null;
  const url = await ctx.storage.getUrl(row.storageId);
  if (!url) return null;
  return {
    version: row.version,
    build: row.build,
    sha256: row.sha256,
    size: row.size,
    minMacOS: row.minMacOS,
    publishedAt: row.publishedAt,
    url,
  };
}

/** For the runner app, through agentHttp after its secret is checked. */
export const latestForRunner = internalQuery({
  args: {},
  handler: async (ctx) => {
    const release = await latestView(ctx);
    return { ok: true as const, release };
  },
});

/** For the Set up runner modal. Staff only; clients have no query here. */
export const latestDownload = adminQuery({
  args: {},
  handler: async (ctx): Promise<RunnerAppReleaseView | null> => latestView(ctx),
});

export const recordRelease = internalMutation({
  args: {
    storageId: v.id('_storage'),
    version: v.string(),
    build: v.number(),
    sha256: v.string(),
    size: v.number(),
    minMacOS: v.string(),
  },
  handler: async (ctx, args) => {
    const latest = await ctx.db.query('runnerAppReleases').withIndex('by_build').order('desc').first();
    const decision = runnerAppPublishDecision(latest, args);
    if (decision === 'same') {
      // A retried publish: keep the stored zip, drop the duplicate upload.
      if (latest && latest.storageId !== args.storageId) await ctx.storage.delete(args.storageId);
      return { ok: true as const, duplicate: true, build: args.build };
    }
    if (decision === 'stale') {
      await ctx.storage.delete(args.storageId);
      return { ok: false as const, status: 409, error: `Build ${args.build} is not newer than build ${latest?.build}` };
    }
    await ctx.db.insert('runnerAppReleases', { ...args, publishedAt: Date.now() });
    const recent = await ctx.db.query('runnerAppReleases').withIndex('by_build').order('desc').take(RUNNER_APP_PRUNE_SCAN);
    for (const old of recent.slice(RUNNER_APP_KEEP)) {
      await ctx.storage.delete(old.storageId);
      await ctx.db.delete(old._id);
    }
    return { ok: true as const, duplicate: false, build: args.build };
  },
});

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/** True only for the publish token. An unset token refuses every call. */
export function publishAuthorized(header: string | null, token: string | undefined): boolean {
  const configured = (token ?? '').trim();
  const bearer = /^Bearer\s+(\S+)\s*$/.exec(header ?? '')?.[1] ?? '';
  const same = timingSafeEqualUtf8(bearer, configured || 'unset-runner-app-token');
  return configured.length >= 32 && bearer.length > 0 && same;
}

export const runnerAppPublishHttp = httpAction(async (ctx, request) => {
  if (!publishAuthorized(request.headers.get('authorization'), process.env.RUNNER_APP_PUBLISH_TOKEN)) {
    return json({ error: 'Unauthorized' }, 401);
  }
  const path = new URL(request.url).pathname;
  if (path === RUNNER_APP_PUBLISH_PATHS.uploadUrl) {
    return json({ uploadUrl: await ctx.storage.generateUploadUrl() }, 200);
  }
  if (path === RUNNER_APP_PUBLISH_PATHS.release) {
    let body: Record<string, unknown>;
    try {
      const parsed = (await request.json()) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return json({ error: 'Body must be a JSON object' }, 400);
      body = parsed as Record<string, unknown>;
    } catch {
      return json({ error: 'Body must be a JSON object' }, 400);
    }
    const parsed = parseRunnerAppRelease(body);
    const storageId = typeof body.storageId === 'string' ? body.storageId : '';
    if (!parsed.ok) return json({ error: parsed.reason }, 400);
    if (!storageId) return json({ error: 'storageId is required' }, 400);
    const result = await ctx.runMutation(internal.runnerApp.recordRelease, {
      storageId: storageId as never,
      ...parsed.release,
    });
    return result.ok ? json(result, 200) : json({ error: result.error }, result.status);
  }
  return json({ error: 'Not found' }, 404);
});
