/**
 * A card move the board shows before the live list has it. `from` is the
 * live value when the card was moved. The override holds only while the live
 * value is still `from`. Once the live row changes, by this save or by anyone
 * else, the card follows the live row again.
 */
export type BoardOverride = {
  mode: 'status' | 'stage';
  value: string;
  from: string;
  pending?: boolean;
};

type BoardRow = { id: string; status: string; stage?: string | null };

export function liveBoardValue(task: BoardRow, mode: 'status' | 'stage'): string {
  return mode === 'stage' ? task.stage ?? '' : task.status;
}

/** True while the live row has not changed since the card was moved. */
export function boardOverrideHolds(task: BoardRow, override: BoardOverride | undefined): override is BoardOverride {
  return override != null && liveBoardValue(task, override.mode) === override.from;
}

/**
 * Drops every override whose live row has changed or left the list, so it
 * cannot come back if the row later returns to its old value. Returns the
 * same object when nothing is dropped.
 */
export function pruneBoardOverrides<T extends BoardOverride>(
  tasks: readonly BoardRow[],
  overrides: Record<string, T>,
): Record<string, T> {
  const live = new Map(tasks.map((task) => [task.id, task] as const));
  const kept = Object.entries(overrides).filter(([id, override]) => {
    const task = live.get(id);
    return task != null && boardOverrideHolds(task, override);
  });
  return kept.length === Object.keys(overrides).length ? overrides : Object.fromEntries(kept);
}
