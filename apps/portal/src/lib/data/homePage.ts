'use client';

/**
 * Dashboard page data. One interface, two adapters:
 *
 * - live: the snapshot, staff cross-org reads, sync health and the activity feed
 * - fixture: the fixture snapshot and rows, plus the `?dash=` and `?joined=`
 *   design-review screens
 *
 * The page picks neither. `useHomePage` reads the fixture flag once and returns
 * the dashboard inputs, so the page only builds the model and renders it.
 */

import { useLayoutEffect, useMemo, useState } from 'react';
import { api } from '@convex/_generated/api';
import { useFixturePreview } from '@/components/providers/FixturePreviewProvider';
import type { DashPreview } from '@/components/pages/DashboardHome';
import { useActivityFeed } from '@/hooks/useActivityFeed';
import { useSafeQuery } from '@/hooks/useSafeQuery';
import { useStaffCrossOrg } from '@/hooks/useStaffCrossOrg';
import { isConvexConfigured } from '@/lib/convex/client';
import {
  EMPTY_OUTBOX,
  GRANOLA_NOT_CONFIGURED,
  OUTBOX_HEALTH_LIMIT,
  type DashboardActivity,
  type DashboardInput,
  type DashboardNotice,
  type DashboardProject,
  type DashboardTask,
  type OutboxHealth,
  type PullMeta,
} from '@/lib/data/dashboard';
import { FIXTURE_PROJECTS, FIXTURE_TASKS } from '@/lib/data/fixtures';
import { useFixtureParam } from '@/lib/data/fixtureParam';
import type { PortalSnapshot } from '@/lib/data/view-models';
import { useStaffJoinedWelcome, type StaffJoined } from '@/lib/staffJoined';

export const DASH_PREVIEWS = ['empty', 'loading', 'error', 'long', 'capped', 'blank'] as const;

