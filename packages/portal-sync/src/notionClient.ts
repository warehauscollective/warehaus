/**
 * The Notion client interface (ADR-0002). Generic Notion operations only:
 * domain filters and request builders stay pure beside it in this package.
 * The HTTP adapter and the write policy live in the portal's Convex code.
 */

import { WRITEBACK_OFF_ERROR } from './writeback';

/** What a write to Notion is for. The write policy decides per kind. */
export type WriteKind = 'writeback' | 'auth-mirror' | 'resource-url';

/** Why the write policy refused a write. */
export type SkipReason = 'writeback-off' | 'not-production' | 'not-configured';

export type WriteDecision = { allowed: true } | { allowed: false; reason: SkipReason };

export const SKIP_MESSAGES: Record<SkipReason, string> = {
  'writeback-off': WRITEBACK_OFF_ERROR,
  'not-production': 'Only production writes this to Notion.',
  'not-configured': 'Notion is not configured for write-back.',
};

export type NotionRawPage = {
  id: string;
  last_edited_time?: string;
  properties?: Record<string, unknown>;
  archived?: boolean;
  is_archived?: boolean;
  in_trash?: boolean;
};

export type NotionRawBlock = { type: string; [key: string]: unknown };

export type NotionList<T> = { results: T[]; nextCursor: string | null };

export type QueryOptions = {
  /** A Notion filter object, passed through as given. */
  filter?: unknown;
  /** Only pages edited after this ISO timestamp. Combined with `filter` is not supported. */
  editedSinceIso?: string | null;
  /** Query the archived partition. */
  archived?: boolean;
  pageSize?: number;
  cursor?: string | null;
};

export type NotionWriteResult = {
  ok: boolean;
  status: number;
  notionPageId?: string;
  lastEditedTime?: string | null;
  retryAfterMs?: number;
  error?: string;
  properties?: Record<string, unknown>;
  /** Set when the write policy refused the write. Nothing was sent to Notion. */
  skipped?: SkipReason;
};

export type NotionErrorCode = 'http' | 'not-configured';

/** A failed read. Writes return a `NotionWriteResult` instead. */
export class NotionError extends Error {
  readonly code: NotionErrorCode;
  readonly status: number;
  readonly retryAfterMs?: number;

  constructor(code: NotionErrorCode, status: number, message: string, retryAfterMs?: number) {
    super(message);
    this.name = 'NotionError';
    this.code = code;
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

export interface NotionClient {
  /** A database id resolves to its primary data source; a data source id passes through. */
  resolveDataSourceId(databaseOrSourceId: string): Promise<string>;
  /** One page of results. Pass `nextCursor` back as `cursor` for the next. */
  queryDataSource(databaseOrSourceId: string, opts?: QueryOptions): Promise<NotionList<NotionRawPage>>;
  getPage(pageId: string): Promise<NotionRawPage>;
  listBlocks(pageId: string, cursor?: string | null): Promise<NotionList<NotionRawBlock>>;
  listPropertyNames(databaseOrSourceId: string): Promise<string[]>;
  /** `body` is the full Notion create request, parent included. */
  createPage(kind: WriteKind, body: Record<string, unknown>): Promise<NotionWriteResult>;
  patchProperties(kind: WriteKind, pageId: string, properties: Record<string, unknown>): Promise<NotionWriteResult>;
  archivePage(kind: WriteKind, pageId: string): Promise<NotionWriteResult>;
}
