/**
 * Rules for a bot that creates and reads milestones through the staff API:
 * Grok Bot and Claude. Pure. No Convex imports.
 */

import { PLAN_TASKS_MAX, PLAN_TASKS_MIN } from '@warehaus/runner-protocol';
import type { MilestoneCreatedVia } from './milestoneTasks';

export const PROPOSED_TASKS_MIN = PLAN_TASKS_MIN;
export const PROPOSED_TASKS_MAX = PLAN_TASKS_MAX;
export const PROPOSED_TASKS_SHAPE = 'proposedTasks must be a list of task titles, or of objects with a title';
export const PROPOSED_TASKS_COUNT = `Propose ${PROPOSED_TASKS_MIN} to ${PROPOSED_TASKS_MAX} tasks, or none`;
export const PROPOSED_TASK_TITLE = 'Every proposed task needs a title under 200 characters';
export const PROPOSED_TASKS_DUPLICATE = 'Two proposed tasks have the same title';
export const BOT_STATUS_BUILDING = 'Building is set in the Portal. A bot cannot set it.';
export const NOTE_REQUIRED = 'Add the note text';
export const NOTE_TOO_LONG = 'Keep the note under 4000 characters';
export const PETER_BOT_TOKEN = 'grok-bot';

const TITLE_LIMIT = 200;
const DETAIL_LIMIT = 4000;
const NOTE_LIMIT = 4000;

export type ProposedTask = { title: string; detail: string };

function record(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/**
 * The task list a bot proposes with a new milestone. Missing or empty means
 * the milestone starts with no tasks. Otherwise 3 to 10 concrete tasks.
 */
export function proposedTasksDecision(
  input: unknown,
): { ok: true; tasks: ProposedTask[] } | { ok: false; reason: string } {
  if (input == null) return { ok: true, tasks: [] };
  if (!Array.isArray(input)) return { ok: false, reason: PROPOSED_TASKS_SHAPE };
  if (input.length === 0) return { ok: true, tasks: [] };
  if (input.length < PROPOSED_TASKS_MIN || input.length > PROPOSED_TASKS_MAX) {
    return { ok: false, reason: PROPOSED_TASKS_COUNT };
  }
  const tasks: ProposedTask[] = [];
  const seen = new Set<string>();
  for (const item of input) {
    const row = record(item);
    const rawTitle = typeof item === 'string' ? item : row?.title;
    const rawDetail = row?.detail;
    if (typeof rawTitle !== 'string') return { ok: false, reason: PROPOSED_TASKS_SHAPE };
    if (rawDetail != null && typeof rawDetail !== 'string') return { ok: false, reason: PROPOSED_TASKS_SHAPE };
    const title = rawTitle.replace(/\s+/g, ' ').trim();
    if (!title || title.length > TITLE_LIMIT) return { ok: false, reason: PROPOSED_TASK_TITLE };
    const key = title.toLowerCase();
    if (seen.has(key)) return { ok: false, reason: PROPOSED_TASKS_DUPLICATE };
    seen.add(key);
    tasks.push({ title, detail: typeof rawDetail === 'string' ? rawDetail.trim().slice(0, DETAIL_LIMIT) : '' });
  }
  return { ok: true, tasks };
}

/**
 * Where a milestone made through the staff API came from. The token name
 * decides: grok-bot is Grok Bot, a token named for Claude is Claude, anything
 * else is other. A value on the request is ignored. Never portal.
 */
export function createdViaDecision(input: {
  tokenName: string;
}): { ok: true; createdVia: Exclude<MilestoneCreatedVia, 'portal'> } {
  const name = input.tokenName.trim().toLowerCase();
  if (name === PETER_BOT_TOKEN || name.includes('grok')) return { ok: true, createdVia: 'grok' };
  if (name.includes('claude')) return { ok: true, createdVia: 'claude' };
  return { ok: true, createdVia: 'other' };
}

/**
 * Status of a milestone a bot creates. A stated status is kept, except
 * Building, which the runner claims. With no status it starts at Planning,
 * whether or not the call includes tasks.
 */
export function statusForBotCreate(
  stated: string | null | undefined,
): { ok: true; status: string } | { ok: false; reason: string } {
  if (stated === 'Building') return { ok: false, reason: BOT_STATUS_BUILDING };
  return { ok: true, status: stated ? stated : 'Planning' };
}

export function noteDecision(body: unknown): { ok: true; body: string } | { ok: false; reason: string } {
  const text = typeof body === 'string' ? body.trim() : '';
  if (!text) return { ok: false, reason: NOTE_REQUIRED };
  if (text.length > NOTE_LIMIT) return { ok: false, reason: NOTE_TOO_LONG };
  return { ok: true, body: text };
}

/** Rows a status read returns at most. Keeps one read small. */
export const STATUS_TASK_LIMIT = 100;
export const STATUS_EVENT_LIMIT = 10;
export const STATUS_NOTE_LIMIT = 10;
export const STATUS_REVIEW_LIMIT = 5;
