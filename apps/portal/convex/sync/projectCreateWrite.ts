/**
 * Project create used to POST to Notion from this file.
 * That client is gone. `projectCreate.createInNotion` enqueues an outbox row,
 * and `sync/outboxWork` is the only sender.
 *
 * `NOTION_WRITEBACK_ENABLED` and `NOTION_PROJECT_CREATE_ENABLED` must each be
 * exactly "true". Write-back off queues nothing and sends nothing.
 */

export {
  planProjectCreateDispatch,
  PROJECT_CREATE_OFF_ERROR,
  WRITEBACK_OFF_ERROR,
} from '@warehaus/portal-sync';
