/**
 * Pull-side Notion helpers. Every call goes through the Notion client (ADR-0002).
 */

import { PORTAL_COLLECTIONS } from '@warehaus/portal-sync';
import { notionClient, type NotionRawPage } from './notion';

export type NotionPageRow = {
  id: string;
  lastEdited: string;
  properties: Record<string, unknown>;
  archived: boolean;
  inTrash: boolean;
};

/**
 * Resolve database page id → primary data_source id.
 * Allowlisted IDs in `@warehaus/portal-sync` are already data_source (collection) ids —
 * those 404 on `/databases/{id}` and must pass through.
 */
export function resolveDataSourceId(databaseOrSourceId: string): Promise<string> {
  return notionClient().resolveDataSourceId(databaseOrSourceId);
}

/**
 * Property names on a data source. Null when the schema could not be read.
 * Callers then fall through to the write, which still rejects a missing property by name.
 */
export async function listDataSourcePropertyNames(databaseOrSourceId: string): Promise<string[] | null> {
  try {
    const names = await notionClient().listPropertyNames(databaseOrSourceId);
    return names.length ? names : null;
  } catch {
    return null;
  }
}

export type QueryPagesOpts = {
  /**
   * ISO timestamp — only pages with `last_edited_time` after this value.
   * Omit / null for a full scan.
   */
  editedSinceIso?: string | null;
  /** Query the archived partition. Default query omits archived pages. */
  archived?: boolean;
};

function toNotionPageRow(page: NotionRawPage & { properties: Record<string, unknown> }, fromArchivedQuery: boolean): NotionPageRow {
  return {
    id: page.id,
    lastEdited: page.last_edited_time ?? '',
    properties: page.properties,
    archived: Boolean(page.archived) || Boolean(page.is_archived) || fromArchivedQuery,
    inTrash: Boolean(page.in_trash),
  };
}

/** Query a collection (database or data source id) with pagination. */
export async function queryAllDataSourcePages(
  databaseOrSourceId: string,
  opts?: QueryPagesOpts,
): Promise<NotionPageRow[]> {
  const notion = notionClient();
  const out: NotionPageRow[] = [];
  let cursor: string | null = null;
  do {
    const page = await notion.queryDataSource(databaseOrSourceId, {
      cursor,
      archived: opts?.archived,
      editedSinceIso: opts?.editedSinceIso,
    });
    for (const row of page.results) {
      if (!row?.id || !row.properties) continue;
      out.push(toNotionPageRow({ ...row, properties: row.properties }, Boolean(opts?.archived)));
    }
    cursor = page.nextCursor;
  } while (cursor);
  return out;
}

/** Fetch one page by id. Returns null when Notion no longer has it. */
export async function fetchNotionPage(pageId: string): Promise<NotionPageRow | null> {
  try {
    const page = await notionClient().getPage(pageId);
    if (!page?.id || !page.properties) return null;
    return toNotionPageRow({ ...page, properties: page.properties }, false);
  } catch {
    return null;
  }
}

export const SYNC_SOURCES = {
  clients: PORTAL_COLLECTIONS.clients,
  projects: PORTAL_COLLECTIONS.projects,
  tasks: PORTAL_COLLECTIONS.tasks,
  contacts: PORTAL_COLLECTIONS.contacts,
  sharedResources: PORTAL_COLLECTIONS.sharedResources,
  clientDocs: PORTAL_COLLECTIONS.clientDocs,
} as const;

/**
 * Write durable Blob (or portal) URL onto the Shared Resource `URL` property.
 * Idempotent when Notion already has the same URL. A resource-URL write:
 * skipped unless write-back is on and a Blob token is set (ADR-0002).
 */
export async function writeSharedResourceUrl(input: {
  notionPageId: string;
  url: string;
  currentUrl?: string | null;
}): Promise<'written' | 'skipped'> {
  if (!input.url || input.currentUrl === input.url) return 'skipped';
  const result = await notionClient().patchProperties('resource-url', input.notionPageId, {
    URL: { url: input.url },
  });
  if (result.skipped) return 'skipped';
  if (!result.ok) {
    throw new Error(`Notion /pages/${input.notionPageId} → ${result.status}: ${result.error ?? ''}`);
  }
  return 'written';
}
