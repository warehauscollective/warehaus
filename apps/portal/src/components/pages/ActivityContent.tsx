'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityFeedRow } from '@/components/activity/ActivityFeedRow';
import { sectionEdgeFadePx } from '@/components/layout/sectionEdgeFade';
import { TaskGlyph } from '@/components/tasks/TaskGlyph';
import { PortalTilePane, PortalWorkspace } from '@/components/layout/PortalWorkspace';
import { useFixturePreview } from '@/components/providers/FixturePreviewProvider';
import { usePortalView } from '@/components/providers/PortalViewProvider';
import { useActivityFeed } from '@/hooks/useActivityFeed';
import { tenantEyebrow, usePortalData } from '@/hooks/usePortalData';
import {
  CLIENT_ACTIVITY_ERROR,
  STAFF_ACTIVITY_ERROR,
  activityEmptyCopy,
  buildActivityView,
  withActivityLongPreview,
  type ActivityFilter,
} from '@/lib/data/activity';
import { FIXTURE_CLIENT_ACTIVITY_PAGE, FIXTURE_STAFF_ACTIVITY_PAGE } from '@/lib/data/fixtures';
import { PORTAL_SURFACE_RADIUS } from '@/lib/design/portal-chrome';
import { useMaxWidth } from '@/lib/design/useMaxWidth';

type ActivityPreview = 'empty' | 'loading' | 'error' | 'long' | null;

function useActivityPreview(fixtures: boolean): ActivityPreview {
  const [preview, setPreview] = useState<ActivityPreview>(null);
  useEffect(() => {
    if (!fixtures) return;
    const value = new URLSearchParams(window.location.search).get('activity');
    if (value === 'empty' || value === 'loading' || value === 'error' || value === 'long') {
      setPreview(value);
    }
  }, [fixtures]);
  return preview;
}

function filterForSection(section: string, staff: boolean): ActivityFilter {
  if (section === 'tasks') return 'tasks';
  if (section === 'sync' && staff) return 'sync';
  if (section === 'resources' && !staff) return 'resources';
  return 'all';
}

