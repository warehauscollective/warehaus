/**
 * A Notion pull against a task the portal may have changed (ADR-0003).
 *
 * Every field the portal writes carries a stamp in `fieldStamps`. A pulled
 * value replaces a stamped field only when Notion's edit is at least as new
 * as the stamp. Stage goes through stage sync (`stagePulled`).
 * A task change and the pull read and write this one stamp format.
 */

import type { FieldStamp } from './portalApi';
import { stagePulled, type StagePatch } from './stageSync';

/** Every task field the portal writes, so every field a stamp can hold. */
export const TASK_STAMPED_FIELDS = [
  'status',
  'stage',
  'priority',
  'nextAction',
  'date',
  'estimate',
  'source',
  'publishToWarehaus',
  'description',
  'resources',
  'assignee',
] as const;

export type TaskStampedField = (typeof TASK_STAMPED_FIELDS)[number];
export type TaskFieldStamps = Partial<Record<TaskStampedField, FieldStamp>>;

/** Whether a Notion edit at `notionEditedMs` may replace a field holding `stamp`. */
export function pullBeatsStamp(stamp: FieldStamp | null | undefined, notionEditedMs: number | null): boolean {
  if (!stamp) return true;
  return (notionEditedMs ?? 0) >= stamp.updatedAt;
}

/** The task row fields the merge reads. */
export type LocalTaskForPull = {
  status: string;
  isDone: boolean;
  stage?: string | null;
  stageSynced?: string | null;
  stagePendingAt?: number | null;
  stagePendingBaseEditedTime?: string | null;
  lastEditedTime?: string | null;
  priority?: string | null;
  nextAction?: string | null;
  date?: string | null;
  estimate?: string | null;
  source?: string | null;
  publishToWarehaus: boolean;
  description?: string | null;
  descriptionSource?: 'body' | 'property' | 'none' | null;
  resourceNotionIds?: readonly string[] | null;
  fieldStamps?: TaskFieldStamps | null;
};

/** What the pull read from Notion. `undefined` means the pull did not read that field. */
export type PulledTask = {
  name: string;
  notionPageId: string;
  status: string;
  isDone: boolean;
  stage: string | null;
  lastEditedTime: string | null;
  priority: string | null;
  nextAction: string | null;
  date: string | null;
  estimate: string | null;
  source: string | null;
  publishToWarehaus: boolean;
  description?: string | null;
  descriptionSource?: 'body' | 'property' | 'none' | null;
  resourceNotionIds?: readonly string[];
};

export type MergedTask = {
  status: string;
  isDone: boolean;
  stage: string | null;
  priority: string | null;
  nextAction: string | null;
  date: string | null;
  estimate: string | null;
  source: string | null;
  publishToWarehaus: boolean;
  /** Absent when the description is unchanged. */
  description?: { description: string | null; descriptionSource: 'body' | 'property' | 'none' | null };
  /** Absent when the pull did not read resources. */
  resourceNotionIds?: string[];
  /** The pending stage fields to write, if any. */
  stagePatch: StagePatch;
  lastEditedTime: string | null;
  fieldStamps: TaskFieldStamps;
  /** Unsent stage rows for this page are now stale. */
  deleteUnsent: boolean;
  notice: { message: string; edgeCase: string } | null;
};

function editedMs(lastEditedTime: string | null): number | null {
  if (typeof lastEditedTime !== 'string') return null;
  const ms = Date.parse(lastEditedTime);
  return Number.isFinite(ms) ? ms : null;
}

function sameList(a: readonly string[] | null | undefined, b: readonly string[] | null | undefined): boolean {
  const left = [...(a ?? [])].sort();
  const right = [...(b ?? [])].sort();
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

/**
 * Merge one pulled task into the local row. A new row (no `local`) takes
 * every pulled value. Otherwise each stamped field keeps the portal value
 * unless Notion's edit is newer than its stamp.
 */
export function mergePulledTask(local: LocalTaskForPull | null, pulled: PulledTask): MergedTask {
  const notionMs = editedMs(pulled.lastEditedTime);
  const stamps: TaskFieldStamps = { ...(local?.fieldStamps ?? {}) };
  const notionStamp: FieldStamp = { updatedAt: notionMs ?? 0, updatedBy: 'notion' };

  /** Notion's value wins this field. Stamps it when the value changed. */
  function take<T>(field: TaskStampedField, notionValue: T, localValue: T, same: (a: T, b: T) => boolean): T {
    if (!local) return notionValue;
    if (!pullBeatsStamp(local.fieldStamps?.[field], notionMs)) return localValue;
    if (!same(notionValue, localValue) || local.fieldStamps?.[field]) stamps[field] = notionStamp;
    return notionValue;
  }
  const eq = <T>(a: T, b: T) => a === b;

  const status = take('status', pulled.status, local?.status ?? pulled.status, eq);
  const isDone = status === pulled.status ? pulled.isDone : (local?.isDone ?? pulled.isDone);
  const priority = take('priority', pulled.priority, local?.priority ?? null, eq);
  const nextAction = take('nextAction', pulled.nextAction, local?.nextAction ?? null, eq);
  const date = take('date', pulled.date, local?.date ?? null, eq);
  const estimate = take('estimate', pulled.estimate, local?.estimate ?? null, eq);
  const source = take('source', pulled.source, local?.source ?? null, eq);
  const publishToWarehaus = take('publishToWarehaus', pulled.publishToWarehaus, local?.publishToWarehaus ?? pulled.publishToWarehaus, eq);

  let description: MergedTask['description'];
  if (pulled.description !== undefined || pulled.descriptionSource !== undefined) {
    const notionDescription = pulled.description ? pulled.description : null;
    const kept = local && !pullBeatsStamp(local.fieldStamps?.description, notionMs);
    if (!kept) {
      if (local && local.fieldStamps?.description) stamps.description = notionStamp;
      description = notionDescription
        ? {
            description: notionDescription,
            descriptionSource:
              pulled.descriptionSource === 'body' || pulled.descriptionSource === 'property'
                ? pulled.descriptionSource
                : null,
          }
        : { description: null, descriptionSource: pulled.descriptionSource === 'none' ? 'none' : null };
    }
  }

  let resourceNotionIds: string[] | undefined;
  if (pulled.resourceNotionIds !== undefined) {
    const value = take('resources', [...pulled.resourceNotionIds], [...(local?.resourceNotionIds ?? [])], sameList);
    resourceNotionIds = value;
  }

  const pulledStage = stagePulled(
    local ? { ...local, stageStamp: local.fieldStamps?.stage ?? null } : null,
    {
      name: pulled.name,
      notionPageId: pulled.notionPageId,
      notionStage: pulled.stage,
      notionLastEditedTime: pulled.lastEditedTime,
      notionEditedMs: notionMs,
    },
  );
  if (pulledStage.stamp) stamps.stage = pulledStage.stamp;
  const stage = pulledStage.stage;
  const stagePatch: MergedTask['stagePatch'] = pulledStage.patch;

  return {
    status,
    isDone,
    stage,
    priority,
    nextAction,
    date,
    estimate,
    source,
    publishToWarehaus,
    ...(description ? { description } : {}),
    ...(resourceNotionIds ? { resourceNotionIds } : {}),
    stagePatch,
    lastEditedTime: pulledStage.lastEditedTime,
    fieldStamps: stamps,
    deleteUnsent: pulledStage.deleteUnsent,
    notice: pulledStage.notice,
  };
}
