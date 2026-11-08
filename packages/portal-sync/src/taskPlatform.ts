/**
 * One read path for tasks and milestones.
 * Notion and Linear implement the same interface.
 * This module does not call either network.
 */

import { linearTaskPlatform } from './linearTaskPlatform';
import { notionTaskPlatform } from './notionTaskPlatform';

export const TASK_PLATFORMS = ['notion', 'linear'] as const;
export type TaskPlatform = (typeof TASK_PLATFORMS)[number];

export const LINEAR_API_KEY_ENV = 'LINEAR_API_KEY' as const;

export type TaskPlatformEnv = {
  LINEAR_API_KEY?: string | undefined;
};

export type MilestoneWorkStatus = 'draft' | 'active' | 'ready';
export type MilestoneApproval = 'unreviewed' | 'approved' | 'changes_requested';

/**
 * Typed milestone the later slice can store.
 * One objective on one project. Goals are text. Approval is the human decision.
 * This slice does not persist it.
 */
export type MilestoneSeam = {
  id: string;
  projectId: string;
  name: string;
  objective: string;
  goals: readonly string[];
  workStatus: MilestoneWorkStatus;
  approval: MilestoneApproval;
};

export type PlatformHit<T> = {
  ok: true;
  platform: TaskPlatform;
  items: T[];
};

export type PlatformMiss =
  | {
      ok: false;
      platform: 'linear';
      reason: 'not-configured';
      env: typeof LINEAR_API_KEY_ENV;
    }
  | {
      ok: false;
      platform: 'linear';
      reason: 'not-wired';
    };

export type PlatformRead<T> = PlatformHit<T> | PlatformMiss;

export type TaskPlatformRead<T> = {
  platform: TaskPlatform;
  tasks: PlatformRead<T>;
  milestones: PlatformRead<MilestoneSeam>;
};

export type TaskPlatformStatus =
  | { ok: true; platform: TaskPlatform; count: number }
  | PlatformMiss;

export type TaskPlatformView = {
  platform: TaskPlatform;
  canChange: boolean;
  tasks: TaskPlatformStatus;
  milestones: TaskPlatformStatus;
};

export interface TaskPlatformAdapter {
  readonly platform: TaskPlatform;
  readTasks<T>(tasks: readonly T[], env: TaskPlatformEnv): PlatformRead<T>;
  readMilestones(env: TaskPlatformEnv): PlatformRead<MilestoneSeam>;
}

export function storedTaskPlatform(value: unknown): TaskPlatform {
  return value === 'linear' ? 'linear' : 'notion';
}

export function linearApiKey(env: TaskPlatformEnv): string | null {
  const raw = env.LINEAR_API_KEY;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function adapterFor(platform: TaskPlatform): TaskPlatformAdapter {
  return platform === 'linear' ? linearTaskPlatform : notionTaskPlatform;
}

export function readTaskPlatform<T>(input: {
  platform: unknown;
  tasks: readonly T[];
  env: TaskPlatformEnv;
}): TaskPlatformRead<T> {
  const platform = storedTaskPlatform(input.platform);
  const adapter = adapterFor(platform);
  return {
    platform,
    tasks: adapter.readTasks(input.tasks, input.env),
    milestones: adapter.readMilestones(input.env),
  };
}

export function taskPlatformStatus<T>(read: PlatformRead<T>): TaskPlatformStatus {
  if (read.ok) return { ok: true, platform: read.platform, count: read.items.length };
  return read;
}

export function toTaskPlatformView(input: {
  platform: unknown;
  tasks: readonly unknown[];
  canChange: boolean;
  env: TaskPlatformEnv;
}): TaskPlatformView {
  const read = readTaskPlatform(input);
  return {
    platform: read.platform,
    canChange: input.canChange,
    tasks: taskPlatformStatus(read.tasks),
    milestones: taskPlatformStatus(read.milestones),
  };
}

export function taskPlatformBlockedMessage(read: TaskPlatformRead<unknown>): string | null {
  if (read.tasks.ok) return null;
  if (read.tasks.reason === 'not-configured') return 'Linear is not configured';
  return 'Linear is not called in this version';
}

export function taskPlatformCopy(
  view: Pick<TaskPlatformView, 'platform' | 'tasks'>,
  audience: 'staff' | 'client',
): { title: string; body: string } {
  const staff = audience === 'staff';
  if (view.platform === 'notion' || view.tasks.ok) {
    return {
      title: 'Notion',
      body: staff
        ? 'Tasks and milestones for this client are read from Notion. No milestones are stored yet. Changing this leaves Notion tasks as they are.'
        : 'Your tasks are read from Notion. No milestones are stored yet. Only Warehaus staff can change this.',
    };
  }
  if (view.tasks.reason === 'not-configured') {
    return {
      title: 'Linear',
      body: staff
        ? 'Linear is not configured. LINEAR_API_KEY is unset, so Linear tasks and milestones are not loaded. Notion tasks stay stored and are left out of this read.'
        : 'Your tasks are set to Linear. Linear is not configured, so tasks and milestones are not shown. Notion tasks are still stored. Only Warehaus staff can change this.',
    };
  }
  return {
    title: 'Linear',
    body: staff
      ? 'LINEAR_API_KEY is set. This version does not call Linear, so Linear tasks and milestones are not loaded. Notion tasks stay stored.'
      : 'Your tasks are set to Linear. This version does not call Linear yet, so tasks and milestones are not shown. Only Warehaus staff can change this.',
  };
}
