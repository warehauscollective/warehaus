/**
 * Milestone review decisions. Portal and Grok Bot chat share one record.
 * Ready to Ship is workStatus `ready`. Approve keeps that stage.
 * Request changes moves the milestone back to Building (`active`).
 * Nothing here writes Notion.
 */

export const ONLY_PETER = 'Only Peter can approve a milestone';
export const STAFF_REQUIRED = 'Staff role required';
export const NOTES_REQUIRED = 'Add a note so the team knows what to change.';
export const STALE_ITERATION = 'That iteration is stale.';
export const ALREADY_REVIEWED = 'This iteration was already reviewed';
export const WAITING_ON_BUILD = 'Waiting on local build';
export const NOT_READY = 'Approve is available when the stage is Ready to Ship';
export const LOCAL_PREVIEW_PORT = 3100;
/** New iteration tasks stay open. The milestone writer does not close tasks. */
export const NEW_ITERATION_TASK_DONE = false;

export const PETER_EMAILS = ['peter@warehaus.studio', 'peter@warehaus.co'] as const;
export const PETER_CHAT_TOKEN = 'grok-bot';

export const TASK_STAGE_HINT =
  "Admin can set Idea or Planning here. Later stages are set by staff in the Portal. Awaiting Go and Ready to Ship are Peter's call.";

export type ReviewDecision = 'approve' | 'request_changes';
export type ReviewSource = 'portal' | 'chat';
export type ReviewWorkStatus = 'draft' | 'active' | 'ready';
export type DesignCheck = 'pass' | 'fixes' | 'pending';

export type ReviewActor = {
  source: ReviewSource;
  role?: 'Warehaus Staff' | 'Client Admin' | 'Client Member' | null;
  email?: string | null;
  tokenName?: string | null;
};

export type ExistingReview = {
  decision: ReviewDecision;
  notes: string;
};

export type NoteGroupTask = {
  name: string;
  description: string;
  parentTaskId: string | null;
};

export type PlanReviewInput = {
  actor: ReviewActor;
  currentIteration: number;
  workStatus: ReviewWorkStatus;
  hasPreview: boolean;
  iteration: number;
  decision: string;
  notes: string;
  existing: ExistingReview | null;
  appliesTo: readonly { id: string; name: string }[];
};

export type PlanReview =
  | { ok: true; idempotent: true; decision: ReviewDecision }
  | {
      ok: true;
      idempotent: false;
      decision: 'approve';
      notes: string;
      workStatus: 'ready';
    }
  | {
      ok: true;
      idempotent: false;
      decision: 'request_changes';
      notes: string;
      workStatus: 'active';
      nextIteration: number;
      tasks: NoteGroupTask[];
    }
  | { ok: false; reason: string };

/** A task at Ready to Ship does not stay labeled In progress. */
export function displayedTaskStatus(status: string, stage?: string | null): string {
  if (stage === 'Ready to Ship' && /in[\s_-]*progress/i.test(status)) return 'In review';
  return status;
}

export function isPeterEmail(email: string | null | undefined): boolean {
  const value = email?.trim().toLowerCase() ?? '';
  return (PETER_EMAILS as readonly string[]).includes(value);
}

/** Chat approvals come only from Peter's grok-bot token. Portal approvals come only from Peter's staff contact. */
export function reviewActorDecision(actor: ReviewActor): { ok: true } | { ok: false; reason: string } {
  if (actor.source === 'chat') {
    if (actor.tokenName !== PETER_CHAT_TOKEN) return { ok: false, reason: ONLY_PETER };
    return { ok: true };
  }
  if (actor.role !== 'Warehaus Staff') return { ok: false, reason: STAFF_REQUIRED };
  if (!isPeterEmail(actor.email)) return { ok: false, reason: ONLY_PETER };
  return { ok: true };
}

export function isReviewDecision(value: string): value is ReviewDecision {
  return value === 'approve' || value === 'request_changes';
}

/** Staff see the build. Clients receive no review fields. */
export function reviewForAudience<T>(audience: 'staff' | 'client', review: T | null): T | null {
  if (audience !== 'staff') return null;
  return review;
}

export function currentIteration(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value) || value < 1) return 1;
  return Math.floor(value);
}

/**
 * Accept only a localhost:3100 preview. Stored without a scheme so the card
 * can show the same string the chat message uses.
 */
export function normalizeLocalPreview(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.hostname !== 'localhost') return null;
  if (url.port !== String(LOCAL_PREVIEW_PORT)) return null;
  const path = `${url.pathname}${url.search}${url.hash}` || '/';
  return `localhost:${LOCAL_PREVIEW_PORT}${path.startsWith('/') ? path : `/${path}`}`;
}

export function reviewChatLine(input: { prNumber: number; iteration: number; previewUrl: string }): string {
  return `PR #${input.prNumber} · Iteration ${input.iteration} is ready. Open local preview: ${input.previewUrl} (your Mac, test data). Reply approve, or request changes with your notes.`;
}

function taskTitle(text: string, iteration: number): string {
  const line = text.split('\n')[0]?.trim() || `Iteration ${iteration}`;
  const clipped = line.length > 80 ? `${line.slice(0, 77)}…` : line;
  return `Iteration ${iteration}: ${clipped}`;
}

