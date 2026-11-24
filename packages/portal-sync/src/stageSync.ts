/**
 * Stage sync: the pending stage as one state machine (see GLOSSARY.md,
 * "Pending stage"). Every writer of a task's stage fields asks one of these
 * transitions and writes the patch it returns, whole:
 *
 * - `stageMoved`: a task change moved the stage (staff, API, webhook, closeout).
 * - `stageConfirmed`: Notion confirmed a task-stage write.
 * - `stagePulled`: a Notion pull read the task.
 * - `stageDrainWrite`: the drain resends a pending stage.
 *
 *   Synced --local move, queued--> Pending
 *   Pending --local move back to stageSynced, nothing inflight--> Synced
 *   Pending --confirmed, stage still matches--> Synced
 *   Pending --confirmed, a later move is saved--> Pending (base moves forward)
 *   Pending --pull, older edit--> Pending
 *   Pending --pull, newer edit--> Synced (Notion wins, notice)
 *
 * Pure: no Convex. A cleared field is `undefined`, as Convex patches clear it.
 */

import type { FieldStamp } from './portalApi';
import { resolvePulledStage } from './portalApi';
import { mergePulledStage, planTaskStageWrite, type TaskWriteProperties } from './taskBoard';

/** The task row's stage fields, as stored. */
export type StageState = {
  stage?: string | null;
  stageSynced?: string | null;
  stagePendingAt?: number | null;
  stagePendingBaseEditedTime?: string | null;
  stagePendingPullRequest?: string | null;
  stagePendingBy?: string | null;
};

/** The stage fields a transition writes. A key that is present is written; `undefined` clears it. */
export type StagePatch = {
  stage?: string | null;
  stageSynced?: string | null;
  stagePendingAt?: number | undefined;
  stagePendingBaseEditedTime?: string | undefined;
  stagePendingPullRequest?: string | undefined;
  stagePendingBy?: string | undefined;
};

const CLEAR_PENDING = {
  stagePendingAt: undefined,
  stagePendingBaseEditedTime: undefined,
  stagePendingPullRequest: undefined,
  stagePendingBy: undefined,
} as const;

export function isStagePending(state: StageState): boolean {
  return typeof state.stagePendingAt === 'number';
}

/** The stage Notion has, as far as the portal knows. */
export function notionStage(state: StageState): string | null {
  return isStagePending(state) ? (state.stageSynced ?? null) : (state.stage ?? null);
}

export type StageMove = {
  stage: string;
  pullRequestLink: string | null;
  /** The task's last edit time the write is checked against. */
  base: string;
  at: number;
  actorId?: string;
  /** Write-back is on and the task has a Notion page: a stage row will be queued. */
  writesBack: boolean;
  /** A task-stage row for this page is inflight now. */
  inflight: boolean;
};

export type StageMoveResult = {
  patch: StagePatch;
  /** The move lands back on Notion's own stage: queue nothing. */
  settles: boolean;
  /** Delete unsent stage rows for the page, keeping the new row's key unless the move settles. */
  deleteUnsent: boolean;
};

/** A task change moved the stage. */
export function stageMoved(state: StageState, move: StageMove): StageMoveResult {
  if (!move.writesBack) return { patch: { stage: move.stage }, settles: false, deleteUnsent: false };
  if (move.stage === notionStage(state) && !move.inflight) {
    return { patch: { stage: move.stage, ...CLEAR_PENDING }, settles: true, deleteUnsent: true };
  }
  const pending = isStagePending(state);
  return {
    patch: {
      stage: move.stage,
      stagePendingAt: pending ? (state.stagePendingAt as number) : move.at,
      stagePendingBaseEditedTime: move.base,
      ...(pending ? {} : { stageSynced: state.stage ? state.stage : null }),
      stagePendingPullRequest: move.pullRequestLink ?? undefined,
      stagePendingBy: move.actorId,
    },
    settles: false,
    deleteUnsent: true,
  };
}

/** Notion confirmed a task-stage write of `written`. */
export function stageConfirmed(state: StageState, written: string, responseEditedTime: string | null): StagePatch {
  if (state.stage === written) return { stageSynced: written, ...CLEAR_PENDING };
  // A later move is already saved: it stays pending, checked against the newer edit.
  return responseEditedTime ? { stagePendingBaseEditedTime: responseEditedTime } : {};
}

export type StagePull = {
  name: string;
  notionPageId: string;
  notionStage: string | null;
  notionLastEditedTime: string | null;
  notionEditedMs: number | null;
};

export type StagePullResult = {
  stage: string | null;
  patch: StagePatch;
  /** The stage stamp to store, when the pull set one. */
  stamp: FieldStamp | null;
  /** The pull's last edit time to store. */
  lastEditedTime: string | null;
  deleteUnsent: boolean;
  notice: { message: string; edgeCase: string } | null;
};

/** A Notion pull read the task. `local` is null for a new row. */
export function stagePulled(
  local: (StageState & { lastEditedTime?: string | null; stageStamp?: FieldStamp | null }) | null,
  pull: StagePull,
): StagePullResult {
  const pending = local ? isStagePending(local) : false;
  const merge = mergePulledStage({
    notionStage: pull.notionStage,
    notionLastEditedTime: pull.notionLastEditedTime,
    localStage: local?.stage ?? null,
    localLastEditedTime: local?.lastEditedTime ?? null,
    stageSynced: local?.stageSynced ?? null,
    pending,
    stagePendingBaseEditedTime: local?.stagePendingBaseEditedTime ?? null,
    name: pull.name,
    notionPageId: pull.notionPageId,
  });
  const resolved = resolvePulledStage({
    pending,
    notionStage: pull.notionStage,
    notionEditedMs: pull.notionEditedMs,
    localStage: local?.stage ?? null,
    localStamp: local?.stageStamp ?? null,
    pulledStage: merge.stage,
    pulledStageSynced: merge.stageSynced,
    pulledLastEditedTime: merge.lastEditedTime,
  });
  const stage = resolved.keptLocal ? (local?.stage ?? null) : resolved.stage;
  const patch: StagePatch = resolved.keptLocal
    ? {}
    : merge.clearPending
      ? { stageSynced: merge.stageSynced, ...CLEAR_PENDING }
      : {
          stageSynced: merge.stageSynced,
          ...(merge.stagePendingBaseEditedTime ? { stagePendingBaseEditedTime: merge.stagePendingBaseEditedTime } : {}),
        };
  return {
    stage,
    patch,
    stamp: resolved.stamp ?? null,
    lastEditedTime: resolved.lastEditedTime,
    deleteUnsent: merge.deleteUnsent,
    notice: merge.notice,
  };
}

/** The row the drain queues for a pending stage, or null when there is nothing to send. */
export function stageDrainWrite(
  state: StageState,
  notionPageId: string,
): { properties: TaskWriteProperties; idempotencyKey: string; base: string } | null {
  if (!isStagePending(state)) return null;
  const stage = state.stage ?? '';
  const base = state.stagePendingBaseEditedTime ?? '';
  if (!stage || !base) return null;
  const planned = planTaskStageWrite({
    actor: 'staff',
    stage,
    pullRequestLink: state.stagePendingPullRequest ?? undefined,
    notionPageId,
    expectedLastEditedTime: base,
    // The move was checked when it was saved; Shipped there was verified or came from a merge.
    ...(stage === 'Shipped' ? { verifiedMerge: true } : {}),
  });
  if (!planned.ok) return null;
  return { properties: planned.properties, idempotencyKey: planned.idempotencyKey, base };
}
