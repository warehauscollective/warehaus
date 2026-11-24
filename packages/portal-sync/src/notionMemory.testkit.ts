/**
 * In-memory adapter for the Notion client (ADR-0002). Tests only: it is
 * reachable through the `@warehaus/portal-sync/notion-memory` subpath, never
 * from the package index, so deployed code does not import it.
 *
 * It is strict on purpose. It supports only the operations and filters that
 * callers use today, and throws a plain `Error` on anything else, so a test
 * cannot pass by accident against behaviour Notion would not have. Writes ask
 * `policy` first; the portal's tests pass the real write policy.
 */

import {
  NotionError,
  SKIP_MESSAGES,
  type NotionClient,
  type NotionList,
  type NotionRawBlock,
  type NotionRawPage,
  type NotionWriteResult,
  type QueryOptions,
  type WriteDecision,
  type WriteKind,
} from './notionClient';

export type MemoryPage = {
  id: string;
  dataSourceId: string;
  properties: Record<string, unknown>;
  lastEditedTime: string;
  archived: boolean;
  inTrash: boolean;
  blocks: NotionRawBlock[];
};

export type MemoryCall = {
  op: 'resolve' | 'query' | 'getPage' | 'listBlocks' | 'listPropertyNames' | 'create' | 'patch' | 'archive';
  kind?: WriteKind;
  id?: string;
  skipped?: boolean;
};

type Op = MemoryCall['op'];

export type MemoryNotionOptions = {
  /** The write policy. Defaults to allowing every write. */
  policy?: (kind: WriteKind) => WriteDecision;
  /** False behaves like a missing token: reads throw `not-configured`. Defaults to true. */
  configured?: boolean;
  /** Database id → data source id, for `resolveDataSourceId`. */
  databases?: Record<string, string>;
  /** Data source id → its property names. A write naming another property fails like Notion does. */
  dataSources: Record<string, readonly string[]>;
  /** Results per query or block page. Small values exercise cursor loops. */
  pageSize?: number;
  /** First last_edited_time. Each write moves the clock one minute on. */
  startTime?: string;
};

export type MemoryNotion = NotionClient & {
  readonly calls: MemoryCall[];
  /** Put a page into a data source, as if someone edited Notion directly. Returns a copy. */
  seedPage(page: {
    id: string;
    dataSourceId: string;
    properties?: Record<string, unknown>;
    lastEditedTime?: string;
    archived?: boolean;
    inTrash?: boolean;
    blocks?: NotionRawBlock[];
  }): MemoryPage;
  /** A copy of the stored page, for assertions. */
  page(id: string): MemoryPage | undefined;
  /** Make the next call to `op` fail with this HTTP status. Reads throw; writes return it. */
  failNext(op: Op, status: number, options?: { retryAfterMs?: number; message?: string }): void;
};

const DEFAULT_START = '2026-11-23T10:00:00.000Z';

function unsupported(what: string): never {
  throw new Error(`In-memory Notion does not support ${what}`);
}

function plainOf(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const prop = value as Record<string, unknown>;
  const rich = Array.isArray(prop.rich_text) ? prop.rich_text : Array.isArray(prop.title) ? prop.title : null;
  if (!rich) return null;
  return rich
    .map((part) => {
      const piece = part as { plain_text?: string; text?: { content?: string } };
      return piece.plain_text ?? piece.text?.content ?? '';
    })
    .join('');
}

type Matcher = (page: MemoryPage) => boolean;

/** The filters callers send today: rich_text or email `equals`, and an `or` of those. */
function compileFilter(filter: unknown): Matcher {
  if (!filter || typeof filter !== 'object') unsupported(`filter ${JSON.stringify(filter)}`);
  const f = filter as Record<string, unknown>;
  const keys = Object.keys(f).sort().join(',');
  if (keys === 'or' && Array.isArray(f.or) && f.or.length > 0) {
    const parts = f.or.map(compileFilter);
    return (page) => parts.some((match) => match(page));
  }
  if (keys === 'property,rich_text' && typeof f.property === 'string') {
    const cond = f.rich_text as Record<string, unknown>;
    if (Object.keys(cond).join(',') !== 'equals' || typeof cond.equals !== 'string') {
      unsupported(`rich_text condition ${JSON.stringify(cond)}`);
    }
    const name = f.property;
    return (page) => plainOf(page.properties[name]) === cond.equals;
  }
  if (keys === 'email,property' && typeof f.property === 'string') {
    const cond = f.email as Record<string, unknown>;
    if (Object.keys(cond).join(',') !== 'equals' || typeof cond.equals !== 'string') {
      unsupported(`email condition ${JSON.stringify(cond)}`);
    }
    const name = f.property;
    return (page) => (page.properties[name] as { email?: unknown } | undefined)?.email === cond.equals;
  }
  return unsupported(`filter ${JSON.stringify(filter)}`);
}