/**
 * One task per note group. Selected tasks are the groups. Otherwise each
 * blank-line paragraph is its own group. Tasks stay on this milestone.
 */
export function iterationTaskDrafts(input: {
  notes: string;
  nextIteration: number;
  appliesTo: readonly { id: string; name: string }[];
}): NoteGroupTask[] {
  const notes = input.notes.trim();
  if (input.appliesTo.length > 0) {
    return input.appliesTo.map((task) => ({
      name: taskTitle(task.name, input.nextIteration),
      description: notes,
      parentTaskId: task.id,
    }));
  }
  const paragraphs = notes
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  const groups = paragraphs.length > 0 ? paragraphs : [notes];
  return groups.map((paragraph) => ({
    name: taskTitle(paragraph, input.nextIteration),
    description: paragraph,
    parentTaskId: null,
  }));
}

export function historyPageLimit(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value)) return 20;
  return Math.min(50, Math.max(1, Math.floor(value)));
}

export function planReview(input: PlanReviewInput): PlanReview {
  const actor = reviewActorDecision(input.actor);
  if (!actor.ok) return actor;
  if (!isReviewDecision(input.decision)) {
    return { ok: false, reason: 'Decision must be approve or request_changes' };
  }
  const iteration = input.iteration;
  if (!Number.isInteger(iteration) || iteration < 1) {
    return { ok: false, reason: STALE_ITERATION };
  }
  if (input.existing) {
    if (input.existing.decision === input.decision) {
      return { ok: true, idempotent: true, decision: input.decision };
    }
    return { ok: false, reason: ALREADY_REVIEWED };
  }
  if (iteration !== input.currentIteration) {
    return { ok: false, reason: `${STALE_ITERATION} Current iteration is ${input.currentIteration}.` };
  }
  if (input.workStatus !== 'ready') return { ok: false, reason: NOT_READY };
  if (!input.hasPreview) return { ok: false, reason: WAITING_ON_BUILD };
  if (input.decision === 'approve') {
    return { ok: true, idempotent: false, decision: 'approve', notes: input.notes.trim(), workStatus: 'ready' };
  }
  const notes = input.notes.trim();
  if (!notes) return { ok: false, reason: NOTES_REQUIRED };
  const nextIteration = input.currentIteration + 1;
  return {
    ok: true,
    idempotent: false,
    decision: 'request_changes',
    notes,
    workStatus: 'active',
    nextIteration,
    tasks: iterationTaskDrafts({ notes, nextIteration, appliesTo: input.appliesTo }),
  };
}

export function iterationOutcome(input: {
  iteration: number;
  currentIteration: number;
  decision: ReviewDecision | null;
  workStatus: ReviewWorkStatus;
}): 'In review' | 'Changes requested' | 'Building' | 'Approved' {
  if (input.decision === 'approve') return 'Approved';
  if (input.decision === 'request_changes' && input.iteration < input.currentIteration) return 'Changes requested';
  if (input.workStatus === 'active' && input.iteration === input.currentIteration) return 'Building';
  if (input.workStatus === 'ready' && input.iteration === input.currentIteration) return 'In review';
  if (input.decision === 'request_changes') return 'Changes requested';
  return 'In review';
}

/** Eastern Time stamp used on the approved line. Always labeled ET. */
export function formatReviewStamp(at: number): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(new Date(at));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  const minute = get('minute');
  return `${get('month')} ${get('day')}, ${get('year')} · ${get('hour')}:${minute} ${get('dayPeriod')} ET`;
}

/** Client milestone payloads never carry review notes. Staff still can. */
export function reviewNotesForAudience(
  audience: 'staff' | 'client',
  note: string | null | undefined,
): string | null {
  if (audience !== 'staff') return null;
  const trimmed = note?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Client roadmap payloads omit approval and decidedAt, including the keys.
 * Staff still receive both.
 */
export function roadmapReviewForAudience(
  audience: 'staff' | 'client',
  fields: {
    approval: 'unreviewed' | 'approved' | 'changes_requested';
    decidedAt?: number | null;
    note?: string | null;
  },
): {
  note: string | null;
  approval?: 'unreviewed' | 'approved' | 'changes_requested';
  decidedAt?: number | null;
} {
  const note = reviewNotesForAudience(audience, fields.note);
  if (audience !== 'staff') return { note };
  return { note, approval: fields.approval, decidedAt: fields.decidedAt ?? null };
}

export const PORTAL_REVIEW_SOURCE = 'portal-review';

export function isPortalReviewTask(source: string | null | undefined): boolean {
  return source === PORTAL_REVIEW_SOURCE;
}

/** Notion pull and outbox must not create, delete, or overwrite a page for these rows. */
export function notionWriteAllowedForTask(input: {
  source?: string | null;
  notionPageId?: string | null;
}): boolean {
  if (isPortalReviewTask(input.source)) return false;
  if ((input.notionPageId ?? '').startsWith(`${PORTAL_REVIEW_SOURCE}:`)) return false;
  return true;
}
