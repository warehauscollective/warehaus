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
  RUNNER_NEEDS_REPO,
  RUN_ENDED,
  RUN_NOT_FOUND,
  RUN_NOT_YOURS,
  LOCAL_PREVIEW_DEFAULT,
  allTasksDone,
  approvalNote,
  blockedNote,
  buildAgent,
  buildTaskState,
  completeDecision,
  cursorAgentUrl,
  eventSummary,
  eventType,
  feedLimit,
  milestoneBranch,
  nextClaimableTask,
  planningBlockedNote,
  planningRetryDecision,
  projectServedBy,
  pullRequestUrl,
  runnerRepos,
  runIsStuck,
  runMode,
  runToolLabel,
  runnerOnline,
  runnerTouchDecision,
  shortSha,
  STUCK_RUN_SCAN,
  taskRetryDecision,
  tasksWaitingOnPerson,
  trimEventPayload,
} from './_lib/agentRun';
import { proposedTasksDecision } from './_lib/milestoneBot';
import { detailActivitySummary } from './_lib/milestoneDetails';
import { writeMilestoneActivity } from './_lib/milestones';
import { STATUS_ACTIVITY, transitionMilestone, type MilestoneStatus } from './_lib/milestoneStatus';
import { PORTAL_MILESTONE_TASK_SOURCE, isPortalOwnedTask, isToDoTask, plannerDraftToArchive, stageForNewMilestoneTask } from './_lib/milestoneTasks';
import { currentIteration } from './_lib/milestoneReview';
import { PortalAuthError } from './_lib/identity';
import { adminMutation, adminQuery } from './_lib/wrappers';
import { uniqueMilestoneBranch } from './_lib/milestoneBranchStore';
import { planningRunsInWindow, queuePlanning } from './planningQueue';

/** Building milestones looked at for one claim. Oldest first. */
const CLAIM_MILESTONE_SCAN = 25;
/** Milestones one claim inspects for a single project, inside that scan. */
const CLAIM_PER_PROJECT = 5;
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

/** Leaves one open note for Peter. Read by Grok Bot through the staff API. */
async function needsPeter(
  ctx: MutationCtx,
  milestone: Doc<'milestones'>,
  input: { reason: 'approval' | 'blocked'; body: string; taskId?: Id<'tasks'>; addedBy: string; at: number },
) {
  await ctx.db.insert('milestoneNotes', {
    orgId: milestone.orgId,
    milestoneId: milestone._id,
    body: input.body,
    addedBy: input.addedBy,
    createdAt: input.at,
    needsPeter: 'open',
    reason: input.reason,
    ...(input.taskId ? { taskId: input.taskId } : {}),
  });
}