function paginate<T>(items: readonly T[], cursor: string | null | undefined, size: number): NotionList<T> {
  let start = 0;
  if (cursor) {
    const match = /^memory-cursor-(\d+)$/.exec(cursor);
    if (!match) unsupported(`cursor ${cursor}`);
    start = Number(match[1]);
  }
  const end = start + size;
  return { results: items.slice(start, end), nextCursor: end < items.length ? `memory-cursor-${end}` : null };
}

/**
 * Store a property map the way Notion answers it: each value carries its
 * `type`, and every rich text part has `plain_text`, even when the write sent
 * only `{ relation: [...] }` or `text.content`.
 */
function asStored(properties: Record<string, unknown>): Record<string, unknown> {
  const out = structuredClone(properties);
  for (const value of Object.values(out)) {
    if (!value || typeof value !== 'object') continue;
    const record = value as Record<string, unknown>;
    if (record.type == null) {
      const keys = Object.keys(record).filter((key) => key !== 'id');
      if (keys.length !== 1) unsupported(`property value ${JSON.stringify(value)}`);
      record.type = keys[0];
    }
    for (const key of ['rich_text', 'title'] as const) {
      const parts = (value as Record<string, unknown>)[key];
      if (!Array.isArray(parts)) continue;
      for (const part of parts as Array<{ plain_text?: string; text?: { content?: string } }>) {
        if (part.plain_text == null) part.plain_text = part.text?.content ?? '';
      }
    }
  }
  return out;
}

function rawPage(page: MemoryPage): NotionRawPage {
  return {
    id: page.id,
    last_edited_time: page.lastEditedTime,
    properties: structuredClone(page.properties),
    archived: page.archived,
    in_trash: page.inTrash,
  };
}

