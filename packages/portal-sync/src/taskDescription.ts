/**
 * Task description. The Notion Description property is SERVER.
 * Page body wins when it has text. The property is the fallback.
 * Clients receive the text only when the tier is CLIENT and the task is published.
 */

import { sanitizeInlineText } from './doc-blocks';
import { extractRichText } from './extract';
import { classifyProperty, type FieldTier } from './tiers';

export const TASK_DESCRIPTION_MAX = 4000;

export function taskDescriptionTier(): FieldTier {
  return classifyProperty('tasks', 'Description');
}

/** CLIENT tier and a published task. SERVER and NEVER stay off the client payload. */
export function clientMaySeeTaskDescription(input: {
  publishToWarehaus: boolean;
  tier?: FieldTier;
}): boolean {
  const tier = input.tier ?? taskDescriptionTier();
  return tier === 'CLIENT' && input.publishToWarehaus;
}

export function plainTextFromNotionBlocks(blocks: readonly unknown[]): string {
  const parts: string[] = [];
  for (const block of blocks) {
    if (!block || typeof block !== 'object') continue;
    const record = block as { type?: string };
    const type = record.type;
    if (!type) continue;
    const payload = (record as Record<string, unknown>)[type];
    if (!payload || typeof payload !== 'object') continue;
    const text = sanitizeInlineText(
      extractRichText({
        type: 'rich_text',
        rich_text: (payload as { rich_text?: unknown }).rich_text,
      }),
    );
    if (text) parts.push(text);
  }
  return parts.join('\n').trim();
}

/** Non-empty page body wins. Otherwise the Description property. */
export function resolveTaskDescription(input: {
  pageBody?: string | null;
  descriptionProperty?: string | null;
}): string | undefined {
  const body = sanitizeInlineText(input.pageBody ?? '');
  if (body) return body.slice(0, TASK_DESCRIPTION_MAX);
  const property = sanitizeInlineText(input.descriptionProperty ?? '');
  return property ? property.slice(0, TASK_DESCRIPTION_MAX) : undefined;
}

export function planTaskDescriptionWrite(input: {
  actor: 'staff' | 'client';
  description: string;
  notionPageId: string;
  expectedLastEditedTime: string;
}):
  | { ok: true; properties: { Description: string }; idempotencyKey: string }
  | { ok: false; error: string } {
  if (input.actor !== 'staff') return { ok: false, error: 'Clients cannot edit a task description.' };
  if (!input.notionPageId) return { ok: false, error: 'Updates require a Notion page' };
  if (!input.expectedLastEditedTime) return { ok: false, error: 'Updates require the last read time' };
  const description = sanitizeInlineText(input.description);
  if (description.length > TASK_DESCRIPTION_MAX) {
    return { ok: false, error: 'Description is too long' };
  }
  if (/notion\.(so|com)|amazonaws\.com/i.test(input.description)) {
    return { ok: false, error: 'Description must be client-safe' };
  }
  return {
    ok: true,
    properties: { Description: description },
    idempotencyKey: `task-description:${input.notionPageId}:${description}:${input.expectedLastEditedTime}`,
  };
}
