/**
 * Incremental Notion pull cursor.
 *
 * The watermark is the syncMeta `lastSyncedAt` used as `last_edited_time`
 * `after` (minus overlap). It may move forward only through pages that were
 * actually processed. A failed page holds the cursor at that edit and is
 * recorded so the next run retries it after backoff.
 */

export const INCREMENTAL_OVERLAP_MS = 2 * 60 * 1000;

const PAGE_RETRY_BASE_MS = 60 * 1000;
const PAGE_RETRY_MAX_MS = 6 * 60 * 60 * 1000;
const MAX_STORED_RETRIES = 200;

/**
 * A page that still fails on this attempt is quarantined and released so the
 * cursor can move. Early waits are 1, 2, 4… minutes (cap 6h), so eight
 * attempts is a few hours, not days.
 */
export const MAX_PAGE_ATTEMPTS = 8;

export type PageProcessOutcome = {
  id: string;
  editedAtMs: number | null;
  ok: boolean;
};

export type FailedPageRetry = {
  id: string;
  database: string;
  editedAtMs: number | null;
  attempts: number;
  nextRetryAt: number;
  error: string;
};

export type SyncPage = {
  id: string;
  database: string;
  editedAtMs: number;
  body: string;
};

/** Page already given up on, until Notion edits it again. */
export type ReleasedPage = {
  id: string;
  editedAtMs: number | null;
};

export function pageEditedAtMs(lastEdited: string | null | undefined): number | null {
  if (!lastEdited) return null;
  const ms = Date.parse(lastEdited);
  return Number.isFinite(ms) ? ms : null;
}

export function pageRetryBackoffMs(attempts: number): number {
  const n = Math.max(1, attempts);
  const ms = PAGE_RETRY_BASE_MS * 2 ** (n - 1);
  return Math.min(PAGE_RETRY_MAX_MS, ms);
}

export function shouldDeferPageRetry(page: FailedPageRetry, nowMs: number): boolean {
  return page.nextRetryAt > nowMs;
}

export function isExhaustedRetry(retry: FailedPageRetry): boolean {
  return retry.attempts >= MAX_PAGE_ATTEMPTS;
}

/** Same edit that was already quarantined. A newer last_edited_time is retried. */
export function shouldSkipReleased(
  page: { id: string; editedAtMs: number | null },
  released: ReleasedPage[],
): boolean {
  const prior = released.find((row) => row.id === page.id);
  if (!prior) return false;
  if (prior.editedAtMs == null || page.editedAtMs == null) return true;
  return page.editedAtMs <= prior.editedAtMs;
}

export function mergeReleasedPages(
  prior: ReleasedPage[],
  quarantined: FailedPageRetry[],
  seenPages: Array<{ id: string; editedAtMs: number | null }>,
): ReleasedPage[] {
  const seenAt = new Map(seenPages.map((page) => [page.id, page.editedAtMs]));
  const kept = prior.filter((row) => {
    if (!seenAt.has(row.id)) return true;
    const editedAtMs = seenAt.get(row.id) ?? null;
    if (row.editedAtMs == null || editedAtMs == null) return true;
    return editedAtMs <= row.editedAtMs;
  });
  const byId = new Map(kept.map((row) => [row.id, row]));
  for (const row of quarantined) {
    byId.set(row.id, { id: row.id, editedAtMs: row.editedAtMs });
  }
  return [...byId.values()].slice(0, MAX_STORED_RETRIES);
}

export function recordPageFailure(
  prior: FailedPageRetry | undefined,
  input: {
    id: string;
    database: string;
    editedAtMs: number | null;
    error: string;
    nowMs: number;
  },
): FailedPageRetry {
  const attempts = (prior?.attempts ?? 0) + 1;
  return {
    id: input.id,
    database: input.database,
    editedAtMs: input.editedAtMs ?? prior?.editedAtMs ?? null,
    attempts,
    nextRetryAt: input.nowMs + pageRetryBackoffMs(attempts),
    error: input.error.slice(0, 500),
  };
}

/**
 * Watermark to persist after a pull.
 * `null` means "do not write lastSyncedAt" (keep the previous cursor, or stay
 * on a full scan when there has never been one).
 * A failed page pins the cursor 1ms before its edit so the next incremental
 * query still includes it, even without overlap.
 */
