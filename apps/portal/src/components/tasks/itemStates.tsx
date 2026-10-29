'use client';

import { useEffect, useId, useState, type ReactNode } from 'react';

/** Fixture preview only. A live session always stays on the real task list. */
export const FIXTURE_ITEM_SCREENS = ['empty', 'loading', 'error', 'long', 'save'] as const;

export type ItemScreen = (typeof FIXTURE_ITEM_SCREENS)[number] | 'ready';

export type ItemRegion = 'loading' | 'error' | 'empty' | 'filtered' | 'long' | 'board';

export type TaskListFilter = 'all' | 'awaiting' | 'unpublished';

/** Zero tasks and no filter. Clear filters stays off. */
export const ITEM_TRUE_EMPTY = {
  title: 'No tasks yet',
  body: 'Tasks synced from Notion will show here.',
} as const;

/** Filtered cell. Only when a real filter matches nothing. */
export const ITEM_FILTERED_EMPTY = {
  title: 'No tasks match these filters',
  body: 'Clear a filter to see more tasks.',
} as const;

export const ITEM_CLIENT_EMPTY = {
  title: 'Nothing shared yet',
  body: "Warehaus will publish tasks here when they're ready for you.",
} as const;

export const ITEM_LOAD_ERROR = {
  title: "We couldn't load your tasks",
  body: 'Try again in a moment.',
} as const;

export const ITEM_STALE = {
  title: 'Tasks are out of date',
  body: 'Showing the last tasks we could load.',
} as const;

export const ITEM_SAVE_TITLE = "Couldn't save to Notion";

export const NEW_TASK_HINT = 'Creating a task stays off until write-back is enabled.';

export const ITEM_STAFF_SUBTITLE = 'Synced from Notion · clients see published only';

export const ITEM_CLIENT_SUBTITLE = 'Shared with you by the Warehaus team.';

export const ITEM_LONG_NAME =
  'Quarterly seasonal menu photography, packaging and in-store signage rollout for all twelve Northwind Foods locations';

export const ITEM_LONG_STAFF = {
  meta: 'Northwind Foods · Spring menu launch · Due Oct 6',
  stage: 'Planning',
  status: 'In progress',
  published: true,
} as const;

export const ITEM_LONG_CLIENT = {
  meta: 'Spring menu launch · Due Oct 6',
  stage: 'Being scoped',
  status: 'In progress',
  published: false,
} as const;

/**
 * Next retry time is not on the client. `getSyncHealth` returns oldestCreatedAt,
 * not nextAttemptAt, and reading the outbox clock would be a Convex change.
 * Pass a timestamp only when one is already in hand. Otherwise the clock is omitted.
 */
export function stageQueueBody(retryAt: number | null): string {
  if (retryAt == null || !Number.isFinite(retryAt)) {
    return 'The stage change is queued and will retry.';
  }
  const time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(retryAt));
  return `The stage change is queued and will retry at ${time}.`;
}

export function readItemScreen(value: string | null, fixtures: boolean): ItemScreen {
  if (!fixtures || !value) return 'ready';
  return (FIXTURE_ITEM_SCREENS as readonly string[]).includes(value) ? (value as ItemScreen) : 'ready';
}

export function readTaskFilter(value: string | null): TaskListFilter {
  if (value === 'awaiting' || value === 'unpublished') return value;
  return 'all';
}

export function taskMatchesListFilter(
  task: { stage?: string | null; publishToWarehaus?: boolean | null },
  filter: TaskListFilter,
  staff: boolean,
): boolean {
  if (filter === 'awaiting') return /awaiting\s*go/i.test(task.stage ?? '');
  if (filter === 'unpublished') return staff && task.publishToWarehaus === false;
  return true;
}

