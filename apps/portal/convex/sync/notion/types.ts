/**
 * The Notion client interface lives in `@warehaus/portal-sync` (ADR-0002),
 * so the outbox attempts there can take a client. Re-exported here for the
 * portal's own callers.
 */

export {
  NotionError,
  type NotionClient,
  type NotionErrorCode,
  type NotionList,
  type NotionRawBlock,
  type NotionRawPage,
  type NotionWriteResult,
  type QueryOptions,
} from '@warehaus/portal-sync';
