/**
 * The runner's side of a milestone: claim a task or a planning job, record
 * what happened, and finish. Every function here is internal and is reached
 * only through the runner HTTP routes in `agentHttp.ts`, plus one staff query
 * for the run feed. No client query reads `agentRuns`, `agentEvents` or
 * `agentRunners`. Nothing here calls a model.
 */

import { v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';
import { internalMutation } from './_generated/server';
import {
  PLAN_NOT_PLANNING,
  RUN_ENDED,
  RUN_NOT_FOUND,
  RUN_NOT_YOURS,
  allTasksDone,
  completeDecision,
  eventSummary,
  eventType,
  feedLimit,
  milestoneBranch,
  nextClaimableTask,
  pullRequestUrl,
  runIsStuck,
  runMode,
  runTool,
  runToolLabel,
  runnerOnline,
  runnerRateDecision,
  shortSha,
  STUCK_RUN_SCAN,
  tasksWaitingOnPerson,
  trimEventPayload,
} from './_lib/agentRun';
import { proposedTasksDecision } from './_lib/milestoneBot';
import { detailActivitySummary } from './_lib/milestoneDetails';
import { writeMilestoneActivity } from './_lib/milestones';
import { STATUS_ACTIVITY, transitionMilestone, type MilestoneStatus } from './_lib/milestoneStatus';
import { PORTAL_MILESTONE_TASK_SOURCE } from './_lib/milestoneTasks';
import { adminQuery } from './_lib/wrappers';
import { uniqueMilestoneBranch } from './_lib/milestoneBranchStore';

/** Building milestones looked at for one claim. Oldest first. */
const CLAIM_MILESTONE_SCAN = 25;
/** Tasks read per milestone when choosing the next one. */
const CLAIM_TASK_SCAN = 100;
const DEDUPE_SCAN = 30;

type Failure = { ok: false; status: number; error: string };

function failure(status: number, error: string): Failure {
  return { ok: false, status, error };
}

async function writeEvent(
  ctx: MutationCtx,
  input: {
    orgId: Id<'clients'>;
    milestoneId: Id<'milestones'>;
    runId?: Id<'agentRuns'>;
    type: string;
    summary: string;
    payload?: string | null;
    key?: string;
    at: number;
  },
) {
  return ctx.db.insert('agentEvents', {
    orgId: input.orgId,
    milestoneId: input.milestoneId,
    ...(input.runId ? { runId: input.runId } : {}),
    type: eventType(input.type),
    summary: input.summary,
    ...(input.payload ? { payload: input.payload } : {}),
    ...(input.key ? { key: input.key } : {}),
    at: input.at,
  });
}

/** One status move through the shared decision, with its activity row. */
async function moveMilestone(
  ctx: MutationCtx,
  milestone: Doc<'milestones'>,
  to: MilestoneStatus,
  actor: string,
  at: number,
): Promise<boolean> {
  const moved = transitionMilestone({ from: milestone.status, cause: 'set', to });
  if (!moved.ok || !moved.wrote) return false;
  await ctx.db.patch(milestone._id, { status: moved.status });
  await writeMilestoneActivity(
    ctx as unknown as Parameters<typeof writeMilestoneActivity>[0],
    milestone,
    STATUS_ACTIVITY,
    at,
    detailActivitySummary({ actor, from: moved.from, to: moved.status, at }),
  );
  return true;
}

function milestoneContext(milestone: Doc<'milestones'>, branch: string) {
  return {
    id: milestone._id,
    name: milestone.name,
    objective: milestone.objective,
    goals: milestone.goals,
    status: milestone.status,
    branch,
    prUrl: milestone.prUrl ?? null,
  };
}

/** The milestone's stored branch. An older milestone gets one the first time a runner works it. */
async function branchFor(ctx: MutationCtx, milestone: Doc<'milestones'>): Promise<string> {
  if (milestone.branch) return milestone.branch;
  const branch = await uniqueMilestoneBranch(ctx, milestone.name);
  await ctx.db.patch(milestone._id, { branch });
  return branch;
}

/**
 * Called first by every runner route. Counts the call against the runner's
 * minute window and records that the runner is alive.
 */
export const touchRunner = internalMutation({
  args: { runnerId: v.string() },
  handler: async (ctx, { runnerId }) => {
    const now = Date.now();
    const row = await ctx.db
      .query('agentRunners')
      .withIndex('by_runnerId', (q) => q.eq('runnerId', runnerId))
      .unique();
    const rate = runnerRateDecision({ windowStart: row?.windowStart, count: row?.count, now });
    if (!rate.ok) return failure(429, rate.reason);
    if (row) {
      await ctx.db.patch(row._id, { windowStart: rate.windowStart, count: rate.count, lastSeenAt: now });
    } else {
      await ctx.db.insert('agentRunners', {
        runnerId,
        windowStart: rate.windowStart,
        count: rate.count,
        lastSeenAt: now,
      });
    }
    return { ok: true as const };
  },
});

async function runningRunFor(ctx: MutationCtx, runnerId: string) {
  return ctx.db
    .query('agentRuns')
    .withIndex('by_runner_status', (q) => q.eq('runnerId', runnerId).eq('status', 'running'))
    .first();
}

async function runPayload(ctx: MutationCtx, run: Doc<'agentRuns'>) {
  const milestone = await ctx.db.get(run.milestoneId);
  if (!milestone) return null;
  const branch = await branchFor(ctx, milestone);
  if (run.kind === 'planning') {
    return { kind: 'planning' as const, runId: run._id, milestone: milestoneContext(milestone, branch) };
  }
  const task = run.taskId ? await ctx.db.get(run.taskId) : null;
  if (!task) return null;
  return {
    kind: 'task' as const,
    runId: run._id,
    milestone: milestoneContext(milestone, branch),
    task: {
      id: task._id,
      order: (task.milestoneOrder ?? 0) + 1,
      title: task.name,
      detail: task.description ?? '',
      origin: task.origin ?? null,
      round: task.round ?? null,
    },
  };
}

/**
 * Hands the runner its next piece of work in one transaction: a planning job
 * first, else the lowest-order To do task on the oldest Building milestone.
 * A runner with a run still open gets that same run back, so a repeated call
 * never claims twice.
 */
export const claimNext = internalMutation({
  args: { runnerId: v.string(), mode: v.optional(v.string()), tool: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const open = await runningRunFor(ctx, args.runnerId);
    if (open) {
      const payload = await runPayload(ctx, open);
      if (payload) return { ok: true as const, resumed: true, ...payload };
      // The task or milestone behind the run is gone. Close it and look again.
      await ctx.db.patch(open._id, { status: 'cancelled', endedAt: Date.now() });
    }
    const now = Date.now();
    const mode = runMode(args.mode);
    const tool = runTool(args.tool);

    const planning = await ctx.db
      .query('milestones')
      .withIndex('by_planning', (q) => q.eq('planning', 'queued'))
      .first();
    if (planning) {
      const existing = await ctx.db
        .query('tasks')
        .withIndex('by_orgId_milestoneId', (q) => q.eq('orgId', planning.orgId).eq('milestoneId', planning._id))
        .first();
      if (existing || planning.status === 'Shipped' || planning.status === 'Parked') {
        // Someone already wrote tasks, or the milestone stopped. Nothing to plan.
        await ctx.db.patch(planning._id, { planning: undefined });
      } else {
        await ctx.db.patch(planning._id, { planning: 'running' });
        const runId = await ctx.db.insert('agentRuns', {
          orgId: planning.orgId,
          milestoneId: planning._id,
          kind: 'planning',
          runnerId: args.runnerId,
          tool,
          mode,
          status: 'running',
          startedAt: now,
        });
        await writeEvent(ctx, {
          orgId: planning.orgId,
          milestoneId: planning._id,
          runId,
          type: 'planning',
          summary: `Planning run started · ${args.runnerId} · ${runToolLabel(tool)}`,
          at: now,
        });
        return {
          ok: true as const,
          resumed: false,
          kind: 'planning' as const,
          runId,
          milestone: milestoneContext(planning, await branchFor(ctx, planning)),
        };
      }
    }

    const building = await ctx.db
      .query('milestones')
      .withIndex('by_status', (q) => q.eq('status', 'Building'))
      .take(CLAIM_MILESTONE_SCAN);
    for (const milestone of building) {
      // One task run per milestone at a time. Two runners never push to the same branch.
      const busy = await ctx.db
        .query('agentRuns')
        .withIndex('by_milestone_status', (q) => q.eq('milestoneId', milestone._id).eq('status', 'running'))
        .first();
      if (busy) continue;
      const tasks = await ctx.db
        .query('tasks')
        .withIndex('by_orgId_milestoneId', (q) => q.eq('orgId', milestone.orgId).eq('milestoneId', milestone._id))
        .take(CLAIM_TASK_SCAN);
      const next = nextClaimableTask(
        tasks.map((task) => ({
          id: task._id,
          status: task.status,
          isDone: task.isDone,
          milestoneOrder: task.milestoneOrder,
          parentTaskId: task.parentTaskId,
          claimedBy: task.claimedBy,
          archivedAt: task.archivedAt,
          source: task.source,
          notionPageId: task.notionPageId,
        })),
      );
      if (!next) continue;
      const task = tasks.find((row) => row._id === next.id);
      if (!task) continue;
      await ctx.db.patch(task._id, {
        status: 'In Progress',
        claimedBy: args.runnerId,
        claimedAt: now,
        blockedReason: undefined,
        updatedAt: now,
      });
      const runId = await ctx.db.insert('agentRuns', {
        orgId: milestone.orgId,
        milestoneId: milestone._id,
        taskId: task._id,
        kind: 'task',
        runnerId: args.runnerId,
        tool,
        mode,
        status: 'running',
        startedAt: now,
      });
      const order = String((task.milestoneOrder ?? 0) + 1).padStart(2, '0');
      await writeEvent(ctx, {
        orgId: milestone.orgId,
        milestoneId: milestone._id,
        runId,
        type: 'run',
        summary: `Run started · task ${order} ${task.name} · ${args.runnerId} · ${runToolLabel(tool)}`,
        at: now,
      });
      const payload = await runPayload(ctx, (await ctx.db.get(runId)) as Doc<'agentRuns'>);
      if (payload) return { ok: true as const, resumed: false, ...payload };
    }
    return { ok: true as const, resumed: false, kind: 'none' as const };
  },
});

async function ownedRun(ctx: MutationCtx, runnerId: string, runId: string) {
  const id = ctx.db.normalizeId('agentRuns', runId);
  const run = id ? await ctx.db.get(id) : null;
  if (!run) return failure(404, RUN_NOT_FOUND);
  if (run.runnerId !== runnerId) return failure(403, RUN_NOT_YOURS);
  return { ok: true as const, run };
}

/**
 * One short line for the run feed, from a Claude Code hook or the runner.
 * The summary and payload are masked and cut down before storage. A repeat
 * with the same `key` is not written again.
 */
export const recordEvent = internalMutation({
  args: {
    runnerId: v.string(),
    runId: v.string(),
    type: v.optional(v.string()),
    summary: v.any(),
    payload: v.optional(v.any()),
    key: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const owned = await ownedRun(ctx, args.runnerId, args.runId);
    if (!owned.ok) return owned;
    const { run } = owned;
    if (run.status !== 'running') return failure(409, RUN_ENDED);
    const summary = eventSummary(args.summary);
    if (!summary.ok) return failure(400, summary.reason);
    const key = args.key?.trim().slice(0, 120) || undefined;
    if (key) {
      const recent = await ctx.db
        .query('agentEvents')
        .withIndex('by_run', (q) => q.eq('runId', run._id))
        .order('desc')
        .take(DEDUPE_SCAN);
      const seen = recent.find((row) => row.key === key);
      if (seen) return { ok: true as const, id: seen._id, duplicate: true };
    }
    const id = await writeEvent(ctx, {
      orgId: run.orgId,
      milestoneId: run.milestoneId,
      runId: run._id,
      type: eventType(args.type),
      summary: summary.summary,
      payload: trimEventPayload(args.payload),
      key,
      at: Date.now(),
    });
    return { ok: true as const, id, duplicate: false };
  },
});

/**
 * Ends a task run. `done` closes the task and stores the commit. `blocked`
 * keeps the reason on the task. `failed` hands the task back as To do. When
 * the last open task is done the milestone moves to Ready to Ship. A repeat
 * for a run that already ended returns the stored outcome and writes nothing.
 */
export const completeTask = internalMutation({
  args: {
    runnerId: v.string(),
    runId: v.string(),
    status: v.any(),
    commitSha: v.optional(v.any()),
    reason: v.optional(v.any()),
    /** The milestone's pull request, when the runner opened or found one. */
    prUrl: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const owned = await ownedRun(ctx, args.runnerId, args.runId);
    if (!owned.ok) return owned;
    const { run } = owned;
    if (run.kind !== 'task' || !run.taskId) return failure(400, 'That run is not a task run');
    const milestone = await ctx.db.get(run.milestoneId);
    if (run.status !== 'running') {
      return {
        ok: true as const,
        duplicate: true,
        run: run.status,
        milestoneStatus: milestone?.status ?? null,
      };
    }
    const decision = completeDecision(args);
    if (!decision.ok) return failure(400, decision.reason);
    const task = await ctx.db.get(run.taskId);
    const now = Date.now();
    await ctx.db.patch(run._id, { status: decision.run, endedAt: now });
    if (!task || !milestone) return { ok: true as const, duplicate: false, run: decision.run, milestoneStatus: null };

    await ctx.db.patch(task._id, {
      status: decision.task.status,
      isDone: decision.task.isDone,
      claimedBy: decision.status === 'blocked' ? task.claimedBy : undefined,
      claimedAt: decision.status === 'blocked' ? task.claimedAt : undefined,
      blockedReason: decision.status === 'blocked' ? (decision.reason ?? undefined) : undefined,
      ...(decision.commitSha ? { lastCommitSha: decision.commitSha } : {}),
      updatedAt: now,
    });
    const prUrl = pullRequestUrl(args.prUrl);
    if (prUrl && milestone.prUrl !== prUrl) await ctx.db.patch(milestone._id, { prUrl });
    const order = String((task.milestoneOrder ?? 0) + 1).padStart(2, '0');
    const sha = shortSha(decision.commitSha);
    await writeEvent(ctx, {
      orgId: run.orgId,
      milestoneId: run.milestoneId,
      runId: run._id,
      type: decision.status === 'done' ? 'commit' : decision.status === 'blocked' ? 'blocked' : 'failed',
      summary:
        decision.status === 'done'
          ? `${sha ? `Commit ${sha}` : 'Done'} · ${task.name} · pushed to ${milestone.branch ?? milestoneBranch(milestone.name)}`
          : decision.status === 'blocked'
            ? `Task ${order} blocked · ${decision.reason}`
            : `Task ${order} went back to To do${decision.reason ? ` · ${decision.reason}` : ''}`,
      at: now,
    });

    let milestoneStatus: MilestoneStatus = milestone.status;
    if (decision.status === 'done' && milestone.status === 'Building') {
      const tasks = await ctx.db
        .query('tasks')
        .withIndex('by_orgId_milestoneId', (q) => q.eq('orgId', milestone.orgId).eq('milestoneId', milestone._id))
        .take(CLAIM_TASK_SCAN);
      if (allTasksDone(tasks)) {
        const moved = await moveMilestone(ctx, milestone, 'Ready to Ship', `Runner ${args.runnerId}`, now);
        if (moved) {
          milestoneStatus = 'Ready to Ship';
          await writeEvent(ctx, {
            orgId: run.orgId,
            milestoneId: run.milestoneId,
            type: 'ready',
            summary: 'All tasks done · milestone is Ready to Ship',
            at: now + 1,
          });
        }
      }
    }
    return { ok: true as const, duplicate: false, run: decision.run, milestoneStatus };
  },
});

/**
 * The task list a planning run wrote. 3 to 10 tasks, stored in the portal
 * only. The milestone moves from Planning to Awaiting Go. A repeat for a run
 * that already ended writes nothing.
 */
export const writePlannedTasks = internalMutation({
  args: { runnerId: v.string(), runId: v.string(), tasks: v.any() },
  handler: async (ctx, args) => {
    const owned = await ownedRun(ctx, args.runnerId, args.runId);
    if (!owned.ok) return owned;
    const { run } = owned;
    if (run.kind !== 'planning') return failure(400, PLAN_NOT_PLANNING);
    const milestone = await ctx.db.get(run.milestoneId);
    if (run.status !== 'running') {
      return { ok: true as const, duplicate: true, taskIds: [] as Id<'tasks'>[], milestoneStatus: milestone?.status ?? null };
    }
    if (!milestone) return failure(404, 'Milestone not found');
    const planned = proposedTasksDecision(args.tasks);
    if (!planned.ok) return failure(400, planned.reason);
    if (planned.tasks.length === 0) return failure(400, 'A planning run has to write 3 to 10 tasks');
    const now = Date.now();
    const taskIds: Id<'tasks'>[] = [];
    for (const [index, task] of planned.tasks.entries()) {
      const key = `${PORTAL_MILESTONE_TASK_SOURCE}:${milestone._id}:plan:${index}`;
      taskIds.push(
        await ctx.db.insert('tasks', {
          orgId: milestone.orgId,
          projectId: milestone.projectId,
          notionPageId: key,
          externalId: key,
          lastSyncedAt: now,
          name: task.title,
          ...(task.detail ? { description: task.detail, descriptionSource: 'property' as const } : {}),
          status: 'To Do',
          isDone: false,
          stage: 'Awaiting Go',
          publishToWarehaus: false,
          source: PORTAL_MILESTONE_TASK_SOURCE,
          origin: 'brief',
          milestoneId: milestone._id,
          milestoneOrder: index,
          updatedAt: now,
        }),
      );
    }
    await ctx.db.patch(run._id, { status: 'succeeded', endedAt: now });
    await ctx.db.patch(milestone._id, { planning: undefined });
    await writeEvent(ctx, {
      orgId: milestone.orgId,
      milestoneId: milestone._id,
      runId: run._id,
      type: 'planning',
      summary: `Planning run wrote ${taskIds.length} tasks from the brief`,
      at: now,
    });
    let milestoneStatus: MilestoneStatus = milestone.status;
    if (milestone.status === 'Planning' || milestone.status === 'Idea') {
      const moved = await moveMilestone(ctx, milestone, 'Awaiting Go', `Runner ${args.runnerId}`, now);
      if (moved) milestoneStatus = 'Awaiting Go';
    }
    return { ok: true as const, duplicate: false, taskIds, milestoneStatus };
  },
});

/** Ends a planning run that wrote nothing. The job goes back in the queue. */
export const failPlanning = internalMutation({
  args: { runnerId: v.string(), runId: v.string(), reason: v.optional(v.any()) },
  handler: async (ctx, args) => {
    const owned = await ownedRun(ctx, args.runnerId, args.runId);
    if (!owned.ok) return owned;
    const { run } = owned;
    if (run.kind !== 'planning') return failure(400, PLAN_NOT_PLANNING);
    if (run.status !== 'running') return { ok: true as const, duplicate: true };
    const now = Date.now();
    await ctx.db.patch(run._id, { status: 'failed', endedAt: now });
    const milestone = await ctx.db.get(run.milestoneId);
    if (milestone?.planning === 'running') await ctx.db.patch(milestone._id, { planning: 'queued' });
    const reason = eventSummary(args.reason);
    await writeEvent(ctx, {
      orgId: run.orgId,
      milestoneId: run.milestoneId,
      runId: run._id,
      type: 'failed',
      summary: `Planning run stopped${reason.ok ? ` · ${reason.summary}` : ''}`,
      at: now,
    });
    return { ok: true as const, duplicate: false };
  },
});

/**
 * Releases runs whose runner went quiet for 30 minutes: the run is cancelled,
 * its task goes back to To do, and the claim is cleared. A planning job goes
 * back in the queue. Reads only running runs, through an index, a few at a
 * time. Called by a cron.
 */
export const releaseStuckRuns = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const running = await ctx.db
      .query('agentRuns')
      .withIndex('by_status', (q) => q.eq('status', 'running'))
      .take(STUCK_RUN_SCAN);
    let released = 0;
    for (const run of running) {
      const runner = await ctx.db
        .query('agentRunners')
        .withIndex('by_runnerId', (q) => q.eq('runnerId', run.runnerId))
        .unique();
      if (!runIsStuck({ lastSeenAt: runner?.lastSeenAt, startedAt: run.startedAt, now })) continue;
      await ctx.db.patch(run._id, { status: 'cancelled', endedAt: now });
      if (run.kind === 'task' && run.taskId) {
        const task = await ctx.db.get(run.taskId);
        if (task && !task.isDone && task.claimedBy === run.runnerId) {
          await ctx.db.patch(task._id, { status: 'To Do', claimedBy: undefined, claimedAt: undefined, updatedAt: now });
        }
      } else {
        const milestone = await ctx.db.get(run.milestoneId);
        if (milestone?.planning === 'running') await ctx.db.patch(milestone._id, { planning: 'queued' });
      }
      await writeEvent(ctx, {
        orgId: run.orgId,
        milestoneId: run.milestoneId,
        runId: run._id,
        type: 'failed',
        summary: `Run released · ${run.runnerId} went quiet for 30 minutes · the work is back in the queue`,
        at: now,
      });
      released += 1;
    }
    return { scanned: running.length, released };
  },
});

