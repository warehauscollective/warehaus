'use client';

import { useLayoutEffect, useMemo, useState } from 'react';
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
  EMPTY_OUTBOX,
  OUTBOX_HEALTH_LIMIT,
  type DashboardActivity,
  type DashboardNotice,
  type DashboardProject,
  type DashboardTask,
  type OutboxHealth,
  type PullMeta,
} from '@/lib/data/dashboard';
import { NewTaskControl } from '@/components/tasks/NewTaskControl';
import { DashboardHome, type DashPreview } from '@/components/pages/DashboardHome';
import { useStaffJoinedWelcome, type StaffJoined } from '@/lib/staffJoined';

type SyncHealthPayload = {
  pull: PullMeta;
  writebackEnabled: boolean;
  outbox: OutboxHealth;
  notices: DashboardNotice[];
  granola?: {
    configured: boolean;
    lastRunAt: string | null;
    lastError: string | null;
  };
};

function useDashPreview(fixtures: boolean): DashPreview {
  const [preview, setPreview] = useState<DashPreview>(null);
  useLayoutEffect(() => {
    if (!fixtures) return;
    const value = new URLSearchParams(window.location.search).get('dash');
    if (
      value === 'empty' ||
      value === 'loading' ||
      value === 'error' ||
      value === 'long' ||
      value === 'capped' ||
      value === 'blank'
    ) {
      setPreview(value);
    }
  }, [fixtures]);
  return preview;
}

function useJoinedFixture(fixtures: boolean): StaffJoined | null {
  const saved = useStaffJoinedWelcome();
  const [forced, setForced] = useState<StaffJoined | null>(null);
  useLayoutEffect(() => {
    if (!fixtures) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('joined') !== '1') return;
    setForced({
      name: params.get('name')?.trim() || 'Jordan Blake',
      passwordSet: params.get('passwordSet') !== '0',
      inviterName: 'Peter Roquemore',
    });
  }, [fixtures]);
  return forced ?? saved;
}

export function PortalHomeContent() {
  const { sectionFor, openDetail } = usePortalView();
  const { data, loading, error } = usePortalData();
  const { portalSession } = usePortalAuth();
  const fixtures = useFixturePreview();
  const joined = useJoinedFixture(fixtures);
  const configured = isConvexConfigured();
  const isStaff = Boolean(portalSession?.isStaff);
  const hostSlug = typeof window !== 'undefined' ? getHostSlugFromLocation() ?? undefined : undefined;
  const staff = useStaffCrossOrg(configured && isStaff && !fixtures, hostSlug);
  const preview = useDashPreview(fixtures);
  const feed = useActivityFeed();

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

  const blank = preview === 'blank';
  const projects = (
    blank
      ? []
      : fixtures
        ? isStaff
          ? FIXTURE_PROJECTS
          : data.projects
        : isStaff && staff.projects
          ? staff.projects
          : data.projects
  ) as DashboardProject[];
  const tasks = (
    blank ? [] : fixtures ? (isStaff ? FIXTURE_TASKS : data.tasks) : isStaff && staff.tasks ? staff.tasks : data.tasks
  ) as DashboardTask[];

  const capped = preview === 'capped' && isStaff;
  const model = useMemo(
    () =>
      buildDashboard({
        audience: isStaff ? 'staff' : 'client',
        projects,
        tasks,
        activity: (blank ? [] : feed.items) as DashboardActivity[],
        pull: isStaff
          ? liveSync.data?.pull ?? {
              // getSyncHealth loads after the snapshot. Until it arrives, the
              // pull line falls back to syncMeta so the card is not blank.
              lastSyncedAt: data.syncMeta.lastSyncedAt,
              lastError: data.syncMeta.lastError,
            }
          : { lastSyncedAt: null, lastError: null },
        outbox: capped
          ? {
              counts: {
                queued: OUTBOX_HEALTH_LIMIT,
                inflight: 0,
                failed: OUTBOX_HEALTH_LIMIT,
                dead: 0,
                conflict: 0,
              },
              oldestCreatedAt: Date.now(),
            }
          : isStaff
            ? liveSync.data?.outbox ?? EMPTY_OUTBOX
            : EMPTY_OUTBOX,
        writebackEnabled: capped || (isStaff && liveSync.data?.writebackEnabled === true),
        notices: isStaff ? liveSync.data?.notices ?? [] : [],
        ...(isStaff
          ? {
              granola: liveSync.data?.granola ?? {
                configured: false,
                lastRunAt: null,
                lastError: null,
              },
            }
          : {}),
        now: Date.now(),
      }),
    [isStaff, projects, tasks, feed.items, liveSync.data, data.syncMeta.lastSyncedAt, data.syncMeta.lastError, capped],
  );

  const projectsLoading = blank
    ? false
    : loading || feed.loading || (isStaff && !fixtures && staff.projectsLoading && projects.length === 0);
  const eyebrow =
    joined || blank
      ? '● PORTAL · DASHBOARD'
      : isStaff
        ? tenantEyebrow(data.tenant, 'Dashboard')
        : `● ${data.tenant.clientName ?? 'Portal'} · Dashboard`;
  const taskProject = projects.find((project) => !project.internal)?.name ?? 'Dashboard';
  const staffProjects = (staff.projects ?? []) as Array<{
    name: string;
    internal?: boolean;
    orgId?: string;
    notionPageId?: string | null;
  }>;
  const taskTarget =
    staffProjects.find((project) => !project.internal && project.orgId && project.notionPageId) ??
    staffProjects.find((project) => project.orgId && project.notionPageId);

  return (
    <PortalWorkspace
      eyebrow={eyebrow}
      title="Dashboard"
      actions={
        isStaff && !joined && !blank ? (
          <NewTaskControl
            projectName={taskTarget?.name ?? taskProject}
            writebackEnabled={liveSync.data?.writebackEnabled === true}
            orgId={taskTarget?.orgId ?? null}
            projectNotionId={taskTarget?.notionPageId ?? null}
            hostSlug={hostSlug}
          />
        ) : undefined
      }
    >
      <PortalTilePane>
        <DashboardHome
          model={model}
          focus={focus}
          loading={projectsLoading}
          preview={preview}
          showLoadError={!isStaff && Boolean(error)}
          clientName={isStaff ? null : data.tenant.clientName}
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
          joined={joined}
        />
      </PortalTilePane>
    </PortalWorkspace>
  );
}
