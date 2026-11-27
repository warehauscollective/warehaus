/**
 * Deploy to main (ADR-0009). Staff see how many Shipped milestones are not
 * deployed yet; Peter starts a deploy run. The Portal never deploys: it starts
 * the GitHub deploy workflow, and the workflow reports each step to
 * `DEPLOY_RUN_PATH`. Convex holds a token that can start workflows and read
 * commits, never one that can write to the repository or deploy.
 */

import { v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { httpAction, internalAction, internalMutation, internalQuery } from './_generated/server';
import { internal } from './_generated/api';
import { closeAsk, openAsk } from './_lib/askStore';
import {
  DEPLOY_CHECK_MIN_MS,
  DEPLOY_DID_NOT_START,
  DEPLOY_GITHUB_TOKEN_ENV,
  DEPLOY_NO_REPORT,
  DEPLOY_NO_TARGET,
  DEPLOY_NOT_SET_UP,
  DEPLOY_NOTHING,
  DEPLOY_ONLY_PETER,
  DEPLOY_REPORT_SECRET_ENV,
  DEPLOY_RUN_TIMEOUT_MS,
  DEPLOY_SETTLE_MS,
  DEPLOY_RUNNING,
  DEPLOY_STALE,
  applyDeployReport,
  cleanCommitSha,
  deployFailureLine,
  deployMark,
  deployRunActive,
  deployTargetFor,
  isDeployReportEvent,
  isDeployStep,
  mainIsAhead,
  readCompare,
  shortSha,
  type DeployCommit,
  type DeployStep,
  type DeploySummary,
  type DeployTarget,
} from './_lib/deploy';
import { isPeterEmail } from './_lib/milestoneReview';
import { authorizeReviewPreview } from './_lib/reviewPreview';
import { adminMutation, adminQuery } from './_lib/wrappers';

type Outcome<T = object> = ({ ok: true } & T) | { ok: false; error: string };

function envSet(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}

/** Both secrets are in place, so a run can start and report back. */
function deploySetUp(): boolean {
  return envSet(DEPLOY_GITHUB_TOKEN_ENV) && envSet(DEPLOY_REPORT_SECRET_ENV);
}

function isPeter(identity: { role: string; email: string }): boolean {
  return identity.role === 'Warehaus Staff' && isPeterEmail(identity.email);
}

function deployedCommitOf(project: Doc<'projects'>, target: DeployTarget): string {
  return project.deployedCommit ?? target.baselineCommit;
}

async function latestRun(ctx: QueryCtx, projectId: Id<'projects'>): Promise<Doc<'deployRuns'> | null> {
  return ctx.db
    .query('deployRuns')
    .withIndex('by_projectId', (q) => q.eq('projectId', projectId))
    .order('desc')
    .first();
}

/** The project's milestone that owns a pull request number, if any. */
async function milestoneForPull(ctx: QueryCtx, projectId: Id<'projects'>, pr: number): Promise<Doc<'milestones'> | null> {
  const rows = await ctx.db
    .query('milestones')
    .withIndex('by_previewPrNumber', (q) => q.eq('previewPrNumber', pr))
    .take(4);
  return rows.find((row) => row.projectId === projectId && row.archivedAt == null) ?? null;
}

/** Splits the commits waiting on `main` into the milestones they merged and the rest. */
async function splitPending(
  ctx: QueryCtx,
  projectId: Id<'projects'>,
  commits: readonly DeployCommit[],
): Promise<{ milestones: Doc<'milestones'>[]; loose: DeployCommit[] }> {
  const milestones: Doc<'milestones'>[] = [];
  const loose: DeployCommit[] = [];
  const seen = new Set<string>();
  for (const commit of commits) {
    const milestone = commit.pr != null ? await milestoneForPull(ctx, projectId, commit.pr) : null;
    if (!milestone) {
      loose.push(commit);
      continue;
    }
    if (seen.has(milestone._id)) continue;
    seen.add(milestone._id);
    milestones.push(milestone);
  }
  return { milestones, loose };
}

/**
 * The counter and the confirm list for one project. Null when the project has
 * no deploy set up. Staff only.
 */
export const summary = adminQuery({
  args: { projectId: v.id('projects') },
  handler: async (ctx, args): Promise<DeploySummary | null> => {
    const project = await ctx.db.get(args.projectId);
    if (!project) return null;
    const target = deployTargetFor(project.agentRepo);
    if (!target) return null;
    const deployed = deployedCommitOf(project, target);
    const pending = project.deployPending ?? null;
    const ahead = mainIsAhead(pending, deployed);
    const split = ahead && pending ? await splitPending(ctx, project._id, pending.commits) : { milestones: [], loose: [] };
    const waitingIds = new Set<string>(split.milestones.map((row) => row._id));
    const all = await ctx.db
      .query('milestones')
      .withIndex('by_projectId', (q) => q.eq('projectId', project._id))
      .collect();
    for (const row of all) {
      if (row.archivedAt == null && deployMark(row) === 'not-deployed') waitingIds.add(row._id);
    }
    const run = await latestRun(ctx, project._id);
    const shown = run && run.status !== 'done' ? run : null;
    return {
      setUp: deploySetUp(),
      isPeter: isPeter(ctx.identity),
      deployed: shortSha(deployed),
      waiting: waitingIds.size,
      ahead,
      sha: ahead && pending ? pending.sha : null,
      milestones: split.milestones.map((row) => ({ id: row._id, name: row.name, mergedAt: row.mergedAt ?? null })),
      loose: split.loose.map((commit) => ({ sha: shortSha(commit.sha), title: commit.title })),
      commitTotal: ahead && pending ? pending.total : 0,
      run: shown
        ? {
            id: shown._id,
            status: shown.status === 'done' ? 'running' : shown.status,
            step: shown.step ?? null,
            convexDone: shown.convexDone === true,
            sha: shortSha(shown.sha),
            milestoneCount: shown.milestoneIds.length,
            failure: shown.status === 'failed' ? deployFailureLine(shown.step, shown.convexDone === true) : null,
            workflowUrl: shown.workflowUrl ?? null,
          }
        : null,
    };
  },
});

/**
 * Asks GitHub what `main` holds that production does not. Any staff member
 * may ask; the read is skipped when one ran in the last minute.
 */
export const check = adminMutation({
  args: { projectId: v.id('projects') },
  handler: async (ctx, args): Promise<Outcome<{ started: boolean }>> => {
    const project = await ctx.db.get(args.projectId);
    if (!project || !deployTargetFor(project.agentRepo)) return { ok: false, error: DEPLOY_NO_TARGET };
    if (!envSet(DEPLOY_GITHUB_TOKEN_ENV)) return { ok: true, started: false };
    const last = project.deployPending?.checkedAt ?? 0;
    if (Date.now() - last < DEPLOY_CHECK_MIN_MS) return { ok: true, started: false };
    await ctx.scheduler.runAfter(0, internal.deploys.refreshMain, { projectId: project._id });
    return { ok: true, started: true };
  },
});

export const deployContext = internalQuery({
  args: { projectId: v.id('projects') },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) return null;
    const target = deployTargetFor(project.agentRepo);
    if (!target) return null;
    return { repo: target.repo, workflow: target.workflow, deployed: deployedCommitOf(project, target) };
  },
});

function githubHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

/** One GitHub compare of the deployed commit with `main`. A failed read writes nothing. */
export const refreshMain = internalAction({
  args: { projectId: v.id('projects') },
  handler: async (ctx, args): Promise<{ ok: boolean }> => {
    const token = process.env[DEPLOY_GITHUB_TOKEN_ENV]?.trim();
    if (!token) return { ok: false };
    const context = await ctx.runQuery(internal.deploys.deployContext, { projectId: args.projectId });
    if (!context) return { ok: false };
    const askedAt = Date.now();
    let body: unknown;
    try {
      const response = await fetch(
        `https://api.github.com/repos/${context.repo}/compare/${context.deployed}...main?per_page=100`,
        { headers: githubHeaders(token), signal: AbortSignal.timeout(10000) },
      );
      if (!response.ok) return { ok: false };
      body = await response.json();
    } catch {
      return { ok: false };
    }
    const compare = readCompare(body);
    if (!compare) return { ok: false };
    const head = compare.commits[compare.commits.length - 1]?.sha ?? context.deployed;
    await ctx.runMutation(internal.deploys.storePending, {
      projectId: args.projectId,
      deployed: context.deployed,
      sha: head,
      total: compare.total,
      commits: compare.commits,
      askedAt,
    });
    return { ok: true };
  },
});

