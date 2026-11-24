/**
 * Task writes behind Mark complete, Archive, Restore and Undo. Each write
 * returns the task as it was, so Undo can put it back. A write that would
 * change nothing is skipped.
 *
 * Status and stage go through the task change (ADR-0003, actor `closeout`),
 * so they are stamped and written back like any other change. Archiving
 * queues the Notion page archive. Archive, restore and milestone moves are
 * portal only.
 */

import { v } from 'convex/values';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import { writebackAllowed } from '../sync/notion';
import { insertOutboxRow } from '../sync/outbox';
import { nextMilestoneOrder } from './milestones';
import { isPortalOwnedTask } from './milestoneTasks';
import { applyTaskChanges, type TaskChange } from './taskChange';

/** A parent and one level of subtasks, the same bound `archiveTask` has always used. */
export const ARCHIVE_CHILD_TAKE = 50;
/** Undo takes this many task snapshots at most. */
export const UNDO_TASK_CAP = 400;

export const taskSnapshotArg = v.object({
  taskId: v.id('tasks'),
  status: v.string(),
  isDone: v.boolean(),
  stage: v.union(v.string(), v.null()),
  milestoneId: v.union(v.id('milestones'), v.null()),
  milestoneOrder: v.union(v.number(), v.null()),
  archivedAt: v.union(v.number(), v.null()),
});

export type TaskSnapshot = {
  taskId: Id<'tasks'>;
  status: string;
  isDone: boolean;
  stage: string | null;
  milestoneId: Id<'milestones'> | null;
  milestoneOrder: number | null;
  archivedAt: number | null;
};

export function taskSnapshot(task: Doc<'tasks'>): TaskSnapshot {
  return {
    taskId: task._id,
    status: task.status,
    isDone: task.isDone,
    stage: task.stage ?? null,
    milestoneId: task.milestoneId ?? null,
    milestoneOrder: task.milestoneOrder ?? null,
    archivedAt: task.archivedAt ?? null,
  };
}

export type NotionMirror = 'off' | 'queued' | 'portal';

/** Collects the before-state of each task once, however many writes touch it. */
export class SnapshotLog {
  private readonly seen = new Map<string, TaskSnapshot>();

  note(task: Doc<'tasks'>) {
    if (!this.seen.has(task._id)) this.seen.set(task._id, taskSnapshot(task));
  }

  list(): TaskSnapshot[] {
    return [...this.seen.values()];
  }
}

/**
 * Archive one task and its subtasks. The same writes and the same Notion
 * page archive as `tasks.archiveTask`. An archived task is left as it is.
 */
export async function archiveTaskTree(
  ctx: MutationCtx,
  task: Doc<'tasks'>,
  at: number,
  actorId: string | undefined,
  log: SnapshotLog,
): Promise<{ wrote: boolean; notion: NotionMirror }> {
  if (task.archivedAt == null) {
    log.note(task);
    await ctx.db.patch(task._id, { archivedAt: at });
  }
  const children = await ctx.db
    .query('tasks')
    .withIndex('by_parentTaskId', (q) => q.eq('parentTaskId', task._id))
    .take(ARCHIVE_CHILD_TAKE);
  for (const child of children) {
    if (child.orgId !== task.orgId || child.archivedAt != null) continue;
    log.note(child);
    await ctx.db.patch(child._id, { archivedAt: at });
  }
  if (task.archivedAt != null) return { wrote: false, notion: 'portal' };
  // A task the portal owns has no Notion page to archive.
  if (isPortalOwnedTask(task)) return { wrote: true, notion: 'portal' };
  if (!task.notionPageId) return { wrote: true, notion: 'portal' };
  if (!writebackAllowed()) return { wrote: true, notion: 'off' };
  await insertOutboxRow(ctx, {
    idempotencyKey: `task-archive:${task.notionPageId}`,
    kind: 'task-archive',
    orgId: task.orgId,
    database: 'tasks',
    notionPageId: task.notionPageId,
    properties: {},
    actor: 'staff',
    actorId,
  });
  return { wrote: true, notion: 'queued' };
}

/** A closeout task change. Closeout passes only known statuses and stages, so a refusal is a bug. */
async function closeoutChange(
  ctx: MutationCtx,
  task: Doc<'tasks'>,
  changes: TaskChange[],
  actorId: string | undefined,
): Promise<{ wrote: boolean; notion: NotionMirror }> {
  const result = await applyTaskChanges(ctx, task, changes, { actor: 'closeout', actorId });
  if (!result.ok) throw new Error(`Closeout task change refused: ${result.error}`);
  return { wrote: result.wrote, notion: result.notion };
}

/** Done (or the restored status) through the task change. */
export async function writeTaskStatus(
  ctx: MutationCtx,
  task: Doc<'tasks'>,
  status: string,
  actorId: string | undefined,
  log: SnapshotLog,
): Promise<{ wrote: boolean; notion: NotionMirror }> {
  const isDone = status === 'Done';
  if (task.status === status && task.isDone === isDone) return { wrote: false, notion: 'portal' };
  log.note(task);
  return closeoutChange(ctx, task, [{ field: 'status', status }], actorId);
}