export function createMemoryNotionClient(options: MemoryNotionOptions): MemoryNotion {
  const policy = options.policy ?? (() => ({ allowed: true }) as const);
  const databases = options.databases ?? {};
  const size = options.pageSize ?? 100;
  const pages = new Map<string, MemoryPage>();
  const calls: MemoryCall[] = [];
  const failures = new Map<Op, { status: number; retryAfterMs?: number; message: string }>();
  let clockMs = Date.parse(options.startTime ?? DEFAULT_START);
  let created = 0;

  function tick(): string {
    clockMs += 60_000;
    return new Date(clockMs).toISOString();
  }

  function takeFailure(op: Op) {
    const failure = failures.get(op);
    if (failure) failures.delete(op);
    return failure;
  }

  function failRead(op: Op): void {
    const failure = takeFailure(op);
    if (failure) throw new NotionError('http', failure.status, failure.message, failure.retryAfterMs);
  }

  function requireToken(): void {
    if (options.configured === false) throw new NotionError('not-configured', 0, 'NOTION_WAREHAUS_TOKEN is not set on the Convex deployment');
  }

  function sourceOf(databaseOrSourceId: string): string {
    return databases[databaseOrSourceId] ?? databaseOrSourceId;
  }

  function schemaOf(dataSourceId: string): readonly string[] {
    const schema = options.dataSources[dataSourceId];
    if (!schema) throw new NotionError('http', 404, `Notion data source ${dataSourceId} not found`);
    return schema;
  }

  function unknownProperty(dataSourceId: string, properties: Record<string, unknown>): string | null {
    const schema = new Set(options.dataSources[dataSourceId] ?? []);
    return Object.keys(properties).find((name) => !schema.has(name)) ?? null;
  }

  function wrote(page: MemoryPage, status = 200): NotionWriteResult {
    return {
      ok: true,
      status,
      notionPageId: page.id,
      lastEditedTime: page.lastEditedTime,
      properties: structuredClone(page.properties),
    };
  }

  /** Policy, then an injected failure, as the HTTP adapter orders them. */
  function gate(op: Op, kind: WriteKind, id?: string): NotionWriteResult | null {
    const decision = policy(kind);
    if (!decision.allowed) {
      calls.push({ op, kind, id, skipped: true });
      return { ok: false, status: 0, skipped: decision.reason, error: SKIP_MESSAGES[decision.reason] };
    }
    calls.push({ op, kind, id });
    const failure = takeFailure(op);
    if (failure) return { ok: false, status: failure.status, retryAfterMs: failure.retryAfterMs, error: failure.message };
    return null;
  }

  function writable(pageId: string): MemoryPage | NotionWriteResult {
    const page = pages.get(pageId);
    if (!page) return { ok: false, status: 404, error: `Could not find page with ID: ${pageId}` };
    return page;
  }

  return {
    calls,

    seedPage(input) {
      schemaOf(input.dataSourceId);
      const page: MemoryPage = {
        id: input.id,
        dataSourceId: input.dataSourceId,
        properties: asStored(input.properties ?? {}),
        lastEditedTime: input.lastEditedTime ?? tick(),
        archived: input.archived ?? false,
        inTrash: input.inTrash ?? false,
        blocks: structuredClone(input.blocks ?? []),
      };
      pages.set(page.id, page);
      return structuredClone(page);
    },

    page(id) {
      const page = pages.get(id);
      return page ? structuredClone(page) : undefined;
    },

    failNext(op, status, failure) {
      failures.set(op, {
        status,
        retryAfterMs: failure?.retryAfterMs,
        message: failure?.message ?? `In-memory Notion ${op} → ${status}`,
      });
    },

    async resolveDataSourceId(databaseOrSourceId) {
      calls.push({ op: 'resolve', id: databaseOrSourceId });
      requireToken();
      return sourceOf(databaseOrSourceId);
    },

    async queryDataSource(databaseOrSourceId, opts: QueryOptions = {}) {
      calls.push({ op: 'query', id: databaseOrSourceId });
      requireToken();
      failRead('query');
      const dataSourceId = sourceOf(databaseOrSourceId);
      schemaOf(dataSourceId);
      if (opts.filter && opts.editedSinceIso) unsupported('a filter combined with editedSinceIso');
      const match = opts.filter ? compileFilter(opts.filter) : () => true;
      const after = opts.editedSinceIso ? Date.parse(opts.editedSinceIso) : null;
      if (after != null && !Number.isFinite(after)) unsupported(`editedSinceIso ${opts.editedSinceIso}`);
      const archivedPartition = Boolean(opts.archived);
      const rows = [...pages.values()].filter(
        (page) =>
          page.dataSourceId === dataSourceId &&
          (page.archived || page.inTrash) === archivedPartition &&
          (after == null || Date.parse(page.lastEditedTime) > after) &&
          match(page),
      );
      const list = paginate(rows, opts.cursor, Math.min(opts.pageSize ?? size, size));
      return { results: list.results.map(rawPage), nextCursor: list.nextCursor };
    },

    async getPage(pageId) {
      calls.push({ op: 'getPage', id: pageId });
      requireToken();
      failRead('getPage');
      const page = pages.get(pageId);
      if (!page) throw new NotionError('http', 404, `Could not find page with ID: ${pageId}`);
      return rawPage(page);
    },

    async listBlocks(pageId, cursor) {
      calls.push({ op: 'listBlocks', id: pageId });
      requireToken();
      failRead('listBlocks');
      const page = pages.get(pageId);
      if (!page) throw new NotionError('http', 404, `Could not find block with ID: ${pageId}`);
      const list = paginate(page.blocks, cursor, size);
      return { results: structuredClone(list.results), nextCursor: list.nextCursor };
    },

    async listPropertyNames(databaseOrSourceId) {
      calls.push({ op: 'listPropertyNames', id: databaseOrSourceId });
      requireToken();
      failRead('listPropertyNames');
      return [...schemaOf(sourceOf(databaseOrSourceId))];
    },

    async createPage(kind, body) {
      const refused = gate('create', kind);
      if (refused) return refused;
      const keys = Object.keys(body).sort().join(',');
      if (keys !== 'parent,properties') unsupported(`create body keys ${keys}`);
      const parent = body.parent as { type?: string; data_source_id?: string };
      if (parent?.type !== 'data_source_id' || typeof parent.data_source_id !== 'string') {
        unsupported(`create parent ${JSON.stringify(body.parent)}`);
      }
      const dataSourceId = parent.data_source_id;
      if (!options.dataSources[dataSourceId]) {
        return { ok: false, status: 404, error: `Could not find data source with ID: ${dataSourceId}` };
      }
      const properties = body.properties as Record<string, unknown>;
      const missing = unknownProperty(dataSourceId, properties);
      if (missing) return { ok: false, status: 400, error: `${missing} is not a property that exists.` };
      created += 1;
      const page: MemoryPage = {
        id: `memory-page-${created}`,
        dataSourceId,
        properties: asStored(properties),
        lastEditedTime: tick(),
        archived: false,
        inTrash: false,
        blocks: [],
      };
      pages.set(page.id, page);
      return wrote(page);
    },

    async patchProperties(kind, pageId, properties) {
      const refused = gate('patch', kind, pageId);
      if (refused) return refused;
      const page = writable(pageId);
      if (!('dataSourceId' in page)) return page;
      const missing = unknownProperty(page.dataSourceId, properties);
      if (missing) return { ok: false, status: 400, error: `${missing} is not a property that exists.` };
      Object.assign(page.properties, asStored(properties));
      page.lastEditedTime = tick();
      return wrote(page);
    },

    async archivePage(kind, pageId) {
      const refused = gate('archive', kind, pageId);
      if (refused) return refused;
      const page = writable(pageId);
      if (!('dataSourceId' in page)) return page;
      page.archived = true;
      page.lastEditedTime = tick();
      return wrote(page);
    },
  };
}