/**
 * Staff run feed for one milestone: the newest events, and the runner behind
 * the latest run. Reactive, indexed, and capped. Clients have no query here.
 */
export const feedForMilestone = adminQuery({
  args: { milestoneId: v.id('milestones'), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const milestone = await ctx.db.get(args.milestoneId);
    if (!milestone) return null;
    const limit = feedLimit(args.limit);
    const rows = await ctx.db
      .query('agentEvents')
      .withIndex('by_milestone_time', (q) => q.eq('milestoneId', milestone._id))
      .order('desc')
      .take(limit + 1);
    const latest = await ctx.db
      .query('agentRuns')
      .withIndex('by_milestone', (q) => q.eq('milestoneId', milestone._id))
      .order('desc')
      .first();
    const runner = latest
      ? await ctx.db
          .query('agentRunners')
          .withIndex('by_runnerId', (q) => q.eq('runnerId', latest.runnerId))
          .unique()
      : null;
    return {
      events: rows.slice(0, limit).map((row) => ({
        id: row._id,
        type: eventType(row.type),
        summary: row.summary,
        at: row.at,
      })),
      hasMore: rows.length > limit,
      run: latest
        ? {
            runnerId: latest.runnerId,
            mode: latest.mode,
            tool: latest.tool,
            status: latest.status,
            kind: latest.kind,
            online: runnerOnline(runner?.lastSeenAt, Date.now()),
            lastSeenAt: runner?.lastSeenAt ?? null,
          }
        : null,
      planning: milestone.planning ?? null,
      branch: milestone.branch ?? null,
      prUrl: milestone.prUrl ?? null,
      waitingOnPerson:
        milestone.status === 'Building'
          ? tasksWaitingOnPerson(
              await ctx.db
                .query('tasks')
                .withIndex('by_orgId_milestoneId', (q) => q.eq('orgId', milestone.orgId).eq('milestoneId', milestone._id))
                .take(CLAIM_TASK_SCAN),
            )
              .slice(0, 5)
              .map((task) => task.name)
          : [],
    };
  },
});