export const storePending = internalMutation({
  args: {
    projectId: v.id('projects'),
    /** The deployed commit the compare started from. A deploy that finished meanwhile makes it stale. */
    deployed: v.string(),
    sha: v.string(),
    total: v.number(),
    commits: v.array(v.object({ sha: v.string(), title: v.string(), pr: v.optional(v.number()) })),
    /** When GitHub was asked. Merges recorded after this are not judged by this compare. */
    askedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) return { wrote: false };
    const target = deployTargetFor(project.agentRepo);
    if (!target || deployedCommitOf(project, target) !== args.deployed) return { wrote: false };
    const same = project.deployPending?.sha === args.sha && project.deployPending.total === args.total;
    await ctx.db.patch(project._id, {
      deployPending: {
        sha: args.sha,
        total: args.total,
        commits: same && project.deployPending ? project.deployPending.commits : args.commits,
        checkedAt: Date.now(),
      },
    });
    // A merged milestone the compare does not list is already in production: it was
    // merged by hand or went out with a commit that named no pull request.
    if (project.deployedAt != null && args.total <= args.commits.length) {
      const listed = new Set(args.commits.map((commit) => commit.pr).filter((pr): pr is number => pr != null));
      const rows = await ctx.db
        .query('milestones')
        .withIndex('by_projectId', (q) => q.eq('projectId', project._id))
        .collect();
      for (const row of rows) {
        if (deployMark(row) !== 'not-deployed' || row.mergedAt == null) continue;
        if (row.mergedAt + DEPLOY_SETTLE_MS > args.askedAt) continue;
        if (row.previewPrNumber != null && listed.has(row.previewPrNumber)) continue;
        await ctx.db.patch(row._id, { deployFinishedAt: project.deployedAt });
      }
    }
    return { wrote: true };
  },
});

/**
 * Starts a deploy run. Peter only. `sha` is the `main` commit his confirm
 * step listed; if `main` has moved since, the run is refused so he never
 * deploys something the list did not show.
 */
export const start = adminMutation({
  args: { projectId: v.id('projects'), sha: v.string() },
  handler: async (ctx, args): Promise<Outcome<{ runId: Id<'deployRuns'> }>> => {
    if (!isPeter(ctx.identity)) return { ok: false, error: DEPLOY_ONLY_PETER };
    const project = await ctx.db.get(args.projectId);
    const target = project ? deployTargetFor(project.agentRepo) : null;
    if (!project || !target) return { ok: false, error: DEPLOY_NO_TARGET };
    if (!deploySetUp()) return { ok: false, error: DEPLOY_NOT_SET_UP };
    const last = await latestRun(ctx, project._id);
    if (last && deployRunActive(last.status)) return { ok: false, error: DEPLOY_RUNNING };
    const pending = project.deployPending ?? null;
    if (!mainIsAhead(pending, deployedCommitOf(project, target)) || !pending) return { ok: false, error: DEPLOY_NOTHING };
    if (pending.sha !== cleanCommitSha(args.sha)) return { ok: false, error: DEPLOY_STALE };
    const split = await splitPending(ctx, project._id, pending.commits);
    const now = Date.now();
    const runId = await ctx.db.insert('deployRuns', {
      orgId: project.orgId,
      projectId: project._id,
      sha: pending.sha,
      status: 'starting',
      step: 'dispatch',
      startedBy: ctx.identity.contactId as Id<'contacts'>,
      startedAt: now,
      attempt: 1,
      milestoneIds: split.milestones.map((row) => row._id),
      looseCount: Math.max(0, pending.total - split.milestones.length),
    });
    await ctx.scheduler.runAfter(0, internal.deploys.dispatch, { runId });
    await ctx.scheduler.runAfter(DEPLOY_RUN_TIMEOUT_MS, internal.deploys.expire, { runId, attempt: 1 });
    return { ok: true, runId };
  },
});

