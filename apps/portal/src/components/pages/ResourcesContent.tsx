'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { PrimaryButton } from '@/components/ui/primitives';
import { TaskGlyph } from '@/components/tasks/TaskGlyph';
import { resourceKind } from '@/components/tasks/AttachedResourceRow';
import { PortalTilePane, PortalWorkspace } from '@/components/layout/PortalWorkspace';
import { NavBreadcrumb } from '@/components/nav/NavBreadcrumb';
import { ResourceDetail, type ResourceTaskRow } from '@/components/resources/ResourceDetail';
import { usePortalView } from '@/components/providers/PortalViewProvider';
import { tenantEyebrow, usePortalData } from '@/hooks/usePortalData';
import { usePortalAuth } from '@/hooks/usePortalAuth';
import { getHostSlugFromLocation } from '@/lib/auth/host-slug';
import { isConvexConfigured } from '@/lib/convex/client';
import { FIXTURE_DOCS, FIXTURE_PROJECTS, FIXTURE_RESOURCES, FIXTURE_TASKS, FIXTURE_TASK_RESOURCES } from '@/lib/data/fixtures';
import { isStudioProjectName, withoutClientLeaks } from '@/lib/data/clientDetail';
import { useFixturePreview } from '@/components/providers/FixturePreviewProvider';
import { useMaxWidth } from '@/lib/design/useMaxWidth';
import { useStaffCrossOrg } from '@/hooks/useStaffCrossOrg';
import { staffRosterQueriesDeployed } from '@/lib/data/staffRoster';
import { useSafeQuery } from '@/hooks/useSafeQuery';
import type { Id } from '@convex/_generated/dataModel';
import { api } from '@convex/_generated/api';
import { PublishChip } from '@/components/sync/SyncChip';
import {
  attachedHint,
  isDraftRecap,
  isMeetingResource,
  resourceAttachmentMeta,
  resourceListStats,
  resourceMatchesFilter,
  resourceSourceLabel,
  resourceTitleLine,
  type ResourceListFilter,
} from '@/lib/data/resourceList';
import { openPortalHref, portalNavDetail } from '@/lib/nav/openPortalHref';

type ResourceScreen = 'ready' | 'empty' | 'loading' | 'error' | 'long';

const LONG_RESOURCE_STAFF =
  'Kickoff and wireframe review with the full Northwind Foods marketing and operations team · Sep 29';
const LONG_RESOURCE_CLIENT =
  'Kickoff and wireframe review with the full Northwind Foods team · Sep 29';
const WRITEBACK_RESOURCE = 'Creating a resource stays off until write-back is enabled';

function LockedStateButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      disabled
      aria-disabled="true"
      style={{
        fontSize: 14,
        fontWeight: 500,
        padding: '12px 16px',
        borderRadius: 9,
        border: '1px solid var(--border)',
        background: 'transparent',
        color: 'var(--muted)',
        cursor: 'not-allowed',
      }}
    >
      {label}
    </button>
  );
}

