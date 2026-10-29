'use client';

import { useEffect, useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { Pill, Surface } from '@/components/ui/primitives';
import { PortalTilePane, PortalWorkspace } from '@/components/layout/PortalWorkspace';
import { usePortalView } from '@/components/providers/PortalViewProvider';
import { tenantEyebrow, usePortalData } from '@/hooks/usePortalData';
import { usePortalAuth } from '@/hooks/usePortalAuth';
import { getHostSlugFromLocation } from '@/lib/auth/host-slug';
import { isConvexConfigured } from '@/lib/convex/client';
import { FIXTURE_DOCS, FIXTURE_RESOURCES } from '@/lib/data/fixtures';
import { useFixturePreview } from '@/components/providers/FixturePreviewProvider';
import { useStaffCrossOrg } from '@/hooks/useStaffCrossOrg';
import { useSafeQuery } from '@/hooks/useSafeQuery';
import type { Id } from '@convex/_generated/dataModel';
import { api } from '@convex/_generated/api';
import { PublishChip, SyncChip } from '@/components/sync/SyncChip';
import { portalNavDetail } from '@/lib/nav/openPortalHref';

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

  const rows = useMemo(
    () => (fixtures ? FIXTURE_RESOURCES : isStaff ? staff.resources ?? [] : clientRows.data ?? []) as ResourceRow[],
    [fixtures, isStaff, staff.resources, clientRows.data],
  );
  const docs = useMemo(
    () => (fixtures ? FIXTURE_DOCS : isStaff ? staff.docs ?? [] : clientDocs.data ?? []) as DocHit[],
    [fixtures, isStaff, staff.docs, clientDocs.data],
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
      if (!docId && !resourceId) return;
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
          return;
        }
        if (!resourceId) return;
        const row = rows.find((item) => item.id === resourceId);
        const allowed = Boolean(row) && (isStaff || (row?.publishToWarehaus !== false && !row?.syncHidden));
        if (!allowed || !row) {
          unavailable(resourceId);
          return;
        }
        openDetail({
          id: row.id,
          title: row.name,
          subtitle: row.type ?? 'Resource',
          body: (
            <div className="flex flex-col gap-2">
              <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>{row.description ?? '—'}</p>
              <p style={{ fontSize: 'var(--t-sm)' }}>Type {row.type ?? '—'}</p>
              <p style={{ fontSize: 'var(--t-sm)' }}>Project {row.projectName ?? '—'}</p>
              {isStaff && row.publishToWarehaus != null ? <PublishChip published={row.publishToWarehaus} /> : null}
            </div>
          ),
        });
      }, 0);
    };
    openFromLocation();
    window.addEventListener('wh-portal-nav', openFromLocation);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('wh-portal-nav', openFromLocation);
    };
  }, [docs, rows, isStaff, openDetail, pathname, fixtures, clientDocs.loading]);

  return (
    <PortalWorkspace eyebrow={tenantEyebrow(data.tenant, 'Resources')} title={title}>
      <PortalTilePane>
        <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto" data-testid="resources-list">
          {error || staff.resourcesError ? (
            <p style={{ fontSize: 'var(--t-sm)', color: 'var(--danger)' }}>
              {isStaff ? error || staff.resourcesError : 'We could not load your resources'}
            </p>
          ) : null}
          <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>
            {isStaff
              ? 'Full notes stay in Notion. This list is the live Shared Resource fields.'
              : 'You only see what is shared with you. A recap, not a transcript.'}
          </p>
          {loading ? (
            <div className="flex flex-col gap-2" aria-busy="true">
              {[0, 1, 2].map((i) => (
                <div key={i} className="animate-pulse" style={{ height: 56, borderRadius: 12, background: 'var(--bg)' }} />
              ))}
            </div>
          ) : visible.length === 0 ? (
            <Surface style={{ padding: 'var(--s-5)' }}>
              <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>
                {isStaff ? 'No resources match these filters.' : 'Nothing shared yet.'}
              </p>
            </Surface>
          ) : (
            visible.map((row) => (
              <button
                key={row.id}
                type="button"
                className="text-left"
                onClick={() =>
                  openDetail({
                    id: row.id,
                    title: row.name,
                    subtitle: row.type ?? 'Resource',
                    body: (
                      <div className="flex flex-col gap-2">
                        <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>
                          {row.description ?? '—'}
                        </p>
                        <p style={{ fontSize: 'var(--t-sm)' }}>Type {row.type ?? '—'}</p>
                        <p style={{ fontSize: 'var(--t-sm)' }}>Project {row.projectName ?? '—'}</p>
                        {isStaff && row.publishToWarehaus != null ? (
                          <PublishChip published={row.publishToWarehaus} />
                        ) : null}
                        <SyncChip audience={isStaff ? 'staff' : 'client'} notionPageId={row.notionPageId} syncHidden={row.syncHidden} />
                        {isStaff && !fixtures ? (
                          <UsedInTasks
                            resourceId={row.id}
                            hostSlug={hostSlug}
                            onOpenTask={(taskId) => {
                              window.location.assign(`/tasks/${taskId}`);
                            }}
                          />
                        ) : null}
                        {row.url ? (
                          <a href={row.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>
                            Open
                          </a>
                        ) : null}
                      </div>
                    ),
                  })
                }
              >
                <Surface style={{ padding: 'var(--s-4)' }}>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 style={{ fontSize: 'var(--t-md)', fontWeight: 600, overflowWrap: 'anywhere' }}>{row.name}</h3>
                    {row.type ? <Pill>{row.type}</Pill> : null}
                    {isStaff && row.publishToWarehaus != null ? (
                      <PublishChip published={row.publishToWarehaus} />
                    ) : null}
                    <SyncChip audience={isStaff ? 'staff' : 'client'} notionPageId={row.notionPageId} syncHidden={row.syncHidden} />
                  </div>
                  <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)', marginTop: 6 }}>
                    {row.projectName ?? '—'}
                    {row.description ? ` · ${row.description}` : ''}
                  </p>
                </Surface>
              </button>
            ))
          )}
        </div>
      </PortalTilePane>
    </PortalWorkspace>
  );
}

function UsedInTasks({
  resourceId,
  hostSlug,
  onOpenTask,
}: {
  resourceId: string;
  hostSlug?: string;
  onOpenTask: (taskId: string) => void;
}) {
  const rows = useSafeQuery<Array<{ id: string; name: string; status: string; stage: string | null }>>(
    api.sharedResources.usedInTasks,
    { hostSlug, resourceId: resourceId as Id<'sharedResources'> },
  );
  return (
    <section className="mt-3">
      <h3 className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>USED IN TASKS</h3>
      {rows.loading ? <p style={{ color: 'var(--muted)', fontSize: 'var(--t-sm)' }}>Loading tasks…</p> : null}
      {!rows.loading && (rows.data ?? []).length === 0 ? (
        <p style={{ color: 'var(--muted)', fontSize: 'var(--t-sm)' }}>Not used in any task yet.</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-2">
          {(rows.data ?? []).map((task) => (
            <li key={task.id}>
              <button type="button" onClick={() => onOpenTask(task.id)} className="text-left" style={{ color: 'var(--fg)' }}>
                {task.name}
                <span className="ds-mono" style={{ marginLeft: 8, color: 'var(--muted)', fontSize: 'var(--t-xs)' }}>
                  {task.stage ?? 'No stage'} · {task.status}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
