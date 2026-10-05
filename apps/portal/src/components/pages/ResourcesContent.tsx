'use client';

import { Pill, Surface } from '@/components/ui/primitives';
import { PortalTilePane, PortalWorkspace } from '@/components/layout/PortalWorkspace';
import { usePortalView } from '@/components/providers/PortalViewProvider';
import { tenantEyebrow, usePortalData } from '@/hooks/usePortalData';
import { usePortalAuth } from '@/hooks/usePortalAuth';
import { getHostSlugFromLocation } from '@/lib/auth/host-slug';
import { isConvexConfigured } from '@/lib/convex/client';
import { FIXTURE_RESOURCES } from '@/lib/data/fixtures';
import { useFixturePreview } from '@/components/providers/FixturePreviewProvider';
import { useStaffCrossOrg } from '@/hooks/useStaffCrossOrg';
import { useSafeQuery } from '@/hooks/useSafeQuery';
import { api } from '@convex/_generated/api';
import { PublishChip, SyncChip } from '@/components/sync/SyncChip';

const SECTION_TITLE: Record<string, string> = {
  all: 'All resources',
  'meeting-notes': 'Meeting notes',
  'files-links': 'Files & links',
};

type ResourceRow = (typeof FIXTURE_RESOURCES)[number];

function isMeeting(type: string | null): boolean {
  return /meeting|recap|notes/i.test(type ?? '');
}

export function ResourcesContent() {
  const fixtures = useFixturePreview();
  const configured = isConvexConfigured();
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

  const rows = (
    fixtures ? FIXTURE_RESOURCES : isStaff ? staff.resources ?? [] : clientRows.data ?? []
  ) as ResourceRow[];
  const loading = !fixtures && (isStaff ? staff.resourcesLoading : clientRows.loading);
  const visible = rows.filter((row) => {
    if (activeSection === 'meeting-notes') return isMeeting(row.type);
    if (activeSection === 'files-links') return !isMeeting(row.type);
    return true;
  });

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
                        <SyncChip notionPageId={row.notionPageId} syncHidden={row.syncHidden} />
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
                    <SyncChip notionPageId={row.notionPageId} syncHidden={row.syncHidden} />
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