/** Leftover parked where it is. Stage is the field the close gate reads. */
export async function parkTask(
  ctx: MutationCtx,
  task: Doc<'tasks'>,
  log: SnapshotLog,
  actorId?: string,
): Promise<boolean> {
  if (task.stage === 'Parked') return false;
  log.note(task);
  const result = await closeoutChange(ctx, task, [{ field: 'stage', stage: 'Parked' }], actorId);
  return result.wrote;
}

/** Leftovers moved onto another milestone of the same project, after the tasks already there. */
export async function moveTasksToMilestone(
  ctx: MutationCtx,
  tasks: readonly Doc<'tasks'>[],
  target: Doc<'milestones'>,
  log: SnapshotLog,
): Promise<number> {
  if (tasks.length === 0) return 0;
  const siblings = await ctx.db
    .query('tasks')
    .withIndex('by_orgId_milestoneId', (q) => q.eq('orgId', target.orgId).eq('milestoneId', target._id))
    .take(ARCHIVE_CHILD_TAKE * 4);
  let order = nextMilestoneOrder(siblings.map((row) => row.milestoneOrder));
  let wrote = 0;
  for (const task of tasks) {
    if (task.milestoneId === target._id) continue;
    log.note(task);
    await ctx.db.patch(task._id, { milestoneId: target._id, milestoneOrder: order });
    order += 1;
    wrote += 1;
  }
  return wrote;
}

export async function detachTaskFromMilestone(ctx: MutationCtx, task: Doc<'tasks'>, log: SnapshotLog): Promise<boolean> {
  if (!task.milestoneId) return false;
  log.note(task);
  await ctx.db.patch(task._id, { milestoneId: undefined, milestoneOrder: undefined });
  return true;
}

/**
 * Undo. Puts each task back to its snapshot. A task outside `orgId`, or a
 * milestone on another project, is skipped. Only fields that differ are written.
 */
export async function restoreTaskSnapshots(
  ctx: MutationCtx,
  orgId: Id<'clients'> | null,
  snapshots: readonly TaskSnapshot[],
  actorId: string | undefined,
): Promise<number> {
  let wrote = 0;
  const milestoneOk = new Map<string, boolean>();
  for (const snapshot of snapshots.slice(0, UNDO_TASK_CAP)) {
    const task = await ctx.db.get(snapshot.taskId);
    if (!task || (orgId && task.orgId !== orgId)) continue;
    const changes: TaskChange[] = [];
    if (task.status !== snapshot.status || task.isDone !== snapshot.isDone) {
      changes.push({ field: 'status', status: snapshot.status });
    }
    if ((task.stage ?? null) !== snapshot.stage && snapshot.stage) {
      changes.push({ field: 'stage', stage: snapshot.stage });
    }
    const patch: Partial<Doc<'tasks'>> & Record<string, unknown> = {};
    // A stage the snapshot did not have is cleared in the portal only: Notion has no empty stage to write.
    if ((task.stage ?? null) !== snapshot.stage && !snapshot.stage) patch.stage = undefined;
    if ((task.archivedAt ?? null) !== snapshot.archivedAt) patch.archivedAt = snapshot.archivedAt ?? undefined;
    if ((task.milestoneId ?? null) !== snapshot.milestoneId) {
      let allowed = snapshot.milestoneId == null;
      if (snapshot.milestoneId != null) {
        const key = `${snapshot.milestoneId}:${task.projectId}`;
        if (!milestoneOk.has(key)) {
          const milestone = await ctx.db.get(snapshot.milestoneId);
          milestoneOk.set(key, milestone != null && milestone.orgId === task.orgId && milestone.projectId === task.projectId);
        }
        allowed = milestoneOk.get(key) === true;
      }
      if (allowed) {
        patch.milestoneId = snapshot.milestoneId ?? undefined;
        patch.milestoneOrder = snapshot.milestoneOrder ?? undefined;
      }
    } else if ((task.milestoneOrder ?? null) !== snapshot.milestoneOrder) {
      patch.milestoneOrder = snapshot.milestoneOrder ?? undefined;
    }
    if (changes.length === 0 && Object.keys(patch).length === 0) continue;
    if (changes.length > 0) await closeoutChange(ctx, task, changes, actorId);
    if (Object.keys(patch).length > 0) await ctx.db.patch(task._id, { ...patch, updatedAt: Date.now() });
    wrote += 1;
  }
  return wrote;
}

/**
 * Restore an archived task. Its subtasks archived in the same write come back
 * with it. A subtask archived on its own stays archived.
 */
export async function restoreTaskTree(ctx: MutationCtx, task: Doc<'tasks'>, log: SnapshotLog): Promise<boolean> {
  if (task.archivedAt == null) return false;
  log.note(task);
  await ctx.db.patch(task._id, { archivedAt: undefined });
  const children = await ctx.db
    .query('tasks')
    .withIndex('by_parentTaskId', (q) => q.eq('parentTaskId', task._id))
    .take(ARCHIVE_CHILD_TAKE);
  for (const child of children) {
    if (child.orgId !== task.orgId || child.archivedAt !== task.archivedAt) continue;
    log.note(child);
    await ctx.db.patch(child._id, { archivedAt: undefined });
  }
  return true;
}
