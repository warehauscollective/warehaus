'use client';

import { useMemo } from 'react';
import { PortalTilePane, PortalWorkspace } from '@/components/layout/PortalWorkspace';
import { usePortalView } from '@/components/providers/PortalViewProvider';
import { tenantEyebrow, usePortalData } from '@/hooks/usePortalData';
import { usePortalAuth } from '@/hooks/usePortalAuth';
import { getHostSlugFromLocation } from '@/lib/auth/host-slug';
import { buildDashboard } from '@/lib/data/dashboard';
import { useHomePage } from '@/lib/data/homePage';
import { NewTaskControl } from '@/components/tasks/NewTaskControl';
import { DashboardHome } from '@/components/pages/DashboardHome';

export function PortalHomeContent() {
  const { sectionFor } = usePortalView();
  const { data, loading, error } = usePortalData();
  const { portalSession } = usePortalAuth();
  const isStaff = Boolean(portalSession?.isStaff);
  const hostSlug = typeof window !== 'undefined' ? getHostSlugFromLocation() ?? undefined : undefined;
  const page = useHomePage({ isStaff, hostSlug, snapshot: data, snapshotLoading: loading });
  const { preview, joined } = page;

  const section = sectionFor('dashboard');
  const focus =
    section === 'sync-health' && isStaff
      ? 'sync'
      : section === 'awaiting-go' || section === 'needs-attention'
        ? 'awaiting'
        : section === 'updates'
          ? 'activity'
          : 'all';

  const blank = preview === 'blank';
  const model = useMemo(
    () => buildDashboard({ ...page.dashboard, audience: isStaff ? 'staff' : 'client', now: Date.now() }),
    [isStaff, page.dashboard],
  );

  const eyebrow =
    joined || blank
      ? '● PORTAL · DASHBOARD'
      : isStaff
        ? tenantEyebrow(data.tenant, 'Dashboard')
        : `● ${data.tenant.clientName ?? 'Portal'} · Dashboard`;
  return (
    <PortalWorkspace
      eyebrow={eyebrow}
      title="Dashboard"
      actions={
        isStaff && !joined && !blank ? (
          <NewTaskControl
            projects={page.newTask.projects}
            writebackEnabled={page.newTask.writebackEnabled}
            hostSlug={hostSlug}
          />
        ) : undefined
      }
    >
      <PortalTilePane>
        <DashboardHome
          model={model}
          focus={focus}
          loading={page.loading}
          preview={preview}
          showLoadError={!isStaff && Boolean(error)}
          clientName={isStaff ? null : data.tenant.clientName}
          joined={joined}
        />
      </PortalTilePane>
    </PortalWorkspace>
  );
}
