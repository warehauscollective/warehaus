'use client';

import { useEffect, useRef, useState } from 'react';
import { useAction, useMutation } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import {
  readTaskPlatform,
  taskPlatformStatus,
  type LinearOrgRead,
  type TaskPlatform,
  type TaskPlatformView,
} from '@warehaus/portal-sync';
import { useSafeQuery } from '@/hooks/useSafeQuery';
import { isMissingConvexFunction } from '@/lib/data/staffRoster';
import { loadSharedLinearRead } from '@/lib/data/linearRead';
import { portalTaskFromLinear, type PortalTask } from '@/lib/data/view-models';
import type { TaskPlatformPanelModel } from './TaskPlatformSetting';

const SAVE_ERROR = 'Could not save the task platform. Try again.';
const MISSING_ERROR = 'Task platform is not on this deployment yet.';

function viewFor(platform: TaskPlatform, canChange: boolean): TaskPlatformView {
  const read = readTaskPlatform({ platform, tasks: [], env: {} });
  return {
    platform: read.platform,
    canChange,
    tasks: taskPlatformStatus(read.tasks),
    milestones: taskPlatformStatus(read.milestones),
  };
}

export function useClientTaskPlatform(input: {
  live: boolean;
  fixtures: boolean;
  hostSlug?: string;
  mode: 'staff' | 'client' | 'off';
  clientId: string | null;
}): { panel: TaskPlatformPanelModel | null; linearTasks: PortalTask[] | null } {
  const { live, fixtures, hostSlug, mode, clientId } = input;
  const mine = useSafeQuery<TaskPlatformView>(
    api.clients.getMyTaskPlatform,
    live && mode === 'client' ? { hostSlug } : 'skip',
  );
  const selected = useSafeQuery<TaskPlatformView>(
    api.clients.getTaskPlatform,
    live && mode === 'staff' && clientId ? { orgId: clientId as Id<'clients'>, hostSlug } : 'skip',
  );
  const save = useMutation(api.clients.setTaskPlatform);
  const readLinear = useAction(api.taskPlatform.readForOrg);
  const readLinearRef = useRef(readLinear);
  readLinearRef.current = readLinear;
  const remote = mode === 'staff' ? selected : mine;
  const [fixturePlatform, setFixturePlatform] = useState<TaskPlatform>('notion');
  const [pending, setPending] = useState<TaskPlatform | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linear, setLinear] = useState<LinearOrgRead | null>(null);
  const server = remote.data;
  const shouldRead =
    live &&
    !fixtures &&
    server?.platform === 'linear' &&
    server.tasks.ok === false &&
    server.tasks.reason === 'remote' &&
    (mode === 'client' || (mode === 'staff' && Boolean(clientId)));

  useEffect(() => {
    if (pending && remote.data?.platform === pending) setPending(null);
  }, [pending, remote.data?.platform]);

  useEffect(() => {
    if (!shouldRead) {
      setLinear(null);
      return;
    }
    let cancel = false;
    const cacheKey =
      mode === 'staff' ? `staff:${clientId}:${hostSlug ?? ''}` : `signed-in:${hostSlug ?? ''}`;
    void loadSharedLinearRead(cacheKey, () =>
      readLinearRef.current(
        mode === 'staff' ? { hostSlug, orgId: clientId as Id<'clients'> } : { hostSlug },
      ),
    )
      .then((result) => {
        if (!cancel) setLinear(result);
      })
      .catch(() => {
        if (!cancel) setLinear({ ok: false, platform: 'linear', reason: 'unavailable' });
      });
    return () => {
      cancel = true;
    };
  }, [shouldRead, mode, clientId, hostSlug]);

  if (mode === 'off') return { panel: null, linearTasks: null };
  if (fixtures) {
    const view = viewFor(fixturePlatform, mode === 'staff');
    return {
      panel: {
        ...view,
        saving: false,
        error: null,
        onChange:
          mode === 'staff'
            ? (next) => {
                setFixturePlatform(next);
              }
            : undefined,
      },
      linearTasks: null,
    };
  }
  if (!live) return { panel: null, linearTasks: null };
  if (remote.loading && !remote.data && !pending) return { panel: null, linearTasks: null };

  const missing = isMissingConvexFunction(remote.error);
  const stored = remote.data ?? viewFor('notion', mode === 'staff');
  const platform = pending ?? stored.platform;
  const shown = pending && stored.platform !== pending ? viewFor(pending, mode === 'staff') : stored;
  const fresh =
    linear && linear.ok && linear.platform === 'linear' && (mode !== 'staff' || linear.orgId === clientId)
      ? linear
      : linear && !linear.ok
        ? linear
        : null;
  const tasks = fresh
    ? fresh.ok && fresh.platform === 'linear'
      ? { ok: true as const, platform: 'linear' as const, count: fresh.tasks.length }
      : fresh.ok
        ? shown.tasks
        : fresh.reason === 'not-configured'
          ? { ok: false as const, platform: 'linear' as const, reason: 'not-configured' as const, env: 'LINEAR_API_KEY' as const }
          : { ok: false as const, platform: 'linear' as const, reason: 'unavailable' as const }
    : shown.tasks;
  const milestoneStatus = fresh
    ? fresh.ok && fresh.platform === 'linear'
      ? fresh.milestonesUnavailable
        ? { ok: false as const, platform: 'linear' as const, reason: 'unavailable' as const }
        : { ok: true as const, platform: 'linear' as const, count: fresh.milestones.length }
      : fresh.ok
        ? shown.milestones
        : fresh.reason === 'not-configured'
          ? { ok: false as const, platform: 'linear' as const, reason: 'not-configured' as const, env: 'LINEAR_API_KEY' as const }
          : { ok: false as const, platform: 'linear' as const, reason: 'unavailable' as const }
    : shown.milestones;
  const linearTasks =
    fresh && fresh.ok && fresh.platform === 'linear' ? fresh.tasks.map(portalTaskFromLinear) : null;

  return {
    panel: {
      platform,
      tasks,
      milestones: milestoneStatus,
      canChange: mode === 'staff',
      saving,
      error: error ?? (remote.error && !missing ? 'Could not load the task platform.' : null),
      milestonesRead:
        fresh && fresh.ok && fresh.platform === 'linear' && !fresh.milestonesUnavailable
          ? fresh.milestones
          : null,
      milestonesUnavailable: Boolean(
        fresh && fresh.ok && fresh.platform === 'linear' && fresh.milestonesUnavailable,
      ),
      onChange:
        mode === 'staff'
          ? (next) => {
              if (!clientId || next === platform) return;
              if (missing) {
                setError(MISSING_ERROR);
                return;
              }
              setSaving(true);
              setError(null);
              setPending(next);
              void save({ orgId: clientId as Id<'clients'>, platform: next, hostSlug })
                .catch(() => {
                  setPending(null);
                  setError(SAVE_ERROR);
                })
                .finally(() => setSaving(false));
            }
          : undefined,
    },
    linearTasks,
  };
}
