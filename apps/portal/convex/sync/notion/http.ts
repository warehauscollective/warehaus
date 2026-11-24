/**
 * HTTP adapter for the Notion client. The only module that calls
 * `api.notion.com`. Every write passes the write policy first.
 */

import { SKIP_MESSAGES, decideWrite, type NotionEnv, type WriteKind } from './policy';
import {
  NotionError,
  type NotionClient,
  type NotionList,
  type NotionRawBlock,
  type NotionRawPage,
  type NotionWriteResult,
  type QueryOptions,
} from './types';

const NOTION_API = 'https://api.notion.com/v1';
export const NOTION_VERSION = '2025-09-03';

const NOT_CONFIGURED = 'NOTION_WAREHAUS_TOKEN is not set on the Convex deployment';

/** Database id → data source id. Lives for the action's isolate. */
const dataSourceCache = new Map<string, string>();

export function retryAfterMs(res: Response): number | undefined {
  const header = res.headers.get('retry-after');
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const when = Date.parse(header);
  if (Number.isFinite(when)) return Math.max(0, when - Date.now());
  return undefined;
}

export function createHttpNotionClient(env: NotionEnv): NotionClient {
  async function send(path: string, init?: RequestInit): Promise<Response> {
    if (!env.token) throw new NotionError('not-configured', 0, NOT_CONFIGURED);
    return fetch(`${NOTION_API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${env.token}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });
  }

  async function read<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await send(path, init);
    if (!res.ok) {
      const body = (await res.text()).slice(0, 400);
      throw new NotionError('http', res.status, `Notion ${path} → ${res.status}: ${body}`, retryAfterMs(res));
    }
    return (await res.json()) as T;
  }

  async function write(kind: WriteKind, path: string, init: RequestInit): Promise<NotionWriteResult> {
    const decision = decideWrite(kind, env);
    if (!decision.allowed) {
      console.info(`[notion] skipped ${kind} write: ${decision.reason}`);
      return { ok: false, status: 0, skipped: decision.reason, error: SKIP_MESSAGES[decision.reason] };
    }
    const res = await send(path, init);
    if (!res.ok) {
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

  async function resolveDataSourceId(databaseOrSourceId: string): Promise<string> {
    const cached = dataSourceCache.get(databaseOrSourceId);
    if (cached) return cached;
    try {
      const db = await read<{ data_sources?: Array<{ id?: string }> }>(`/databases/${databaseOrSourceId}`);
      const id = db?.data_sources?.[0]?.id;
      if (typeof id === 'string' && id) {
        dataSourceCache.set(databaseOrSourceId, id);
        return id;
      }
    } catch (err) {
      // A missing token is a configuration error, not a data source id.
      if (err instanceof NotionError && err.code === 'not-configured') throw err;
      // Allowlisted ids are already data source ids; those 404 on /databases.
    }
    dataSourceCache.set(databaseOrSourceId, databaseOrSourceId);
    return databaseOrSourceId;
  }

  return {
    resolveDataSourceId,

    async queryDataSource(databaseOrSourceId: string, opts: QueryOptions = {}): Promise<NotionList<NotionRawPage>> {
      const dataSourceId = await resolveDataSourceId(databaseOrSourceId);
      const body: Record<string, unknown> = { page_size: opts.pageSize ?? 100 };
      if (opts.cursor) body.start_cursor = opts.cursor;
      if (opts.archived) body.is_archived = true;
      if (opts.filter) body.filter = opts.filter;
      if (opts.editedSinceIso) {
        body.filter = { timestamp: 'last_edited_time', last_edited_time: { after: opts.editedSinceIso } };
      }
      const json = await read<{ results?: NotionRawPage[]; has_more?: boolean; next_cursor?: string | null }>(
        `/data_sources/${dataSourceId}/query`,
        { method: 'POST', body: JSON.stringify(body) },
      );
      return { results: json.results ?? [], nextCursor: json.has_more ? (json.next_cursor ?? null) : null };
    },

    getPage(pageId: string): Promise<NotionRawPage> {
      return read<NotionRawPage>(`/pages/${pageId}`);
    },

    async listBlocks(pageId: string, cursor?: string | null): Promise<NotionList<NotionRawBlock>> {
      const params = new URLSearchParams({ page_size: '100' });
      if (cursor) params.set('start_cursor', cursor);
      const json = await read<{ results?: NotionRawBlock[]; has_more?: boolean; next_cursor?: string | null }>(
        `/blocks/${pageId}/children?${params.toString()}`,
      );
      return { results: json.results ?? [], nextCursor: json.has_more ? (json.next_cursor ?? null) : null };
    },

    async listPropertyNames(databaseOrSourceId: string): Promise<string[]> {
      const dataSourceId = await resolveDataSourceId(databaseOrSourceId);
      const json = await read<{ properties?: Record<string, unknown> }>(`/data_sources/${dataSourceId}`);
      return json?.properties && typeof json.properties === 'object' ? Object.keys(json.properties) : [];
    },

    createPage(kind: WriteKind, body: Record<string, unknown>): Promise<NotionWriteResult> {
      return write(kind, '/pages', { method: 'POST', body: JSON.stringify(body) });
    },

    patchProperties(kind: WriteKind, pageId: string, properties: Record<string, unknown>): Promise<NotionWriteResult> {
      return write(kind, `/pages/${pageId}`, { method: 'PATCH', body: JSON.stringify({ properties }) });
    },

    archivePage(kind: WriteKind, pageId: string): Promise<NotionWriteResult> {
      return write(kind, `/pages/${pageId}`, { method: 'PATCH', body: JSON.stringify({ archived: true }) });
    },
  };
}