export function useItemScreen(fixtures: boolean): [ItemScreen, (screen: ItemScreen) => void] {
  const [screen, setScreen] = useState<ItemScreen>('ready');
  useEffect(() => {
    if (!fixtures) return;
    const params = new URLSearchParams(window.location.search);
    setScreen(readItemScreen(params.get('items'), true));
  }, [fixtures]);
  return [screen, setScreen];
}

export function useTaskListFilter(fixtures: boolean): [TaskListFilter, (filter: TaskListFilter) => void] {
  const [filter, setFilter] = useState<TaskListFilter>('all');
  useEffect(() => {
    if (!fixtures) return;
    const params = new URLSearchParams(window.location.search);
    setFilter(readTaskFilter(params.get('taskFilter')));
  }, [fixtures]);
  return [filter, setFilter];
}

/**
 * Fixture `?items` wins. A live session ignores that screen.
 * Staff and clients share the no-data error. A failed load that still has
 * rows keeps the list and raises `stale`. Filtered empty is a real filter
 * that matched nothing, never the unfiltered zero-task case.
 */
/** Chips stay up for the list and for a filter that matched nothing. */
export function showTaskListFilters(region: ItemRegion): boolean {
  return region === 'board' || region === 'filtered';
}

/** Empty and error are their own boxes. Loading, the list, and the long row use the card. */
export function itemListUsesCard(region: ItemRegion): boolean {
  return region === 'board' || region === 'loading' || region === 'long';
}

export function resolveItemRegion(input: {
  fixtures: boolean;
  screen: ItemScreen;
  staff: boolean;
  loading: boolean;
  error: boolean;
  count: number;
  matched: number;
  filterActive: boolean;
}): { region: ItemRegion; stale: boolean; save: boolean } {
  if (input.fixtures && input.screen === 'save') {
    return { region: 'board', stale: false, save: input.staff };
  }
  if (input.fixtures && input.screen !== 'ready' && input.screen !== 'save') {
    return { region: input.screen, stale: false, save: false };
  }
  if (input.loading && input.count === 0) return { region: 'loading', stale: false, save: false };
  if (input.error && input.count === 0) return { region: 'error', stale: false, save: false };
  if (input.count === 0) return { region: 'empty', stale: false, save: false };
  if (input.filterActive && input.matched === 0) return { region: 'filtered', stale: false, save: false };
  return { region: 'board', stale: input.error, save: false };
}

const ITEM_STATE_CSS = `.item-state-btn:focus-visible { outline: 2px solid var(--fg); outline-offset: 3px; }
.tasks-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.new-task { display: inline-flex; flex-direction: column; align-items: flex-start; gap: 6px; max-width: 280px; }
.new-task-hint { font-size: 12px; line-height: 16px; color: var(--muted); }
@media (min-width: 1440px) {
  .tasks-actions { display: grid; grid-template-columns: auto auto; justify-content: end; justify-items: end; column-gap: 8px; row-gap: 6px; }
  .tasks-view { grid-column: 1; grid-row: 1; }
  .new-task { display: contents; max-width: none; }
  .new-task-control { grid-column: 2; grid-row: 1; }
  .new-task-hint { grid-column: 1 / -1; grid-row: 2; justify-self: end; white-space: nowrap; text-align: right; max-width: none; }
}`;

const ITEM_CARD_STYLE = {
  border: '1px solid var(--border)',
  borderRadius: 18,
  background: 'var(--surface)',
  padding: 16,
} as const;

/** Card for loading, the loaded list, and the long row. Empty and error are the box themselves. */
export function ItemListCard(props: { children?: ReactNode }) {
  const { children } = props;
  return (
    <div data-testid="item-list-card" className="min-w-0" style={ITEM_CARD_STYLE}>
      <style>{ITEM_STATE_CSS}</style>
      {children}
    </div>
  );
}

