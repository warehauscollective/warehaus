import type {
  MilestoneSeam,
  PlatformRead,
  TaskPlatformAdapter,
  TaskPlatformEnv,
} from './taskPlatform';

/** Notion-backed rows already in Convex. This module does not call Notion. */
export const notionTaskPlatform: TaskPlatformAdapter = {
  platform: 'notion',
  readTasks<T>(tasks: readonly T[], _env: TaskPlatformEnv): PlatformRead<T> {
    return { ok: true, platform: 'notion', items: [...tasks] };
  },
  readMilestones(_env: TaskPlatformEnv): PlatformRead<MilestoneSeam> {
    const items: MilestoneSeam[] = [];
    return { ok: true, platform: 'notion', items };
  },
};
