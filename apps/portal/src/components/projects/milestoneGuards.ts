/**
 * Pure checks for the milestone UI. No schema and no new queries.
 * Activity rows still have no milestone id, so review history is not joined by name.
 */

export const ACTIVITY_MILESTONE_ID_GAP =
  'Activity rows store the milestone name and have no milestone id. A rename or two milestones with the same name cannot be separated, so this tab does not match activity by name.';

export const CREATE_TASK_MILESTONE_GAP =
  'createTask does not accept milestoneId. A new task is not attached to this milestone, so that control stays hidden. attachTask can link a task that already exists.';

export function resourcesForProject<T extends { projectId?: string | null }>(
  resources: readonly T[],
  projectId: string,
): T[] {
  return resources.filter((resource) => resource.projectId === projectId);
}

/** Project-scoped choices, plus resources already on this milestone. Server choice lists are not reused. */
export function milestoneResourceChoices(
  projectChoices: readonly { id: string; title: string }[],
  attached: readonly { id: string; title: string }[],
): { id: string; title: string }[] {
  const seen = new Set<string>();
  const choices: { id: string; title: string }[] = [];
  for (const choice of [...projectChoices, ...attached]) {
    if (seen.has(choice.id)) continue;
    seen.add(choice.id);
    choices.push({ id: choice.id, title: choice.title });
  }
  return choices;
}

/**
 * Fields already on the project the client is viewing.
 * An explicit hidden, internal, or unpublished project is unavailable.
 * Anything else with an empty milestone list is an authorized empty list.
 */
export function clientMilestoneEmptyKind(project: {
  publishToWarehaus?: boolean;
  internal?: boolean;
  syncHidden?: boolean;
  name?: string | null;
}): 'unavailable' | 'none-shared' {
  if (project.publishToWarehaus === false) return 'unavailable';
  if (project.internal === true) return 'unavailable';
  if (project.syncHidden === true) return 'unavailable';
  if ((project.name ?? '').trim().toLowerCase() === 'warehaus.studio') return 'unavailable';
  return 'none-shared';
}

export function milestonesAfterQuery<T>(input: {
  data: readonly T[] | undefined;
  error: string | null;
  loading: boolean;
  previous: readonly T[];
}): T[] {
  if (input.data) return [...input.data];
  if ((input.error || input.loading) && input.previous.length > 0) return [...input.previous];
  return [];
}

export function boardCountsFromTasks(
  tasks: readonly { id: string; parentTaskId?: string | null; isDone: boolean }[],
): { lanes: number; laneDone: number; nested: number } {
  const ids = new Set(tasks.map((task) => task.id));
  const parents = tasks.filter((task) => !task.parentTaskId);
  const nested = tasks.filter((task) => Boolean(task.parentTaskId) && ids.has(task.parentTaskId as string));
  return {
    lanes: parents.length,
    laneDone: parents.filter((task) => task.isDone).length,
    nested: nested.length,
  };
}

/** The decision stored on the milestone row. Activity names are not an input. */
export function storedMilestoneReview(milestone: {
  id: string;
  approval: string;
  note: string | null;
  approverName: string | null;
  decidedAt: number | null;
}): {
  id: string;
  approval: string;
  note: string;
  approverName: string | null;
  decidedAt: number | null;
} | null {
  if (!milestone.note && milestone.decidedAt == null) return null;
  return {
    id: milestone.id,
    approval: milestone.approval,
    note: milestone.note ?? '',
    approverName: milestone.approverName,
    decidedAt: milestone.decidedAt,
  };
}

export function reviewStamp(at: number | null, now = Date.now()): string {
  if (at == null) return 'No review yet';
  const date = new Date(at);
  const today = new Date(now);
  if (date.toDateString() === today.toDateString()) return 'Last review today';
  return `Last review ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

export function goalKey(index: number, goal: string): string {
  return `${index}:${goal}`;
}

export function nextTabIndex(current: number, count: number, key: string): number | null {
  if (count <= 0 || current < 0) return null;
  if (key === 'ArrowRight') return (current + 1) % count;
  if (key === 'ArrowLeft') return (current - 1 + count) % count;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return null;
}

export function tabIds(prefix: string, tabId: string): { tab: string; panel: string } {
  return { tab: `${prefix}-tab-${tabId}`, panel: `${prefix}-panel` };
}

/** Where Tab should move when it would leave the dialog. */
export function dialogTabBoundary(input: {
  shiftKey: boolean;
  atFirst: boolean;
  atLast: boolean;
}): 'first' | 'last' | null {
  if (input.shiftKey && input.atFirst) return 'last';
  if (!input.shiftKey && input.atLast) return 'first';
  return null;
}