function ResourcePreviewState({ screen, staff }: { screen: Exclude<ResourceScreen, 'ready'>; staff: boolean }) {
  if (screen === 'loading') {
    return (
      <div className="flex flex-col gap-3" aria-busy="true" data-testid="resource-state-loading">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="animate-pulse" style={{ width: 36, height: 36, borderRadius: 18, background: 'var(--bg)' }} />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div className="animate-pulse" style={{ height: 12, borderRadius: 99, background: 'var(--bg)' }} />
              <div className="animate-pulse" style={{ height: 10, width: 160, borderRadius: 99, background: 'var(--bg)' }} />
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (screen === 'error') {
    return (
      <div role="alert" data-testid="resource-state-error" style={{ border: '1px solid var(--danger)', borderRadius: 18, padding: '1rem 1.25rem' }}>
        <p style={{ color: 'var(--danger)', fontWeight: 600, fontSize: 14 }}>
          {staff ? 'Granola import failed' : 'We could not load your resources'}
        </p>
        <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4 }}>
          {staff ? 'The last import did not finish. Existing notes are unchanged.' : 'Try again in a moment.'}
        </p>
        {staff ? (
          <div className="mt-3">
            <LockedStateButton label="Retry import" />
          </div>
        ) : null}
      </div>
    );
  }
  if (screen === 'empty') {
    return (
      <div
        data-testid="resource-state-empty"
        className="flex flex-col items-center text-center"
        style={{ border: '1px dashed var(--border)', borderRadius: 18, padding: '3rem 1.5rem' }}
      >
        <p style={{ fontWeight: 600 }}>{staff ? 'No recap published yet' : 'Nothing shared yet'}</p>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 8, maxWidth: 420 }}>
          {staff
            ? 'This meeting note is a draft recap. Publish it to share summary, decisions and action items with the client.'
            : 'When Warehaus shares a meeting recap or file, it will appear here.'}
        </p>
        {staff ? (
          <div className="mt-3">
            <LockedStateButton label="Review draft recap" />
          </div>
        ) : null}
      </div>
    );
  }
  return null;
}

type ResourceRow = (typeof FIXTURE_RESOURCES)[number];

type DocHit = {
  id: string;
  title: string;
  summary?: string | null;
  docType?: string | null;
  status?: string;
  publishToWarehaus?: boolean;
  syncHidden?: boolean;
};

function fixtureTasksFor(resourceId: string, staff: boolean): ResourceTaskRow[] {
  const ids = new Set(
    FIXTURE_TASK_RESOURCES.filter((link) => link.resourceId === resourceId).map((link) => link.taskId),
  );
  return FIXTURE_TASKS.filter((task) => ids.has(task.id)).flatMap((task) => {
    const project = FIXTURE_PROJECTS.find((item) => item.id === task.projectId);
    if (!staff) {
      if (task.syncHidden || task.publishToWarehaus === false) return [];
      if (!project || project.internal || project.publishToWarehaus === false || isStudioProjectName(project.name)) {
        return [];
      }
    }
    const row: ResourceTaskRow = {
      id: task.id,
      name: task.name,
      status: task.status,
      isDone: task.isDone,
      stage: task.stage,
      category: task.category,
      projectName: project?.name ?? task.projectName,
      projectInternal: Boolean(project?.internal || isStudioProjectName(project?.name)),
      date: task.date,
      ...(staff ? { publishToWarehaus: task.publishToWarehaus } : {}),
    };
    return [staff ? row : withoutClientLeaks(row)];
  });
}

function clientMayOpen(row: ResourceRow): boolean {
  if (row.publishToWarehaus === false || row.syncHidden) return false;
  if (isStudioProjectName(row.projectName)) return false;
  return true;
}

