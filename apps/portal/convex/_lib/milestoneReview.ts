/**
 * Milestone review decisions. Portal and Grok Bot chat share one record.
 * Approve needs Status Ready to Ship plus a preview, and keeps that status.
 * Request changes moves the milestone back to Building.
 * Nothing here writes Notion.
 */

import { APPROVE_NOT_READY, transitionMilestone, type MilestoneStatus } from './milestoneStatus';
import { isPortalOwnedTask, PORTAL_REVIEW_TASK_SOURCE, reviewTaskLines } from './milestoneTasks';

export const ONLY_PETER = 'Only Peter can approve a milestone';
export const CHAT_CONTACT_MISSING = 'Request changes needs Peter’s staff contact.';

export function chatContactError(decision: 'approve' | 'request_changes'): string {
  return decision === 'request_changes' ? CHAT_CONTACT_MISSING : ONLY_PETER;
}
export const STAFF_REQUIRED = 'Staff role required';
export const NOTES_REQUIRED = 'Add a note so the team knows what to change.';
export const STALE_ITERATION = 'That iteration is stale.';
export const ALREADY_REVIEWED = 'This iteration was already reviewed';
export const WAITING_ON_BUILD = 'Waiting on local build';
export const NOT_READY = APPROVE_NOT_READY;
export const LOCAL_PREVIEW_PORT = 3100;
/** New iteration tasks stay open. The milestone writer does not close tasks. */
export const NEW_ITERATION_TASK_DONE = false;

export const PETER_EMAILS = ['peter@warehaus.studio', 'peter@warehaus.co'] as const;
export const PETER_CHAT_TOKEN = 'grok-bot';

export const TASK_STAGE_HINT =
  'Staff can set any stage except Shipped. Shipped is set when the pull request merges.';

/** Shown on a disabled Retry while review previews are still being set up. */
export const RETRY_WAITS_ON_TOKENS = "Retry isn't available yet. Review previews are still being set up.";

export type PreviewBuildStatus = 'building' | 'failed';
export type PreviewDeleteStatus = 'removing' | 'failed' | 'removed';

export function reviewPreviewRetryReady(env: {
  githubToken?: string | null;
  vercelToken?: string | null;
}): boolean {
  return Boolean(env.githubToken && env.vercelToken);
}

/** Fields to write for a preview lifecycle change. Null when nothing changed. */
export function previewStatusPatch(
  current: {
    previewBuild?: PreviewBuildStatus | null;
    previewBuildAttempt?: number | null;
    previewBuildAt?: number | null;
    previewDelete?: PreviewDeleteStatus | null;
    previewDeleteAttempt?: number | null;
    previewDeleteAt?: number | null;
  },
  next: {
    build?: PreviewBuildStatus | 'ready';
    buildAttempt?: number;
    buildAt?: number;
    deleteStatus?: PreviewDeleteStatus;
    deleteAttempt?: number;
    deleteAt?: number;
  },
): {
  previewBuild?: PreviewBuildStatus;
  previewBuildAttempt?: number;
  previewBuildAt?: number;
  previewDelete?: PreviewDeleteStatus;
  previewDeleteAttempt?: number;
  previewDeleteAt?: number;
} | null {
  const patch: {
    previewBuild?: PreviewBuildStatus;
    previewBuildAttempt?: number;
    previewBuildAt?: number;
    previewDelete?: PreviewDeleteStatus;
    previewDeleteAttempt?: number;
    previewDeleteAt?: number;
  } = {};
  if (next.build === 'ready') {
    if (current.previewBuild) patch.previewBuild = undefined;
    if (current.previewBuildAttempt != null) patch.previewBuildAttempt = undefined;
    if (current.previewBuildAt != null) patch.previewBuildAt = undefined;
  } else if (next.build && current.previewBuild !== next.build) {
    patch.previewBuild = next.build;
    if (next.buildAt != null && current.previewBuildAt !== next.buildAt) patch.previewBuildAt = next.buildAt;
    if (next.buildAttempt != null && current.previewBuildAttempt !== next.buildAttempt) {
      patch.previewBuildAttempt = next.buildAttempt;
    }
  }
  if (next.deleteStatus && current.previewDelete !== next.deleteStatus) {
    patch.previewDelete = next.deleteStatus;
    if (next.deleteAt != null && current.previewDeleteAt !== next.deleteAt) patch.previewDeleteAt = next.deleteAt;
    if (next.deleteAttempt != null && current.previewDeleteAttempt !== next.deleteAttempt) {
      patch.previewDeleteAttempt = next.deleteAttempt;
    }
  }
  return Object.keys(patch).length > 0 ? patch : null;
}

export type ReviewDecision = 'approve' | 'request_changes';
export type ReviewSource = 'portal' | 'chat';
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
  /** Every task a change request makes is a review task for the iteration it starts. */
  origin: 'review';
  round: number;
};

