import type {
  MilestoneSeam,
  PlatformMiss,
  PlatformRead,
  TaskPlatformAdapter,
  TaskPlatformEnv,
} from './taskPlatform';

const LINEAR_API_KEY_ENV = 'LINEAR_API_KEY' as const;

function configuredKey(env: TaskPlatformEnv): string | null {
  const raw = env.LINEAR_API_KEY;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function linearMiss(env: TaskPlatformEnv): PlatformMiss {
  if (!configuredKey(env)) {
    return { ok: false, platform: 'linear', reason: 'not-configured', env: LINEAR_API_KEY_ENV };
  }
  return { ok: false, platform: 'linear', reason: 'not-wired' };
}

/**
 * Same read interface as Notion.
 * Returns before any network call. Fetch belongs in a later slice.
 */
export const linearTaskPlatform: TaskPlatformAdapter = {
  platform: 'linear',
  readTasks<T>(_tasks: readonly T[], env: TaskPlatformEnv): PlatformRead<T> {
    return linearMiss(env);
  },
  readMilestones(env: TaskPlatformEnv): PlatformRead<MilestoneSeam> {
    return linearMiss(env);
  },
};