function pathId(pathname: string, prefix: string): string | null {
  const match = pathname.match(new RegExp(`^${prefix}([^/?#]+)`));
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

export function ResourcesContent() {
  const fixtures = useFixturePreview();
  const configured = isConvexConfigured();
  const pathname = usePathname() || '';
  const { sectionFor, setSectionFor, openDetail } = usePortalView();
  const { data, error } = usePortalData();
  const { portalSession } = usePortalAuth();
  const hostSlug =
    typeof window !== 'undefined' ? getHostSlugFromLocation() ?? undefined : undefined;
  const activeSection = sectionFor('resources');
  const isStaff = Boolean(portalSession?.isStaff);

  const staff = useStaffCrossOrg(!fixtures && configured && isStaff, hostSlug);
  const clientRows = useSafeQuery<ResourceRow[]>(
    api.sharedResources.listForClient,
    !fixtures && configured && !isStaff && data.tenant.ok ? { hostSlug } : 'skip',
  );
  const clientDocs = useSafeQuery<DocHit[]>(
    api.clientDocs.listForClient,
    !fixtures && configured && !isStaff && data.tenant.ok ? { hostSlug } : 'skip',
  );

  const rows = useMemo(() => {
    const source = (fixtures ? FIXTURE_RESOURCES : isStaff ? staff.resources ?? [] : clientRows.data ?? []) as ResourceRow[];
    if (isStaff) return source;
    return source.filter(clientMayOpen).map((row) => withoutClientLeaks(row));
  }, [fixtures, isStaff, staff.resources, clientRows.data]);
  const docs = useMemo(
    () => (fixtures ? FIXTURE_DOCS : isStaff ? staff.docs ?? [] : clientDocs.data ?? []) as DocHit[],
    [fixtures, isStaff, staff.docs, clientDocs.data],
  );
  const [openResourceId, setOpenResourceId] = useState<string | null>(null);
  const [resourceScreen, setResourceScreen] = useState<ResourceScreen>('ready');

  // Preview and deep links pass ?resource= or /resources/:id. The initializer
  // cannot read window during SSR, so apply the id after mount.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const screen = params.get('resources');
    if (screen === 'empty' || screen === 'loading' || screen === 'error' || screen === 'long') {
      setResourceScreen(screen);
    }
    const id = params.get('resource') ?? pathId(window.location.pathname, '/resources/');
    if (id && screen !== 'empty' && screen !== 'loading' && screen !== 'error' && screen !== 'long') {
      setOpenResourceId(id);
    }
  }, [pathname]);
  const staffUsed = useSafeQuery<ResourceTaskRow[]>(
    api.sharedResources.usedInTasks,
    !fixtures && configured && isStaff && openResourceId
      ? { hostSlug, resourceId: openResourceId as Id<'sharedResources'> }
      : 'skip',
  );
  const clientUsed = useSafeQuery<ResourceTaskRow[]>(
    api.sharedResources.usedInTasksForClient,
    !fixtures && configured && !isStaff && openResourceId
      ? { hostSlug, resourceId: openResourceId as Id<'sharedResources'> }
      : 'skip',
  );
  const loading = !fixtures && (isStaff ? staff.resourcesLoading : clientRows.loading);
  const [draftOnly, setDraftOnly] = useState(false);
  const keepDraft = useRef(false);
  const narrow = useMaxWidth(480);
  const filter: ResourceListFilter = draftOnly
    ? 'draft-recap'
    : activeSection === 'meeting-notes' || activeSection === 'files-links'
      ? activeSection
      : 'all';
  const visible = rows.filter((row) => resourceMatchesFilter(row, isStaff || filter !== 'draft-recap' ? filter : 'all'));
  useEffect(() => {
    if (keepDraft.current) {
      keepDraft.current = false;
      return;
    }
    setDraftOnly(false);
  }, [activeSection]);

  useEffect(() => {
    let timer = 0;
    const unavailable = (id: string) => {
      openDetail({
        id,
        title: 'Not available',
        body: <p style={{ color: 'var(--muted)', fontSize: 'var(--t-sm)' }}>That isn&apos;t available.</p>,
      });
    };
    const openFromLocation = (event?: Event) => {
      window.clearTimeout(timer);
      const detail = event ? portalNavDetail(event) : null;
      const params = new URLSearchParams(window.location.search);
      const preview = window.location.pathname.startsWith('/preview');
      const docId = detail ? detail.doc : preview ? params.get('doc') : pathId(window.location.pathname, '/docs/');
      const resourceId = detail ? detail.resource : preview ? params.get('resource') : pathId(window.location.pathname, '/resources/');
      if (resourceId) setOpenResourceId(resourceId);
      if (!docId) return;
      if (docId && !fixtures && !isStaff && clientDocs.loading) return;
      timer = window.setTimeout(() => {
        if (docId) {
          const doc = docs.find((item) => item.id === docId);
          const allowed = Boolean(doc) && (isStaff || (doc?.publishToWarehaus !== false && doc?.status !== 'Draft' && !doc?.syncHidden));
          if (!allowed || !doc) {
            unavailable(docId);
            return;
          }
          openDetail({
            id: doc.id,
            title: doc.title,
            subtitle: doc.docType ?? 'Doc',
            body: (
              <div className="flex flex-col gap-2">
                <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>{doc.summary ?? '—'}</p>
                <p style={{ fontSize: 'var(--t-sm)' }}>Type {doc.docType ?? '—'}</p>
                {isStaff && doc.publishToWarehaus != null ? <PublishChip published={doc.publishToWarehaus} /> : null}
              </div>
            ),
          });
        }
      }, 0);
    };
    const onNav = (event: Event) => {
      if (!portalNavDetail(event)) return;
      openFromLocation(event);
    };
    window.addEventListener('wh-portal-nav', onNav);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('wh-portal-nav', onNav);
    };
  }, [docs, rows, isStaff, openDetail, pathname, fixtures, clientDocs.loading]);

  const pathDocId = pathId(pathname, '/docs/');
  const pathResourceId = pathId(pathname, '/resources/');
  const docsPending = !fixtures && (isStaff ? staffRosterQueriesDeployed() && staff.docs == null : clientDocs.loading);
  const resourcesPending = !fixtures && (isStaff ? staff.resourcesLoading : clientRows.loading);

  if (pathDocId) {
    const doc = docs.find((item) => item.id === pathDocId);
    const allowed = Boolean(doc) && (isStaff || (doc?.publishToWarehaus !== false && doc?.status !== 'Draft' && !doc?.syncHidden));
    return (
      <PortalWorkspace eyebrow={tenantEyebrow(data.tenant, 'Docs')} title={allowed && doc ? doc.title : 'Doc'}>
        <PortalTilePane>
          <article data-testid="focused-doc" className="flex flex-col gap-2">
            {docsPending ? (
              <p aria-busy="true" style={{ color: 'var(--muted)' }}>Loading…</p>
            ) : !allowed || !doc ? (
              <p style={{ color: 'var(--muted)' }}>That isn&apos;t available.</p>
            ) : (
              <>
                <h2 style={{ fontSize: 16, fontWeight: 500 }}>{doc.title}</h2>
                <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>{doc.summary ?? '—'}</p>
                <p style={{ fontSize: 'var(--t-sm)' }}>Type {doc.docType ?? '—'}</p>
                {isStaff && doc.publishToWarehaus != null ? <PublishChip published={doc.publishToWarehaus} /> : null}
              </>
            )}
          </article>
        </PortalTilePane>
      </PortalWorkspace>
    );
  }

  const selectedId = resourceScreen === 'long' ? null : pathResourceId || openResourceId;
  const longRow = resourceScreen === 'long'
    ? rows.find((item) => item.id === 'r-notes') ?? rows.find((item) => isMeetingResource(item.type)) ?? null
    : null;
  const opened = longRow ?? (selectedId ? rows.find((item) => item.id === selectedId) ?? null : null);
  if (opened || (selectedId && !longRow)) {
    const row = opened;
    const shownName = resourceScreen === 'long' && row ? (isStaff ? LONG_RESOURCE_STAFF : LONG_RESOURCE_CLIENT) : row?.name;
    const allowed = Boolean(row) && (isStaff || clientMayOpen(row as ResourceRow));
    const taskState = fixtures
      ? { data: row ? fixtureTasksFor(row.id, isStaff) : [], loading: false }
      : isStaff
        ? staffUsed
        : clientUsed;
    const closeResource = () => {
      setOpenResourceId(null);
      setResourceScreen('ready');
      const url = new URL(window.location.href);
      url.searchParams.delete('resource');
      url.searchParams.delete('resources');
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}`);
    };
    const heading = allowed && shownName ? shownName : 'Resource';
    return (
      <PortalWorkspace
        eyebrow={tenantEyebrow(data.tenant, 'Resources')}
        title={heading}
        titleLines={resourceScreen === 'long' && allowed ? 2 : 1}
        breadcrumb={
          <NavBreadcrumb
            back="always"
            onBack={closeResource}
            parent={{ label: 'Resources', onClick: closeResource }}
            current={heading}
          />
        }
      >
        <PortalTilePane>
          {resourcesPending ? (
            <p aria-busy="true" style={{ color: 'var(--muted)' }}>Loading…</p>
          ) : !allowed || !row ? (
            <p data-testid="resource-detail" style={{ color: 'var(--muted)' }}>That isn&apos;t available.</p>
          ) : (
            <ResourceDetail
              resource={{
                id: row.id,
                name: shownName ?? row.name,
                description: row.description,
                type: row.type,
                url: row.url,
                projectName: row.projectName,
                clientName: row.clientName,
                updatedAt: row.updatedAt ?? row.lastSyncedAt ?? null,
                staff: isStaff,
                ...(isStaff
                  ? {
                      publishToWarehaus: row.publishToWarehaus,
                      notionPageId: row.notionPageId,
                      syncHidden: row.syncHidden,
                    }
                  : {}),
              }}
              tasks={taskState.data ?? []}
              tasksLoading={taskState.loading}
              onOpenTask={(taskId) => openPortalHref(`/tasks/${taskId}`)}
            />
          )}
        </PortalTilePane>
      </PortalWorkspace>
    );
  }

  const counted = rows.map((row) => ({
    type: row.type,
    publishToWarehaus: isStaff ? row.publishToWarehaus : true,
    attachedCount: attachmentCount(row, isStaff, fixtures),
  }));
  const stats = resourceListStats(counted, isStaff);
  const chips: Array<{ key: ResourceListFilter; label: string; count: number }> = [
    { key: 'all', label: 'All', count: stats.total },
    { key: 'meeting-notes', label: 'Meeting notes', count: stats.meetings },
    { key: 'files-links', label: 'Files & links', count: stats.files },
    ...(isStaff ? [{ key: 'draft-recap' as const, label: 'Draft recap', count: stats.drafts }] : []),
  ];
  const chooseFilter = (key: ResourceListFilter) => {
    if (key === 'draft-recap') {
      keepDraft.current = true;
      setDraftOnly(true);
      setSectionFor('resources', 'all');
      return;
    }
    keepDraft.current = false;
    setDraftOnly(false);
    setSectionFor('resources', key);
  };

  return (
    <PortalWorkspace
      eyebrow={tenantEyebrow(data.tenant, 'Resources')}
      title="Resources"
      actions={
        isStaff ? (
          <PrimaryButton disabled solidWhenDisabled title={WRITEBACK_RESOURCE}>
            Add resource
          </PrimaryButton>
        ) : undefined
      }
    >
      <PortalTilePane>
        <div className="flex h-full min-h-0 flex-col gap-8 overflow-y-auto" data-testid="resources-list">
          <div
            className={`grid grid-cols-1 gap-4 ${isStaff ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}
            data-testid="resource-kpis"
          >
            {[
              { label: 'Meeting notes', value: stats.meetings, hint: attachedHint(stats.attached, isStaff) },
              ...(isStaff
                ? [{ label: 'Draft recaps', value: stats.drafts, hint: 'Not visible to clients' }]
                : []),
              { label: 'Published recaps', value: stats.published, hint: isStaff ? 'Client-safe only' : 'Shared with you' },
            ].map((stat) => (
              <div
                key={stat.label}
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 28,
                  padding: 'clamp(1.25rem, 2vw, 2rem)',
                }}
              >
                <p className="ds-mono" style={{ fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)' }}>
                  {stat.label}
                </p>
                <p className="kpi-figure">{loading ? '…' : stat.value}</p>
                <p style={{ marginTop: 12, fontSize: 14 }}>{loading ? 'Loading' : stat.hint}</p>
              </div>
            ))}
          </div>
          <section
            data-testid="all-resources"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 36,
              padding: 'clamp(1.25rem, 2vw, 3rem)',
            }}
          >
            <h2 style={{ fontSize: 20, fontWeight: 600, lineHeight: '26px' }}>All resources</h2>
            <p style={{ marginTop: 4, fontSize: 13, lineHeight: '19px', color: 'var(--muted)' }}>
              Each resource attaches to one or more items.
            </p>
            {resourceScreen !== 'ready' && resourceScreen !== 'long' ? (
              <div className="mt-6">
                <ResourcePreviewState screen={resourceScreen} staff={isStaff} />
              </div>
            ) : (
              <>
                <div
                  className="mt-6 flex gap-2"
                  data-testid="resource-filters"
                  style={narrow ? { overflowX: 'auto', flexWrap: 'nowrap', scrollbarWidth: 'none' } : { flexWrap: 'wrap' }}
                >
                  {chips.map((chip) => {
                    const active = filter === chip.key;
                    return (
                      <button
                        key={chip.key}
                        type="button"
                        aria-pressed={active}
                        onClick={() => chooseFilter(chip.key)}
                        className="inline-flex shrink-0 items-center gap-2"
                        style={{
                          padding: '8px 16px',
                          borderRadius: 999,
                          border: active ? '1px solid var(--border-2)' : '1px solid var(--border)',
                          background: active ? 'var(--surface-2)' : 'transparent',
                          color: active ? 'var(--fg)' : 'var(--muted)',
                          fontSize: 13,
                          fontWeight: 500,
                          cursor: 'pointer',
                        }}
                      >
                        {chip.label}
                        <span className="ds-mono" style={{ fontSize: 11, color: 'var(--faint)' }}>{chip.count}</span>
                      </button>
                    );
                  })}
                </div>
                {resourceScreen === 'ready' && (error || staff.resourcesError) ? (
                  <p style={{ fontSize: 13, color: 'var(--danger)', marginTop: 16 }}>
                    {isStaff ? error || staff.resourcesError : 'We could not load your resources'}
                  </p>
                ) : null}
                {loading ? (
                  <div className="mt-4 flex flex-col gap-2" aria-busy="true">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="animate-pulse" style={{ height: 64, borderRadius: 12, background: 'var(--bg)' }} />
                    ))}
                  </div>
                ) : null}
                {!loading && visible.length === 0 ? (
                  <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 16 }}>
                    {isStaff ? 'No resources match these filters.' : 'Nothing shared yet.'}
                  </p>
                ) : null}
                {!loading && visible.length > 0 ? (
                  <ul className="mt-2">
                    {visible.map((row) => {
                      const kind = resourceKind(row.type ?? null);
                      const meeting = isMeetingResource(row.type);
                      const draft = isStaff && isDraftRecap(row);
                      const recap = meeting ? (draft ? 'Draft recap' : 'Recap published') : null;
                      const when = row.updatedAt ?? row.lastSyncedAt ?? null;
                      const marks = (
                        <span className="inline-flex flex-wrap items-center gap-2">
                          {recap ? (
                            <span
                              className="ds-mono inline-flex items-center whitespace-nowrap"
                              style={{
                                border: draft ? '1px dashed var(--border-2)' : '1px solid var(--border-2)',
                                background: draft ? 'transparent' : 'var(--surface-2)',
                                borderRadius: 999,
                                padding: '4px 12px',
                                fontSize: 11,
                                letterSpacing: '0.44px',
                                color: draft ? 'var(--muted)' : 'var(--fg)',
                              }}
                            >
                              {recap}
                            </span>
                          ) : null}
                          {isStaff && row.publishToWarehaus != null ? <PublishMark published={row.publishToWarehaus === true} /> : null}
                        </span>
                      );
                      return (
                        <li key={row.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <button
                            type="button"
                            data-testid="resource-row"
                            className="flex w-full items-center gap-4 py-6 text-left"
                            style={{ background: 'transparent', color: 'inherit' }}
                            onClick={() => {
                              setOpenResourceId(row.id);
                              const url = new URL(window.location.href);
                              url.searchParams.set('tab', 'resources');
                              url.searchParams.set('resource', row.id);
                              window.history.replaceState(window.history.state, '', `${url.pathname}?${url.searchParams.toString()}`);
                            }}
                          >
                            <span
                              className="inline-flex shrink-0 items-center justify-center"
                              style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--muted)' }}
                            >
                              <TaskGlyph src={kind.icon} size={16} />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate" style={{ fontSize: 16, fontWeight: 500 }}>{resourceTitleLine(row.name, when)}</span>
                              <span className="ds-mono mt-1 block truncate" style={{ fontSize: 12, lineHeight: '18px', color: 'var(--muted)' }}>
                                {attachmentCopy(row, isStaff, fixtures)}
                              </span>
                              {narrow ? <span className="mt-2 flex">{marks}</span> : null}
                            </span>
                            {narrow ? null : marks}
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img alt="" src="/icons/client-chev.svg" width={16} height={16} className="shrink-0 opacity-70" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </>
            )}
            <div
              className="mt-6 flex gap-3"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 18, padding: '16px 24px' }}
            >
              <span
                aria-hidden
                className="inline-flex shrink-0 items-center justify-center"
                style={{ width: 20, height: 20, borderRadius: 999, border: '1.25px solid var(--muted)', color: 'var(--muted)', fontSize: 11, fontWeight: 600 }}
              >
                i
              </span>
              <span>
                <strong style={{ fontSize: 14, lineHeight: '20px' }}>Full notes stay in Notion</strong>
                <span className="mt-1 block" style={{ fontSize: 13, lineHeight: '19px', color: 'var(--muted)' }}>
                  Only a published, client-safe recap (summary, decisions, action items) can be opened by a client. Transcripts are never shown to clients.
                </span>
              </span>
            </div>
          </section>
        </div>
      </PortalTilePane>
    </PortalWorkspace>
  );
}

