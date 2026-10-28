'use client';

import { api } from '@convex/_generated/api';
import { ActivityFeedRow } from '@/components/activity/ActivityFeedRow';
import { Pill, Surface } from '@/components/ui/primitives';
import {
  PortalStatGrid,
  PortalTilePane,
  PortalWorkspace,
} from '@/components/layout/PortalWorkspace';
import { usePortalView } from '@/components/providers/PortalViewProvider';
import { useActivityFeed } from '@/hooks/useActivityFeed';
import { activityToneVar, tenantEyebrow, usePortalData } from '@/hooks/usePortalData';
import { useSafeQuery } from '@/hooks/useSafeQuery';
import { getHostSlugFromLocation } from '@/lib/auth/host-slug';
import { isConvexConfigured } from '@/lib/convex/client';
import { pullSyncWords, type PortalActivity } from '@/lib/data/view-models';

const SECTION_TITLE: Record<string, string> = {
  all: 'All activity',
  tasks: 'Tasks',
  sync: 'Sync',
  'invite-notices': 'Invite notices',
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 5);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function formatDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function isException(a: PortalActivity): boolean {
  return a.type === 'exception' || a.tone === 'danger';
}

function isWatching(a: PortalActivity): boolean {
  return a.tone === 'warn' && !isException(a);
}

function activityPillColor(a: PortalActivity): string {
  if (isException(a)) return 'var(--danger)';
  if (a.tone === 'warn') return 'var(--warn)';
  return activityToneVar(a.tone);
}

function ActivityDetailBody({ item }: { item: PortalActivity }) {
  return (
    <div className="flex flex-col gap-3">
      <Pill color={activityPillColor(item)}>{item.type}</Pill>
      {item.summary ? (
        <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)', lineHeight: 1.5 }}>
          {item.summary}
        </p>
      ) : null}
      <p className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--faint)' }}>
        {formatDay(item.timestamp)} · {formatTime(item.timestamp)}
      </p>
    </div>
  );
}