export function decidePullWatermark(input: {
  previousWatermarkMs: number | null;
  nowMs: number;
  outcomes: PageProcessOutcome[];
  outstanding?: Array<{ editedAtMs: number | null }>;
  fatal?: boolean;
}): number | null {
  if (input.fatal) return input.previousWatermarkMs;

  const failed = [
    ...input.outcomes.filter((outcome) => !outcome.ok),
    ...(input.outstanding ?? []),
  ];
  if (failed.length === 0) return input.nowMs;

  const times = failed
    .map((outcome) => outcome.editedAtMs)
    .filter((time): time is number => time != null && Number.isFinite(time));
  if (times.length === 0) return input.previousWatermarkMs;
  return Math.max(0, Math.min(...times) - 1);
}

export function selectPagesForPull(input: {
  pages: SyncPage[];
  lastSyncedAtMs: number | null;
  overlapMs?: number;
  forceFull?: boolean;
}): SyncPage[] {
  if (input.forceFull || input.lastSyncedAtMs == null) return [...input.pages];
  const since = input.lastSyncedAtMs - (input.overlapMs ?? INCREMENTAL_OVERLAP_MS);
  return input.pages.filter((page) => page.editedAtMs > since);
}

export function unseenPageRetries(
  prior: FailedPageRetry[],
  seenIds: ReadonlySet<string>,
): FailedPageRetry[] {
  return prior.filter((retry) => !seenIds.has(retry.id));
}

/** Keep unseen failures, and back off ones that were due but still missing. */
export function refreshUnseenRetries(
  prior: FailedPageRetry[],
  seenIds: ReadonlySet<string>,
  nowMs: number,
): FailedPageRetry[] {
  return unseenPageRetries(prior, seenIds).map((retry) => {
    if (shouldDeferPageRetry(retry, nowMs)) return retry;
    return recordPageFailure(retry, {
      id: retry.id,
      database: retry.database,
      editedAtMs: retry.editedAtMs,
      error: retry.error || 'not returned by Notion',
      nowMs,
    });
  });
}

export function dueRetryIds(input: {
  prior: FailedPageRetry[];
  database: string;
  alreadyPresent: ReadonlySet<string>;
  nowMs: number;
}): string[] {
  return input.prior
    .filter(
      (retry) =>
        retry.database === input.database &&
        retry.nextRetryAt <= input.nowMs &&
        !input.alreadyPresent.has(retry.id),
    )
    .map((retry) => retry.id);
}

export function capStoredRetries(retries: FailedPageRetry[]): FailedPageRetry[] {
  return retries.slice(0, MAX_STORED_RETRIES);
}

function parseRetryRow(row: unknown): FailedPageRetry | null {
  if (!row || typeof row !== 'object') return null;
  const record = row as Record<string, unknown>;
  if (typeof record.id !== 'string' || typeof record.database !== 'string') return null;
  if (typeof record.attempts !== 'number' || typeof record.nextRetryAt !== 'number') return null;
  return {
    id: record.id,
    database: record.database,
    editedAtMs: typeof record.editedAtMs === 'number' ? record.editedAtMs : null,
    attempts: record.attempts,
    nextRetryAt: record.nextRetryAt,
    error: typeof record.error === 'string' ? record.error : 'failed',
  };
}

function parseReleasedRow(row: unknown): ReleasedPage | null {
  if (!row || typeof row !== 'object') return null;
  const record = row as Record<string, unknown>;
  if (typeof record.id !== 'string') return null;
  return {
    id: record.id,
    editedAtMs: typeof record.editedAtMs === 'number' ? record.editedAtMs : null,
  };
}

export function parsePullRetries(details: string | null | undefined): FailedPageRetry[] {
  return parsePullCursorState(details).retries;
}

