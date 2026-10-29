'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Pill, Surface } from '@/components/ui/primitives';
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
import { useStaffCrossOrg } from '@/hooks/useStaffCrossOrg';
import { staffRosterQueriesDeployed } from '@/lib/data/staffRoster';
import { useSafeQuery } from '@/hooks/useSafeQuery';
import type { Id } from '@convex/_generated/dataModel';
import { api } from '@convex/_generated/api';
import { PublishChip, SyncChip } from '@/components/sync/SyncChip';
import { openPortalHref, portalNavDetail } from '@/lib/nav/openPortalHref';

type ResourceScreen = 'ready' | 'empty' | 'loading' | 'error' | 'long';

const LONG_RESOURCE_STAFF =
  'Kickoff and wireframe review with the full Northwind Foods marketing and operations team · Sep 22';
const LONG_RESOURCE_CLIENT =
  'Kickoff and wireframe review with the full Northwind Foods team · Sep 22';

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
  const title = staff ? LONG_RESOURCE_STAFF : LONG_RESOURCE_CLIENT;
  return (
    <div data-testid="resource-state-long">
    <Surface style={{ padding: 'var(--s-4)' }}>
      <h3 style={{ fontSize: 16, fontWeight: 600, overflowWrap: 'break-word' }}>{title}</h3>
      <p className="truncate" style={{ fontSize: 13, color: 'var(--muted)', marginTop: 6 }}>
        {staff ? 'Granola · Homepage wireframes +3' : 'Meeting recap · Homepage wireframes'}
      </p>
      {staff ? (
        <div className="mt-3 flex flex-nowrap items-center gap-2 overflow-hidden">
          <span className="ds-mono shrink-0 whitespace-nowrap" style={{ border: '1px dashed var(--border)', borderRadius: 999, padding: '4px 10px', fontSize: 11, color: 'var(--muted)' }}>
            Draft recap
          </span>
          <PublishChip published={false} />
        </div>
      ) : null}
    </Surface>
    </div>
  );
}

const SECTION_TITLE: Record<string, string> = {
  all: 'All resources',
  'meeting-notes': 'Meeting notes',
  'files-links': 'Files & links',
};

type ResourceRow = (typeof FIXTURE_RESOURCES)[number];

function isMeeting(type: string | null): boolean {
  return /meeting|recap|notes/i.test(type ?? '');
}

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
  const { sectionFor, openDetail } = usePortalView();
  const { data, error } = usePortalData();
  const { portalSession } = usePortalAuth();
  const hostSlug =
    typeof window !== 'undefined' ? getHostSlugFromLocation() ?? undefined : undefined;
  const activeSection = sectionFor('resources');
  const isStaff = Boolean(portalSession?.isStaff);
  const title = SECTION_TITLE[activeSection] ?? 'Resources';

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
  const visible = rows.filter((row) => {
    if (activeSection === 'meeting-notes') return isMeeting(row.type);
    if (activeSection === 'files-links') return !isMeeting(row.type);
    return true;
  });

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

  const selectedId = pathResourceId || openResourceId;
  if (selectedId) {
    const row = rows.find((item) => item.id === selectedId);
    const allowed = Boolean(row) && (isStaff || clientMayOpen(row as ResourceRow));
    const taskState = fixtures
      ? { data: row ? fixtureTasksFor(row.id, isStaff) : [], loading: false }
      : isStaff
        ? staffUsed
        : clientUsed;
    const closeResource = () => {
      setOpenResourceId(null);
      const url = new URL(window.location.href);
      url.searchParams.delete('resource');
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}`);
    };
    return (
      <PortalWorkspace
        eyebrow={tenantEyebrow(data.tenant, 'Resources')}
        title={allowed && row ? row.name : 'Resource'}
        breadcrumb={
          <NavBreadcrumb
            back="always"
            onBack={closeResource}
            parent={{ label: 'Resources', onClick: closeResource }}
            current={allowed && row ? row.name : 'Resource'}
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
                name: row.name,
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

  return (
    <PortalWorkspace eyebrow={tenantEyebrow(data.tenant, 'Resources')} title={title}>
      <PortalTilePane>
        <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto" data-testid="resources-list">
          {resourceScreen !== 'ready' ? (
            <ResourcePreviewState screen={resourceScreen} staff={isStaff} />
          ) : null}
          {resourceScreen === 'ready' && (error || staff.resourcesError) ? (
            <p style={{ fontSize: 'var(--t-sm)', color: 'var(--danger)' }}>
              {isStaff ? error || staff.resourcesError : 'We could not load your resources'}
            </p>
          ) : null}
          {resourceScreen === 'ready' ? (
          <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>
            {isStaff
              ? 'Full notes stay in Notion. This list is the live Shared Resource fields.'
              : 'You only see what is shared with you. A recap, not a transcript.'}
          </p>
          ) : null}
          {resourceScreen === 'ready' && loading ? (
            <div className="flex flex-col gap-2" aria-busy="true">
              {[0, 1, 2].map((i) => (
                <div key={i} className="animate-pulse" style={{ height: 56, borderRadius: 12, background: 'var(--bg)' }} />
              ))}
            </div>
          ) : null}
          {resourceScreen === 'ready' && !loading && visible.length === 0 ? (
            <Surface style={{ padding: 'var(--s-5)' }}>
              <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>
                {isStaff ? 'No resources match these filters.' : 'Nothing shared yet.'}
              </p>
            </Surface>
          ) : null}
          {resourceScreen === 'ready' && !loading && visible.length > 0
            ? visible.map((row) => (
              <button
                key={row.id}
                type="button"
                className="text-left"
                onClick={() => {
                  setOpenResourceId(row.id);
                  const url = new URL(window.location.href);
                  url.searchParams.set('tab', 'resources');
                  url.searchParams.set('resource', row.id);
                  window.history.replaceState(window.history.state, '', `${url.pathname}?${url.searchParams.toString()}`);
                }}
              >
                <Surface style={{ padding: 'var(--s-4)' }}>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="min-w-0 flex-1 truncate" style={{ fontSize: 'var(--t-md)', fontWeight: 600 }}>{row.name}</h3>
                    {row.type ? <Pill>{row.type}</Pill> : null}
                    {isStaff && row.publishToWarehaus != null ? (
                      <PublishChip published={row.publishToWarehaus} />
                    ) : null}
                    {isStaff ? (
                      <SyncChip audience="staff" notionPageId={row.notionPageId} syncHidden={row.syncHidden} />
                    ) : null}
                  </div>
                  <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)', marginTop: 6 }}>
                    {row.projectName ?? '—'}
                    {row.description ? ` · ${row.description}` : ''}
                  </p>
                </Surface>
              </button>
            ))
            : null}
        </div>
      </PortalTilePane>
    </PortalWorkspace>
  );
}
