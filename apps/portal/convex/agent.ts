/**
 * The runner's side of a milestone: claim a task or a planning job, record
 * what happened, and finish. Every function here is internal and is reached
 * only through the runner HTTP routes in `agentHttp.ts`, plus the staff queries
 * for the run feed and the runner health chip. No client query reads `agentRuns`, `agentEvents` or
 * `agentRunners`. Nothing here calls a model.
 */

import { v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { internalMutation } from './_generated/server';
import {
  PLAN_NOT_PLANNING,
  RUNNER_NEEDS_REPO,
  RUNNER_UNAUTHORIZED,
  RUN_ENDED,
  RUN_NOT_FOUND,
  RUN_NOT_YOURS,
  RELEASE_KIND_INVALID,
  agentRepo,
  blockedNote,
  buildAgent,
  buildTaskState,
  completeDecision,
  cursorAgentToResume,
  cursorBuildTooLong,
  CURSOR_BUILD_TOO_LONG,
  cursorAgentUrl,
  eventSummary,
  eventType,
  feedLimit,
  milestoneBranch,
  planningBlockedNote,
  planningRetryDecision,
  projectServedBy,
  pullRequestUrl,
  releaseReason,
  retryLeaseDecision,
  runnerRepos,
  runIsStuck,
  stuckRunReason,
  runMode,
  runToolLabel,
  runnerOnline,
  runnerTouchDecision,
  shortSha,
  STUCK_RUN_SCAN,
  taskRetryDecision,
  trimEventPayload,
  heldRunIds,
  openRunDecision,
  RUNNER_BUSY,
  RUNNER_MAX_SLOTS,
  runnerSlots,
  RERUN_NOT_NEEDS_INPUT,
  rerunAnswerText,
  STOP_NO_RUN,
  stopRunDecision,
  stoppedReason,
  type BlockedCause,
} from './_lib/agentRun';
import { TROUBLESHOOT_EVENTS, troubleshootView, type TroubleshootView } from './_lib/troubleshoot';
import { closeAsk, closeAsksOnMilestone, openAsk, openAsks, openAsksOnMilestone, type AskReason } from './_lib/askStore';
import { proposedTasksDecision } from './_lib/milestoneBot';
import { changeMilestoneStatus } from './_lib/milestoneLifecycle';
import type { MilestoneStatus } from './_lib/milestoneStatus';
import { PORTAL_MILESTONE_TASK_SOURCE, plannerDraftToArchive, stageForNewMilestoneTask } from './_lib/milestoneTasks';
import { taskKind } from './_lib/designGate';
import { syncDesignAsk } from './_lib/designGateStore';
import { loadClaimableTasks, loadMilestoneTaskSet, type LoadedTask } from './_lib/milestoneTaskSet';
import { PortalAuthError } from './_lib/identity';
import { adminMutation, adminQuery } from './_lib/wrappers';
import { RUNNER_READY_WITHIN_MS, type RunnerHealthView } from './_lib/runnerHealth';
import {
  NO_RUNNER_NOTE_SCAN,
  NO_RUNNER_SCAN,
  anyRunnerOnline,
  isNoRunnerNote,
  noRunnerNoteFor,
  runnerAccess,
  runnerPausePatch,
} from './_lib/runnerRegistry';
import { registeredRunners, sweepExpiredPairings } from './_lib/runnerRegistryStore';
import { RUNNER_PROTOCOL_MIN, STOP_RUN_PROTOCOL } from '@warehaus/runner-protocol';
import { aliveWriteDue } from './_lib/buildRun';
import { PRODUCTION_DEPLOYMENT } from './_lib/reviewPreview';
import { uniqueMilestoneBranch } from './_lib/milestoneBranchStore';
import { planningRunsInWindow, queuePlanning } from './planningQueue';

/** Building milestones looked at for one claim. Oldest first. */
const CLAIM_MILESTONE_SCAN = 25;
/** Milestones one claim inspects for a single project, inside that scan. */
const CLAIM_PER_PROJECT = 5;
/** Linked tasks read per milestone when a run's claimed tasks are blocked, released or listed. */
const CLAIM_TASK_SCAN = 100;
const DEDUPE_SCAN = 30;

type Failure = { ok: false; status: number; error: string };

function failure(status: number, error: string): Failure {
  return { ok: false, status, error };
}

export async function writeEvent(
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

/** Closes open Asks on a milestone. With a task, only that task's blocked Ask. */
async function answerNotes(
  ctx: MutationCtx,
  milestoneId: Id<'milestones'>,
  match: { reason: AskReason; taskId?: Id<'tasks'> },
) {
  await closeAsksOnMilestone(
    ctx,
    milestoneId,
    (ask) => ask.reason === match.reason && (!match.taskId || ask.taskId === match.taskId),
  );
}

export const TOO_MANY_TASKS_NOTE = 'This milestone has too many tasks to check. Close or split some.';

/**
 * The note wrap-up leaves when the task set is over the cap. Open: one note,
 * never a second. Closed: the note goes once the set can be read again.
 */
async function tooManyTasksNote(
  ctx: MutationCtx,
  milestone: Doc<'milestones'>,
  input: { open: true; addedBy: string; at: number } | { open: false },
) {
  const notes = await openAsksOnMilestone(ctx, milestone._id);
  const existing = notes.filter((note) => note.reason === 'blocked' && note.body === TOO_MANY_TASKS_NOTE);
  if (!input.open) {
    for (const note of existing) await closeAsk(ctx, note);
    return;
  }
  if (existing.length > 0) return;
  await openAsk(ctx, milestone, { reason: 'blocked', body: TOO_MANY_TASKS_NOTE, addedBy: input.addedBy, at: input.at });
}

/** The first open tasks a person has to close, from the whole task set. */
async function waitingOnPersonNames(ctx: QueryCtx, milestone: Doc<'milestones'>): Promise<string[]> {
  const loaded = await loadMilestoneTaskSet(ctx, milestone);
  if (!loaded.ok) return [];
  return loaded.set.waitingOnPerson.slice(0, 5).map((task) => task.doc.name);
}

/** What a runner is told about the milestone, including the project's repository, so it works in its own clone. */
async function milestoneContext(ctx: QueryCtx, milestone: Doc<'milestones'>, branch: string) {
  const project = await ctx.db.get(milestone.projectId);
  return {
    id: milestone._id,
    repo: agentRepo(project?.agentRepo),
    name: milestone.name,
    objective: milestone.objective,
    goals: milestone.goals,
    status: milestone.status,
    branch,
    prUrl: milestone.prUrl ?? null,
    /** Set once Peter presses Approve designs. The task prompt says so. */
    designApprovedAt: milestone.designApprovedAt ?? null,
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
 * Called first by every runner route. A runner is let in only by its
 * registration: the hash of its bearer token matches.
 * The runner row is patched at most once a minute. Calls inside that minute
 * do not write, unless the runner's protocol version or its paused flag changed.
 * `paused` comes from the runner app: absent means "not saying", so an older
 * runner never clears a pause.
 */
export const touchRunner = internalMutation({
  args: {
    runnerId: v.string(),
    tokenHash: v.optional(v.string()),
    protocolVersion: v.optional(v.number()),
    paused: v.optional(v.boolean()),
    /** Protocol 4: the run ids the runner holds right now. Each gets a sign of life. */
    alive: v.optional(v.array(v.string())),
  },
  handler: async (ctx, { runnerId, tokenHash, protocolVersion, paused, alive }) => {
    const now = Date.now();
    const row = await ctx.db
      .query('agentRunners')
      .withIndex('by_runnerId', (q) => q.eq('runnerId', runnerId))
      .unique();
    const access = runnerAccess({ row, tokenHash });
    if (!access) return failure(401, RUNNER_UNAUTHORIZED);
    const registered = access === 'registered';
    const decision = runnerTouchDecision({
      lastSeenAt: row?.lastSeenAt,
      windowStart: row?.windowStart,
      count: row?.count,
      now,
    });
    if (!decision.ok) return failure(429, decision.reason);
    // Protocol 5: a held run staff stopped is named in the answer until the runner lets go of it.
    const stop = alive?.length ? await markRunsAlive(ctx, runnerId, alive, now) : [];
    const stops = stop.length && (protocolVersion ?? 0) >= STOP_RUN_PROTOCOL ? { stop } : {};
    const versionChanged = protocolVersion != null && row?.protocolVersion !== protocolVersion;
    const pause = runnerPausePatch(row?.pausedAt, paused, now);
    if (!decision.write) {
      if (row && (versionChanged || pause)) {
        await ctx.db.patch(row._id, { ...(versionChanged ? { protocolVersion } : {}), ...(pause ?? {}) });
      }
      return { ok: true as const, registered, ...stops };
    }
    const version = protocolVersion != null ? { protocolVersion } : {};
    if (row) {
      const same =
        row.windowStart === decision.windowStart &&
        row.count === decision.count &&
        row.lastSeenAt === decision.lastSeenAt &&
        !versionChanged &&
        !pause;
      if (!same) {
        await ctx.db.patch(row._id, {
          windowStart: decision.windowStart,
          count: decision.count,
          lastSeenAt: decision.lastSeenAt,
          ...version,
          ...(pause ?? {}),
        });
      }
    } else {
      await ctx.db.insert('agentRunners', {
        runnerId,
        windowStart: decision.windowStart,
        count: decision.count,
        lastSeenAt: decision.lastSeenAt,
        ...version,
      });
    }
    return { ok: true as const, registered, ...stops };
  },
});

/**
 * Signs of life (protocol 4). Each run id the runner says it holds, that is
 * its own and still running, gets `aliveAt`, at most once a minute. A point
 * read per id, capped at the runner's slots, so this stays a few reads.
 * Returns the held runs staff stopped (Stop run), from the same reads: the
 * runner still works them and has to be told.
 */
async function markRunsAlive(ctx: MutationCtx, runnerId: string, runIds: readonly string[], now: number): Promise<string[]> {
  const stopped: string[] = [];
  for (const raw of runIds.slice(0, RUNNER_MAX_SLOTS * 2)) {
    const id = ctx.db.normalizeId('agentRuns', raw);
    if (!id) continue;
    const run = await ctx.db.get(id);
    if (!run || run.runnerId !== runnerId) continue;
    if (run.status !== 'running') {
      if (run.stoppedAt != null) stopped.push(run._id);
      continue;
    }
    if (!aliveWriteDue(run.aliveAt, now)) continue;
    await ctx.db.patch(run._id, { aliveAt: now });
  }
  return stopped;
}

/** The runner's open runs, oldest first. Capped: a runner holds at most RUNNER_MAX_SLOTS. */
async function runningRunsFor(ctx: MutationCtx, runnerId: string) {
  return ctx.db
    .query('agentRuns')
    .withIndex('by_runner_status', (q) => q.eq('runnerId', runnerId).eq('status', 'running'))
    .take(RUNNER_MAX_SLOTS * 2);
}

/** Marks an ended run as settled: the runner answered for it. Writes once. */
async function settleRun(ctx: MutationCtx, run: Doc<'agentRuns'>, at: number) {
  if (run.status === 'running' || run.settledAt != null) return;
  await ctx.db.patch(run._id, { settledAt: at });
}

/** Runs one idle claim settles for a runner. */
const SETTLE_SCAN = 5;

/**
 * A runner that asks for work says which runs it is still working on. Any
 * task or planning run the stuck sweep closed under it that it does not list
 * is over, so its hold on the milestone ends here. A Cursor build is left
 * alone: its agent runs in the cloud whether or not the runner is busy.
 */
async function settleIdleRunner(ctx: MutationCtx, runnerId: string, held: ReadonlySet<string>, at: number) {
  const closed = await ctx.db
    .query('agentRuns')
    .withIndex('by_runner_status', (q) => q.eq('runnerId', runnerId).eq('status', 'cancelled'))
    .order('desc')
    .take(SETTLE_SCAN);
  for (const run of closed) {
    if (run.kind !== 'build' && !held.has(run._id)) await settleRun(ctx, run, at);
  }
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
      milestone: await milestoneContext(ctx, milestone, branch),
    };
  }
  if (run.kind === 'build') {
    const claim = await loadClaimableTasks(ctx, milestone);
    return {
      kind: 'build' as const,
      driver: 'cursor' as const,
      runId: run._id,
      externalId: run.externalId ?? null,
      externalUrl: run.externalUrl ?? null,
      milestone: await milestoneContext(ctx, milestone, branch),
      tasks: claim.ok ? claim.openBuild.map(buildTaskPayload) : [],
    };
  }
  const task = run.taskId ? await ctx.db.get(run.taskId) : null;
  if (!task) return null;
  return {
    kind: 'task' as const,
    runId: run._id,
    milestone: await milestoneContext(ctx, milestone, branch),
    task: {
      id: task._id,
      order: (task.milestoneOrder ?? 0) + 1,
      title: task.name,
      detail: task.description ?? '',
      origin: task.origin ?? null,
      round: task.round ?? null,
      /** Design tasks work in Figma and never change code (task.md). */
      kind: taskKind(task),
      /** Staff's answer to what the last run asked (Answer and rerun). It goes into the prompt. */
      answer: task.rerunAnswer ? { question: task.rerunAnswer.question, answer: task.rerunAnswer.answer } : null,
    },
    driver: 'claude_code' as const,
  };
}

/** One task in a Cursor build's payload. */
function buildTaskPayload({ doc: task }: LoadedTask) {
  return {
    id: task._id,
    order: (task.milestoneOrder ?? 0) + 1,
    title: task.name,
    detail: task.description ?? '',
    kind: taskKind(task),
  };
}

/**
 * Hands the runner its next piece of work in one transaction: a planning job
 * first, else the lowest-order To do task on the oldest Building milestone.
 * A runner works up to `slots` runs at once, each on a different milestone,
 * and lists the runs it holds. An open run it does not list comes back to it,
 * so a repeated call never claims twice.
 */
export const claimNext = internalMutation({
  args: {
    runnerId: v.string(),
    mode: v.optional(v.string()),
    tool: v.optional(v.string()),
    /** Repositories this runner serves, as owner/name. Work for any other project is not handed over. */
    repos: v.optional(v.any()),
    /**
     * A registered runner that names no repository serves every project that
     * names one (ADR-0005 amendment). It still gets nothing for a project with none.
     */
    anyRepo: v.optional(v.boolean()),
    /** Run slots: how many runs the runner works at once, one per milestone (1 to RUNNER_MAX_SLOTS). */
    slots: v.optional(v.number()),
    /** The run ids the runner is working on now. */
    held: v.optional(v.array(v.string())),
    /** Protocol 4: the runner sends a sign of life for each run, so a new run starts with one. */
    signsOfLife: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const repos = runnerRepos(args.repos);
    const slots = runnerSlots(args.slots);
    const held = heldRunIds(args.held);
    const anyRepo = args.anyRepo === true && repos.length === 0;
    // Fail safe: a runner that names no repository, and is not registered, is handed nothing.
    if (repos.length === 0 && !anyRepo) return { ok: true as const, resumed: false, kind: 'none' as const, reason: RUNNER_NEEDS_REPO };
    const served = async (projectId: Id<'projects'>) => {
      const project = await ctx.db.get(projectId);
      return anyRepo ? agentRepo(project?.agentRepo) != null : projectServedBy(project, repos);
    };
    const open = await runningRunsFor(ctx, args.runnerId);
    const decision = openRunDecision({ open: open.map((run) => run._id), held, slots });
    const lost = decision.resume ? open.find((run) => run._id === decision.resume) : undefined;
    if (lost) {
      const payload = await runPayload(ctx, lost);
      if (payload) return { ok: true as const, resumed: true, ...payload };
      // The task or milestone behind the run is gone. Close it and look again.
      const closedAt = Date.now();
      await ctx.db.patch(lost._id, { status: 'cancelled', endedAt: closedAt, settledAt: closedAt });
    }
    const now = Date.now();
    await settleIdleRunner(ctx, args.runnerId, new Set(held), now);
    if (decision.full) return { ok: true as const, resumed: false, kind: 'none' as const, reason: RUNNER_BUSY };
    const mode = runMode(args.mode);

    const inspected = new Map<string, number>();
    const roomFor = (projectId: string) => (inspected.get(projectId) ?? 0) < CLAIM_PER_PROJECT;
    const noteProject = (projectId: string) => inspected.set(projectId, (inspected.get(projectId) ?? 0) + 1);

    const queued = await ctx.db
      .query('milestones')
      .withIndex('by_planning', (q) => q.eq('planning', 'queued'))
      .take(CLAIM_MILESTONE_SCAN);
    for (const planning of queued) {
      if (planning.archivedAt != null) continue;
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
      await ctx.db.patch(planning._id, { planning: 'running', loopChangedAt: now });
      const runId = await ctx.db.insert('agentRuns', {
        orgId: planning.orgId,
        milestoneId: planning._id,
        kind: 'planning',
        runnerId: args.runnerId,
        tool: 'claude_code',
        mode,
        status: 'running',
        startedAt: now,
        ...(args.signsOfLife ? { aliveAt: now } : {}),
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
        milestone: await milestoneContext(ctx, planning, await branchFor(ctx, planning)),
      };
    }

    const building = await ctx.db
      .query('milestones')
      .withIndex('by_status', (q) => q.eq('status', 'Building'))
      .take(CLAIM_MILESTONE_SCAN);
    for (const milestone of building) {
      // An archived milestone is not built.
      if (milestone.archivedAt != null) continue;
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
      const claim = await loadClaimableTasks(ctx, milestone);
      if (!claim.ok) continue;
      if (driver === 'cursor') {
        const open = claim.openBuild;
        if (open.length === 0) continue;
        const recent = await ctx.db
          .query('agentRuns')
          .withIndex('by_milestone', (q) => q.eq('milestoneId', milestone._id))
          .order('desc')
          .take(10);
        if (recent.some((run) => run.kind === 'build' && run.status === 'failed')) continue;
        // The stuck sweep closed the last build but nobody saw its cloud agent
        // stop. Follow that agent. A second one would push to the same branch.
        const resume = cursorAgentToResume(recent);
        const followed = resume ? recent.find((run) => run.kind === 'build' && run.externalId === resume.externalId) : undefined;
        const runId = await ctx.db.insert('agentRuns', {
          orgId: milestone.orgId,
          milestoneId: milestone._id,
          kind: 'build',
          runnerId: args.runnerId,
          tool: 'cursor',
          mode,
          status: 'running',
          startedAt: now,
          ...(args.signsOfLife ? { aliveAt: now } : {}),
          ...(resume ? { externalId: resume.externalId } : {}),
          ...(resume?.externalUrl ? { externalUrl: resume.externalUrl } : {}),
          agentStartedAt: followed ? (followed.agentStartedAt ?? followed.startedAt) : now,
        });
        await writeEvent(ctx, {
          orgId: milestone.orgId,
          milestoneId: milestone._id,
          runId,
          type: 'run',
          summary: resume
            ? `Cursor agent picked up again · ${args.runnerId} · ${open.length} tasks`
            : `Cursor agent started · ${args.runnerId} · ${open.length} tasks`,
          at: now,
        });
        for (const { doc: task } of open) {
          await ctx.db.patch(task._id, {
            status: 'In Progress',
            claimedBy: args.runnerId,
            claimedAt: now,
            blockedReason: undefined,
            blockedCause: undefined,
            updatedAt: now,
          });
        }
        const payload = await runPayload(ctx, (await ctx.db.get(runId)) as Doc<'agentRuns'>);
        if (payload) return { ok: true as const, resumed: false, ...payload };
        continue;
      }
      if (!claim.nextClaimable) continue;
      const task = claim.nextClaimable.doc;
      await ctx.db.patch(task._id, {
        status: 'In Progress',
        claimedBy: args.runnerId,
        claimedAt: now,
        blockedReason: undefined,
        blockedCause: undefined,
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
        ...(args.signsOfLife ? { aliveAt: now } : {}),
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
 * and `failed` both leave the task Blocked with its reason and Blocked cause
 * (Needs input or Failed) and open an Ask; a failed run also keeps the end of
 * its output. When the last open task is done the milestone moves to Ready to
 * Ship. A repeat for a run that already ended returns the stored outcome and
 * writes nothing: that is also what keeps a late result from undoing Stop run.
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
    /** Protocol 5: why a run that is not done stopped (`needs_input` or `failed`). */
    cause: v.optional(v.any()),
    /** Protocol 5: the end of the agent's output. Kept on a failed run only. */
    output: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const owned = await ownedRun(ctx, args.runnerId, args.runId);
    if (!owned.ok) return owned;
    const { run } = owned;
    if (run.kind !== 'task' || !run.taskId) return failure(400, 'That run is not a task run');
    const milestone = await ctx.db.get(run.milestoneId);
    if (run.status !== 'running') {
      await settleRun(ctx, run, Date.now());
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
    await ctx.db.patch(run._id, {
      status: decision.run,
      endedAt: now,
      settledAt: now,
      ...(decision.status !== 'done' && decision.reason ? { blockedReason: decision.reason } : {}),
      ...(decision.output ? { failureOutput: decision.output } : {}),
    });
    if (!task || !milestone) return { ok: true as const, duplicate: false, run: decision.run, milestoneStatus: null };

    await ctx.db.patch(task._id, {
      status: decision.task.status,
      isDone: decision.task.isDone,
      claimedBy: decision.status === 'blocked' ? task.claimedBy : undefined,
      claimedAt: decision.status === 'blocked' ? task.claimedAt : undefined,
      blockedReason: decision.status === 'done' ? undefined : (decision.reason ?? undefined),
      blockedCause: decision.cause ?? undefined,
      // The answer is spent once the task is done, or once the run asks something new.
      ...(task.rerunAnswer && (decision.status === 'done' || decision.cause === 'needs_input') ? { rerunAnswer: undefined } : {}),
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
      await openAsk(ctx, milestone, {
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
 * When every task that is not Parked is done, move to Ready to Ship, store the local preview,
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
  if (milestone.status !== 'Building') return milestone.status;
  const loaded = await loadMilestoneTaskSet(ctx, milestone);
  if (!loaded.ok) {
    // Too many tasks to check. It stays in Building and says so, once.
    await tooManyTasksNote(ctx, milestone, { open: true, addedBy: `runner:${runnerId}`, at: now });
    return milestone.status;
  }
  await tooManyTasksNote(ctx, milestone, { open: false });
  // The last design task done on a visual milestone asks Peter to approve the designs.
  await syncDesignAsk(ctx, milestone, { addedBy: `runner:${runnerId}`, at: now, rows: loaded.set.tasks });
  if (!loaded.set.allDone) return milestone.status;
  const moved = await changeMilestoneStatus(ctx, milestone, {
    cause: 'set',
    to: 'Ready to Ship',
    actorName: `Runner ${runnerId}`,
    noteAuthor: `runner:${runnerId}`,
    at: now,
    readyLine: 'All tasks done · milestone is Ready to Ship',
    prUrl,
  });
  if (!moved.ok || !moved.wrote) return milestone.status;
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
      await settleRun(ctx, run, Date.now());
      return { ok: true as const, duplicate: true, taskIds: [] as Id<'tasks'>[], milestoneStatus: milestone?.status ?? null };
    }
    if (!milestone) return failure(404, 'Milestone not found');
    if (milestone.status !== 'Planning') {
      const now = Date.now();
      await ctx.db.patch(run._id, { status: 'cancelled', endedAt: now, settledAt: now });
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
          ...(task.kind === 'design' ? { kind: 'design' as const } : {}),
          milestoneId: milestone._id,
          milestoneOrder: index,
          updatedAt: now,
        }),
      );
    }
    await ctx.db.patch(run._id, { status: 'succeeded', endedAt: now, settledAt: now });
    await ctx.db.patch(milestone._id, {
      planning: undefined,
      planningReplace: undefined,
      planningBlockedReason: undefined,
      loopChangedAt: now,
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

/**
 * Ends a planning run that wrote nothing. The planning job is blocked with its
 * reason and leaves an Ask waiting on Peter; staff press Retry to queue it again.
 * It is not put straight back in the queue (ADR-0001, amendment 2026-11-22).
 */
export const failPlanning = internalMutation({
  args: { runnerId: v.string(), runId: v.string(), reason: v.optional(v.any()) },
  handler: async (ctx, args) => {
    const owned = await ownedRun(ctx, args.runnerId, args.runId);
    if (!owned.ok) return owned;
    const { run } = owned;
    if (run.kind !== 'planning') return failure(400, PLAN_NOT_PLANNING);
    if (run.status !== 'running') {
      await settleRun(ctx, run, Date.now());
      return { ok: true as const, duplicate: true };
    }
    const now = Date.now();
    const reason = eventSummary(typeof args.reason === 'string' && args.reason.trim() ? args.reason : 'The planning run failed');
    const why = reason.ok ? reason.summary : 'The planning run failed';
    await ctx.db.patch(run._id, { status: 'failed', endedAt: now, blockedReason: why, settledAt: now });
    const milestone = await ctx.db.get(run.milestoneId);
    if (milestone?.planning === 'running') {
      await ctx.db.patch(milestone._id, { planning: 'blocked', planningBlockedReason: why, loopChangedAt: now });
      await openAsk(ctx, milestone, {
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
 * The runner hands a run back untouched, because Claude hit the account usage
 * limit. The run is cancelled and settled, so it holds nothing. A task goes
 * back to To do and a plan back to the queue, with no Ask: the
 * runner takes new work again once the limit resets. Idempotent on the run.
 */
export const releaseRun = internalMutation({
  args: { runnerId: v.string(), runId: v.string(), reason: v.optional(v.any()) },
  handler: async (ctx, args) => {
    const owned = await ownedRun(ctx, args.runnerId, args.runId);
    if (!owned.ok) return owned;
    const { run } = owned;
    if (run.kind !== 'task' && run.kind !== 'planning') return failure(400, RELEASE_KIND_INVALID);
    if (run.status !== 'running') {
      await settleRun(ctx, run, Date.now());
      return { ok: true as const, duplicate: true };
    }
    const now = Date.now();
    const why = releaseReason(args.reason);
    await ctx.db.patch(run._id, { status: 'cancelled', endedAt: now, settledAt: now, blockedReason: why });
    const milestone = await ctx.db.get(run.milestoneId);
    let summary = `Run handed back · ${why}`;
    if (run.kind === 'task' && run.taskId) {
      const task = await ctx.db.get(run.taskId);
      if (task && !task.isDone && task.claimedBy === args.runnerId) {
        await ctx.db.patch(task._id, {
          status: 'To Do',
          isDone: false,
          claimedBy: undefined,
          claimedAt: undefined,
          blockedReason: undefined,
          blockedCause: undefined,
          updatedAt: now,
        });
      }
      if (task) summary = `Task ${String((task.milestoneOrder ?? 0) + 1).padStart(2, '0')} went back to To do · ${why}`;
    } else if (run.kind === 'planning') {
      if (milestone?.planning === 'running') await ctx.db.patch(milestone._id, { planning: 'queued', loopChangedAt: now });
      summary = `Planning went back to the queue · ${why}`;
    }
    await writeEvent(ctx, {
      orgId: run.orgId,
      milestoneId: run.milestoneId,
      runId: run._id,
      type: 'note',
      summary,
      at: now,
    });
    return { ok: true as const, duplicate: false };
  },
});

/**
 * Releases stuck runs: a protocol 4 run with no sign of life for 15 minutes
 * (Stalled), or an older run whose runner went quiet for 30. A task run is
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
      if (run.kind === 'build' && cursorBuildTooLong({ agentStartedAt: run.agentStartedAt, startedAt: run.startedAt, now })) {
        // One Cursor agent per milestone, and none past 2 hours: blocked with an Ask waiting on Peter.
        const long = await ctx.db.get(run.milestoneId);
        if (long) {
          await blockCursorBuild(ctx, run, long, run.runnerId, CURSOR_BUILD_TOO_LONG, now, false, 'failed');
          released += 1;
          continue;
        }
      }
      if (!runIsStuck({ lastSeenAt: runner?.lastSeenAt, startedAt: run.startedAt, now, aliveAt: run.aliveAt })) continue;
      const why = stuckRunReason(run.aliveAt);
      const milestone = await ctx.db.get(run.milestoneId);
      if (run.kind === 'build' && milestone) {
        await blockCursorBuild(ctx, run, milestone, run.runnerId, why, now, false, 'stalled');
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
            blockedCause: 'stalled',
            updatedAt: now,
          });
          if (milestone) {
            const order = String((task.milestoneOrder ?? 0) + 1).padStart(2, '0');
            await openAsk(ctx, milestone, {
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
        await ctx.db.patch(milestone._id, { planning: 'blocked', planningBlockedReason: why, loopChangedAt: now });
        await openAsk(ctx, milestone, {
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
        summary:
          run.aliveAt != null
            ? `Run blocked · stalled, no sign of life from ${run.runnerId} for 15 minutes`
            : `Run blocked · ${run.runnerId} went quiet for 30 minutes`,
        at: now,
      });
      released += 1;
    }
    // Expired runner pairings ride on the same cron: one indexed read, at most 50 deletes.
    const pairingsSwept = await sweepExpiredPairings(ctx, now);
    const noRunner = await noteMissingRunner(ctx, now);
    return { scanned: running.length, released, pairingsSwept, ...noRunner };
  },
});

/**
 * ADR-0005 amendment, alerts. A Building milestone with a repository that has
 * waited 30 minutes while no registered runner is online gets one open "needs
 * Peter" note, saying whether no runner is set up at all. The notes close when
 * a runner is online again, or when the milestone leaves Building. Bounded:
 * at most 10 runners, 50 open notes and 10 Building milestones per sweep.
 */
async function noteMissingRunner(ctx: MutationCtx, now: number) {
  const runners = await registeredRunners(ctx);
  const online = anyRunnerOnline(runners, now, RUNNER_READY_WITHIN_MS);
  const open = await openAsks(ctx, { limit: NO_RUNNER_NOTE_SCAN });
  const noted = new Map<string, Doc<'milestoneNotes'>>();
  for (const note of open) if (note.reason === 'blocked' && isNoRunnerNote(note.body)) noted.set(note.milestoneId, note);
  let closed = 0;
  let opened = 0;
  for (const note of noted.values()) {
    const milestone = online ? null : await ctx.db.get(note.milestoneId);
    if (!online && milestone?.status === 'Building' && milestone.archivedAt == null) continue;
    await closeAsk(ctx, note);
    closed += 1;
  }
  if (online) return { noRunnerOpened: opened, noRunnerClosed: closed };
  const building = await ctx.db
    .query('milestones')
    .withIndex('by_status', (q) => q.eq('status', 'Building'))
    .take(NO_RUNNER_SCAN);
  for (const milestone of building) {
    if (milestone.archivedAt != null || noted.has(milestone._id)) continue;
    const project = await ctx.db.get(milestone.projectId);
    const body = noRunnerNoteFor({
      online,
      registeredCount: runners.length,
      hasRepo: agentRepo(project?.agentRepo) != null,
      buildingSince: milestone.statusChangedAt ?? milestone._creationTime,
      now,
    });
    if (!body) continue;
    await openAsk(ctx, milestone, { reason: 'blocked', body, addedBy: 'portal', at: now });
    opened += 1;
  }
  return { noRunnerOpened: opened, noRunnerClosed: closed };
}

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
  const open = await openAsksOnMilestone(ctx, milestone._id);
  if (open.some((note) => note.reason === 'blocked' && !note.taskId)) return;
  await openAsk(ctx, milestone, {
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
  /** True when the runner reported it. The stuck sweep leaves the run unsettled. */
  settled: boolean,
  /** The Blocked cause its tasks carry: Stalled from the stuck sweep, else Failed. */
  cause: BlockedCause,
) {
  await ctx.db.patch(run._id, { status: 'failed', endedAt: now, blockedReason: why, ...(settled ? { settledAt: now } : {}) });
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
      blockedCause: cause,
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
      // The runner saw the agent end. A report that it is still running settles nothing.
      if (args.status === 'failed' || args.status === 'finished') await settleRun(ctx, run, Date.now());
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
      await blockCursorBuild(ctx, run, milestone, args.runnerId, why, now, true, 'failed');
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
        blockedCause: undefined,
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
        true,
        'failed',
      );
      return { ok: true as const, duplicate: false, milestoneStatus: milestone.status };
    }
    await ctx.db.patch(run._id, { status: 'succeeded', endedAt: now, settledAt: now });
    const milestoneStatus = await markReady(ctx, milestone, args.runnerId, now, prUrl ?? milestone.prUrl ?? null);
    return { ok: true as const, duplicate: false, milestoneStatus };
  },
});

/** Newest runs on a milestone that Retry looks at. */
const RETRY_RUN_SCAN = 10;

async function recentRuns(ctx: MutationCtx, milestoneId: Id<'milestones'>) {
  return ctx.db
    .query('agentRuns')
    .withIndex('by_milestone', (q) => q.eq('milestoneId', milestoneId))
    .order('desc')
    .take(RETRY_RUN_SCAN);
}

async function failedBuildRun(ctx: MutationCtx, milestoneId: Id<'milestones'>) {
  const recent = await recentRuns(ctx, milestoneId);
  return recent.find((run) => run.kind === 'build' && run.status === 'failed') ?? null;
}

/**
 * Clears a blocked task, a blocked Cursor build, or a blocked planning run.
 * Staff only. Refused, with nothing written, while the run it would replace
 * is still going or still winding down: see `retryLeaseDecision`.
 */
export async function retryBlockedWork(
  ctx: MutationCtx,
  args: { milestoneId: Id<'milestones'>; taskId?: Id<'tasks'> },
): Promise<{ ok: true } | Failure> {
  const milestone = await ctx.db.get(args.milestoneId);
  if (!milestone) return failure(404, 'Milestone not found');
  const now = Date.now();
  const lease = retryLeaseDecision({ runs: await recentRuns(ctx, milestone._id), taskId: args.taskId ?? null, now });
  if (!lease.ok) return failure(409, lease.reason);
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
        blockedCause: undefined,
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
        blockedCause: undefined,
        updatedAt: now,
      });
    }
    await closeAsksOnMilestone(ctx, milestone._id, (ask) => ask.reason === 'blocked' && !ask.taskId);
    return { ok: true };
  }
  if (args.taskId) return { ok: true };
  const decision = planningRetryDecision({
    status: milestone.status,
    planning: milestone.planning ?? null,
    recentRuns: await planningRunsInWindow(ctx, milestone._id, now),
  });
  if (!decision.ok) return failure(400, decision.reason);
  await ctx.db.patch(milestone._id, { planning: 'queued', planningBlockedReason: undefined, loopChangedAt: now });
  await closeAsksOnMilestone(ctx, milestone._id, (ask) => ask.reason === 'blocked' && !ask.taskId);
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

const taskOrderLabel = (task: Doc<'tasks'>) => String((task.milestoneOrder ?? 0) + 1).padStart(2, '0');

export const RERUN_DONE_TASK = 'A Done task is never rerun.';
export const FIX_TASK_NOT_FOUND = 'Task not found';
export const FIX_TASK_NO_MILESTONE = 'That task is not on a milestone.';

/**
 * Rerun, and Answer and rerun (decision 0013). Puts one Blocked task back in
 * To do, whichever task it is, and closes its Ask; the next claim runs it.
 * With an answer the task must be Needs input, and the answer is kept with
 * the question it answers for the next run's prompt. A Done task is never
 * rerun. Refused, with nothing written, while the task's last run is still
 * going or winding down. `by` is the staff member or bot, for the feed.
 */
export async function rerunTaskWork(
  ctx: MutationCtx,
  args: { taskId: Id<'tasks'>; by: string; answer?: unknown },
): Promise<{ ok: true } | Failure> {
  const task = await ctx.db.get(args.taskId);
  if (!task) return failure(404, FIX_TASK_NOT_FOUND);
  if (!task.milestoneId) return failure(400, FIX_TASK_NO_MILESTONE);
  if (task.isDone) return failure(400, RERUN_DONE_TASK);
  const blocked = taskRetryDecision(task);
  if (!blocked.ok) return failure(400, blocked.reason);
  let answer: string | null = null;
  if (args.answer !== undefined) {
    if (task.blockedCause !== 'needs_input') return failure(400, RERUN_NOT_NEEDS_INPUT);
    const parsed = rerunAnswerText(args.answer);
    if (!parsed.ok) return failure(400, parsed.reason);
    answer = parsed.answer;
  }
  const retried = await retryBlockedWork(ctx, { milestoneId: task.milestoneId, taskId: task._id });
  if (!retried.ok) return retried;
  const now = Date.now();
  if (answer) {
    await ctx.db.patch(task._id, { rerunAnswer: { question: task.blockedReason ?? '', answer, by: args.by, at: now } });
  }
  await writeEvent(ctx, {
    orgId: task.orgId,
    milestoneId: task.milestoneId,
    type: 'note',
    summary: `Task ${taskOrderLabel(task)} ${answer ? 'answered and queued to rerun' : 'queued to rerun'} · ${args.by}`,
    at: now,
  });
  return { ok: true };
}

/** Runs read to find the one going on a task. One runs at a time; the rest are its history. */
const TASK_RUN_SCAN = 3;

/**
 * Stop run (decision 0014). Closes the task's running run at once and leaves
 * the task Blocked, so the next claim does not start it again: staff Rerun it
 * when they want it back. The run is not settled, so it holds the task until
 * the runner lets go of it, and the runner is told to stop on its next claim
 * or ping (`touchRunner`). Commits already pushed stay on the branch, and
 * whatever the run reports afterwards is ignored: it has ended. Only for a
 * task run on a runner that honours stop. A second press writes nothing.
 */
export async function stopRunWork(
  ctx: MutationCtx,
  args: { taskId: Id<'tasks'>; by: string },
): Promise<{ ok: true; stopped: boolean } | Failure> {
  const task = await ctx.db.get(args.taskId);
  if (!task) return failure(404, FIX_TASK_NOT_FOUND);
  const runs = await ctx.db
    .query('agentRuns')
    .withIndex('by_task', (q) => q.eq('taskId', task._id))
    .order('desc')
    .take(TASK_RUN_SCAN);
  const run = runs.find((row) => row.status === 'running');
  // Already stopped: the same press twice.
  if (!run && runs[0]?.stoppedAt != null) return { ok: true, stopped: false };
  if (!run) return failure(409, STOP_NO_RUN);
  const runner = await ctx.db
    .query('agentRunners')
    .withIndex('by_runnerId', (q) => q.eq('runnerId', run.runnerId))
    .unique();
  const decision = stopRunDecision({ run, runnerProtocol: runner?.protocolVersion });
  if (!decision.ok) return failure(409, decision.reason);
  const now = Date.now();
  const why = stoppedReason(args.by);
  await ctx.db.patch(run._id, { status: 'cancelled', endedAt: now, stoppedAt: now, blockedReason: why });
  if (!task.isDone && task.claimedBy === run.runnerId) {
    await ctx.db.patch(task._id, {
      status: 'Blocked',
      claimedBy: undefined,
      claimedAt: undefined,
      blockedReason: why,
      blockedCause: 'failed',
      updatedAt: now,
    });
  }
  await writeEvent(ctx, {
    orgId: run.orgId,
    milestoneId: run.milestoneId,
    runId: run._id,
    type: 'stop',
    summary: `Run stopped · task ${taskOrderLabel(task)} · ${args.by}`,
    at: now,
  });
  return { ok: true, stopped: true };
}

/** Rerun on a Blocked card or in the Troubleshoot section. Any staff member. */
export const rerunTask = adminMutation({
  args: { taskId: v.id('tasks') },
  handler: async (ctx, args) => {
    const result = await rerunTaskWork(ctx, { taskId: args.taskId, by: ctx.identity.name });
    if (!result.ok) throw new PortalAuthError(result.error, 'FORBIDDEN');
    return { ok: true as const };
  },
});

/** Answer and rerun on a Needs input task. Any staff member. */
export const answerAndRerun = adminMutation({
  args: { taskId: v.id('tasks'), answer: v.string() },
  handler: async (ctx, args) => {
    const result = await rerunTaskWork(ctx, { taskId: args.taskId, by: ctx.identity.name, answer: args.answer });
    if (!result.ok) throw new PortalAuthError(result.error, 'FORBIDDEN');
    return { ok: true as const };
  },
});

/** Stop run in the Troubleshoot section. Any staff member. */
export const stopRun = adminMutation({
  args: { taskId: v.id('tasks') },
  handler: async (ctx, args) => {
    const result = await stopRunWork(ctx, { taskId: args.taskId, by: ctx.identity.name });
    if (!result.ok) throw new PortalAuthError(result.error, 'FORBIDDEN');
    return { ok: true as const, stopped: result.stopped };
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
          blockedCause: task.blockedCause ?? null,
        })),
      events: events.map((row) => ({ id: row._id, type: eventType(row.type), summary: row.summary, at: row.at })),
    };
  },
});

/**
 * The staff-only Troubleshoot section of the task modal (decision 0012): the
 * task's cause and reason or its run going, that run's events, the end of a
 * failed run's output, the branch and the last commit. Null when there is
 * nothing to troubleshoot. Indexed and capped: the task's newest runs, one
 * run's newest events and one runner row. Clients have no query here.
 */
export const taskTroubleshoot = adminQuery({
  args: { taskId: v.id('tasks') },
  handler: async (ctx, args): Promise<TroubleshootView | null> => {
    const task = await ctx.db.get(args.taskId);
    if (!task || !task.milestoneId || task.isDone) return null;
    const runs = await ctx.db
      .query('agentRuns')
      .withIndex('by_task', (q) => q.eq('taskId', task._id))
      .order('desc')
      .take(TASK_RUN_SCAN);
    const run = runs.find((row) => row.status === 'running') ?? runs[0] ?? null;
    if (run?.status !== 'running' && !(task.status === 'Blocked' && task.blockedCause)) return null;
    const events = run
      ? await ctx.db
          .query('agentEvents')
          .withIndex('by_run', (q) => q.eq('runId', run._id))
          .order('desc')
          .take(TROUBLESHOOT_EVENTS)
      : [];
    const runner =
      run?.status === 'running'
        ? await ctx.db
            .query('agentRunners')
            .withIndex('by_runnerId', (q) => q.eq('runnerId', run.runnerId))
            .unique()
        : null;
    const milestone = await ctx.db.get(task.milestoneId);
    return troubleshootView({
      task,
      run,
      events: events.map((row) => ({ id: row._id, summary: row.summary, at: row.at })),
      branch: milestone?.branch ?? null,
      runnerStops: stopRunDecision({ run, runnerProtocol: runner?.protocolVersion }).ok,
    });
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
          ? await waitingOnPersonNames(ctx, milestone)
          : [],
    };
  },
});

/** Running runs one runner is checked for. A runner holds one at a time. */
const HEALTH_RUN_SCAN = 5;
/** Milestones read to find one in Building. Same cap as the agent lock. */
const HEALTH_MILESTONE_SCAN = 100;

/**
 * Staff runner health for one project: is a repository set, which runners
 * may serve it, when each last called, and what is being worked on. Indexed
 * and capped. Runner ids and names only: a token never leaves this function.
 * Clients have no query here.
 */
export const runnerHealth = adminQuery({
  args: { projectId: v.id('projects') },
  handler: async (ctx, args): Promise<RunnerHealthView | null> => {
    const project = await ctx.db.get(args.projectId);
    if (!project) return null;
    const repo = agentRepo(project.agentRepo);
    const production = (process.env.CONVEX_CLOUD_URL ?? '').includes(PRODUCTION_DEPLOYMENT);
    // Registered runners serve every project with a repository.
    const registered = await registeredRunners(ctx);
    const base = { production, protocolMin: RUNNER_PROTOCOL_MIN, registeredCount: registered.length };
    if (!repo) return { ...base, repoSet: false, repo: null, runnerAllowed: false, runners: [], working: null, building: null };
    const runners: RunnerHealthView['runners'] = registered.map((row) => ({
      id: row.runnerId,
      lastSeenAt: row.lastSeenAt ?? null,
      registered: true,
      protocolVersion: row.protocolVersion ?? null,
      paused: row.pausedAt != null,
    }));
    if (runners.length === 0) return { ...base, repoSet: true, repo, runnerAllowed: false, runners: [], working: null, building: null };
    let working: RunnerHealthView['working'] = null;
    for (const { id } of runners) {
      if (working) break;
      const runs = await ctx.db
        .query('agentRuns')
        .withIndex('by_runner_status', (q) => q.eq('runnerId', id).eq('status', 'running'))
        .take(HEALTH_RUN_SCAN);
      for (const run of runs) {
        const milestone = await ctx.db.get(run.milestoneId);
        if (milestone && milestone.projectId === project._id) {
          working = { milestoneId: milestone._id, milestoneName: milestone.name };
          break;
        }
      }
    }
    const milestones = await ctx.db
      .query('milestones')
      .withIndex('by_projectId', (q) => q.eq('projectId', project._id))
      .take(HEALTH_MILESTONE_SCAN);
    const held = milestones.find((row) => row.status === 'Building' && row.archivedAt == null);
    return {
      ...base,
      repoSet: true,
      repo,
      runnerAllowed: true,
      runners,
      working,
      building: held ? { milestoneId: held._id, milestoneName: held.name } : null,
    };
  },
});