export function ItemState({
  screen,
  staff,
  onClear,
  onRetry,
}: {
  screen: Exclude<ItemRegion, 'board'>;
  staff: boolean;
  onClear?: () => void;
  onRetry?: () => void;
}) {
  if (screen === 'loading') return <ItemSkeleton />;
  if (screen === 'error') return <ItemLoadError onRetry={onRetry} />;
  if (screen === 'long') return <ItemLongRow staff={staff} />;
  return <ItemEmpty staff={staff} filtered={screen === 'filtered'} onClear={onClear} />;
}

export function ItemStaleBanner({ onRetry }: { onRetry?: () => void }) {
  return (
    <ItemDangerCard testId="item-stale" title={ITEM_STALE.title} body={ITEM_STALE.body} actionLabel="Try again" actionTestId="item-try-again" onAction={onRetry} />
  );
}

export function ItemSaveBanner({
  retryAt,
  onRetry,
  busy = false,
  error = null,
}: {
  retryAt: number | null;
  onRetry?: () => void;
  busy?: boolean;
  error?: string | null;
}) {
  return (
    <ItemDangerCard
      testId="item-save-banner"
      title={ITEM_SAVE_TITLE}
      body={stageQueueBody(retryAt)}
      actionLabel="Retry now"
      actionTestId="item-retry-now"
      onAction={onRetry}
      busy={busy}
      error={error}
    />
  );
}

function ItemEmpty({
  staff,
  filtered,
  onClear,
}: {
  staff: boolean;
  filtered: boolean;
  onClear?: () => void;
}) {
  const copy = !staff ? ITEM_CLIENT_EMPTY : filtered ? ITEM_FILTERED_EMPTY : ITEM_TRUE_EMPTY;
  return (
    <div
      data-testid="item-empty"
      className="flex flex-col items-center text-center"
      style={{
        gap: 12,
        border: '1px dashed var(--border)',
        borderRadius: 18,
        background: 'var(--bg-2, var(--bg))',
        padding: '48px 24px',
      }}
    >
      <ItemEmptyIcon />
      <p style={{ margin: 0, fontSize: 16, fontWeight: 500, lineHeight: '19px' }}>{copy.title}</p>
      <p
        style={{
          margin: 0,
          maxWidth: 384,
          fontSize: 13,
          lineHeight: '19px',
          color: 'var(--muted)',
          textWrap: 'balance',
        }}
      >
        {copy.body}
      </p>
      {staff && filtered ? (
        <ItemOutlineButton testId="item-clear-filters" onClick={onClear}>
          Clear filters
        </ItemOutlineButton>
      ) : null}
    </div>
  );
}

function ItemLoadError({ onRetry }: { onRetry?: () => void }) {
  return (
    <ItemDangerCard
      testId="item-error"
      title={ITEM_LOAD_ERROR.title}
      body={ITEM_LOAD_ERROR.body}
      actionLabel="Try again"
      actionTestId="item-try-again"
      onAction={onRetry}
    />
  );
}

function ItemDangerCard({
  testId,
  title,
  body,
  actionLabel,
  actionTestId,
  onAction,
  busy = false,
  error = null,
}: {
  testId: string;
  title: string;
  body: string;
  actionLabel: string;
  actionTestId: string;
  onAction?: () => void;
  busy?: boolean;
  error?: string | null;
}) {
  return (
    <div
      role="alert"
      data-testid={testId}
      aria-busy={busy || undefined}
      className="flex items-start"
      style={{
        gap: 12,
        border: '1px solid var(--danger)',
        borderRadius: 18,
        background: 'var(--surface)',
        padding: '16px 24px',
      }}
    >
      <span
        aria-hidden
        className="inline-flex shrink-0 items-center justify-center"
        style={{
          width: 20,
          height: 20,
          borderRadius: 999,
          border: '1.25px solid var(--danger)',
          color: 'var(--danger)',
          fontSize: 11,
          fontWeight: 600,
        }}
      >
        !
      </span>
      <span className="flex min-w-0 flex-1 flex-col items-start" style={{ gap: 4 }}>
        <p style={{ margin: 0, color: 'var(--danger)', fontWeight: 600, fontSize: 14, lineHeight: '20px' }}>{title}</p>
        <p style={{ margin: 0, color: 'var(--muted)', fontSize: 13, lineHeight: '19px' }}>{body}</p>
        {error ? (
          <p data-testid="item-save-error" style={{ margin: 0, color: 'var(--danger)', fontSize: 13, lineHeight: '19px' }}>{error}</p>
        ) : null}
        <span style={{ marginTop: 8 }}>
          <ItemOutlineButton testId={actionTestId} onClick={onAction} disabled={busy}>
            {actionLabel}
          </ItemOutlineButton>
        </span>
      </span>
    </div>
  );
}

