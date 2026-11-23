/**
 * The outbox's Notion reads and writes, over the Notion client (ADR-0002).
 * Every write is a write-back write, so the client's write policy skips it
 * unless write-back is on.
 */

import {
  clientCreateHitFromNotion,
  clientCreatePageRequest,
  clientCreateSearchFilter,
  type ClientCreateHit,
  type ClientCreateProperties,
} from './clientCreate';
import { PORTAL_COLLECTIONS } from './collections';
import { extractRelationIds } from './extract';
import { NotionError, type NotionClient, type NotionRawPage, type NotionWriteResult } from './notionClient';
import { projectCreatePageRequest, projectCreateSearchFilter, type ProjectCreateProperties } from './projectCreate';
import { readNotionPlain, toNotionProperties, type WriteProperties, type WritebackDatabase } from './writeback';

type PageDatabase = Exclude<WritebackDatabase, 'activity'>;

export type PageRead =
  | { ok: true; lastEditedTime: string | null }
  | { ok: false; status: number; retryAfterMs?: number; error: string };

const ACTIVITY_WRITE: NotionWriteResult = { ok: false, status: 400, error: 'Activity has no portal create path' };

async function searchPages(notion: NotionClient, database: PageDatabase, filter: unknown): Promise<NotionRawPage[]> {
  const { results } = await notion.queryDataSource(PORTAL_COLLECTIONS[database], { filter, pageSize: 5 });
  return results.filter((page) => Boolean(page.id));
}

/** Re-read last_edited_time before a property update. A failed read is a result, not a throw. */
export async function readLastEdited(notion: NotionClient, pageId: string): Promise<PageRead> {
  try {
    const page = await notion.getPage(pageId);
    if (!page.id) return { ok: false, status: 200, error: 'Notion response had no page id' };
    return { ok: true, lastEditedTime: page.last_edited_time ?? null };
  } catch (err) {
    if (err instanceof NotionError) {
      return { ok: false, status: err.status, retryAfterMs: err.retryAfterMs, error: err.message };
    }
    throw err;
  }
}

/**
 * Pages that already hold this Slug, Email or External ID. A contact belongs
 * to the caller's org when its Client Company includes the org's client page.
 */
export async function searchExistingPages(
  notion: NotionClient,
  database: WritebackDatabase,
  plan: { property: string; value: string },
  clientNotionId: string | null,
): Promise<Array<{ notionPageId: string; sameOrg: boolean }>> {
  if (database === 'activity') return [];
  const { property, value } = plan;
  if (property !== 'Slug' && property !== 'Email' && property !== 'External ID') return [];
  const filter =
    property === 'Email' ? { property, email: { equals: value } } : { property, rich_text: { equals: value } };
  const pages = await searchPages(notion, database, filter);
  return pages.map((page) => {
    if (database !== 'contacts') return { notionPageId: page.id, sameOrg: true };
    const ids = readNotionPlain(page.properties?.['Client Company']);
    const sameOrg = Boolean(clientNotionId) && Array.isArray(ids) && ids.includes(clientNotionId!);
    return { notionPageId: page.id, sameOrg };
  });
}

/** Create a page, or patch the properties of an existing one. */
export async function writePage(
  notion: NotionClient,
  database: WritebackDatabase,
  request: { method: 'create' | 'update'; notionPageId?: string; properties: WriteProperties },
): Promise<NotionWriteResult> {
  if (database === 'activity') return ACTIVITY_WRITE;
  const properties = toNotionProperties(database, request.properties);
  if (request.method === 'update' && request.notionPageId) {
    return notion.patchProperties('writeback', request.notionPageId, properties);
  }
  const sourceId = await notion.resolveDataSourceId(PORTAL_COLLECTIONS[database]);
  return notion.createPage('writeback', { parent: { type: 'data_source_id', data_source_id: sourceId }, properties });
}

export async function searchProjectCreateHits(
  notion: NotionClient,
  externalId: string,
): Promise<Array<{ notionPageId: string; clientNotionIds: string[] }>> {
  const pages = await searchPages(notion, 'projects', projectCreateSearchFilter(externalId));
  return pages.map((page) => ({ notionPageId: page.id, clientNotionIds: extractRelationIds(page.properties?.Client) }));
}

/** Uses the project-create property builder, not the generic create shaper. */
export async function createProjectPage(
  notion: NotionClient,
  properties: ProjectCreateProperties,
): Promise<NotionWriteResult> {
  const sourceId = await notion.resolveDataSourceId(PORTAL_COLLECTIONS.projects);
  return notion.createPage('writeback', projectCreatePageRequest(sourceId, properties));
}

/** External ID or Slug, in one query. Does not update the page. */
export async function searchClientCreateHits(
  notion: NotionClient,
  externalId: string,
  slug: string,
): Promise<ClientCreateHit[]> {
  if (!externalId || !slug) return [];
  const pages = await searchPages(notion, 'clients', clientCreateSearchFilter(externalId, slug));
  return pages.map((page) => clientCreateHitFromNotion({ notionPageId: page.id, properties: page.properties ?? {} }));
}

/** Full-page POST. A slug hit never reaches this function. */
export async function createClientPage(
  notion: NotionClient,
  properties: ClientCreateProperties,
): Promise<NotionWriteResult> {
  const sourceId = await notion.resolveDataSourceId(PORTAL_COLLECTIONS.clients);
  return notion.createPage('writeback', clientCreatePageRequest(sourceId, properties));
}