export function parsePullCursorState(details: string | null | undefined): {
  retries: FailedPageRetry[];
  released: ReleasedPage[];
} {
  if (!details) return { retries: [], released: [] };
  try {
    const parsed = JSON.parse(details) as unknown;
    if (!parsed || typeof parsed !== 'object') return { retries: [], released: [] };
    const bag = parsed as { retries?: unknown; released?: unknown };
    const retries = Array.isArray(bag.retries)
      ? bag.retries.flatMap((row) => {
          const parsedRow = parseRetryRow(row);
          return parsedRow ? [parsedRow] : [];
        })
      : [];
    const released = Array.isArray(bag.released)
      ? bag.released.flatMap((row) => {
          const parsedRow = parseReleasedRow(row);
          return parsedRow ? [parsedRow] : [];
        })
      : [];
    return { retries, released };
  } catch {
    return { retries: [], released: [] };
  }
}

/**
 * Reference pull used by tests. Production `pullAll` follows the same cursor
 * rules: defer during backoff, record failures, hold the watermark, then apply
 * the edit once a later run succeeds.
 */
export function applyPullPass(input: {
  source: SyncPage[];
  stored: Map<string, SyncPage>;
  lastSyncedAtMs: number | null;
  nowMs: number;
  failIds: ReadonlySet<string>;
  priorRetries?: FailedPageRetry[];
  priorReleased?: ReleasedPage[];
}): {
  lastSyncedAtMs: number | null;
  retries: FailedPageRetry[];
  quarantined: FailedPageRetry[];
  released: ReleasedPage[];
  appliedIds: string[];
} {
  const priorRetries = input.priorRetries ?? [];
  const priorReleased = input.priorReleased ?? [];
  const priorById = new Map(priorRetries.map((retry) => [retry.id, retry]));
  const selected = selectPagesForPull({
    pages: input.source,
    lastSyncedAtMs: input.lastSyncedAtMs,
  });
  const selectedIds = new Set(selected.map((page) => page.id));
  for (const retry of priorRetries) {
    if (retry.nextRetryAt > input.nowMs || selectedIds.has(retry.id)) continue;
    const page = input.source.find((candidate) => candidate.id === retry.id);
    if (!page) continue;
    selected.push(page);
    selectedIds.add(page.id);
  }

  const outcomes: PageProcessOutcome[] = [];
  const nextRetries: FailedPageRetry[] = [];
  const seen = new Set<string>();
  const appliedIds: string[] = [];

  for (const page of selected) {
    seen.add(page.id);
    const prior = priorById.get(page.id);
    const attempt = {
      id: page.id,
      database: page.database,
      editedAtMs: page.editedAtMs,
    };
    if (shouldSkipReleased(attempt, priorReleased)) {
      outcomes.push({ id: page.id, editedAtMs: page.editedAtMs, ok: true });
      continue;
    }
    if (prior && shouldDeferPageRetry(prior, input.nowMs)) {
      outcomes.push({ id: page.id, editedAtMs: page.editedAtMs, ok: false });
      nextRetries.push(prior);
      continue;
    }
    if (input.failIds.has(page.id)) {
      outcomes.push({ id: page.id, editedAtMs: page.editedAtMs, ok: false });
      nextRetries.push(
        recordPageFailure(prior, {
          ...attempt,
          error: 'failed',
          nowMs: input.nowMs,
        }),
      );
      continue;
    }
    input.stored.set(page.id, page);
    appliedIds.push(page.id);
    outcomes.push({ id: page.id, editedAtMs: page.editedAtMs, ok: true });
  }

  const outstanding = refreshUnseenRetries(priorRetries, seen, input.nowMs);
  const combined = [...nextRetries, ...outstanding];
  const quarantined = combined.filter(isExhaustedRetry);
  const exhaustedIds = new Set(quarantined.map((retry) => retry.id));
  const lastSyncedAtMs = decidePullWatermark({
    previousWatermarkMs: input.lastSyncedAtMs,
    nowMs: input.nowMs,
    outcomes: outcomes.map((outcome) =>
      exhaustedIds.has(outcome.id) ? { ...outcome, ok: true } : outcome,
    ),
    outstanding: outstanding.filter((retry) => !exhaustedIds.has(retry.id)),
  });
  const seenPages = selected.map((page) => ({
    id: page.id,
    editedAtMs: page.editedAtMs,
  }));

  return {
    lastSyncedAtMs,
    retries: capStoredRetries(combined.filter((retry) => !exhaustedIds.has(retry.id))),
    quarantined,
    released: mergeReleasedPages(priorReleased, quarantined, seenPages),
    appliedIds,
  };
}
