/**
 * Task change (see GLOSSARY.md, ADR-0003). The one way a task's fields are
 * edited by staff, the staff API, a merged pull request, or closeout.
 *
 * `applyTaskChanges(ctx, task, changes, options)`:
 * - checks every change first: archived, stale, portal-owned rules, field
 *   rules, a dead or conflicting earlier write. A refusal writes nothing.
 * - then saves the row once: every changed field, its stamp, and for a stage
 *   move the pending stage.
 * - then, when the task has a Notion page and the write policy allows
 *   write-back, queues one outbox row per write kind.
 *
 * It never returns `ok: false` after a write. Anything unexpected after the
 * first write throws, so Convex undoes the whole change.
 */

import {
  NEXT_ACTION_MAX,
  isTaskStage,
  notionStage,
  stageMoved,
  type StageMoveResult,
  notionOnlyStageReason,
  planTaskDescriptionWrite,
  planTaskLiveFieldsWrite,
  planTaskResourceWrite,
  planTaskStageWrite,
  taskStatusIdempotencyKey,
  unstagedMoveAllowed,
  validatePropertyPatch,
  validateTaskStatusUpdate,
  type OutboxKind,
  type TaskFieldStamps,
  type TaskStampedField,
  type WriteProperties,
} from '@warehaus/portal-sync';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import { findOutboxRow, insertOutboxRow } from '../sync/outbox';
import { writebackAllowed } from '../sync/notion';
import { isPortalOwnedTask } from './milestoneTasks';

export type TaskChange =
  | { field: 'status'; status: string }
  | {
      field: 'stage';
      stage: string;
      pullRequestLink?: string;
      /** Set only after GitHub confirmed the pull request is merged. */
      verifiedMerge?: boolean;
      /** The merge webhook: Shipped from a merged pull request. */
      allowReviewStage?: boolean;
    }
  | { field: 'date'; date: string | null }
  | { field: 'estimate'; estimate: string | null }
  | { field: 'priority'; priority: string | null }
  | { field: 'source'; source: string | null }
  | { field: 'publishToWarehaus'; publishToWarehaus: boolean }
  | { field: 'nextAction'; nextAction: string | null }
  | { field: 'description'; description: string }
  | { field: 'resources'; resourceNotionIds: string[] }
  | { field: 'assignee'; assigneeContactId: Id<'contacts'> | null };

export type TaskChangeField = TaskChange['field'];

/** Who made the change. Closeout may change archived and portal-owned tasks' status. */
export type TaskChangeActor = 'staff' | 'api' | 'webhook' | 'closeout';

export type TaskChangeOptions = {
  actor: TaskChangeActor;
  /** Contact id or token name. Stamped on each field and kept on the outbox row. */
  actorId?: string;
  /** The task's `lastEditedTime` the caller last saw. A different value refuses the change. */
  expectedLastEditedTime?: string;
  at?: number;
};

export type TaskChangeNotion = 'queued' | 'portal' | 'off';

export type TaskChangeResult =
  | {
      ok: true;
      /** False when every field already held the new value. Nothing was written. */
      wrote: boolean;
      /** `queued`: written back. `off`: the write policy refused write-back. `portal`: nothing for Notion. */
      notion: TaskChangeNotion;
      outboxIds: Id<'notionOutbox'>[];
      /** The assignee's name after an assignee change. */
      assigneeName?: string | null;
    }
  | { ok: false; code: TaskChangeRefusal; error: string };

export type TaskChangeRefusal = 'stale' | 'refused' | 'conflict' | 'invalid';

export const RESTORE_FIRST = 'Restore the task first.';
export const TASK_CHANGED_IN_NOTION = 'This task changed in Notion. Check it and try again.';
export const PORTAL_TASK_STATUS = "Notion can't set this task's status. It lives in the portal.";
export const PORTAL_TASK_DETAIL = "Edit this task's detail on its milestone.";
export const EDIT_IN_NOTION = 'Edit in Notion';
export const EARLIER_WRITE_FAILED = 'Notion refused this change earlier. Check the task in Notion.';
export const CHOOSE_ASSIGNEE = 'Choose someone on this client';
export const USE_CALENDAR_DAY = 'Use a calendar day';

const OUTBOX_ROWS_PER_PAGE = 50;

type Refusal = Extract<TaskChangeResult, { ok: false }>;
const refuse = (code: TaskChangeRefusal, error: string): Refusal => ({ ok: false, code, error });