export function ActivityContent() {
  const { sectionFor, openDetail } = usePortalView();
  const { data, loading: snapshotLoading } = usePortalData();
  const activityFeed = useActivityFeed();
  const loading = snapshotLoading || activityFeed.loading;
  const activeSection = sectionFor('activity');
  const title = SECTION_TITLE[activeSection] ?? 'Activity';

  const feed = activityFeed.items.filter((item) => {
    if (activeSection === 'tasks') return item.type === 'task';
    if (activeSection === 'sync') return item.type === 'sync' || item.type === 'exception';
    return true;
  });
  const exceptions = feed.filter(isException);
  const watching = feed.filter(isWatching);
  const attention = exceptions.length ? exceptions : watching;
  const syncMeta = data.syncMeta;
  const pull = pullSyncWords(syncMeta);
  const isTeam = data.tenant.mode === 'team';
  const configured = isConvexConfigured();
  const hostSlug = typeof window !== 'undefined' ? getHostSlugFromLocation() ?? undefined : undefined;
  const notices = useSafeQuery<
    Array<{ id: string; message: string; createdAt: number; edgeCase?: string | null; unread?: boolean }>
  >(
    api.invitesSync.listStaffNotices,
    configured && isTeam && activeSection === 'invite-notices' ? { hostSlug } : 'skip',
  );

  return (
    <PortalWorkspace eyebrow={tenantEyebrow(data.tenant, 'Activity')} title={title}>
      {activeSection === 'all' && (
        <PortalTilePane>
          <div className="flex h-full min-h-0 flex-col gap-4">
            <PortalStatGrid
              items={[
                { label: 'Events', value: loading ? '…' : String(feed.length), hint: 'Feed' },
                {
                  label: 'Exceptions',
                  value: String(exceptions.length),
                  hint: exceptions.length ? 'Needs attention' : 'Clear',
                },
                {
                  label: 'Watching',
                  value: String(watching.length),
                  hint: 'Warn tone',
                },
                ...(isTeam
                  ? [
                      {
                        label: 'Sync',
                        value: pull.value,
                        hint: pull.hint,
                      },
                    ]
                  : [
                      {
                        label: 'Scope',
                        value: data.tenant.slug ?? '—',
                        hint: 'Your org',
                      },
                    ]),
              ]}
            />
            {isTeam && syncMeta.lastError && (
              <Surface style={{ padding: 'var(--s-3)', borderColor: 'var(--danger)' }}>
                <p className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--danger)' }}>
                  Sync status · error
                </p>
                <p style={{ fontSize: 'var(--t-sm)', marginTop: 4 }}>{syncMeta.lastError}</p>
              </Surface>
            )}
            <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-2">
              <Surface style={{ padding: 'var(--s-4)', minHeight: 0 }}>
                <p className="ds-mono mb-3" style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>
                  Latest
                </p>
                <div className="flex flex-col gap-2">
                  {loading && (
                    <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>Loading…</p>
                  )}
                  {!loading && feed.length === 0 && (
                    <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>
                      No activity yet. Task responses, uploads, and staff project creates show up here.
                    </p>
                  )}
                  {feed.slice(0, 5).map((item) => (
                    <ActivityFeedRow
                      key={item.id}
                      item={item}
                      onOpen={() =>
                        openDetail({
                          id: item.id,
                          title: item.name,
                          subtitle: item.summary,
                          body: <ActivityDetailBody item={item} />,
                        })
                      }
                    />
                  ))}
                </div>
              </Surface>
              <Surface style={{ padding: 'var(--s-4)' }}>
                <p className="ds-mono mb-3" style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>
                  Needs attention
                </p>
                <div className="flex flex-col gap-2">
                  {attention.map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() =>
                        openDetail({
                          id: e.id,
                          title: e.name,
                          subtitle: e.summary,
                          body: <ActivityDetailBody item={e} />,
                        })
                      }
                      className="flex w-full items-center justify-between gap-2 text-left"
                      style={{
                        padding: '0.55rem 0.65rem',
                        borderRadius: 10,
                        border: '1px solid var(--border)',
                        background: 'var(--bg)',
                      }}
                    >
                      <span>
                        <span className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--faint)' }}>
                          {formatDay(e.timestamp)}
                        </span>
                        <span className="block" style={{ fontSize: 'var(--t-sm)', fontWeight: 600 }}>
                          {e.name}
                        </span>
                      </span>
                      <Pill color={activityPillColor(e)}>{e.type}</Pill>
                    </button>
                  ))}
                  {!attention.length && (
                    <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>
                      {isTeam
                        ? syncMeta.lastError
                          ? 'The Notion pull failed. See the note above.'
                          : pull.value === 'In sync'
                            ? 'No exceptions. The Notion pull is in sync.'
                            : 'No exceptions. The Notion pull is still syncing.'
                        : 'Nothing needs attention right now.'}
                    </p>
                  )}
                </div>
              </Surface>
            </div>
          </div>
        </PortalTilePane>
      )}

      {(activeSection === 'tasks' || activeSection === 'sync') && (
        <PortalTilePane>
          <div className="flex flex-col gap-2">
            {loading && (
              <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>Loading…</p>
            )}
            {!loading && feed.length === 0 && (
              <Surface style={{ padding: 'var(--s-5)' }}>
                <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>
                  No activity events yet.
                </p>
              </Surface>
            )}
            {feed.map((item) => (
              <ActivityFeedRow
                key={item.id}
                item={item}
                onOpen={() =>
                  openDetail({
                    id: item.id,
                    title: item.name,
                    subtitle: item.summary,
                    body: <ActivityDetailBody item={item} />,
                  })
                }
              />
            ))}
          </div>
        </PortalTilePane>
      )}

      {activeSection === 'exceptions' && (
        <PortalTilePane>
          <div
            style={{
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              overflow: 'hidden',
              height: '100%',
            }}
          >
            <div className="h-full overflow-auto">
              {!attention.length ? (
                <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)', padding: 'var(--s-5)' }}>
                  No exceptions or warnings in the current feed.
                </p>
              ) : (
                <table className="ds-data" style={{ minWidth: 480 }}>
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Issue</th>
                      <th>Context</th>
                      <th>Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attention.map((e) => (
                      <tr
                        key={e.id}
                        onClick={() =>
                          openDetail({
                            id: e.id,
                            title: e.name,
                            subtitle: e.summary,
                            body: <ActivityDetailBody item={e} />,
                          })
                        }
                        style={{ cursor: 'pointer' }}
                      >
                        <td className="ds-mono">
                          {formatDay(e.timestamp)} {formatTime(e.timestamp)}
                        </td>
                        <td>{e.name}</td>
                        <td style={{ color: 'var(--muted)' }}>{e.summary || '—'}</td>
                        <td>
                          <Pill color={activityPillColor(e)}>{e.type}</Pill>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </PortalTilePane>
      )}

      {activeSection === 'invite-notices' && isTeam && (
        <PortalTilePane>
          <div className="flex h-full min-h-0 flex-col gap-3 overflow-auto">
            {notices.loading && (
              <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>Loading notices…</p>
            )}
            {notices.data?.length === 0 && (
              <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>No invite notices.</p>
            )}
            {notices.data?.map((notice) => (
              <Surface key={notice.id} style={{ padding: 24 }}>
                <p style={{ fontSize: 14, lineHeight: '21px', margin: 0 }}>{notice.message}</p>
                <p className="ds-mono" style={{ fontSize: 11, color: 'var(--faint)', margin: '8px 0 0' }}>
                  {new Date(notice.createdAt).toLocaleString('en-US')}
                  {notice.edgeCase ? ` · ${notice.edgeCase}` : ''}
                </p>
              </Surface>
            ))}
          </div>
        </PortalTilePane>
      )}
    </PortalWorkspace>
  );
}
