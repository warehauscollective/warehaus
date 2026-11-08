/**
 * One read path for tasks and milestones.
 * Notion and Linear implement the same interface.
 * The sync preview in this file does not call either network.
 * Linear's readTasks and readMilestones fetch only when LINEAR_API_KEY is set.
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
      /** Key is set. This sync preview did not fetch. Call the async Linear read. */
      reason: 'remote';
    }
  | {
      ok: false;
      platform: 'linear';
      reason: 'unavailable';
    };

/** Issue fields the portal task board can show. Linear ids are not Warehaus ids. */
export type PlatformTaskRead = {
  id: string;
  name: string;
  status: string;
  isDone: boolean;
  date: string | null;
  stage: null;
  lastEditedTime: string | null;
  projectId: string | null;
  projectName: string | null;
  projectStatus: null;
  projectEndDate: null;
  description: string | null;
};

export type LinearTaskRead = PlatformTaskRead & {
  orgId: string;
  source: 'linear';
};

export type LinearOrgRead =
  | {
      ok: true;
      platform: 'linear';
      orgId: string;
      tasks: LinearTaskRead[];
      milestones: MilestoneSeam[];
      milestonesUnavailable: boolean;
    }
  | {
      ok: true;
      platform: 'notion';
      tasks: [];
      milestones: [];
      milestonesUnavailable: false;
    }
  | {
      ok: false;
      platform: 'linear';
      reason: 'not-configured';
      env: typeof LINEAR_API_KEY_ENV;
    }
  | {
      ok: false;
      platform: 'linear';
      reason: 'unavailable';
    };

export type LinearIo = {
  fetch?: typeof fetch;
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
  readTasks<T>(
    tasks: readonly T[],
    env: TaskPlatformEnv,
    io?: LinearIo,
  ): PlatformRead<T> | Promise<PlatformRead<PlatformTaskRead>>;
  readMilestones(
    env: TaskPlatformEnv,
    io?: LinearIo,
  ): PlatformRead<MilestoneSeam> | Promise<PlatformRead<MilestoneSeam>>;
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

/** Sync preview. Linear with a key returns remote and does not fetch. */
export function linearSyncMiss(env: TaskPlatformEnv): PlatformMiss {
  if (!linearApiKey(env)) {
    return { ok: false, platform: 'linear', reason: 'not-configured', env: LINEAR_API_KEY_ENV };
  }
  return { ok: false, platform: 'linear', reason: 'remote' };
}

export function readTaskPlatform<T>(input: {
  platform: unknown;
  tasks: readonly T[];
  env: TaskPlatformEnv;
}): TaskPlatformRead<T> {
  const platform = storedTaskPlatform(input.platform);
  if (platform === 'linear') {
    const miss = linearSyncMiss(input.env);
    return { platform, tasks: miss, milestones: miss };
  }
  const adapter = adapterFor(platform);
  const tasks = adapter.readTasks(input.tasks, input.env);
  const milestones = adapter.readMilestones(input.env);
  if (tasks instanceof Promise || milestones instanceof Promise) {
    throw new Error('Task platform preview must not fetch');
  }
  return { platform, tasks, milestones };
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
  if (read.tasks.reason === 'unavailable') return 'Linear could not be read';
  return 'This client reads tasks from Linear';
}

export function taskPlatformCopy(
  view: Pick<TaskPlatformView, 'platform' | 'tasks'>,
  audience: 'staff' | 'client',
): { title: string; body: string } {
  const staff = audience === 'staff';
  if (view.platform === 'notion') {
    return {
      title: 'Notion',
      body: staff
        ? 'Tasks and milestones for this client are read from Notion. No milestones are stored yet. Changing this leaves Notion tasks as they are.'
        : 'Your tasks are read from Notion. No milestones are stored yet. Only Warehaus staff can change this.',
    };
  }
  if (view.tasks.ok) {
    return {
      title: 'Linear',
      body: staff
        ? 'Tasks for this client are read from Linear. Notion tasks stay stored. Changing this leaves Notion tasks as they are.'
        : 'Your tasks are read from Linear. Notion tasks are still stored. Only Warehaus staff can change this.',
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
  if (view.tasks.reason === 'unavailable') {
    return {
      title: 'Linear',
      body: staff
        ? 'Linear could not be read. Notion tasks stay stored and are left out of this read.'
        : 'Linear could not be read, so tasks and milestones are not shown. Notion tasks are still stored. Only Warehaus staff can change this.',
    };
  }
  return {
    title: 'Linear',
    body: staff
      ? 'LINEAR_API_KEY is set. Tasks load from Linear. Notion tasks stay stored.'
      : 'Your tasks are read from Linear. Notion tasks are still stored. Only Warehaus staff can change this.',
  };
}
