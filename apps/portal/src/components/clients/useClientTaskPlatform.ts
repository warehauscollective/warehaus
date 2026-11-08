'use client';

import { useEffect, useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import {
  readTaskPlatform,
  taskPlatformStatus,
  type TaskPlatform,
  type TaskPlatformView,
} from '@warehaus/portal-sync';
import { useSafeQuery } from '@/hooks/useSafeQuery';
import { isMissingConvexFunction } from '@/lib/data/staffRoster';
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
}): { panel: TaskPlatformPanelModel | null } {
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
  const remote = mode === 'staff' ? selected : mine;
  const [fixturePlatform, setFixturePlatform] = useState<TaskPlatform>('notion');
  const [pending, setPending] = useState<TaskPlatform | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (pending && remote.data?.platform === pending) setPending(null);
  }, [pending, remote.data?.platform]);

  if (mode === 'off') return { panel: null };
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
    };
  }
  if (!live) return { panel: null };
  if (remote.loading && !remote.data && !pending) return { panel: null };

  const missing = isMissingConvexFunction(remote.error);
  const stored = remote.data ?? viewFor('notion', mode === 'staff');
  const platform = pending ?? stored.platform;
  const shown = pending && stored.platform !== pending ? viewFor(pending, mode === 'staff') : stored;

  return {
    panel: {
      platform,
      tasks: shown.tasks,
      milestones: shown.milestones,
      canChange: mode === 'staff',
      saving,
      error: error ?? (remote.error && !missing ? 'Could not load the task platform.' : null),
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
  };
}
