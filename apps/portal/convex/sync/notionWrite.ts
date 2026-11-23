/**
 * Notion writes for the outbox. Every call goes through the Notion client
 * (ADR-0002). Writes are write-back writes: the write policy skips them
 * unless NOTION_WRITEBACK_ENABLED is exactly "true".
 */

import {
  PORTAL_COLLECTIONS,
  clientCreatePageRequest,
  clientCreateSearchFilter,
  extractRelationIds,
  projectCreatePageRequest,
  projectCreateSearchFilter,
  toNotionProperties,
  type ClientCreateProperties,
  type ProjectCreateProperties,
  type WriteProperties,
  type WritebackDatabase,
} from '@warehaus/portal-sync';
import { NotionError, notionClient, type NotionWriteResult } from './notion';

export type { NotionWriteResult } from './notion';

function dataSourceId(database: Exclude<WritebackDatabase, 'activity'>): string {
  return PORTAL_COLLECTIONS[database];
}

async function searchPages(sourceId: string, filter: unknown) {
  const { results } = await notionClient().queryDataSource(sourceId, { filter, pageSize: 5 });
  return results.filter((page) => Boolean(page.id));
}

export async function searchNotionPages(
  database: Exclude<WritebackDatabase, 'activity'>,
  plan: { property: 'Slug' | 'Email' | 'External ID'; value: string },
): Promise<Array<{ notionPageId: string; properties: Record<string, unknown> }>> {
  const filter =
    plan.property === 'Email'
      ? { property: 'Email', email: { equals: plan.value } }
      : { property: plan.property, rich_text: { equals: plan.value } };
  const pages = await searchPages(dataSourceId(database), filter);
  return pages.map((page) => ({ notionPageId: page.id, properties: page.properties ?? {} }));
}

/** Re-read last_edited_time before a property update. Does not change the page. */
export async function readNotionLastEdited(pageId: string): Promise<NotionWriteResult> {
  try {
    const page = await notionClient().getPage(pageId);
    if (!page.id) return { ok: false, status: 200, error: 'Notion response had no page id' };
    return {
      ok: true,
      status: 200,
      notionPageId: page.id,
      lastEditedTime: page.last_edited_time ?? null,
      properties: page.properties,
    };
  } catch (err) {
    if (err instanceof NotionError) {
      return { ok: false, status: err.status, retryAfterMs: err.retryAfterMs, error: err.message };
    }
    throw err;
  }
}

export async function searchProjectCreateHits(
  externalId: string,
): Promise<Array<{ notionPageId: string; clientNotionIds: string[] }>> {
  const pages = await searchPages(PORTAL_COLLECTIONS.projects, projectCreateSearchFilter(externalId));
  return pages.map((page) => ({
    notionPageId: page.id,
    clientNotionIds: extractRelationIds(page.properties?.Client),
  }));
}

/** External ID or Slug. Does not update the page. */
export async function searchClientCreateHits(
  externalId: string,
  slug: string,
): Promise<Array<{ notionPageId: string; properties: Record<string, unknown> }>> {
  const pages = await searchPages(PORTAL_COLLECTIONS.clients, clientCreateSearchFilter(externalId, slug));
  return pages.map((page) => ({ notionPageId: page.id, properties: page.properties ?? {} }));
}

/** Full-page POST. A slug hit never reaches this function. */
export async function createNotionClientPage(
  properties: ClientCreateProperties,
): Promise<NotionWriteResult> {
  const notion = notionClient();
  const sourceId = await notion.resolveDataSourceId(PORTAL_COLLECTIONS.clients);
  return notion.createPage('writeback', clientCreatePageRequest(sourceId, properties));
}

/** Uses the project-create property builder, not the generic create shaper. */
export async function createNotionProjectPage(
  properties: ProjectCreateProperties,
): Promise<NotionWriteResult> {
  const notion = notionClient();
  const sourceId = await notion.resolveDataSourceId(PORTAL_COLLECTIONS.projects);
  return notion.createPage('writeback', projectCreatePageRequest(sourceId, properties));
}

/** Archive the Notion page. The portal row stays and is hidden by archivedAt. */
export function archiveNotionPage(notionPageId: string): Promise<NotionWriteResult> {
  return notionClient().archivePage('writeback', notionPageId);
}

export async function writeNotionPage(
  database: Exclude<WritebackDatabase, 'activity'>,
  request: { method: 'create' | 'update'; notionPageId?: string; properties: WriteProperties },
): Promise<NotionWriteResult> {
  const notion = notionClient();
  const properties = toNotionProperties(database, request.properties);
  if (request.method === 'update' && request.notionPageId) {
    return notion.patchProperties('writeback', request.notionPageId, properties);
  }
  const sourceId = await notion.resolveDataSourceId(dataSourceId(database));
  return notion.createPage('writeback', {
    parent: { type: 'data_source_id', data_source_id: sourceId },
    properties,
  });
}