/** Runs a failed deploy again from the same commit. Peter only. */
export const retry = adminMutation({
  args: { runId: v.id('deployRuns') },
  handler: async (ctx, args): Promise<Outcome> => {
    if (!isPeter(ctx.identity)) return { ok: false, error: DEPLOY_ONLY_PETER };
    if (!deploySetUp()) return { ok: false, error: DEPLOY_NOT_SET_UP };
    const run = await ctx.db.get(args.runId);
    if (!run) return { ok: false, error: DEPLOY_NOTHING };
    const last = await latestRun(ctx, run.projectId);
    if (!last || last._id !== run._id || run.status !== 'failed') return { ok: false, error: DEPLOY_RUNNING };
    const attempt = run.attempt + 1;
    await ctx.db.patch(run._id, {
      status: 'starting',
      step: 'dispatch',
      convexDone: undefined,
      finishedAt: undefined,
      workflowUrl: undefined,
      attempt,
    });
    await ctx.scheduler.runAfter(0, internal.deploys.dispatch, { runId: run._id });
    await ctx.scheduler.runAfter(DEPLOY_RUN_TIMEOUT_MS, internal.deploys.expire, { runId: run._id, attempt });
    return { ok: true };
  },
});

export const runForDispatch = internalQuery({
  args: { runId: v.id('deployRuns') },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run || run.status !== 'starting') return null;
    const project = await ctx.db.get(run.projectId);
    const target = project ? deployTargetFor(project.agentRepo) : null;
    if (!target) return null;
    return { repo: target.repo, workflow: target.workflow, sha: run.sha, attempt: run.attempt };
  },
});

/** Starts the GitHub deploy workflow on `main`. Anything but 204 fails the run at the dispatch step. */
export const dispatch = internalAction({
  args: { runId: v.id('deployRuns') },
  handler: async (ctx, args): Promise<{ ok: boolean }> => {
    const run = await ctx.runQuery(internal.deploys.runForDispatch, { runId: args.runId });
    if (!run) return { ok: false };
    const token = process.env[DEPLOY_GITHUB_TOKEN_ENV]?.trim();
    let started = false;
    if (token) {
      try {
        const response = await fetch(
          `https://api.github.com/repos/${run.repo}/actions/workflows/${run.workflow}/dispatches`,
          {
            method: 'POST',
            headers: { ...githubHeaders(token), 'Content-Type': 'application/json' },
            body: JSON.stringify({ ref: 'main', inputs: { sha: run.sha, run_id: args.runId } }),
            signal: AbortSignal.timeout(10000),
          },
        );
        started = response.status === 204;
      } catch {
        started = false;
      }
    }
    if (started) return { ok: true };
    await ctx.runMutation(internal.deploys.failRun, { runId: args.runId, attempt: run.attempt, step: 'dispatch', note: DEPLOY_DID_NOT_START });
    return { ok: false };
  },
});

async function finishRun(ctx: MutationCtx, run: Doc<'deployRuns'>, now: number) {
  const project = await ctx.db.get(run.projectId);
  if (project) {
    await ctx.db.patch(project._id, {
      deployedCommit: run.sha,
      deployedAt: now,
      // The list was made against the old deployed commit. A newer `main` is compared again below.
      deployPending: undefined,
    });
  }
  for (const milestoneId of run.milestoneIds) {
    const milestone = await ctx.db.get(milestoneId);
    if (!milestone || milestone.deployFinishedAt != null) continue;
    await ctx.db.patch(milestone._id, { deployFinishedAt: now });
    await ctx.db.insert('agentEvents', {
      orgId: milestone.orgId,
      milestoneId: milestone._id,
      type: 'note',
      summary: `Deployed to production · ${shortSha(run.sha)}`,
      key: `deployed:${run.sha}`,
      at: now,
    });
  }
  // Milestones merged before the compare ran, or by hand, that this commit also covers
  // are found by the next compare: they no longer appear after the new deployed commit.
  if (run.askId) {
    const ask = await ctx.db.get(run.askId);
    if (ask) await closeAsk(ctx, ask);
  }
  await ctx.db.patch(run._id, { status: 'done', step: undefined, convexDone: true, finishedAt: now, askId: undefined });
  if (project) await ctx.scheduler.runAfter(0, internal.deploys.refreshMain, { projectId: project._id });
}

