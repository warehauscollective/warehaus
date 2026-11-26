import { PROJECT_UNAVAILABLE, TASK_UNAVAILABLE } from '@warehaus/portal-sync';

/** Same card for a missing project and one the viewer cannot see. */
export const PROJECT_UNAVAILABLE_COPY = {
  title: "This project isn't available",
  detail: "It may have been removed or isn't shared with you.",
} as const;

/**
 * H1 and breadcrumb leaf on the unavailable project page.
 * The card is the only place that says PROJECT_UNAVAILABLE_COPY.title.
 */
export const PROJECT_UNAVAILABLE_HEADING = 'Project';

export function projectUnavailableCopy(): { title: string; detail: string } {
  return PROJECT_UNAVAILABLE_COPY;
}

export type BoardRoute =
  | { view: 'list' }
  | { view: 'board'; projectId: string; taskId: string | null }
  | { view: 'unavailable'; message: string };

function pathId(pathname: string, prefix: string): string | null {
  const match = pathname.match(new RegExp(`^${prefix}([^/]+)`));
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

/**
 * /projects/:id opens that board. /tasks/:id opens the modal over its board.
 * A missing row and a row the viewer cannot see use the same message.
 */
/**
 * The page's tasks, plus a task opened from a milestone card, and its nested
 * child tasks, that the page does not hold. The page's own copy wins as soon
 * as it has one.
 */
export function tasksWithOpened<T extends { id: string }>(tasks: T[], opened: T | readonly T[] | null): T[] {
  const list: readonly T[] = opened == null ? [] : Array.isArray(opened) ? opened : [opened as T];
  const held = new Set(tasks.map((task) => task.id));
  const extra = list.filter((task) => !held.has(task.id));
  return extra.length === 0 ? tasks : [...tasks, ...extra];
}

export function resolveBoardRoute(input: {
  pathname: string;
  tasks: readonly { id: string; projectId?: string | null }[];
  visibleProjectIds: readonly string[];
}): BoardRoute {
  const taskId = pathId(input.pathname, '/tasks/');
  if (taskId) {
    const task = input.tasks.find((item) => item.id === taskId);
    const projectId = task?.projectId ?? null;
    if (!projectId || !input.visibleProjectIds.includes(projectId)) {
      return { view: 'unavailable', message: TASK_UNAVAILABLE };
    }
    return { view: 'board', projectId, taskId };
  }

  const projectId = pathId(input.pathname, '/projects/');
  if (projectId) {
    if (!input.visibleProjectIds.includes(projectId)) {
      return { view: 'unavailable', message: PROJECT_UNAVAILABLE };
    }
    return { view: 'board', projectId, taskId: null };
  }

  return { view: 'list' };
}