/** Closes open notes on a milestone. With a task, only that task's blocked note. */
async function answerNotes(
  ctx: MutationCtx,
  milestoneId: Id<'milestones'>,
  match: { reason: 'approval' | 'blocked'; taskId?: Id<'tasks'> },
) {
  const open = await ctx.db
    .query('milestoneNotes')
    .withIndex('by_milestone_needsPeter', (q) => q.eq('milestoneId', milestoneId).eq('needsPeter', 'open'))
    .take(20);
  for (const note of open) {
    if (note.reason !== match.reason) continue;
    if (match.taskId && note.taskId !== match.taskId) continue;
    await ctx.db.patch(note._id, { needsPeter: undefined });
  }
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
 * Called first by every runner route. The runner row is patched at most
 * once a minute. Calls inside that minute do not write.
 */
export const touchRunner = internalMutation({
  args: { runnerId: v.string() },
  handler: async (ctx, { runnerId }) => {
    const now = Date.now();
    const row = await ctx.db
      .query('agentRunners')
      .withIndex('by_runnerId', (q) => q.eq('runnerId', runnerId))
      .unique();
    const decision = runnerTouchDecision({
      lastSeenAt: row?.lastSeenAt,
      windowStart: row?.windowStart,
      count: row?.count,
      now,
    });
    if (!decision.ok) return failure(429, decision.reason);
    if (!decision.write) return { ok: true as const };
    if (row) {
      const same = row.windowStart === decision.windowStart && row.count === decision.count && row.lastSeenAt === decision.lastSeenAt;
      if (!same) await ctx.db.patch(row._id, { windowStart: decision.windowStart, count: decision.count, lastSeenAt: decision.lastSeenAt });
    } else {
      await ctx.db.insert('agentRunners', {
        runnerId,
        windowStart: decision.windowStart,
        count: decision.count,
        lastSeenAt: decision.lastSeenAt,
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
    return {
      kind: 'planning' as const,
      driver: 'claude_code' as const,
      runId: run._id,
      milestone: milestoneContext(milestone, branch),
    };
  }
  if (run.kind === 'build') {
    const tasks = await ctx.db
      .query('tasks')
      .withIndex('by_orgId_milestoneId', (q) => q.eq('orgId', milestone.orgId).eq('milestoneId', milestone._id))
      .take(CLAIM_TASK_SCAN);
    return {
      kind: 'build' as const,
      driver: 'cursor' as const,
      runId: run._id,
      externalId: run.externalId ?? null,
      externalUrl: run.externalUrl ?? null,
      milestone: milestoneContext(milestone, branch),
      tasks: openBuildTasks(tasks),
    };
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
    driver: 'claude_code' as const,
  };
}

function isOpenBuildTask(task: Doc<'tasks'>): boolean {
  if (task.archivedAt != null || task.parentTaskId || task.isDone || !isPortalOwnedTask(task)) return false;
  return isToDoTask(task) || task.status === 'In Progress';
}

function openBuildTasks(tasks: readonly Doc<'tasks'>[]) {
  return tasks
    .filter((task) => isOpenBuildTask(task))
    .sort((a, b) => (a.milestoneOrder ?? Number.MAX_SAFE_INTEGER) - (b.milestoneOrder ?? Number.MAX_SAFE_INTEGER))
    .map((task) => ({
      id: task._id,
      order: (task.milestoneOrder ?? 0) + 1,
      title: task.name,
      detail: task.description ?? '',
    }));
}

/**
 * Hands the runner its next piece of work in one transaction: a planning job
 * first, else the lowest-order To do task on the oldest Building milestone.
 * A runner with a run still open gets that same run back, so a repeated call
 * never claims twice.
 */
export const claimNext = internalMutation({
  args: {
    runnerId: v.string(),
    mode: v.optional(v.string()),
    tool: v.optional(v.string()),
    /** Repositories this runner serves, as owner/name. Work for any other project is not handed over. */
    repos: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const repos = runnerRepos(args.repos);
    // Fail safe: a runner that names no repository is handed nothing.
    if (repos.length === 0) return { ok: true as const, resumed: false, kind: 'none' as const, reason: RUNNER_NEEDS_REPO };
    const served = async (projectId: Id<'projects'>) => projectServedBy(await ctx.db.get(projectId), repos);
    const open = await runningRunFor(ctx, args.runnerId);
    if (open) {
      const payload = await runPayload(ctx, open);
      if (payload) return { ok: true as const, resumed: true, ...payload };
      // The task or milestone behind the run is gone. Close it and look again.
      await ctx.db.patch(open._id, { status: 'cancelled', endedAt: Date.now() });
    }
    const now = Date.now();
    const mode = runMode(args.mode);

    const inspected = new Map<string, number>();
    const roomFor = (projectId: string) => (inspected.get(projectId) ?? 0) < CLAIM_PER_PROJECT;
    const noteProject = (projectId: string) => inspected.set(projectId, (inspected.get(projectId) ?? 0) + 1);

    const queued = await ctx.db
      .query('milestones')
      .withIndex('by_planning', (q) => q.eq('planning', 'queued'))
      .take(CLAIM_MILESTONE_SCAN);
    for (const planning of queued) {
      if (!roomFor(planning.projectId)) continue;
      if (!(await served(planning.projectId))) continue;
      noteProject(planning.projectId);
      if (planning.status !== 'Planning') {
        await ctx.db.patch(planning._id, { planning: undefined, planningReplace: undefined });
        continue;
      }
      const existing = await ctx.db
        .query('tasks')
        .withIndex('by_orgId_milestoneId', (q) => q.eq('orgId', planning.orgId).eq('milestoneId', planning._id))
        .first();
      if (existing && !planning.planningReplace) {
        // Someone already wrote tasks. Nothing to plan.
        await ctx.db.patch(planning._id, { planning: undefined });
        continue;
      }
      await ctx.db.patch(planning._id, { planning: 'running' });
      const runId = await ctx.db.insert('agentRuns', {
        orgId: planning.orgId,
        milestoneId: planning._id,
        kind: 'planning',
        runnerId: args.runnerId,
        tool: 'claude_code',
        mode,
        status: 'running',
        startedAt: now,
      });
      await writeEvent(ctx, {
        orgId: planning.orgId,
        milestoneId: planning._id,
        runId,
        type: 'planning',
        summary: `Planning run started · ${args.runnerId} · ${runToolLabel('claude_code')}`,
        at: now,
      });
      return {
        ok: true as const,
        resumed: false,
        kind: 'planning' as const,
        driver: 'claude_code' as const,
        runId,
        milestone: milestoneContext(planning, await branchFor(ctx, planning)),
      };
    }

    const building = await ctx.db
      .query('milestones')
      .withIndex('by_status', (q) => q.eq('status', 'Building'))
      .take(CLAIM_MILESTONE_SCAN);
    for (const milestone of building) {
      if (!roomFor(milestone.projectId)) continue;
      if (!(await served(milestone.projectId))) continue;
      noteProject(milestone.projectId);
      const project = await ctx.db.get(milestone.projectId);
      const driver = buildAgent(project?.agentDriver);
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
      if (driver === 'cursor') {
        const open = openBuildTasks(tasks);
        if (open.length === 0) continue;
        const recent = await ctx.db
          .query('agentRuns')
          .withIndex('by_milestone', (q) => q.eq('milestoneId', milestone._id))
          .order('desc')
          .take(10);
        if (recent.some((run) => run.kind === 'build' && run.status === 'failed')) continue;
        const runId = await ctx.db.insert('agentRuns', {
          orgId: milestone.orgId,
          milestoneId: milestone._id,
          kind: 'build',
          runnerId: args.runnerId,
          tool: 'cursor',
          mode,
          status: 'running',
          startedAt: now,
        });
        await writeEvent(ctx, {
          orgId: milestone.orgId,
          milestoneId: milestone._id,
          runId,
          type: 'run',
          summary: `Cursor agent started · ${args.runnerId} · ${open.length} tasks`,
          at: now,
        });
        for (const task of tasks) {
          if (!open.some((item) => item.id === task._id)) continue;
          await ctx.db.patch(task._id, {
            status: 'In Progress',
            claimedBy: args.runnerId,
            claimedAt: now,
            blockedReason: undefined,
            updatedAt: now,
          });
        }
        const payload = await runPayload(ctx, (await ctx.db.get(runId)) as Doc<'agentRuns'>);
        if (payload) return { ok: true as const, resumed: false, ...payload };
        continue;
      }
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
        tool: 'claude_code',
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
        summary: `Run started · task ${order} ${task.name} · ${args.runnerId} · ${runToolLabel('claude_code')}`,
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

    if (decision.task.status === 'Blocked') {
      await needsPeter(ctx, milestone, {
        reason: 'blocked',
        taskId: task._id,
        addedBy: `runner:${args.runnerId}`,
        at: now,
        body: blockedNote({
          milestoneName: milestone.name,
          taskOrder: order,
          taskName: task.name,
          reason: decision.reason ?? 'no reason given',
          runnerId: args.runnerId,
        }),
      });
    } else if (decision.status === 'done') {
      await answerNotes(ctx, milestone._id, { reason: 'blocked', taskId: task._id });
    }

    let milestoneStatus: MilestoneStatus = milestone.status;
    if (decision.status === 'done' && milestone.status === 'Building') {
      milestoneStatus = await markReady(ctx, milestone, args.runnerId, now, prUrl ?? milestone.prUrl ?? null);
    }
    return { ok: true as const, duplicate: false, run: decision.run, milestoneStatus };
  },
});

/**
 * When every task is done, move to Ready to Ship, store the local preview,
 * and leave Peter's note. The Vercel preview is labeled later, at review
 * time, and only against shared dev. Both agents use this.
 */
async function markReady(
  ctx: MutationCtx,
  milestone: Doc<'milestones'>,
  runnerId: string,
  now: number,
  prUrl: string | null,
): Promise<MilestoneStatus> {
  const tasks = await ctx.db
    .query('tasks')
    .withIndex('by_orgId_milestoneId', (q) => q.eq('orgId', milestone.orgId).eq('milestoneId', milestone._id))
    .take(CLAIM_TASK_SCAN);
  if (!allTasksDone(tasks) || milestone.status !== 'Building') return milestone.status;
  const moved = await moveMilestone(ctx, milestone, 'Ready to Ship', `Runner ${runnerId}`, now);
  if (!moved) return milestone.status;
  const localPreviewUrl = milestone.localPreviewUrl ?? LOCAL_PREVIEW_DEFAULT;
  if (!milestone.localPreviewUrl) await ctx.db.patch(milestone._id, { localPreviewUrl });
  await answerNotes(ctx, milestone._id, { reason: 'approval' });
  await needsPeter(ctx, milestone, {
    reason: 'approval',
    addedBy: `runner:${runnerId}`,
    at: now,
    body: approvalNote({
      milestoneName: milestone.name,
      iteration: currentIteration(milestone.iteration),
      branch: milestone.branch ?? milestoneBranch(milestone.name),
      prUrl,
      prNumber: milestone.previewPrNumber ?? null,
      localPreviewUrl,
    }),
  });
  await writeEvent(ctx, {
    orgId: milestone.orgId,
    milestoneId: milestone._id,
    type: 'ready',
    summary: 'All tasks done · milestone is Ready to Ship',
    at: now + 1,
  });
  return 'Ready to Ship';
}

/**
 * The task list a planning run wrote. 3 to 10 tasks, stored in the portal
 * only, with origin planner. The milestone stays in Planning so staff can
 * edit the draft. A repeat for a run that already ended writes nothing.
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
    if (milestone.status !== 'Planning') {
      const now = Date.now();
      await ctx.db.patch(run._id, { status: 'cancelled', endedAt: now });
      await ctx.db.patch(milestone._id, { planning: undefined, planningReplace: undefined });
      return failure(409, 'Planning stopped because the milestone left Planning');
    }
    const planned = proposedTasksDecision(args.tasks);
    if (!planned.ok) return failure(400, planned.reason);
    if (planned.tasks.length === 0) return failure(400, 'A planning run has to write 3 to 10 tasks');
    const now = Date.now();
    if (milestone.planningReplace) {
      const existing = await ctx.db
        .query('tasks')
        .withIndex('by_orgId_milestoneId', (q) => q.eq('orgId', milestone.orgId).eq('milestoneId', milestone._id))
        .take(CLAIM_TASK_SCAN);
      for (const task of existing) {
        if (plannerDraftToArchive(task)) await ctx.db.patch(task._id, { archivedAt: now });
      }
    }
    const taskIds: Id<'tasks'>[] = [];
    for (const [index, task] of planned.tasks.entries()) {
      const key = `${PORTAL_MILESTONE_TASK_SOURCE}:${milestone._id}:plan:${run._id}:${index}`;
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
          stage: stageForNewMilestoneTask(milestone.status),
          publishToWarehaus: false,
          source: PORTAL_MILESTONE_TASK_SOURCE,
          origin: 'planner',
          milestoneId: milestone._id,
          milestoneOrder: index,
          updatedAt: now,
        }),
      );
    }
    await ctx.db.patch(run._id, { status: 'succeeded', endedAt: now });
    await ctx.db.patch(milestone._id, {
      planning: undefined,
      planningReplace: undefined,
      planningBlockedReason: undefined,
    });
    await writeEvent(ctx, {
      orgId: milestone.orgId,
      milestoneId: milestone._id,
      runId: run._id,
      type: 'planning',
      summary: `Planning run wrote ${taskIds.length} tasks`,
      at: now,
    });
    return { ok: true as const, duplicate: false, taskIds, milestoneStatus: milestone.status };
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
    const reason = eventSummary(typeof args.reason === 'string' && args.reason.trim() ? args.reason : 'The planning run failed');
    const why = reason.ok ? reason.summary : 'The planning run failed';
    await ctx.db.patch(run._id, { status: 'failed', endedAt: now, blockedReason: why });
    const milestone = await ctx.db.get(run.milestoneId);
    if (milestone?.planning === 'running') {
      await ctx.db.patch(milestone._id, { planning: 'blocked', planningBlockedReason: why });
      await needsPeter(ctx, milestone, {
        reason: 'blocked',
        addedBy: `runner:${args.runnerId}`,
        at: now,
        body: planningBlockedNote({ milestoneName: milestone.name, reason: why }),
      });
    }
    await writeEvent(ctx, {
      orgId: run.orgId,
      milestoneId: run.milestoneId,
      runId: run._id,
      type: 'failed',
      summary: `Planning run stopped · ${why}`,
      at: now,
    });
    return { ok: true as const, duplicate: false };
  },
});

/**
 * Releases runs whose runner went quiet for 30 minutes. A task run is
 * cancelled and its task is Blocked. A planning job is blocked for Retry.
 * A Cursor build uses the same failed hold as a stopped agent, so the next
 * claim does not start another cloud agent and Retry can clear it. Reads
 * only running runs, through an index, a few at a time. Called by a cron.
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
      const why = 'Runner went quiet for 30 minutes';
      const milestone = await ctx.db.get(run.milestoneId);
      if (run.kind === 'build' && milestone) {
        await blockCursorBuild(ctx, run, milestone, run.runnerId, why, now);
        released += 1;
        continue;
      }
      await ctx.db.patch(run._id, { status: 'cancelled', endedAt: now, blockedReason: why });
      if (run.kind === 'task' && run.taskId) {
        const task = await ctx.db.get(run.taskId);
        if (task && !task.isDone && task.claimedBy === run.runnerId) {
          await ctx.db.patch(task._id, {
            status: 'Blocked',
            claimedBy: undefined,
            claimedAt: undefined,
            blockedReason: why,
            updatedAt: now,
          });
          if (milestone) {
            const order = String((task.milestoneOrder ?? 0) + 1).padStart(2, '0');
            await needsPeter(ctx, milestone, {
              reason: 'blocked',
              taskId: task._id,
              addedBy: `runner:${run.runnerId}`,
              at: now,
              body: blockedNote({
                milestoneName: milestone.name,
                taskOrder: order,
                taskName: task.name,
                reason: why,
                runnerId: run.runnerId,
              }),
            });
          }
        }
      } else if (milestone?.planning === 'running') {
        await ctx.db.patch(milestone._id, { planning: 'blocked', planningBlockedReason: why });
        await needsPeter(ctx, milestone, {
          reason: 'blocked',
          addedBy: `runner:${run.runnerId}`,
          at: now,
          body: planningBlockedNote({ milestoneName: milestone.name, reason: why }),
        });
      }
      await writeEvent(ctx, {
        orgId: run.orgId,
        milestoneId: run.milestoneId,
        runId: run._id,
        type: 'failed',
        summary: `Run blocked · ${run.runnerId} went quiet for 30 minutes`,
        at: now,
      });
      released += 1;
    }
    return { scanned: running.length, released };
  },
});

async function rememberAgentLink(
  ctx: MutationCtx,
  task: Doc<'tasks'>,
  url: string,
  runnerId: string,
  now: number,
) {
  const existing = await ctx.db
    .query('taskLinks')
    .withIndex('by_taskId_url', (q) => q.eq('taskId', task._id).eq('url', url))
    .first();
  if (existing) return;
  await ctx.db.insert('taskLinks', {
    orgId: task.orgId,
    taskId: task._id,
    kind: 'agent',
    url,
    title: 'Cursor agent',
    addedBy: `runner:${runnerId}`,
    createdAt: now,
  });
}

/** One open note for a blocked build. A repeat failure does not add another. */
async function noteBlockedBuild(
  ctx: MutationCtx,
  milestone: Doc<'milestones'>,
  input: { runnerId: string; at: number; body: string },
) {
  const open = await ctx.db
    .query('milestoneNotes')
    .withIndex('by_milestone_needsPeter', (q) => q.eq('milestoneId', milestone._id).eq('needsPeter', 'open'))
    .take(20);
  if (open.some((note) => note.reason === 'blocked' && !note.taskId)) return;
  await needsPeter(ctx, milestone, {
    reason: 'blocked',
    addedBy: `runner:${input.runnerId}`,
    at: input.at,
    body: input.body,
  });
}

/**
 * Holds a Cursor build until staff press Retry. Tasks this run claimed go
 * to Blocked. The run stays failed so the next claim does not start another agent.
 */
async function blockCursorBuild(
  ctx: MutationCtx,
  run: Doc<'agentRuns'>,
  milestone: Doc<'milestones'>,
  runnerId: string,
  why: string,
  now: number,
) {
  await ctx.db.patch(run._id, { status: 'failed', endedAt: now, blockedReason: why });
  const tasks = await ctx.db
    .query('tasks')
    .withIndex('by_orgId_milestoneId', (q) => q.eq('orgId', milestone.orgId).eq('milestoneId', milestone._id))
    .take(CLAIM_TASK_SCAN);
  for (const task of tasks) {
    if (task.claimedBy !== run.runnerId || task.isDone) continue;
    if (task.claimedAt == null || task.claimedAt < run.startedAt) continue;
    await ctx.db.patch(task._id, {
      status: 'Blocked',
      isDone: false,
      blockedReason: why,
      updatedAt: now,
    });
  }
  await noteBlockedBuild(ctx, milestone, {
    runnerId,
    at: now,
    body: planningBlockedNote({ milestoneName: milestone.name, reason: why }),
  });
  await writeEvent(ctx, {
    orgId: run.orgId,
    milestoneId: run.milestoneId,
    runId: run._id,
    type: 'failed',
    summary: `Cursor agent stopped · ${why}`,
    at: now,
  });
}

function runClaimedTask(task: Doc<'tasks'>, run: Doc<'agentRuns'>): boolean {
  return task.claimedBy === run.runnerId && task.claimedAt != null && task.claimedAt >= run.startedAt;
}

/**
 * Progress from the one Cursor agent on a milestone. Finished tasks are
 * closed with their commit, the same way a Claude task run ends.
 */
export const reportBuild = internalMutation({
  args: {
    runnerId: v.string(),
    runId: v.string(),
    status: v.string(),
    agentId: v.optional(v.string()),
    agentUrl: v.optional(v.string()),
    tasks: v.optional(v.any()),
    prUrl: v.optional(v.any()),
    reason: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const owned = await ownedRun(ctx, args.runnerId, args.runId);
    if (!owned.ok) return owned;
    const { run } = owned;
    if (run.kind !== 'build') return failure(400, 'That run is not a build');
    const milestone = await ctx.db.get(run.milestoneId);
    if (run.status !== 'running') {
      return { ok: true as const, duplicate: true, milestoneStatus: milestone?.status ?? null };
    }
    if (!milestone) return failure(404, 'Milestone not found');
    const now = Date.now();
    const agentUrl = cursorAgentUrl(args.agentUrl);
    const agentId = args.agentId?.trim().slice(0, 80) || undefined;
    if (agentId || agentUrl) {
      await ctx.db.patch(run._id, {
        ...(agentId ? { externalId: agentId } : {}),
        ...(agentUrl ? { externalUrl: agentUrl } : {}),
      });
    }
    if (args.status === 'running') return { ok: true as const, duplicate: false, milestoneStatus: milestone.status };
    if (args.status === 'failed') {
      const reason = eventSummary(typeof args.reason === 'string' && args.reason.trim() ? args.reason : 'The Cursor agent stopped');
      const why = reason.ok ? reason.summary : 'The Cursor agent stopped';
      await blockCursorBuild(ctx, run, milestone, args.runnerId, why, now);
      return { ok: true as const, duplicate: false, milestoneStatus: milestone.status };
    }
    if (args.status !== 'finished') return failure(400, 'Status must be running, finished, or failed');
    const reported = Array.isArray(args.tasks) ? args.tasks : [];
    const prUrl = pullRequestUrl(args.prUrl);
    if (prUrl && milestone.prUrl !== prUrl) await ctx.db.patch(milestone._id, { prUrl });
    let closed = 0;
    for (const item of reported.slice(0, CLAIM_TASK_SCAN)) {
      const row = item != null && typeof item === 'object' ? (item as { taskId?: unknown; commitSha?: unknown }) : {};
      const taskId = typeof row.taskId === 'string' ? ctx.db.normalizeId('tasks', row.taskId) : null;
      const task = taskId ? await ctx.db.get(taskId) : null;
      if (!task || task.milestoneId !== milestone._id || task.isDone || !runClaimedTask(task, run)) continue;
      const decision = completeDecision({ status: 'done', commitSha: row.commitSha });
      if (!decision.ok || !decision.commitSha) continue;
      closed += 1;
      await ctx.db.patch(task._id, {
        status: 'Done',
        isDone: true,
        claimedBy: undefined,
        claimedAt: undefined,
        blockedReason: undefined,
        lastCommitSha: decision.commitSha,
        updatedAt: now,
      });
      if (agentUrl) await rememberAgentLink(ctx, task, agentUrl, args.runnerId, now);
      await answerNotes(ctx, milestone._id, { reason: 'blocked', taskId: task._id });
      await writeEvent(ctx, {
        orgId: run.orgId,
        milestoneId: run.milestoneId,
        runId: run._id,
        type: 'commit',
        summary: `Commit ${shortSha(decision.commitSha)} · ${task.name} · pushed to ${milestone.branch ?? milestoneBranch(milestone.name)}`,
        at: now,
      });
    }
    if (closed === 0) {
      await blockCursorBuild(
        ctx,
        run,
        milestone,
        args.runnerId,
        'The Cursor agent finished without a Portal-Task trailer',
        now,
      );
      return { ok: true as const, duplicate: false, milestoneStatus: milestone.status };
    }
    await ctx.db.patch(run._id, { status: 'succeeded', endedAt: now });
    const milestoneStatus = await markReady(ctx, milestone, args.runnerId, now, prUrl ?? milestone.prUrl ?? null);
    return { ok: true as const, duplicate: false, milestoneStatus };
  },
});

async function failedBuildRun(ctx: MutationCtx, milestoneId: Id<'milestones'>) {
  const recent = await ctx.db
    .query('agentRuns')
    .withIndex('by_milestone', (q) => q.eq('milestoneId', milestoneId))
    .order('desc')
    .take(10);
  return recent.find((run) => run.kind === 'build' && run.status === 'failed') ?? null;
}

/** Clears a blocked task, a blocked Cursor build, or a blocked planning run. Staff only. */
export async function retryBlockedWork(
  ctx: MutationCtx,
  args: { milestoneId: Id<'milestones'>; taskId?: Id<'tasks'> },
): Promise<{ ok: true } | Failure> {
  const milestone = await ctx.db.get(args.milestoneId);
  if (!milestone) return failure(404, 'Milestone not found');
  const now = Date.now();
  if (args.taskId) {
    const task = await ctx.db.get(args.taskId);
    const decision = taskRetryDecision(task && task.milestoneId === milestone._id ? task : null);
    if (!decision.ok && !(await failedBuildRun(ctx, milestone._id))) return failure(400, decision.reason);
    if (decision.ok && task) {
      await ctx.db.patch(task._id, {
        status: 'To Do',
        isDone: false,
        claimedBy: undefined,
        claimedAt: undefined,
        blockedReason: undefined,
        updatedAt: now,
      });
      await answerNotes(ctx, milestone._id, { reason: 'blocked', taskId: task._id });
    }
  }
  const held = await failedBuildRun(ctx, milestone._id);
  if (held) {
    await ctx.db.patch(held._id, { status: 'cancelled' });
    const tasks = await ctx.db
      .query('tasks')
      .withIndex('by_orgId_milestoneId', (q) => q.eq('orgId', milestone.orgId).eq('milestoneId', milestone._id))
      .take(CLAIM_TASK_SCAN);
    for (const task of tasks) {
      if (task.claimedBy !== held.runnerId || task.isDone) continue;
      if (task.status !== 'Blocked' && task.status !== 'In Progress') continue;
      await ctx.db.patch(task._id, {
        status: 'To Do',
        isDone: false,
        claimedBy: undefined,
        claimedAt: undefined,
        blockedReason: undefined,
        updatedAt: now,
      });
    }
    const open = await ctx.db
      .query('milestoneNotes')
      .withIndex('by_milestone_needsPeter', (q) => q.eq('milestoneId', milestone._id).eq('needsPeter', 'open'))
      .take(20);
    for (const note of open) {
      if (note.reason === 'blocked' && !note.taskId) await ctx.db.patch(note._id, { needsPeter: undefined });
    }
    return { ok: true };
  }
  if (args.taskId) return { ok: true };
  const decision = planningRetryDecision({
    status: milestone.status,
    planning: milestone.planning ?? null,
    recentRuns: await planningRunsInWindow(ctx, milestone._id, now),
  });
  if (!decision.ok) return failure(400, decision.reason);
  await ctx.db.patch(milestone._id, { planning: 'queued', planningBlockedReason: undefined });
  const open = await ctx.db
    .query('milestoneNotes')
    .withIndex('by_milestone_needsPeter', (q) => q.eq('milestoneId', milestone._id).eq('needsPeter', 'open'))
    .take(20);
  for (const note of open) {
    if (note.reason === 'blocked' && !note.taskId) await ctx.db.patch(note._id, { needsPeter: undefined });
  }
  return { ok: true };
}

export const retryBlocked = adminMutation({
  args: { milestoneId: v.id('milestones'), taskId: v.optional(v.id('tasks')) },
  handler: async (ctx, args) => {
    const result = await retryBlockedWork(ctx, args);
    if (!result.ok) throw new PortalAuthError(result.error, 'FORBIDDEN');
    return { ok: true as const };
  },
});

export const regeneratePlan = adminMutation({
  args: { milestoneId: v.id('milestones') },
  handler: async (ctx, args) => {
    const milestone = await ctx.db.get(args.milestoneId);
    if (!milestone) throw new PortalAuthError('Milestone not found', 'FORBIDDEN');
    const result = await queuePlanning(ctx, milestone, { regenerate: true });
    if (!result.enqueued && result.reason) throw new PortalAuthError(result.reason, 'FORBIDDEN');
    return { ok: true as const, enqueued: result.enqueued };
  },
});

/**
 * Per-task state while Building, the active agent, and the latest feed lines.
 * Indexed and capped.
 */
export const buildingProgress = adminQuery({
  args: { milestoneId: v.id('milestones') },
  handler: async (ctx, args) => {
    const milestone = await ctx.db.get(args.milestoneId);
    if (!milestone) return null;
    const project = await ctx.db.get(milestone.projectId);
    const tasks = await ctx.db
      .query('tasks')
      .withIndex('by_orgId_milestoneId', (q) => q.eq('orgId', milestone.orgId).eq('milestoneId', milestone._id))
      .take(CLAIM_TASK_SCAN);
    const events = await ctx.db
      .query('agentEvents')
      .withIndex('by_milestone_time', (q) => q.eq('milestoneId', milestone._id))
      .order('desc')
      .take(10);
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
      agent: buildAgent(project?.agentDriver),
      agentLabel: runToolLabel(buildAgent(project?.agentDriver)),
      planning: milestone.planning ?? null,
      planningBlockedReason: milestone.planningBlockedReason ?? null,
      branch: milestone.branch ?? null,
      prUrl: milestone.prUrl ?? null,
      run: latest
        ? {
            status: latest.status,
            kind: latest.kind,
            tool: latest.tool,
            blockedReason: latest.blockedReason ?? null,
            runnerId: latest.runnerId,
            endedAt: latest.endedAt ?? null,
            lastSeenAt: runner?.lastSeenAt ?? null,
          }
        : null,
      tasks: tasks
        .filter((task) => task.archivedAt == null && !task.parentTaskId)
        .sort((a, b) => (a.milestoneOrder ?? Number.MAX_SAFE_INTEGER) - (b.milestoneOrder ?? Number.MAX_SAFE_INTEGER))
        .map((task) => ({
          id: task._id,
          order: (task.milestoneOrder ?? 0) + 1,
          title: task.name,
          state: buildTaskState(task),
          commit: shortSha(task.lastCommitSha),
          blockedReason: task.blockedReason ?? null,
        })),
      events: events.map((row) => ({ id: row._id, type: eventType(row.type), summary: row.summary, at: row.at })),
    };
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