function ItemSkeleton() {
  return (
    <div role="status" data-testid="item-loading" className="flex flex-col" style={{ gap: 24 }}>
      <span className="sr-only">Loading tasks</span>
      {[0, 1, 2].map((row) => (
        <div key={row} data-testid="item-skeleton-row" className="flex items-center" style={{ gap: 16, minHeight: 36 }}>
          <span className="animate-pulse shrink-0" style={{ width: 36, height: 36, borderRadius: 18, background: 'var(--surface-2, var(--bg))' }} />
          <span className="flex min-w-0 flex-1 flex-col" style={{ gap: 8 }}>
            <span className="animate-pulse" style={{ height: 12, width: '70%', maxWidth: 302, borderRadius: 6, background: 'var(--surface-2, var(--bg))' }} />
            <span className="animate-pulse" style={{ height: 10, width: 160, maxWidth: '40%', borderRadius: 6, background: 'var(--surface-2, var(--bg))' }} />
          </span>
          <span className="animate-pulse shrink-0" style={{ width: 64, height: 22, borderRadius: 999, background: 'var(--surface-2, var(--bg))' }} />
        </div>
      ))}
    </div>
  );
}

export function ItemLongRow({ staff }: { staff: boolean }) {
  const row = staff ? ITEM_LONG_STAFF : ITEM_LONG_CLIENT;
  return (
    <div
      data-testid="item-long-row"
      className="flex flex-col"
      style={{ gap: 8, padding: '8px 0' }}
    >
      <div className="flex items-start" style={{ gap: 12 }}>
        <span className="min-w-0 flex-1">
          <span data-testid="item-long-title" className="block" style={{ fontSize: 16, fontWeight: 500, overflowWrap: 'anywhere' }}>
            {ITEM_LONG_NAME}
          </span>
          <span className="ds-mono block" data-testid="item-long-meta" style={{ marginTop: 4, fontSize: 12, lineHeight: '18px', color: 'var(--muted)' }}>
            {row.meta}
          </span>
        </span>
        <ItemChevronIcon />
      </div>
      <div className="flex flex-wrap items-center" style={{ gap: 8 }}>
        <span
          data-testid="item-stage"
          className="ds-mono inline-flex items-center"
          style={{
            gap: 8,
            border: '1px solid var(--border-2, var(--border))',
            borderRadius: 999,
            padding: '4px 12px',
            fontSize: 11,
            letterSpacing: '0.44px',
            color: 'var(--fg)',
          }}
        >
          <ItemStageIcon />
          {row.stage}
        </span>
        {row.published ? (
          <span data-testid="item-pill-group" className="inline-flex items-center" style={{ gap: 8, flexWrap: 'nowrap' }}>
            <ItemStatusPill status={row.status} />
            <span data-testid="item-published" className="ds-mono inline-flex items-center" style={{ gap: 8, padding: '4px 8px', fontSize: 11, letterSpacing: '0.44px' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt="" src="/icons/activity-published-dot.svg" width={8} height={8} />
              Published
            </span>
          </span>
        ) : (
          <ItemStatusPill status={row.status} />
        )}
      </div>
    </div>
  );
}

export function TasksActionStyle() {
  return <style>{ITEM_STATE_CSS}</style>;
}

/** Header New task. createTask only enqueues a Notion write, and write-back is off. */
export function NewTaskButton() {
  const hintId = useId();
  return (
    <span className="new-task">
      <style>{ITEM_STATE_CSS}</style>
      <span
        tabIndex={0}
        aria-disabled="true"
        aria-describedby={hintId}
        title={NEW_TASK_HINT}
        data-testid="new-task-hint"
        className="new-task-control item-state-btn inline-flex"
        style={{ cursor: 'not-allowed' }}
      >
        <button
          type="button"
          disabled
          aria-disabled="true"
          tabIndex={-1}
          data-testid="new-task"
          style={{
            pointerEvents: 'none',
            background: 'transparent',
            color: 'var(--fg)',
            border: '1px solid var(--border-2, var(--border))',
            borderRadius: 9,
            fontFamily: 'var(--font-body)',
            fontSize: 14,
            fontWeight: 500,
            padding: '12px 16px',
            cursor: 'not-allowed',
            opacity: 0.4,
          }}
        >
          New task
        </button>
      </span>
      <span id={hintId} data-testid="new-task-hint-text" className="new-task-hint">
        {NEW_TASK_HINT}
      </span>
    </span>
  );
}

function ItemStatusPill({ status }: { status: string }) {
  return (
    <span
      data-testid="item-status"
      className="ds-mono inline-flex items-center"
      style={{
        borderRadius: 999,
        padding: '4px 12px',
        fontSize: 11,
        letterSpacing: '0.44px',
        background: 'var(--accent-tint, rgba(252, 252, 252, 0.12))',
        color: 'var(--accent, var(--fg))',
      }}
    >
      {status}
    </span>
  );
}

function ItemOutlineButton({
  testId,
  onClick,
  disabled = false,
  children,
}: {
  testId: string;
  onClick?: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      aria-disabled={disabled || undefined}
      className="item-state-btn inline-flex items-center justify-center"
      style={{
        background: 'transparent',
        color: 'var(--fg)',
        border: '1px solid var(--border-2, var(--border))',
        borderRadius: 9,
        fontFamily: 'var(--font-body)',
        fontSize: 14,
        fontWeight: 500,
        padding: '12px 16px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        pointerEvents: disabled ? 'none' : undefined,
      }}
    >
      {children}
    </button>
  );
}

function ItemEmptyIcon() {
  return (
    <span aria-hidden style={{ color: 'var(--muted)', display: 'inline-flex' }}>
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M5.5 4.5H13.5M5.5 8H13.5M5.5 11.5H13.5M2.5 4.5H3M2.5 8H3M2.5 11.5H3" stroke="currentColor" strokeWidth="1.33" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function ItemChevronIcon() {
  return (
    <span aria-hidden className="shrink-0" data-testid="item-chev" style={{ color: 'var(--muted)', display: 'inline-flex' }}>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M6 3L11 8L6 13" stroke="currentColor" strokeWidth="1.33" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function ItemStageIcon() {
  return (
    <span aria-hidden data-testid="item-stage-icon" style={{ color: 'var(--fg)', display: 'inline-flex' }}>
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M11.25 6C11.25 8.89949 8.89949 11.25 6 11.25C3.10051 11.25 0.75 8.89949 0.75 6C0.75 3.10051 3.10051 0.75 6 0.75C8.89949 0.75 11.25 3.10051 11.25 6Z" stroke="currentColor" strokeWidth="1.5" />
        <path d="M6 2C6.52529 2 7.04543 2.10346 7.53073 2.30448C8.01604 2.5055 8.45699 2.80014 8.82843 3.17157C9.19986 3.54301 9.4945 3.98396 9.69552 4.46927C9.89654 4.95457 10 5.47471 10 6H6L6 2Z" fill="currentColor" />
      </svg>
    </span>
  );
}
