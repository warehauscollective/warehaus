import { PROJECT_UNAVAILABLE, TASK_UNAVAILABLE } from '@warehaus/portal-sync';

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
