/**
 * Milestone Status. One field, seven values. Pure rules, no Convex imports.
 *
 * Every write of a milestone's status goes through `transitionMilestone`.
 * Approval is not a status. It is the review result and lives on its own field.
 * Shipped is never set by hand. It is set when the pull request merges.
 *
 * Until the schema is narrowed, rows written before the Status field still
 * carry `stage`, `workStatus` and `detailStatus`. `milestoneStatusOf` is the
 * only reader of those old fields outside the backfill.
 */

export const MILESTONE_STATUSES = [
  'Idea',
  'Planning',
  'Awaiting Go',
  'Building',
  'Ready to Ship',
  'Shipped',
  'Parked',
] as const;

export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number];

export type MilestoneStatusCategory = 'not_started' | 'started' | 'completed' | 'canceled';

/** The category a status maps to in Linear or Jira terms. */
export const MILESTONE_STATUS_CATEGORY: Record<MilestoneStatus, MilestoneStatusCategory> = {
  Idea: 'not_started',
  Planning: 'not_started',
  'Awaiting Go': 'not_started',
  Building: 'started',
  'Ready to Ship': 'started',
  Shipped: 'completed',
  Parked: 'canceled',
};

/** A new milestone starts here unless the caller names another status. */
export const DEFAULT_MILESTONE_STATUS: MilestoneStatus = 'Planning';

export const STATUS_ACTIVITY = 'milestone.status';
export const UNKNOWN_STATUS = 'Unknown status';
export const SHIPPED_ON_MERGE = 'Shipped is set when the pull request merges';
export const STATUS_STALE = 'The status changed. Refresh and try again.';
export const APPROVE_NOT_READY = 'Approve is available when the status is Ready to Ship';
export const AI_STATUS_LOCKED = 'AI cannot edit an approved milestone or change its tasks';

const STATUS_SET = new Set<string>(MILESTONE_STATUSES);

/** Play moves one step along this line. Ready to Ship is the last stop. */
const ADVANCE_LINE: readonly MilestoneStatus[] = ['Idea', 'Planning', 'Awaiting Go', 'Building', 'Ready to Ship'];

export function isMilestoneStatus(value: unknown): value is MilestoneStatus {
  return typeof value === 'string' && STATUS_SET.has(value);
}

export function statusCategory(status: MilestoneStatus): MilestoneStatusCategory {
  return MILESTONE_STATUS_CATEGORY[status];
}

/**
 * The status play moves to. Null on Ready to Ship (Approve is next), on
 * Shipped (set on merge) and on Parked (resume from the menu).
 */
export function nextStatus(status: MilestoneStatus): MilestoneStatus | null {
  const index = ADVANCE_LINE.indexOf(status);
  if (index < 0 || index === ADVANCE_LINE.length - 1) return null;
  return ADVANCE_LINE[index + 1] ?? null;
}

/** The menu lists Shipped but does not let a person pick it. */
export function statusOptionLock(status: MilestoneStatus): 'shipped' | null {
  return status === 'Shipped' ? 'shipped' : null;
}

export type LegacyWorkStatus = 'draft' | 'active' | 'ready';

export function isLegacyWorkStatus(value: unknown): value is LegacyWorkStatus {
  return value === 'draft' || value === 'active' || value === 'ready';
}

/** The old three-value work status, read as a Status. */
export function statusFromWorkStatus(workStatus: LegacyWorkStatus): MilestoneStatus {
  if (workStatus === 'draft') return 'Planning';
  if (workStatus === 'ready') return 'Ready to Ship';
  return 'Building';
}

/**
 * The old work status a Status stands for. Only for the staff API, which
 * still returns `workStatus` for one release. Nothing stores this.
 */
export function legacyWorkStatus(status: MilestoneStatus): LegacyWorkStatus {
  if (status === 'Building') return 'active';
  if (status === 'Ready to Ship' || status === 'Shipped') return 'ready';
  return 'draft';
}

export type StoredStatusFields = {
  status?: string | null;
  stage?: string | null;
  workStatus?: string | null;
  detailStatus?: string | null;
};

/**
 * The milestone's status. Stored `status` wins. A row from before the
 * backfill falls back to its old stage, then to its old work status.
 */
export function milestoneStatusOf(row: StoredStatusFields): MilestoneStatus {
  if (isMilestoneStatus(row.status)) return row.status;
  if (isMilestoneStatus(row.stage)) return row.stage;
  if (isLegacyWorkStatus(row.workStatus)) return statusFromWorkStatus(row.workStatus);
  return DEFAULT_MILESTONE_STATUS;
}

/**
 * Why the status is changing.
 * - `set`: a person, the staff API, or AI names a status.
 * - `advance`: the play button. One step forward.
 * - `approve`: the review result. Needs Ready to Ship and keeps it.
 * - `request_changes`: the review result. Needs Ready to Ship, returns to Building.
 * - `merge`: the pull request merged. The only way to Shipped.
 */
