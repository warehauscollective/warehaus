/**
 * Pure parts of `NotionTaskSource` (the Convex adapter lives in
 * apps/portal/convex/sync/sources/notion.ts).
 *
 * The Notion pipeline — pull, `/notion/webhook`, `notionOutbox`, the
 * NOTION_WRITEBACK_ENABLED gate — is unchanged. These helpers only describe it
 * through the `TaskSource` contract so other sources can sit beside it.
 */

import type { MappedTask } from './mappers';
import { isLiveTaskStatus, isTaskStage, type LiveTaskStatus } from './taskBoard';
import type {
  NeutralTask,
  ParsedWebhook,
  StatusMapping,
  TaskSourceCapabilities,
} from './taskSource';
import { isNotionWritebackEnabled } from './writeback';

/** Where Notion task webhooks land. Path is unchanged. */
export const NOTION_WEBHOOK_PATH = '/notion/webhook';

/**
 * `canWrite` mirrors NOTION_WRITEBACK_ENABLED; the gate itself stays in the
 * outbox worker and `taskWrite`. Notion has no dependency field.
 */
export function notionTaskSourceCapabilities(
  writebackFlag: string | undefined,
): TaskSourceCapabilities {
  return {
    canWrite: isNotionWritebackEnabled(writebackFlag),
    supportsWebhooks: true,
    supportsDependencies: false,
    supportsStage: true,
  };
}

/**
 * Notion Status → portal Status. Notion already uses the portal names; a value
 * outside LIVE_TASK_STATUSES (legacy option) reads as Inbox for the neutral
 * view only. The pull still stores the raw Notion value, as before.
 * Client visibility for Notion comes from the gate (Publish to Warehaus), not
 * from Status, so `hiddenFromClients` is always false here.
 */
export function mapNotionTaskStatus(raw: unknown): StatusMapping {
  const status: LiveTaskStatus =
    typeof raw === 'string' && isLiveTaskStatus(raw) ? raw : 'Inbox';
  return { status, hiddenFromClients: false };
}

/** A mapped Notion task page as a source-neutral task. */
export function neutralTaskFromNotion(input: {
  row: MappedTask;
  lastEdited: string;
  hiddenFromClients: boolean;
}): NeutralTask {
  const { row } = input;
  const task: NeutralTask = {
    source: 'notion',
    externalId: row.notionPageId,
    title: row.name,
    status: mapNotionTaskStatus(row.status).status,
    hiddenFromClients: input.hiddenFromClients,
    stage: row.stage && isTaskStage(row.stage) ? row.stage : null,
    dependencyExternalIds: [],
    notionContextPageId: row.notionPageId,
    sourceUpdatedAt: input.lastEdited,
  };
  if (row.description) task.description = row.description;
  if (row.date) task.dueDate = row.date;
  return task;
}

/**
 * The delivery id `notionWebhook` dedupes on: body `id`, else `event_id`.
 * Null when neither is a non-empty string; the handler then makes a one-off id.
 */
export function notionWebhookEventId(body: Record<string, unknown>): string | null {
  if (typeof body.id === 'string' && body.id) return body.id;
  if (typeof body.event_id === 'string' && body.event_id) return body.event_id;
  return null;
}

/**
 * Notion webhooks only signal "something changed"; the handler runs a pull
 * rather than trusting payload fields. Page id is read when present.
 */
export function parseNotionWebhook(rawBody: string): ParsedWebhook {
  let body: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(rawBody) as unknown;
    if (parsed && typeof parsed === 'object') body = parsed as Record<string, unknown>;
  } catch {
    body = {};
  }
  const entity = body.entity as { id?: unknown; type?: unknown } | undefined;
  const externalIds =
    entity && entity.type === 'page' && typeof entity.id === 'string' && entity.id
      ? [entity.id]
      : [];
  const type = typeof body.type === 'string' ? body.type : '';
  const action: ParsedWebhook['action'] = /\.(created|undeleted)$/.test(type)
    ? 'create'
    : /\.deleted$/.test(type)
      ? 'remove'
      : 'update';
  return { deliveryId: notionWebhookEventId(body) ?? '', externalIds, action };
}
