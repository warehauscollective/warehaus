import {
  readTaskPlatform,
  type TaskPlatformEnv,
} from '@warehaus/portal-sync';

/** Server env only. The browser never reads this name. */
export function linearEnv(): TaskPlatformEnv {
  return { LINEAR_API_KEY: process.env.LINEAR_API_KEY };
}

export function serveTasks<T>(platform: unknown, tasks: readonly T[]): T[] {
  const read = readTaskPlatform({ platform, tasks, env: linearEnv() });
  return read.tasks.ok ? [...read.tasks.items] : [];
}

/** Group a mixed-org task list and keep rows whose platform read succeeds. */
export function serveTasksByOrg<T extends { orgId: string }>(
  tasks: readonly T[],
  platformForOrg: (orgId: string) => unknown,
): T[] {
  const groups = new Map<string, T[]>();
  for (const task of tasks) {
    const rows = groups.get(task.orgId);
    if (rows) rows.push(task);
    else groups.set(task.orgId, [task]);
  }
  const keep = new Set<T>();
  for (const [orgId, rows] of groups) {
    const read = readTaskPlatform({
      platform: platformForOrg(orgId),
      tasks: rows,
      env: linearEnv(),
    });
    if (read.tasks.ok) {
      for (const row of read.tasks.items) keep.add(row);
    }
  }
  return tasks.filter((task) => keep.has(task));
}