function attachmentCount(row: ResourceRow, staff: boolean, fixtures: boolean): number | undefined {
  if (fixtures) {
    const linked = fixtureTasksFor(row.id, staff).length;
    if (!staff) return linked;
    return Math.max(linked, row.attachedCount ?? 0);
  }
  return typeof row.attachedCount === 'number' ? row.attachedCount : undefined;
}

function attachmentCopy(row: ResourceRow, staff: boolean, fixtures: boolean): string {
  const source = resourceSourceLabel(row.type);
  if (fixtures) {
    const tasks = fixtureTasksFor(row.id, staff);
    if (tasks.length > 0) return resourceAttachmentMeta(source, tasks[0]?.name, tasks.length - 1);
  }
  const count = typeof row.attachedCount === 'number' ? row.attachedCount : 0;
  if (row.projectName) return resourceAttachmentMeta(source, row.projectName, Math.max(0, count - 1));
  return source;
}

function PublishMark({ published }: { published: boolean }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap" style={{ padding: '4px 8px' }}>
      {published ? (
        <span
          aria-hidden
          style={{
            width: 8,
            height: 8,
            background: 'var(--fg)',
            WebkitMask: 'url(/icons/docs-dot-on.svg) center / contain no-repeat',
            mask: 'url(/icons/docs-dot-on.svg) center / contain no-repeat',
          }}
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src="/icons/docs-dot-off.svg" alt="" width={8} height={8} />
      )}
      <span className="ds-mono" style={{ fontSize: 11, letterSpacing: '0.44px', color: published ? 'var(--fg)' : 'var(--muted)' }}>
        {published ? 'Published' : 'Not published'}
      </span>
    </span>
  );
}
