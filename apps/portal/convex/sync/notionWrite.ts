/**
 * Notion writes for the outbox. Notion-Version 2025-09-03.
 * `notionAuth.ts` still sends 2022-06-28 and is intentionally unchanged.
 * Every function here refuses to run unless NOTION_WRITEBACK_ENABLED is exactly "true".
 */

import { PORTAL_COLLECTIONS, toNotionProperties, type WriteProperties, type WritebackDatabase } from '@warehaus/portal-sync';
import { isNotionWritebackEnabled } from '../_lib/writeAuthz';
import { notionToken, resolveDataSourceId } from './notionApi';

const NOTION_VERSION = '2025-09-03';

export type NotionWriteResult = {
  ok: boolean;
  status: number;
  notionPageId?: string;
  lastEditedTime?: string | null;
  retryAfterMs?: number;
  error?: string;
  properties?: Record<string, unknown>;
};

function assertWritebackEnabled() {
  if (!isNotionWritebackEnabled()) {
    throw new Error('NOTION_WRITEBACK_ENABLED is off');
  }
}

async function notionWriteFetch(path: string, init: RequestInit): Promise<Response> {
  assertWritebackEnabled();
  return fetch(`https://api.notion.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${notionToken()}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
}

function retryAfterMs(res: Response): number | undefined {
  const header = res.headers.get('retry-after');
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const when = Date.parse(header);
  if (Number.isFinite(when)) return Math.max(0, when - Date.now());
  return undefined;
}

async function readResult(res: Response): Promise<NotionWriteResult> {
  if (res.status === 429 || !res.ok) {
    const error = (await res.text()).slice(0, 400);
    return { ok: false, status: res.status, retryAfterMs: retryAfterMs(res), error };
  }
  const body = (await res.json()) as {
    id?: string;
    last_edited_time?: string;
    properties?: Record<string, unknown>;
  };
  if (!body.id) return { ok: false, status: res.status, error: 'Notion response had no page id' };
  return {
    ok: true,
    status: res.status,
    notionPageId: body.id,
    lastEditedTime: body.last_edited_time ?? null,
    properties: body.properties,
  };
}

function dataSourceId(database: Exclude<WritebackDatabase, 'activity'>): string {
  return PORTAL_COLLECTIONS[database];
}

export async function searchNotionPages(
  database: Exclude<WritebackDatabase, 'activity'>,
  plan: { property: 'Slug' | 'Email' | 'External ID'; value: string },
): Promise<Array<{ notionPageId: string; properties: Record<string, unknown> }>> {
  const sourceId = await resolveDataSourceId(dataSourceId(database));
  const filter =
    plan.property === 'Email'
      ? { property: 'Email', email: { equals: plan.value } }
      : { property: plan.property, rich_text: { equals: plan.value } };
  const res = await notionWriteFetch(`/data_sources/${sourceId}/query`, {
    method: 'POST',
    body: JSON.stringify({ filter, page_size: 5 }),
  });
  if (!res.ok) {
    const error = (await res.text()).slice(0, 400);
    throw new Error(`Notion search → ${res.status}: ${error}`);
  }
  const body = (await res.json()) as {
    results?: Array<{ id: string; properties?: Record<string, unknown> }>;
  };
  return (body.results ?? []).map((page) => ({
    notionPageId: page.id,
    properties: page.properties ?? {},
  }));
}

export async function writeNotionPage(
  database: Exclude<WritebackDatabase, 'activity'>,
  request: { method: 'create' | 'update'; notionPageId?: string; properties: WriteProperties },
): Promise<NotionWriteResult> {
  const properties = toNotionProperties(database, request.properties);
  if (request.method === 'update' && request.notionPageId) {
    const res = await notionWriteFetch(`/pages/${request.notionPageId}`, {
      method: 'PATCH',
      body: JSON.stringify({ properties }),
    });
    return readResult(res);
  }
  const sourceId = await resolveDataSourceId(dataSourceId(database));
  const res = await notionWriteFetch('/pages', {
    method: 'POST',
    body: JSON.stringify({
      parent: { type: 'data_source_id', data_source_id: sourceId },
      properties,
    }),
  });
  return readResult(res);
}
