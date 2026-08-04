/**
 * Minimal Notion data-source query helpers for Convex actions (fetch-based).
 * Uses Notion API 2025-09-03 (data_sources), matching @notionhq/client v5.
 */

import { PORTAL_COLLECTIONS } from '@warehaus/portal-sync';

const NOTION_VERSION = '2025-09-03';

export type NotionPageRow = {
  id: string;
  lastEdited: string;
  properties: Record<string, unknown>;
};

const dataSourceCache = new Map<string, string>();

export function notionToken(): string {
  const token = process.env.NOTION_WAREHAUS_TOKEN;
  if (!token) {
    throw new Error('NOTION_WAREHAUS_TOKEN is not set on the Convex deployment');
  }
  return token;
}

async function notionFetch(path: string, init?: RequestInit) {
  const res = await fetch(`https://api.notion.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${notionToken()}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Notion ${path} → ${res.status}: ${body.slice(0, 400)}`);
  }
  return res.json();
}

/**
 * Resolve database page id → primary data_source id.
 * Allowlisted IDs in `@warehaus/portal-sync` are already data_source (collection) ids —
 * those 404 on `/databases/{id}` and must pass through.
 */
export async function resolveDataSourceId(databaseOrSourceId: string): Promise<string> {
  const cached = dataSourceCache.get(databaseOrSourceId);
  if (cached) return cached;

  try {
    const db = await notionFetch(`/databases/${databaseOrSourceId}`);
    const id = db?.data_sources?.[0]?.id;
    if (typeof id === 'string' && id) {
      dataSourceCache.set(databaseOrSourceId, id);
      return id;
    }
  } catch {
    // Likely already a data_source_id (or not shared) — try as-is at query time.
  }

  dataSourceCache.set(databaseOrSourceId, databaseOrSourceId);
  return databaseOrSourceId;
}

export type QueryPagesOpts = {
  /**
   * ISO timestamp — only pages with `last_edited_time` after this value.
   * Omit / null for a full scan.
   */
  editedSinceIso?: string | null;
};

/** Query a collection (database or data source id) with pagination. */
export async function queryAllDataSourcePages(
  databaseOrSourceId: string,
  opts?: QueryPagesOpts,
): Promise<NotionPageRow[]> {
  const dataSourceId = await resolveDataSourceId(databaseOrSourceId);
  const out: NotionPageRow[] = [];
  let cursor: string | undefined;
  do {
    const body: Record<string, unknown> = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    if (opts?.editedSinceIso) {
      body.filter = {
        timestamp: 'last_edited_time',
        last_edited_time: { after: opts.editedSinceIso },
      };
    }
    const json = await notionFetch(`/data_sources/${dataSourceId}/query`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    for (const page of json.results ?? []) {
      if (!page?.id || !page.properties) continue;
      out.push({
        id: page.id,
        lastEdited: page.last_edited_time ?? '',
        properties: page.properties,
      });
    }
    cursor = json.has_more ? json.next_cursor : undefined;
  } while (cursor);
  return out;
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
 * Idempotent when Notion already has the same URL.
 */
export async function writeSharedResourceUrl(input: {
  notionPageId: string;
  url: string;
  currentUrl?: string | null;
}): Promise<'written' | 'skipped'> {
  if (!input.url || input.currentUrl === input.url) return 'skipped';
  await notionFetch(`/pages/${input.notionPageId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      properties: {
        URL: { url: input.url },
      },
    }),
  });
  return 'written';
}