export type TransitionCause = 'set' | 'advance' | 'approve' | 'request_changes' | 'merge';

export type TransitionFailure = 'unknown' | 'shipped' | 'stale' | 'no_next' | 'not_ready' | 'locked';

export type TransitionInput = {
  from: MilestoneStatus;
  cause: TransitionCause;
  /** Required for `set`. Optional check for `advance`. */
  to?: string | null;
  /** The status the caller last saw. A mismatch is stale unless the move already happened. */
  expected?: string | null;
  /** `ai` is locked out of an approved milestone. Defaults to `human`. */
  actor?: 'human' | 'ai';
  approval?: string | null;
};

export type Transition =
  | { ok: true; from: MilestoneStatus; status: MilestoneStatus; wrote: boolean }
  | { ok: false; reason: string; code: TransitionFailure };

function reject(code: TransitionFailure, reason: string): Transition {
  return { ok: false, reason, code };
}

function noop(from: MilestoneStatus): Transition {
  return { ok: true, from, status: from, wrote: false };
}

function move(from: MilestoneStatus, status: MilestoneStatus): Transition {
  return { ok: true, from, status, wrote: from !== status };
}

/**
 * The one decision for a milestone status change. `wrote: false` means the
 * caller skips the write and the activity row.
 */
export function transitionMilestone(input: TransitionInput): Transition {
  const { from, cause } = input;
  if (input.expected != null && !isMilestoneStatus(input.expected)) return reject('unknown', UNKNOWN_STATUS);

  if (cause === 'set') {
    if (!isMilestoneStatus(input.to)) return reject('unknown', UNKNOWN_STATUS);
    if (input.actor === 'ai' && input.approval === 'approved') return reject('locked', AI_STATUS_LOCKED);
    if (input.to === from) return noop(from);
    if (input.expected != null && input.expected !== from) return reject('stale', STATUS_STALE);
    if (input.to === 'Shipped') return reject('shipped', SHIPPED_ON_MERGE);
    return move(from, input.to);
  }

  if (cause === 'advance') {
    if (input.to != null && !isMilestoneStatus(input.to)) return reject('unknown', UNKNOWN_STATUS);
    if (input.expected != null && input.expected !== from) {
      // The same click sent twice. The first one already moved it.
      if (nextStatus(input.expected) === from) return noop(from);
      return reject('stale', STATUS_STALE);
    }
    const next = nextStatus(from);
    if (!next) return reject('no_next', `${from} has no next status`);
    if (input.to != null && input.to !== next) return reject('no_next', `Play moves ${from} to ${next}`);
    return move(from, next);
  }

  if (cause === 'approve') {
    if (from !== 'Ready to Ship') return reject('not_ready', APPROVE_NOT_READY);
    return noop(from);
  }

  if (cause === 'request_changes') {
    if (from !== 'Ready to Ship') return reject('not_ready', APPROVE_NOT_READY);
    return move(from, 'Building');
  }

  return move(from, 'Shipped');
}

const DETAIL_EXPECTS: Record<string, readonly MilestoneStatus[]> = {
  draft: ['Idea', 'Planning', 'Awaiting Go', 'Parked'],
  in_progress: ['Building'],
  in_review: ['Ready to Ship'],
  complete: ['Shipped'],
};

export type StatusBackfillPlan =
  | { action: 'skip'; status: MilestoneStatus }
  | {
      action: 'set';
      status: MilestoneStatus;
      source: 'stage' | 'workStatus' | 'default';
      /** Old fields that pointed somewhere else. Empty when they agreed. */
      disagreements: string[];
    };

/**
 * What the backfill does to one row. Stage wins. With no stage the work
 * status decides: draft is Planning, active is Building, ready is Ready to
 * Ship. A row that already has a status is left alone.
 */
export function planStatusBackfill(row: StoredStatusFields): StatusBackfillPlan {
  if (isMilestoneStatus(row.status)) return { action: 'skip', status: row.status };
  const status = milestoneStatusOf(row);
  const source = isMilestoneStatus(row.stage) ? 'stage' : isLegacyWorkStatus(row.workStatus) ? 'workStatus' : 'default';
  const disagreements: string[] = [];
  if (source === 'stage' && isLegacyWorkStatus(row.workStatus) && status !== 'Parked') {
    if (legacyWorkStatus(status) !== row.workStatus) {
      disagreements.push(`stage ${status}, work status ${row.workStatus}`);
    }
  }
  const expects = row.detailStatus ? DETAIL_EXPECTS[row.detailStatus] : undefined;
  if (expects && !expects.includes(status)) {
    disagreements.push(`${source === 'stage' ? 'stage' : 'work status'} gives ${status}, old status picker ${row.detailStatus}`);
  }
  return { action: 'set', status, source, disagreements };
}

