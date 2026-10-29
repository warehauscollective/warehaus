'use client';

import { useEffect, useState, type ReactNode } from 'react';

/** Fixture preview only. A live session always stays on the real task list. */
export const FIXTURE_ITEM_SCREENS = ['empty', 'loading', 'error', 'long'] as const;

export type ItemScreen = (typeof FIXTURE_ITEM_SCREENS)[number] | 'ready';

export const ITEM_STAFF_EMPTY = {
  title: 'No items match these filters',
  body: 'Clear a filter, or create a new item.',
} as const;

export const ITEM_CLIENT_EMPTY = {
  title: 'Nothing shared yet',
  body: 'Warehaus will publish items here when they are ready for you.',
} as const;

export const ITEM_STAFF_ERROR = {
  title: 'Could not save to Notion',
  body: 'The Stage change is queued (Source: portal). It will retry at 14:05.',
} as const;

export const ITEM_CLIENT_ERROR = {
  title: 'We could not load your items',
  body: 'Try again in a moment.',
} as const;

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

const ITEM_RETRY_NOTE = 'Nothing was sent.';

export function readItemScreen(value: string | null, fixtures: boolean): ItemScreen {
  if (!fixtures || !value) return 'ready';
  return (FIXTURE_ITEM_SCREENS as readonly string[]).includes(value) ? (value as ItemScreen) : 'ready';
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

/** Fixture `?items` wins. A live session ignores that screen and follows the task list. */
export function resolveItemRegion(input: {
  fixtures: boolean;
  screen: ItemScreen;
  staff: boolean;
  loading: boolean;
  error: boolean;
  count: number;
}): Exclude<ItemScreen, 'ready'> | 'board' {
  if (input.fixtures && input.screen !== 'ready') return input.screen;
  if (input.loading && input.count === 0) return 'loading';
  if (!input.staff && input.error && input.count === 0) return 'error';
  if (input.count === 0 && !input.error) return 'empty';
  return 'board';
}

const ITEM_STATE_CSS = `.item-state-btn:focus-visible { outline: 2px solid var(--fg); outline-offset: 3px; }`;

export function ItemState({
  screen,
  staff,
  onClear,
}: {
  screen: Exclude<ItemScreen, 'ready'>;
  staff: boolean;
  onClear?: () => void;
}) {
  const body =
    screen === 'loading' ? (
      <ItemSkeleton />
    ) : screen === 'error' ? (
      <ItemError staff={staff} />
    ) : screen === 'long' ? (
      <ItemLongRow staff={staff} />
    ) : (
      <ItemEmpty staff={staff} onClear={onClear} />
    );
  return (
    <>
      <style>{ITEM_STATE_CSS}</style>
      {body}
    </>
  );
}

function ItemEmpty({ staff, onClear }: { staff: boolean; onClear?: () => void }) {
  const copy = staff ? ITEM_STAFF_EMPTY : ITEM_CLIENT_EMPTY;
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
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img alt="" src="/icons/item-empty.svg" width={28} height={28} />
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
      {staff ? (
        <ItemOutlineButton testId="item-clear-filters" onClick={onClear}>
          Clear filters
        </ItemOutlineButton>
      ) : null}
    </div>
  );
}

function ItemError({ staff }: { staff: boolean }) {
  const copy = staff ? ITEM_STAFF_ERROR : ITEM_CLIENT_ERROR;
  const [note, setNote] = useState<string | null>(null);
  return (
    <div data-testid="item-error" className="flex flex-col items-start" style={{ gap: 24 }}>
      <div
        className="flex w-full items-start"
        style={{
          gap: 12,
          border: '1px solid var(--danger)',
          borderRadius: 18,
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
        <span className="min-w-0">
          <p style={{ margin: 0, color: 'var(--danger)', fontWeight: 600, fontSize: 14, lineHeight: '20px' }}>{copy.title}</p>
          <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: 13, lineHeight: '19px' }}>{copy.body}</p>
        </span>
      </div>
      {staff ? (
        <div className="flex flex-col items-start" style={{ gap: 8 }}>
          <ItemOutlineButton testId="item-retry-now" onClick={() => setNote(ITEM_RETRY_NOTE)}>
            Retry now
          </ItemOutlineButton>
          {note ? (
            <p data-testid="item-retry-note" style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
              {note}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ItemSkeleton() {
  return (
    <div role="status" data-testid="item-loading" className="flex flex-col" style={{ gap: 24 }}>
      <span className="sr-only">Loading items</span>
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
      style={{ gap: 8, borderBottom: '1px solid var(--border)', padding: '24px 0' }}
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
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt="" src="/icons/item-chev.svg" width={16} height={16} className="shrink-0" />
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
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt="" src="/icons/item-stage.svg" width={12} height={12} />
          {row.stage}
        </span>
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
          {row.status}
        </span>
        {row.published ? (
          <span data-testid="item-published" className="ds-mono inline-flex items-center" style={{ gap: 8, padding: '4px 8px', fontSize: 11, letterSpacing: '0.44px' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt="" src="/icons/activity-published-dot.svg" width={8} height={8} />
            Published
          </span>
        ) : null}
      </div>
    </div>
  );
}

function ItemOutlineButton({
  testId,
  onClick,
  children,
}: {
  testId: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
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
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}