export type PlanReviewInput = {
  actor: ReviewActor;
  currentIteration: number;
  status: MilestoneStatus;
  hasPreview: boolean;
  iteration: number;
  decision: string;
  notes: string;
  existing: ExistingReview | null;
  appliesTo: readonly { id: string; name: string }[];
  /** Task lines typed on the change request. When any are present they are the tasks. */
  newTasks?: readonly string[];
};

export type PlanReview =
  | { ok: true; idempotent: true; decision: ReviewDecision }
  | {
      ok: true;
      idempotent: false;
      decision: 'approve';
      notes: string;
      status: MilestoneStatus;
    }
  | {
      ok: true;
      idempotent: false;
      decision: 'request_changes';
      notes: string;
      status: MilestoneStatus;
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

/**
 * Approve & deploy is Peter only, in the Portal and in chat.
 * Request changes is any Warehaus Staff member. Chat still uses Peter's grok-bot token.
 */
export function reviewActorDecision(
  actor: ReviewActor,
  decision: string,
): { ok: true } | { ok: false; reason: string } {
  if (actor.source === 'chat') {
    if (actor.tokenName !== PETER_CHAT_TOKEN) return { ok: false, reason: ONLY_PETER };
    return { ok: true };
  }
  if (actor.role !== 'Warehaus Staff') return { ok: false, reason: STAFF_REQUIRED };
  if (decision === 'approve' && !isPeterEmail(actor.email)) return { ok: false, reason: ONLY_PETER };
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
 * Typed task lines are the tasks, one per line, with the notes as the detail.
 * Without lines: one task per note group. Selected tasks are the groups.
 * Otherwise each blank-line paragraph is its own group. Tasks stay on this
 * milestone and carry the iteration they start as their round.
 */
export function iterationTaskDrafts(input: {
  notes: string;
  nextIteration: number;
  appliesTo: readonly { id: string; name: string }[];
  newTasks?: readonly string[];
}): NoteGroupTask[] {
  const notes = input.notes.trim();
  const review = { origin: 'review' as const, round: input.nextIteration };
  const lines = (input.newTasks ?? []).map((line) => line.trim()).filter((line) => line.length > 0);
  if (lines.length > 0) {
    return lines.map((line) => ({ name: line, description: notes, parentTaskId: null, ...review }));
  }
  if (input.appliesTo.length > 0) {
    return input.appliesTo.map((task) => ({
      name: taskTitle(task.name, input.nextIteration),
      description: notes,
      parentTaskId: task.id,
      ...review,
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
    ...review,
  }));
}

export function historyPageLimit(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value)) return 20;
  return Math.min(50, Math.max(1, Math.floor(value)));
}

export function planReview(input: PlanReviewInput): PlanReview {
  const actor = reviewActorDecision(input.actor, input.decision);
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
  const moved = transitionMilestone({ from: input.status, cause: input.decision });
  if (!moved.ok) return { ok: false, reason: moved.reason };
  if (!input.hasPreview) return { ok: false, reason: WAITING_ON_BUILD };
  if (input.decision === 'approve') {
    return { ok: true, idempotent: false, decision: 'approve', notes: input.notes.trim(), status: moved.status };
  }
  const notes = input.notes.trim();
  if (!notes) return { ok: false, reason: NOTES_REQUIRED };
  const lines = reviewTaskLines(input.newTasks);
  if (!lines.ok) return { ok: false, reason: lines.reason };
  const nextIteration = input.currentIteration + 1;
  return {
    ok: true,
    idempotent: false,
    decision: 'request_changes',
    notes,
    status: moved.status,
    nextIteration,
    tasks: iterationTaskDrafts({ notes, nextIteration, appliesTo: input.appliesTo, newTasks: lines.titles }),
  };
}

export function iterationOutcome(input: {
  iteration: number;
  currentIteration: number;
  decision: ReviewDecision | null;
  status: MilestoneStatus;
}): 'In review' | 'Changes requested' | 'Building' | 'Approved' {
  if (input.decision === 'approve') return 'Approved';
  if (input.decision === 'request_changes' && input.iteration < input.currentIteration) return 'Changes requested';
  if (input.status === 'Building' && input.iteration === input.currentIteration) return 'Building';
  if (input.status === 'Ready to Ship' && input.iteration === input.currentIteration) return 'In review';
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

export const PORTAL_REVIEW_SOURCE = PORTAL_REVIEW_TASK_SOURCE;

export function isPortalReviewTask(source: string | null | undefined): boolean {
  return source === PORTAL_REVIEW_SOURCE;
}

/**
 * Notion pull and outbox must not create, delete, or overwrite a page for a
 * task the portal owns: one made by a change request or added inside a milestone.
 */
export function notionWriteAllowedForTask(input: {
  source?: string | null;
  notionPageId?: string | null;
}): boolean {
  return !isPortalOwnedTask(input);
}
