'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@convex/_generated/api';
import { useSafeQuery } from '@/hooks/useSafeQuery';
import { PortalTilePane, PortalWorkspace } from '@/components/layout/PortalWorkspace';
import { usePortalView } from '@/components/providers/PortalViewProvider';
import { tenantEyebrow, usePortalData } from '@/hooks/usePortalData';
import { useActivityFeed } from '@/hooks/useActivityFeed';
import { usePortalAuth } from '@/hooks/usePortalAuth';
import { useFixturePreview } from '@/components/providers/FixturePreviewProvider';
import { useStaffCrossOrg } from '@/hooks/useStaffCrossOrg';
import { getHostSlugFromLocation } from '@/lib/auth/host-slug';
import { isConvexConfigured } from '@/lib/convex/client';
import { FIXTURE_PROJECTS, FIXTURE_TASKS } from '@/lib/data/fixtures';
import {
  buildDashboard,
  type DashboardActivity,
  type DashboardNotice,
  type DashboardProject,
  type DashboardTask,
  type OutboxRow,
  type PullMeta,
} from '@/lib/data/dashboard';
import type { PortalBillingSummary } from '@/lib/data/view-models';
import { NewTaskControl } from '@/components/tasks/NewTaskControl';
import { DashboardHome, type DashPreview } from '@/components/pages/DashboardHome';

type SyncHealthPayload = {
  pull: PullMeta;
  writebackEnabled: boolean;
  outbox: OutboxRow[];
  notices: DashboardNotice[];
};

function useDashPreview(fixtures: boolean): DashPreview {
  const [preview, setPreview] = useState<DashPreview>(null);
  useEffect(() => {
    if (!fixtures) return;
    const value = new URLSearchParams(window.location.search).get('dash');
    if (value === 'empty' || value === 'loading' || value === 'error' || value === 'long') {
      setPreview(value);
    }
  }, [fixtures]);
  return preview;
}

export function PortalHomeContent() {
  const { sectionFor, openDetail } = usePortalView();
  const { data, loading, error } = usePortalData();
  const { portalSession } = usePortalAuth();
  const fixtures = useFixturePreview();
  const configured = isConvexConfigured();
  const isStaff = Boolean(portalSession?.isStaff);
  const hostSlug = typeof window !== 'undefined' ? getHostSlugFromLocation() ?? undefined : undefined;
  const staff = useStaffCrossOrg(configured && isStaff && !fixtures, hostSlug);
  const preview = useDashPreview(fixtures);
  const feed = useActivityFeed();

  // Billing stays loaded for this screen. The rail is not part of the dashboard.
  const billingState = useSafeQuery<PortalBillingSummary>(
    api.billing.getSummary,
    configured && data.tenant.ok ? { hostSlug } : 'skip',
  );
  const billingSummary = billingState.data;

  const liveSync = useSafeQuery<SyncHealthPayload>(
    api.portalData.getSyncHealth,
    configured && isStaff && !fixtures && data.tenant.ok ? { hostSlug } : 'skip',
  );

  const section = sectionFor('dashboard');
  const focus =
    section === 'sync-health' && isStaff
      ? 'sync'
      : section === 'awaiting-go' || section === 'needs-attention'
        ? 'awaiting'
        : section === 'updates'
          ? 'activity'
          : 'all';

  const projects = (
    fixtures
      ? isStaff
        ? FIXTURE_PROJECTS
        : data.projects
      : isStaff && staff.projects
        ? staff.projects
        : data.projects
  ) as DashboardProject[];
  const tasks = (
    fixtures ? (isStaff ? FIXTURE_TASKS : data.tasks) : isStaff && staff.tasks ? staff.tasks : data.tasks
  ) as DashboardTask[];

  const model = useMemo(
    () =>
      buildDashboard({
        audience: isStaff ? 'staff' : 'client',
        projects,
        tasks,
        activity: feed.items as DashboardActivity[],
        pull: isStaff
          ? liveSync.data?.pull ?? {
              lastSyncedAt: data.syncMeta.lastSyncedAt,
              lastError: data.syncMeta.lastError,
            }
          : { lastSyncedAt: null, lastError: null },
        outbox: isStaff ? liveSync.data?.outbox ?? [] : [],
        writebackEnabled: isStaff && liveSync.data?.writebackEnabled === true,
        notices: isStaff ? liveSync.data?.notices ?? [] : [],
        now: Date.now(),
      }),
    [isStaff, projects, tasks, feed.items, liveSync.data, data.syncMeta.lastSyncedAt, data.syncMeta.lastError],
  );

  const projectsLoading =
    loading || feed.loading || (isStaff && !fixtures && staff.projectsLoading && projects.length === 0);
  const eyebrow = isStaff
    ? tenantEyebrow(data.tenant, 'Dashboard')
    : `● ${data.tenant.clientName ?? 'Portal'} · Dashboard`;
  const taskProject = projects.find((project) => !project.internal)?.name ?? 'Dashboard';

  return (
    <PortalWorkspace
      eyebrow={eyebrow}
      title="Dashboard"
      actions={isStaff ? <NewTaskControl projectName={taskProject} /> : undefined}
    >
      <PortalTilePane>
        <DashboardHome
          model={model}
          focus={focus}
          loading={projectsLoading}
          preview={preview}
          showLoadError={!isStaff && Boolean(error)}
          billingMark={billingSummary?.hasBilling ? 'on-file' : 'none'}
          onOpenTask={(row) =>
            openDetail({
              id: row.id,
              title: row.name,
              subtitle: row.meta,
              body: (
                <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>
                  {row.stageLabel}
                  {row.status ? ` · ${row.status}` : ''}
                </p>
              ),
            })
          }
          onOpenProject={(row) =>
            openDetail({
              id: row.id,
              title: row.name,
              subtitle: row.brand,
              body: (
                <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>
                  {row.percentLabel} · {row.itemsLabel}
                </p>
              ),
            })
          }
        />
      </PortalTilePane>
    </PortalWorkspace>
  );
}