async function failRunNow(ctx: MutationCtx, run: Doc<'deployRuns'>, step: DeployStep, now: number, note?: string) {
  const line = note ?? deployFailureLine(step, run.convexDone === true);
  let askId = run.askId;
  if (!askId) {
    const first = run.milestoneIds[0] ? await ctx.db.get(run.milestoneIds[0]) : null;
    if (first) {
      askId = await openAsk(ctx, first, {
        reason: 'blocked',
        body: `Deploy to main failed · ${shortSha(run.sha)}. ${line} Retry from the project page.${run.workflowUrl ? `\nWorkflow log: ${run.workflowUrl}` : ''}`,
        addedBy: 'Deploy to main',
        at: now,
      });
    }
  }
  await ctx.db.patch(run._id, { status: 'failed', step, finishedAt: now, ...(askId ? { askId } : {}) });
}

export const failRun = internalMutation({
  args: {
    runId: v.id('deployRuns'),
    attempt: v.number(),
    step: v.union(v.literal('dispatch'), v.literal('convex'), v.literal('vercel')),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run || run.attempt !== args.attempt || !deployRunActive(run.status)) return { wrote: false };
    await failRunNow(ctx, run, args.step, Date.now(), args.note);
    return { wrote: true };
  },
});

/** A run with no report inside the limit is failed at the step it had reached. */
export const expire = internalMutation({
  args: { runId: v.id('deployRuns'), attempt: v.number() },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run || run.attempt !== args.attempt || !deployRunActive(run.status)) return { wrote: false };
    await failRunNow(ctx, run, run.step ?? 'dispatch', Date.now(), DEPLOY_NO_REPORT);
    return { wrote: true };
  },
});

/** One step report from the deploy workflow. A repeat, or a report for another commit, writes nothing. */
export const report = internalMutation({
  args: {
    runId: v.string(),
    sha: v.string(),
    event: v.union(v.literal('started'), v.literal('convex_ok'), v.literal('vercel_ok'), v.literal('failed')),
    step: v.optional(v.union(v.literal('dispatch'), v.literal('convex'), v.literal('vercel'))),
    url: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ ok: boolean; wrote: boolean }> => {
    const runId = ctx.db.normalizeId('deployRuns', args.runId);
    const run = runId ? await ctx.db.get(runId) : null;
    if (!run || run.sha !== cleanCommitSha(args.sha)) return { ok: false, wrote: false };
    const result = applyDeployReport(
      { status: run.status, step: run.step, convexDone: run.convexDone },
      { event: args.event, step: args.step },
    );
    const url = args.url && /^https:\/\/github\.com\//.test(args.url) ? args.url.slice(0, 300) : undefined;
    if (url && !run.workflowUrl) await ctx.db.patch(run._id, { workflowUrl: url });
    if (!result.changed) return { ok: true, wrote: false };
    const now = Date.now();
    const current = (await ctx.db.get(run._id)) ?? run;
    if (result.next.status === 'done') {
      await finishRun(ctx, current, now);
    } else if (result.next.status === 'failed') {
      await failRunNow(ctx, current, result.next.step ?? 'dispatch', now);
    } else {
      await ctx.db.patch(run._id, {
        status: result.next.status,
        step: result.next.step,
        ...(result.next.convexDone ? { convexDone: true } : {}),
      });
    }
    return { ok: true, wrote: true };
  },
});

/** The deploy workflow's reports. Signed with `DEPLOY_REPORT_SECRET`. */
export const deployRunHttp = httpAction(async (ctx, request) => {
  const auth = authorizeReviewPreview({
    configuredSecret: process.env[DEPLOY_REPORT_SECRET_ENV],
    authorizationHeader: request.headers.get('authorization'),
  });
  if (auth === 'unconfigured') return new Response('Deploy to main is not configured', { status: 503 });
  if (auth === 'unauthorized') return new Response('Unauthorized', { status: 401 });
  let body: { runId?: unknown; sha?: unknown; event?: unknown; step?: unknown; url?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }
  const sha = cleanCommitSha(body.sha);
  if (typeof body.runId !== 'string' || !sha || !isDeployReportEvent(body.event)) {
    return new Response('Invalid report', { status: 400 });
  }
  const result = await ctx.runMutation(internal.deploys.report, {
    runId: body.runId,
    sha,
    event: body.event,
    ...(isDeployStep(body.step) ? { step: body.step } : {}),
    ...(typeof body.url === 'string' ? { url: body.url } : {}),
  });
  return new Response(JSON.stringify(result), {
    status: result.ok ? 200 : 404,
    headers: { 'Content-Type': 'application/json' },
  });
});
