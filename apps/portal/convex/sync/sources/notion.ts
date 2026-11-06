/**
 * NotionTaskSource — today's Notion task sync described as a `TaskSource`.
 *
 * Zero behaviour change. The pipeline stays where it was:
 * - pull:     internal.sync.pull.pullAll (webhook + 15-min cron backstop)
 * - webhook:  POST /notion/webhook → sync/queue.ts notionWebhook → syncEvents dedupe
 * - writes:   sync/taskWrite.ts → notionOutbox → sync/outboxWork.ts, all gated by
 *             NOTION_WRITEBACK_ENABLED exactly as before
 * The pull's task branch reads its data source and page mapper from here, so
 * there is one place that says how a Notion task page becomes a task row.
 */

import {
  NOTION_WEBHOOK_PATH,
  mapNotionTask,
  mapNotionTaskStatus,
  neutralTaskFromNotion,
  notionTaskSourceCapabilities,
  parseNotionWebhook,
  type NeutralTask,
  type TaskSource,
  type TaskSourceCapabilities,
} from '@warehaus/portal-sync';
import { decideNotionWebhook } from '../../_lib/notionSignature';
import { SYNC_SOURCES, fetchNotionPage, queryAllDataSourcePages, type NotionPageRow } from '../notionApi';

/** Notion Tasks data source the pull reads. Unchanged id. */
export const NOTION_TASKS_DATA_SOURCE = SYNC_SOURCES.tasks;

/** How the pull turns a Notion task page into a row. Unchanged mapper. */
export const mapNotionTaskPage = mapNotionTask;

function neutralFromPage(page: NotionPageRow): NeutralTask | null {
  // Gate input is the parent project; list/get have no project map, so the
  // neutral view reads publish state only. The pull keeps its own gate.
  const mapped = mapNotionTaskPage(page.id, page.properties, true);
  if (!mapped.row || mapped.row.database !== 'tasks') return null;
  return neutralTaskFromNotion({
    row: mapped.row,
    lastEdited: page.lastEdited,
    hiddenFromClients:
      page.archived || page.inTrash || mapped.disposition !== 'upsert' || !mapped.row.publishToWarehaus,
  });
}

export const notionTaskSource: TaskSource = {
  id: 'notion',
  get capabilities(): TaskSourceCapabilities {
    return notionTaskSourceCapabilities(process.env.NOTION_WRITEBACK_ENABLED);
  },

  /** One full page set; Notion pagination is handled inside queryAllDataSourcePages. */
  async list(_cfg, opts) {
    const pages = await queryAllDataSourcePages(NOTION_TASKS_DATA_SOURCE, {
      editedSinceIso: opts.updatedSince ?? null,
    });
    const tasks: NeutralTask[] = [];
    for (const page of pages) {
      const task = neutralFromPage(page);
      if (task) tasks.push(task);
    }
    return { tasks };
  },

  async get(_cfg, externalId) {
    const page = await fetchNotionPage(externalId);
    return page ? neutralFromPage(page) : null;
  },

  // No `upsert`: Notion writes stay on notionOutbox (see taskWrite.ts).

  mapStatus(raw) {
    return mapNotionTaskStatus(raw);
  },

  async verifyWebhook(req, rawBody) {
    const decision = await decideNotionWebhook({
      rawBody,
      signatureHeader: req.headers.get('x-notion-signature'),
      secret: process.env.NOTION_WEBHOOK_SECRET,
    });
    return decision.ok;
  },

  parseWebhook(rawBody) {
    return parseNotionWebhook(rawBody);
  },
};

export { NOTION_WEBHOOK_PATH };