export type SyncHealthPayload = {
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

/** A project the staff New task control can file into. */
export type TaskProjectOption = { id: string; name: string; orgId: string; notionPageId: string };

/** Everything `buildDashboard` needs except the audience and the clock. */
export type HomeDashboardData = Omit<DashboardInput, 'audience' | 'now'>;

export type HomePage = {
  dashboard: HomeDashboardData;
  loading: boolean;
  /** Design-review screen. Always null on a live page. */
  preview: DashPreview;
  /** Welcome card after a staff invite was accepted. */
  joined: StaffJoined | null;
  newTask: { projects: TaskProjectOption[]; writebackEnabled: boolean };
};

type Snapshot = Pick<PortalSnapshot, 'projects' | 'tasks' | 'syncMeta'>;

const NO_PULL: PullMeta = { lastSyncedAt: null, lastError: null };

/** Fixture adapter. Pure, so tests can read it without React. */
export function fixtureHomePage(input: {
  isStaff: boolean;
  preview: DashPreview;
  snapshot: Snapshot;
  activity: readonly DashboardActivity[];
  loading: boolean;
  joined?: StaffJoined | null;
}): HomePage {
  const { isStaff, preview, snapshot } = input;
  const blank = preview === 'blank';
  const capped = preview === 'capped' && isStaff;
  const cappedOutbox: OutboxHealth = {
    counts: { queued: OUTBOX_HEALTH_LIMIT, inflight: 0, failed: OUTBOX_HEALTH_LIMIT, dead: 0, conflict: 0 },
    oldestCreatedAt: Date.now(),
  };
  return {
    dashboard: {
      projects: blank ? [] : ((isStaff ? FIXTURE_PROJECTS : snapshot.projects) as DashboardProject[]),
      tasks: blank ? [] : ((isStaff ? FIXTURE_TASKS : snapshot.tasks) as DashboardTask[]),
      activity: blank ? [] : input.activity,
      pull: blank || !isStaff ? NO_PULL : { lastSyncedAt: snapshot.syncMeta.lastSyncedAt, lastError: snapshot.syncMeta.lastError },
      outbox: blank ? EMPTY_OUTBOX : capped ? cappedOutbox : EMPTY_OUTBOX,
      writebackEnabled: !blank && capped,
      notices: [],
      ...(isStaff ? { granola: GRANOLA_NOT_CONFIGURED } : {}),
    },
    loading: blank ? false : input.loading,
    preview,
    joined: input.joined ?? null,
    newTask: { projects: [], writebackEnabled: false },
  };
}

/** Live dashboard inputs. Pure, so tests can read it without React. */
export function liveHomeDashboard(input: {
  isStaff: boolean;
  snapshot: Snapshot;
  staffProjects: readonly unknown[] | undefined;
  staffTasks: readonly unknown[] | undefined;
  sync: SyncHealthPayload | undefined;
  activity: readonly DashboardActivity[];
}): HomeDashboardData {
  const { isStaff, snapshot, sync } = input;
  return {
    projects: (isStaff && input.staffProjects ? input.staffProjects : snapshot.projects) as DashboardProject[],
    tasks: (isStaff && input.staffTasks ? input.staffTasks : snapshot.tasks) as DashboardTask[],
    activity: input.activity,
    // getSyncHealth loads after the snapshot. Until it arrives, the pull line
    // falls back to syncMeta so the card is not blank.
    pull: isStaff
      ? sync?.pull ?? { lastSyncedAt: snapshot.syncMeta.lastSyncedAt, lastError: snapshot.syncMeta.lastError }
      : NO_PULL,
    outbox: isStaff ? sync?.outbox ?? EMPTY_OUTBOX : EMPTY_OUTBOX,
    writebackEnabled: isStaff && sync?.writebackEnabled === true,
    notices: isStaff ? sync?.notices ?? [] : [],
    ...(isStaff ? { granola: sync?.granola ?? GRANOLA_NOT_CONFIGURED } : {}),
  };
}

function taskProjectOptions(rows: readonly unknown[] | undefined): TaskProjectOption[] {
  return ((rows ?? []) as Array<{ id: string; name: string; orgId?: string; notionPageId?: string | null }>).flatMap(
    (project) =>
      project.orgId && project.notionPageId
        ? [{ id: project.id, name: project.name, orgId: project.orgId, notionPageId: project.notionPageId }]
        : [],
  );
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

type Input = {
  isStaff: boolean;
  hostSlug: string | undefined;
  /** From the page's `usePortalData()`. */
  snapshot: PortalSnapshot;
  snapshotLoading: boolean;
};

/** The page's one data seam. Fixture mode is read here and nowhere else on the page. */
export function useHomePage({ isStaff, hostSlug, snapshot, snapshotLoading }: Input): HomePage {
  const fixtures = useFixturePreview();
  const preview = useFixtureParam(fixtures, 'dash', DASH_PREVIEWS);
  const joined = useJoinedFixture(fixtures);
  const feed = useActivityFeed();
  const live = !fixtures && isConvexConfigured() && isStaff;
  const staff = useStaffCrossOrg(live, hostSlug);
  const sync = useSafeQuery<SyncHealthPayload>(
    api.portalData.getSyncHealth,
    live && snapshot.tenant.ok ? { hostSlug } : 'skip',
  );
  const { projects, tasks, syncMeta } = snapshot;

  const fixturePage = useMemo(
    () =>
      fixtures
        ? fixtureHomePage({
            isStaff,
            preview,
            snapshot: { projects, tasks, syncMeta },
            activity: feed.items as DashboardActivity[],
            loading: snapshotLoading || feed.loading,
            joined,
          })
        : null,
    [fixtures, isStaff, preview, projects, tasks, syncMeta, feed.items, feed.loading, snapshotLoading, joined],
  );
  const liveDashboard = useMemo(
    () =>
      liveHomeDashboard({
        isStaff,
        snapshot: { projects, tasks, syncMeta },
        staffProjects: staff.projects,
        staffTasks: staff.tasks,
        sync: sync.data,
        activity: feed.items as DashboardActivity[],
      }),
    [isStaff, projects, tasks, syncMeta, staff.projects, staff.tasks, sync.data, feed.items],
  );
  const newTaskProjects = useMemo(() => taskProjectOptions(staff.projects), [staff.projects]);

  if (fixturePage) return fixturePage;
  return {
    dashboard: liveDashboard,
    loading:
      snapshotLoading || feed.loading || (isStaff && staff.projectsLoading && liveDashboard.projects.length === 0),
    preview: null,
    joined,
    newTask: { projects: newTaskProjects, writebackEnabled: sync.data?.writebackEnabled === true },
  };
}