/** One outbox row the change will queue. */
type PlannedWrite = { kind: OutboxKind; properties: WriteProperties; idempotencyKey: string };

/** A real UTC calendar day, or null to clear. */
export function calendarDay(value: string | null): string | null | 'bad' {
  if (value == null) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'bad';
  const [year, month, day] = value.split('-').map(Number);
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return 'bad';
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return 'bad';
  return value;
}

function text(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

function sameIds(a: readonly string[] | null | undefined, b: readonly string[]): boolean {
  const left = [...new Set(a ?? [])].sort();
  const right = [...new Set(b)].sort();
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

/** The newest outbox rows for one page, bounded. Stage moves look here for inflight and unsent rows. */
async function recentPageRows(ctx: MutationCtx, notionPageId: string) {
  return ctx.db
    .query('notionOutbox')
    .withIndex('by_notionPageId', (q) => q.eq('notionPageId', notionPageId))
    .order('desc')
    .take(OUTBOX_ROWS_PER_PAGE);
}

/** Queued or failed task-stage rows for a page, other than `keepKey`. Inflight, done and conflict stay. */
export async function deleteUnsentStageRows(ctx: MutationCtx, notionPageId: string, keepKey?: string): Promise<number> {
  let deleted = 0;
  for (const row of await recentPageRows(ctx, notionPageId)) {
    if (row.kind !== 'task-stage') continue;
    if (row.status !== 'queued' && row.status !== 'failed') continue;
    if (keepKey && row.idempotencyKey === keepKey) continue;
    await ctx.db.delete(row._id);
    deleted += 1;
  }
  return deleted;
}

/**
 * Apply one task change. Every change in `changes` names a different field.
 * See the module comment for the order of checks and writes.
 */
export async function applyTaskChanges(
  ctx: MutationCtx,
  task: Doc<'tasks'>,
  changes: readonly TaskChange[],
  options: TaskChangeOptions,
): Promise<TaskChangeResult> {
  if (changes.length === 0) return refuse('invalid', 'At least one field is required');
  const fields = new Set(changes.map((change) => change.field));
  if (fields.size !== changes.length) return refuse('invalid', 'Each field can change once');
  if (task.archivedAt != null && options.actor !== 'closeout') return refuse('refused', RESTORE_FIRST);
  const base = typeof task.lastEditedTime === 'string' ? task.lastEditedTime : '';
  // A Portal-only task has no Notion page, so there is no Notion edit time to
  // compare. Callers often send one anyway (blank, updatedAt, a dummy); ignore it.
  const portalOwned = isPortalOwnedTask(task);
  if (!portalOwned && options.expectedLastEditedTime !== undefined && options.expectedLastEditedTime !== base) {
    return refuse('stale', TASK_CHANGED_IN_NOTION);
  }

  const notionBacked = !portalOwned && Boolean(task.notionPageId) && Boolean(base);
  const at = options.at ?? Date.now();
  const stamp = { updatedAt: at, updatedBy: options.actorId ?? options.actor };

  const patch: Partial<Doc<'tasks'>> = {};
  const stamped: TaskStampedField[] = [];
  const writes: PlannedWrite[] = [];
  const liveFields: { estimate?: string | null; priority?: string | null; source?: string | null; publishToWarehaus?: boolean; nextAction?: string | null } = {};
  let stageMove: { stage: string; pullRequestLink: string | null; key: string } | null = null;
  let assigneeName: string | null | undefined;

  for (const change of changes) {
    switch (change.field) {
      case 'status': {
        // Staff, the staff API, closeout and the runner set a Portal-only task's status. Notion never does: it has no page.
        if (portalOwned && options.actor === 'webhook') return refuse('refused', PORTAL_TASK_STATUS);
        const valid = validateTaskStatusUpdate(change.status);
        if (!valid.ok) return refuse('invalid', valid.errors.join('; '));
        const isDone = change.status === 'Done';
        if (task.status === change.status && task.isDone === isDone) break;
        patch.status = change.status;
        patch.isDone = isDone;
        stamped.push('status');
        writes.push({
          kind: 'task-status',
          properties: { Status: change.status },
          idempotencyKey: taskStatusIdempotencyKey(task.notionPageId, change.status, base),
        });
        break;
      }
      case 'stage': {
        const current = typeof task.stage === 'string' ? task.stage : '';
        if (current === change.stage) break;
        if (options.actor === 'closeout') {
          // Closeout parks a leftover or puts a task back as Undo had it, so
          // the staff move rules (unstaged, Shipped) do not apply.
          if (!isTaskStage(change.stage)) return refuse('invalid', 'Unknown stage');
          const key = `task-stage:${task.notionPageId}:${change.stage}::${base || 'portal'}`;
          patch.stage = change.stage;
          stamped.push('stage');
          stageMove = { stage: change.stage, pullRequestLink: null, key };
          writes.push({ kind: 'task-stage', properties: { Stage: change.stage }, idempotencyKey: key });
          break;
        }
        const leaving = notionOnlyStageReason(current);
        if (leaving) return refuse('refused', leaving);
        if (!isTaskStage(current) && !unstagedMoveAllowed(change.stage)) {
          return refuse('refused', 'Tasks with no stage can move to Idea or Planning.');
        }
        // The planner holds the stage rules. A portal-owned task has no real
        // base time, so its key is unused.
        const planned = planTaskStageWrite({
          actor: 'staff',
          stage: change.stage,
          pullRequestLink: change.pullRequestLink,
          notionPageId: task.notionPageId,
          expectedLastEditedTime: base || 'portal',
          verifiedMerge: change.verifiedMerge === true,
          allowReviewStage: change.allowReviewStage === true,
        });
        if (!planned.ok) return refuse(isTaskStage(change.stage) ? 'refused' : 'invalid', planned.error);
        const link = planned.properties['GitHub Issue/PR'];
        patch.stage = change.stage;
        stamped.push('stage');
        stageMove = { stage: change.stage, pullRequestLink: typeof link === 'string' ? link : null, key: planned.idempotencyKey };
        writes.push({ kind: 'task-stage', properties: planned.properties, idempotencyKey: planned.idempotencyKey });
        break;
      }
      case 'date': {
        const day = calendarDay(change.date);
        if (day === 'bad') return refuse('invalid', USE_CALENDAR_DAY);
        if ((task.date ?? null) === day) break;
        patch.date = day ?? undefined;
        stamped.push('date');
        const properties: WriteProperties = { Date: day };
        const valid = validatePropertyPatch({ database: 'tasks', properties });
        if (!valid.ok) return refuse('invalid', valid.errors.join('; '));
        writes.push({ kind: 'task-date', properties, idempotencyKey: `task-date:${task.notionPageId}:${day ?? ''}:${base}` });
        break;
      }
      case 'estimate':
      case 'priority':
      case 'source': {
        const raw = change.field === 'estimate' ? change.estimate : change.field === 'priority' ? change.priority : change.source;
        const value = text(raw);
        if ((task[change.field] ?? null) === value) break;
        patch[change.field] = value ?? undefined;
        stamped.push(change.field);
        liveFields[change.field] = value;
        break;
      }
      case 'nextAction': {
        const value = text(change.nextAction);
        if (value && value.length > NEXT_ACTION_MAX) return refuse('invalid', 'Next action is too long');
        if ((task.nextAction ?? null) === value) break;
        patch.nextAction = value;
        stamped.push('nextAction');
        liveFields.nextAction = value;
        break;
      }
      case 'publishToWarehaus': {
        if (task.publishToWarehaus === change.publishToWarehaus) break;
        patch.publishToWarehaus = change.publishToWarehaus;
        stamped.push('publishToWarehaus');
        liveFields.publishToWarehaus = change.publishToWarehaus;
        break;
      }
      case 'description': {
        if (portalOwned) return refuse('refused', PORTAL_TASK_DETAIL);
        if (task.descriptionSource === 'body') return refuse('refused', EDIT_IN_NOTION);
        const planned = planTaskDescriptionWrite({
          actor: 'staff',
          description: change.description,
          notionPageId: task.notionPageId,
          expectedLastEditedTime: base || 'portal',
        });
        if (!planned.ok) return refuse('invalid', planned.error);
        const value = planned.properties.Description;
        if ((task.description ?? '') === value) break;
        patch.description = value.length > 0 ? value : undefined;
        patch.descriptionSource = value.length > 0 ? 'property' : 'none';
        stamped.push('description');
        writes.push({ kind: 'task-description', properties: planned.properties, idempotencyKey: planned.idempotencyKey });
        break;
      }
      case 'resources': {
        const planned = planTaskResourceWrite({
          actor: 'staff',
          resourceNotionIds: change.resourceNotionIds,
          notionPageId: task.notionPageId,
          expectedLastEditedTime: base || 'portal',
        });
        if (!planned.ok) return refuse('invalid', planned.error);
        const ids = planned.properties.Resources as string[];
        if (sameIds(task.resourceNotionIds, ids)) break;
        patch.resourceNotionIds = ids;
        stamped.push('resources');
        writes.push({ kind: 'task-resources', properties: planned.properties, idempotencyKey: planned.idempotencyKey });
        break;
      }
      case 'assignee': {
        if (!change.assigneeContactId) {
          assigneeName = null;
          if (task.assigneeContactId == null && !task.assigneeName) break;
          patch.assigneeContactId = undefined;
          patch.assigneeName = undefined;
          stamped.push('assignee');
          break;
        }
        const contact = await ctx.db.get(change.assigneeContactId);
        const name = contact?.name.trim() ?? '';
        if (
          !contact ||
          contact.orgId !== task.orgId ||
          contact.role !== 'Warehaus Staff' ||
          contact.portalAccess !== 'Enabled' ||
          contact.syncHiddenAt != null ||
          !name
        ) {
          return refuse('invalid', CHOOSE_ASSIGNEE);
        }
        assigneeName = name;
        if (task.assigneeContactId === contact._id && task.assigneeName === name) break;
        patch.assigneeContactId = contact._id;
        patch.assigneeName = name;
        stamped.push('assignee');
        break;
      }
    }
  }

  if (Object.keys(liveFields).length > 0) {
    const planned = planTaskLiveFieldsWrite({
      actor: 'staff',
      notionPageId: task.notionPageId,
      expectedLastEditedTime: base || 'portal',
      ...liveFields,
    });
    if (!planned.ok) return refuse('invalid', planned.error);
    writes.push({ kind: 'task-fields', properties: planned.properties, idempotencyKey: planned.idempotencyKey });
  }

  const withName = assigneeName !== undefined ? { assigneeName } : {};
  if (stamped.length === 0) {
    return { ok: true, wrote: false, notion: 'portal', outboxIds: [], ...withName };
  }

  // Only fields with a Notion property are written back. Assignee is portal only.
  const writeBack = notionBacked && writes.length > 0;
  const allowed = writeBack && writebackAllowed();

  // Stage sync decides the pending stage: a move back onto Notion's own stage settles instead of writing.
  let stageResult: StageMoveResult | null = null;
  if (stageMove) {
    const inflight =
      allowed && stageMove.stage === notionStage(task)
        ? (await recentPageRows(ctx, task.notionPageId)).some((row) => row.kind === 'task-stage' && row.status === 'inflight')
        : false;
    stageResult = stageMoved(task, {
      stage: stageMove.stage,
      pullRequestLink: stageMove.pullRequestLink,
      base,
      at,
      actorId: options.actorId,
      writesBack: allowed,
      inflight,
    });
  }
  const stageSettles = stageResult?.settles === true;
  const queued = allowed ? writes.filter((write) => !(stageSettles && write.kind === 'task-stage')) : [];

  // Last check before writing: an earlier write under the same key that Notion refused.
  for (const write of queued) {
    const existing = await findOutboxRow(ctx, write.idempotencyKey);
    if (existing.found && (existing.status === 'dead' || existing.status === 'conflict')) {
      return refuse('conflict', EARLIER_WRITE_FAILED);
    }
  }

  // Writes start here. Nothing below returns a refusal.
  const fieldStamps: TaskFieldStamps = { ...(task.fieldStamps ?? {}) };
  for (const field of stamped) fieldStamps[field] = stamp;
  const stagePatch = stageResult?.patch ?? {};
  await ctx.db.patch(task._id, { ...patch, ...stagePatch, fieldStamps, updatedAt: at });

  const outboxIds: Id<'notionOutbox'>[] = [];
  if (stageMove && stageResult?.deleteUnsent) {
    await deleteUnsentStageRows(ctx, task.notionPageId, stageSettles ? undefined : stageMove.key);
  }
  for (const write of queued) {
    const row = await insertOutboxRow(ctx, {
      idempotencyKey: write.idempotencyKey,
      kind: write.kind,
      orgId: task.orgId,
      database: 'tasks',
      notionPageId: task.notionPageId,
      expectedLastEditedTime: base,
      properties: write.properties,
      actor: 'staff',
      actorId: options.actorId,
    });
    outboxIds.push(row.outboxId);
  }

  // A stage that settles back onto Notion's own value queues nothing and needs no note.
  const notion: TaskChangeNotion = !writeBack ? 'portal' : !allowed ? 'off' : outboxIds.length > 0 ? 'queued' : 'portal';
  return { ok: true, wrote: true, notion, outboxIds, ...withName };
}