export type StatusBackfillRow = StoredStatusFields & { id: string; name: string };

export type StatusBackfillReport = {
  scanned: number;
  alreadySet: number;
  toSet: number;
  writes: { id: string; status: MilestoneStatus }[];
  disagreements: {
    id: string;
    name: string;
    status: MilestoneStatus;
    stage: string | null;
    workStatus: string | null;
    detailStatus: string | null;
    notes: string[];
  }[];
};

/** One page of the backfill. Pure, so the dry run and the apply share it. */
export function planStatusBackfillPage(rows: readonly StatusBackfillRow[]): StatusBackfillReport {
  const report: StatusBackfillReport = { scanned: rows.length, alreadySet: 0, toSet: 0, writes: [], disagreements: [] };
  for (const row of rows) {
    const plan = planStatusBackfill(row);
    if (plan.action === 'skip') {
      report.alreadySet += 1;
      continue;
    }
    report.toSet += 1;
    report.writes.push({ id: row.id, status: plan.status });
    if (plan.disagreements.length > 0) {
      report.disagreements.push({
        id: row.id,
        name: row.name,
        status: plan.status,
        stage: row.stage ?? null,
        workStatus: row.workStatus ?? null,
        detailStatus: row.detailStatus ?? null,
        notes: plan.disagreements,
      });
    }
  }
  return report;
}

export function backfillPageSize(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value)) return 50;
  return Math.min(100, Math.max(1, Math.floor(value)));
}

export const RETIRED_STATUS_FIELDS = ['stage', 'workStatus', 'detailStatus'] as const;
export type RetiredStatusField = (typeof RETIRED_STATUS_FIELDS)[number];

export type RetiredFieldsReport = {
  scanned: number;
  /** Rows with no retired field left. */
  alreadyClear: number;
  /** Rows that still carry at least one retired field and have a status. */
  toClear: number;
  writes: { id: string; fields: RetiredStatusField[] }[];
  /** Rows with no status yet. Left alone: run the status backfill first. */
  missingStatus: { id: string; name: string }[];
};

/**
 * One page of the step before the schema narrows. A row keeps its retired
 * fields until it has a status, so nothing is lost if the backfill was skipped.
 */
export function planRetiredFieldsPage(rows: readonly StatusBackfillRow[]): RetiredFieldsReport {
  const report: RetiredFieldsReport = { scanned: rows.length, alreadyClear: 0, toClear: 0, writes: [], missingStatus: [] };
  for (const row of rows) {
    const fields = RETIRED_STATUS_FIELDS.filter((field) => row[field] != null);
    if (fields.length === 0) {
      report.alreadyClear += 1;
      continue;
    }
    if (!isMilestoneStatus(row.status)) {
      report.missingStatus.push({ id: row.id, name: row.name });
      continue;
    }
    report.toClear += 1;
    report.writes.push({ id: row.id, fields });
  }
  return report;
}

export const WORK_STATUS_ALIAS_INVALID = 'Work status must be draft, active, or ready';
export const STATUS_ALIAS_CONFLICT = 'Send status only. stage and workStatus are aliases of status and must match it.';

/**
 * Staff API input. `status` is the field. `stage` and `workStatus` are
 * accepted for one release so current bot tokens keep working: `stage`
 * carries the same seven values, and `workStatus` maps draft to Planning,
 * active to Building and ready to Ready to Ship. Null means nothing was sent.
 */
export function apiStatusInput(body: {
  status?: string | null;
  stage?: string | null;
  workStatus?: string | null;
}): { ok: true; status: string | null } | { ok: false; reason: string } {
  const sent: string[] = [];
  if (body.status != null) sent.push(body.status);
  if (body.stage != null) sent.push(body.stage);
  if (body.workStatus != null) {
    if (!isLegacyWorkStatus(body.workStatus)) return { ok: false, reason: WORK_STATUS_ALIAS_INVALID };
    // An explicit status or stage is more exact than the three-value alias.
    if (sent.length === 0) sent.push(statusFromWorkStatus(body.workStatus));
    else if (sent.some((value) => !isMilestoneStatus(value) || legacyWorkStatus(value) !== body.workStatus)) {
      return { ok: false, reason: STATUS_ALIAS_CONFLICT };
    }
  }
  if (sent.length === 0) return { ok: true, status: null };
  if (sent.some((value) => value !== sent[0])) return { ok: false, reason: STATUS_ALIAS_CONFLICT };
  return { ok: true, status: sent[0]! };
}

/** Staff API output. `stage` and `workStatus` are read aliases for one release. */
export function apiStatusFields(status: MilestoneStatus): {
  status: MilestoneStatus;
  stage: MilestoneStatus;
  workStatus: LegacyWorkStatus;
} {
  return { status, stage: status, workStatus: legacyWorkStatus(status) };
}
