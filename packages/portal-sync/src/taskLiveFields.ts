/**
 * Staff edits for Estimate, Priority, Source, and Publish to Warehaus.
 * The outbox is the only Notion write. This module does not patch a task row.
 * Is Done stays read-only. Clients never receive these fields.
 */

import type { WriteProperties, WriteValue } from './writeback';

/** Notion Tasks Estimate select. Unknown names fail closed. */
export const TASK_ESTIMATES = ['XS', 'S', 'M', 'L', 'XL'] as const;
/** Notion Tasks Priority select. */
export const TASK_PRIORITIES = ['High', 'Medium', 'Low'] as const;
/** Shared Source select. Same options as Clients. */
export const TASK_SOURCES = ['motoko', 'portal', 'notion-ui', 'bridge', 'arc'] as const;

export type TaskEstimate = (typeof TASK_ESTIMATES)[number];
export type TaskPriority = (typeof TASK_PRIORITIES)[number];
export type TaskSource = (typeof TASK_SOURCES)[number];

const FIELD_NAMES = ['Estimate', 'Priority', 'Source', 'Publish to Warehaus'] as const;

export type TaskLiveFieldInput = {
  estimate?: string | null;
  priority?: string | null;
  source?: string | null;
  publishToWarehaus?: boolean;
};

function isOneOf(value: string, options: readonly string[]): boolean {
  return options.includes(value);
}

function selectValue(value: string | null): string | null {
  const text = value?.trim() ?? '';
  return text.length > 0 ? text : null;
}

function selectError(value: WriteValue | undefined, options: readonly string[], label: string): string | null {
  if (value == null || value === '') return null;
  if (typeof value === 'string' && isOneOf(value, options)) return null;
  return `Unknown ${label}`;
}

/** Names and values allowed on a task-fields patch. Null clears a select. */
export function taskLiveFieldsWriteError(properties: WriteProperties): string | null {
  const names = Object.keys(properties);
  if (names.length === 0) return 'At least one property is required';
  for (const name of names) {
    if (!FIELD_NAMES.includes(name as (typeof FIELD_NAMES)[number])) {
      return 'Task field updates can only set Estimate, Priority, Source, or Publish to Warehaus';
    }
  }
  if ('Estimate' in properties) {
    const error = selectError(properties.Estimate, TASK_ESTIMATES, 'estimate');
    if (error) return error;
  }
  if ('Priority' in properties) {
    const error = selectError(properties.Priority, TASK_PRIORITIES, 'priority');
    if (error) return error;
  }
  if ('Source' in properties) {
    const error = selectError(properties.Source, TASK_SOURCES, 'source');
    if (error) return error;
  }
  if ('Publish to Warehaus' in properties && typeof properties['Publish to Warehaus'] !== 'boolean') {
    return 'Publish to Warehaus must be true or false';
  }
  return null;
}

function fieldToken(properties: WriteProperties): string {
  return Object.keys(properties)
    .sort()
    .map((name) => `${name}=${properties[name] == null ? '' : String(properties[name])}`)
    .join('|');
}

export function planTaskLiveFieldsWrite(
  input: {
    actor: 'staff' | 'client';
    notionPageId: string;
    expectedLastEditedTime: string;
  } & TaskLiveFieldInput,
):
  | { ok: true; properties: WriteProperties; idempotencyKey: string }
  | { ok: false; error: string } {
  if (input.actor !== 'staff') return { ok: false, error: 'Clients cannot edit these task fields.' };
  if (!input.notionPageId) return { ok: false, error: 'Updates require a Notion page' };
  if (!input.expectedLastEditedTime) return { ok: false, error: 'Updates require the last read time' };

  const properties: WriteProperties = {};
  if (input.estimate !== undefined) properties.Estimate = selectValue(input.estimate);
  if (input.priority !== undefined) properties.Priority = selectValue(input.priority);
  if (input.source !== undefined) properties.Source = selectValue(input.source);
  if (input.publishToWarehaus !== undefined) properties['Publish to Warehaus'] = input.publishToWarehaus;

  const error = taskLiveFieldsWriteError(properties);
  if (error) return { ok: false, error };
  return {
    ok: true,
    properties,
    idempotencyKey: `task-fields:${input.notionPageId}:${fieldToken(properties)}:${input.expectedLastEditedTime}`,
  };
}