export function ActivityContent() {
  const { sectionFor, setSectionFor, openDetail } = usePortalView();
  const { data } = usePortalData();
  const fixtures = useFixturePreview();
  const feed = useActivityFeed();
  const preview = useActivityPreview(fixtures);
  const staff = data.tenant.mode === 'team';
  const narrow = useMaxWidth(480);
  const section = sectionFor('activity');
  const [filter, setFilter] = useState<ActivityFilter>('all');
  const [retryNote, setRetryNote] = useState<string | null>(null);

  useEffect(() => {
    setFilter(filterForSection(section, staff));
  }, [section, staff]);

  const source = fixtures
    ? staff
      ? FIXTURE_STAFF_ACTIVITY_PAGE
      : FIXTURE_CLIENT_ACTIVITY_PAGE
    : feed.items;
  const failed = preview === 'error' || (!fixtures && Boolean(feed.error));
  const busy = preview === 'loading' || (!fixtures && feed.loading && !failed);
  const model = useMemo(
    () =>
      buildActivityView({
        audience: staff ? 'staff' : 'client',
        items: preview === 'empty' || failed || busy ? [] : source,
        filter,
        now: Date.now(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        clientName: data.tenant.clientName,
      }),
    [staff, preview, failed, busy, source, filter, data.tenant.clientName],
  );
  const shown = preview === 'long' ? withActivityLongPreview(model, filter) : model;
  const groups = shown.groups;
  const empty = activityEmptyCopy(staff ? 'staff' : 'client');
  const eyebrow = staff
    ? tenantEyebrow(data.tenant, 'Activity')
    : `● ${data.tenant.clientName ?? 'Portal'} · Activity`;

  return (
    <PortalWorkspace eyebrow={eyebrow} title="Activity">
      <PortalTilePane>
        <section
            data-testid="activity-feed"
            data-audience={staff ? 'staff' : 'client'}
            data-state={preview ?? (busy ? 'loading' : failed ? 'error' : groups.length === 0 ? 'empty' : 'ready')}
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: `${PORTAL_SURFACE_RADIUS}rem`,
              padding: 'clamp(1.25rem, 3vw, 3rem)',
            }}
          >
            {busy ? (
              <SkeletonRows />
            ) : failed ? (
              <ErrorState
                staff={staff}
                preview={preview === 'error'}
                note={retryNote}
                onRetry={() => setRetryNote('Nothing was sent.')}
              />
            ) : groups.length === 0 ? (
              <EmptyState title={empty.title} body={empty.body} />
            ) : (
              <>
                <h2 style={{ fontSize: 20, fontWeight: 600, lineHeight: '26px' }}>{model.title}</h2>
                <p style={{ marginTop: 4, fontSize: 13, lineHeight: '19px', color: 'var(--muted)' }}>
                  {model.subtitle}
                </p>
                <ActivityFilters
                  narrow={narrow}
                  filter={filter}
                  filters={shown.filters}
                  onSelect={(key) => {
                    setFilter(key);
                    if (key === 'all' || key === 'tasks' || (staff && key === 'sync') || (!staff && key === 'resources')) {
                      setSectionFor('activity', key === 'all' ? 'all' : key);
                    }
                  }}
                />
                <div className="mt-8 flex flex-col gap-8">
                  {groups.map((group) => (
                    <div key={group.key}>
                      <div className="flex items-center justify-between gap-3">
                        <p
                          className="ds-mono"
                          style={{ fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)' }}
                        >
                          {group.label}
                        </p>
                        <p className="ds-mono" style={{ fontSize: 12, letterSpacing: '0.04em', color: 'var(--faint)' }}>
                          {group.countLabel}
                        </p>
                      </div>
                      <div>
                        {group.rows.map((row) => (
                          <button
                            key={row.id}
                            type="button"
                            className="block w-full border-0 bg-transparent p-0 text-left"
                            onClick={() =>
                              openDetail({
                                id: row.id,
                                title: row.name,
                                subtitle: row.summary,
                                body: (
                                  <p style={{ fontSize: 14, color: 'var(--muted)' }}>
                                    {row.summary || row.type}
                                  </p>
                                ),
                              })
                            }
                          >
                            <ActivityFeedRow
                              name={row.name}
                              summary={row.summary}
                              when={row.when}
                              lane={row.lane}
                              published={row.published}
                            />
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>
      </PortalTilePane>
    </PortalWorkspace>
  );
}

function ActivityFilters({
  narrow,
  filter,
  filters,
  onSelect,
}: {
  narrow: boolean;
  filter: ActivityFilter;
  filters: Array<{ key: ActivityFilter; label: string; count: number }>;
  onSelect: (key: ActivityFilter) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [fadePx, setFadePx] = useState(0);
  useEffect(() => {
    const node = scroller.current;
    if (!node || !narrow) {
      setFadePx(0);
      return;
    }
    const update = () => {
      setFadePx(sectionEdgeFadePx(node, { activeSelector: '[aria-pressed="true"]' }));
    };
    update();
    node.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(node);
    window.addEventListener('resize', update);
    return () => {
      node.removeEventListener('scroll', update);
      observer.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [narrow, filter, filters]);
  const fade = narrow && fadePx > 0;
  return (
    <div className="relative mt-6 min-w-0">
      <div
        ref={scroller}
        className="flex min-w-0 gap-2"
        data-testid="activity-filters"
        style={
          narrow
            ? {
                overflowX: 'auto',
                flexWrap: 'nowrap',
                scrollbarWidth: 'none',
                maxWidth: '100%',
                ...(fade
                  ? {
                      maskImage: `linear-gradient(to right, #000 0, #000 calc(100% - ${fadePx}px), transparent calc(100% - ${Math.round(fadePx * 0.45)}px))`,
                      WebkitMaskImage: `linear-gradient(to right, #000 0, #000 calc(100% - ${fadePx}px), transparent calc(100% - ${Math.round(fadePx * 0.45)}px))`,
                    }
                  : null),
              }
            : { flexWrap: 'wrap' }
        }
      >
        {filters.map((chip) => {
          const active = chip.key === filter;
          return (
            <button
              key={chip.key}
              type="button"
              aria-pressed={active}
              onClick={() => onSelect(chip.key)}
              className="inline-flex shrink-0 items-center gap-2"
              style={{
                borderRadius: 999,
                padding: '8px 16px',
                border: `1px solid ${active ? 'var(--border-2)' : 'var(--border)'}`,
                background: active ? 'var(--surface-2)' : 'transparent',
                color: active ? 'var(--fg)' : 'var(--muted)',
                fontSize: 13,
                fontWeight: 500,
              }}
            >
              {chip.label}
              <span className="ds-mono" style={{ fontSize: 11, color: 'var(--faint)' }}>
                {chip.count}
              </span>
            </button>
          );
        })}
      </div>
      {fade ? (
        <div
          aria-hidden
          data-testid="activity-filter-fade"
          className="pointer-events-none absolute inset-y-0 right-0"
          style={{ width: fadePx, background: 'linear-gradient(to right, transparent, var(--surface) 70%)' }}
        />
      ) : null}
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div
      data-testid="activity-empty"
      className="flex flex-col items-center gap-3 px-6 py-16 text-center"
      style={{
        borderRadius: 18,
        border: '1px dashed var(--border)',
        background: 'var(--bg)',
      }}
    >
      <span aria-hidden className="inline-flex" style={{ color: 'var(--faint)' }}>
        <TaskGlyph src="/icons/activity-row.svg" size={28} />
      </span>
      <p style={{ fontSize: 16, fontWeight: 500 }}>{title}</p>
      <p style={{ fontSize: 13, lineHeight: '19px', color: 'var(--muted)', maxWidth: 360 }}>{body}</p>
    </div>
  );
}

function SkeletonRows() {
  return (
    <div className="flex flex-col gap-6" data-testid="activity-loading" aria-hidden>
      {[0, 1, 2].map((row) => (
        <div key={row} className="flex items-center gap-4">
          <div className="h-9 w-9 shrink-0 rounded-[10px]" style={{ background: 'var(--surface-2, var(--bg))' }} />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="h-3 w-2/3 rounded-full" style={{ background: 'var(--surface-2, var(--bg))' }} />
            <div className="h-2.5 w-40 rounded-full" style={{ background: 'var(--surface-2, var(--bg))' }} />
          </div>
          <div className="h-3 w-12 rounded-full" style={{ background: 'var(--surface-2, var(--bg))' }} />
        </div>
      ))}
    </div>
  );
}

function ErrorState({
  staff,
  preview,
  note,
  onRetry,
}: {
  staff: boolean;
  preview: boolean;
  note: string | null;
  onRetry: () => void;
}) {
  const copy = staff ? STAFF_ACTIVITY_ERROR : CLIENT_ACTIVITY_ERROR;
  const body = staff && preview ? STAFF_ACTIVITY_ERROR.previewBody : copy.body;
  return (
    <div data-testid="activity-error" className="flex flex-col items-start gap-3">
      <div
        className="flex w-full items-start gap-3"
        style={{
          border: '1px solid var(--danger)',
          borderRadius: 18,
          padding: '16px 20px',
        }}
      >
        <span
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
          style={{ border: '1.25px solid var(--danger)', color: 'var(--danger)', fontSize: 11, fontWeight: 600 }}
        >
          !
        </span>
        <span>
          <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--danger)' }}>{copy.title}</p>
          <p style={{ marginTop: 4, fontSize: 13, lineHeight: '19px', color: 'var(--muted)' }}>{body}</p>
        </span>
      </div>
      {staff ? (
        <button
          type="button"
          onClick={onRetry}
          style={{
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: '8px 14px',
            fontSize: 13,
            fontWeight: 500,
            background: 'transparent',
            color: 'var(--fg)',
          }}
        >
          Retry sync
        </button>
      ) : null}
      {note ? <p style={{ fontSize: 12, color: 'var(--muted)' }}>{note}</p> : null}
    </div>
  );
}
