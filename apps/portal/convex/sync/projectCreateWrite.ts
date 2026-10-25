/**
 * Create one page in the Projects data source.
 * Runs only when NOTION_PROJECT_CREATE_ENABLED is exactly "true".
 * Does not read NOTION_WRITEBACK_ENABLED. Does not write any other database.
 */

import {
  PORTAL_COLLECTIONS,
  decideProjectCreateDedupe,
  extractRelationIds,
  isNotionProjectCreateEnabled,
  projectCreatePageRequest,
  projectCreateSearchFilter,
  type ProjectCreateProperties,
} from '@warehaus/portal-sync';
import { notionToken, resolveDataSourceId } from './notionApi';

const NOTION_VERSION = '2025-09-03';

export type NotionProjectCreateResult =
  | { ok: true; notionPageId: string; reused: boolean }
  | { ok: false; error: string };

function projectCreateEnabled(): boolean {
  return isNotionProjectCreateEnabled(process.env.NOTION_PROJECT_CREATE_ENABLED);
}

async function notionRequest(path: string, body: unknown): Promise<Response> {
  if (!projectCreateEnabled()) {
    throw new Error('NOTION_PROJECT_CREATE_ENABLED is off');
  }
  return fetch(`https://api.notion.com/v1${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${notionToken()}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

export async function writeNotionProject(
  properties: ProjectCreateProperties,
): Promise<NotionProjectCreateResult> {
  if (!projectCreateEnabled()) {
    return { ok: false, error: 'Project create is off. Nothing was sent to Notion.' };
  }

  try {
    const sourceId = await resolveDataSourceId(PORTAL_COLLECTIONS.projects);
    const externalId = properties['External ID'];
    const search = await notionRequest(`/data_sources/${sourceId}/query`, {
      filter: projectCreateSearchFilter(externalId),
      page_size: 5,
    });
    if (!search.ok) {
      console.error('[projectCreate] Notion search failed', search.status);
      return {
        ok: false,
        error: `Notion search failed (${search.status}). The project was not created.`,
      };
    }

    const found = (await search.json()) as {
      results?: Array<{ id?: string; properties?: Record<string, unknown> }>;
    };
    const hits = (found.results ?? [])
      .filter((page): page is { id: string; properties?: Record<string, unknown> } =>
        Boolean(page.id),
      )
      .map((page) => ({
        notionPageId: page.id,
        clientNotionIds: extractRelationIds(page.properties?.Client),
      }));
    const decision = decideProjectCreateDedupe({
      hits,
      clientNotionPageId: properties.Client[0],
    });
    if (decision.action === 'reject') {
      return { ok: false, error: decision.reason };
    }
    if (decision.action === 'reuse') {
      return { ok: true, notionPageId: decision.notionPageId, reused: true };
    }

    const created = await notionRequest(
      '/pages',
      projectCreatePageRequest(sourceId, properties),
    );
    if (!created.ok) {
      console.error('[projectCreate] Notion create failed', created.status);
      return {
        ok: false,
        error: `Notion did not create the project (${created.status}).`,
      };
    }
    const page = (await created.json()) as { id?: string };
    if (!page.id) {
      return { ok: false, error: 'Notion did not return a project page.' };
    }
    return { ok: true, notionPageId: page.id, reused: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (message.includes('NOTION_PROJECT_CREATE_ENABLED')) {
      return { ok: false, error: 'Project create is off. Nothing was sent to Notion.' };
    }
    if (message.includes('NOTION_WAREHAUS_TOKEN')) {
      return { ok: false, error: 'Notion is not configured for project create.' };
    }
    console.error('[projectCreate] failed', message.slice(0, 200));
    return { ok: false, error: 'Notion project create failed.' };
  }
}
