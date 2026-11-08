export type TaskListView = 'board' | 'table';

/** Board is the project default. Only an explicit `table` query selects the table. */
export function readTaskListView(value: string | null | undefined): TaskListView {
  return value === 'table' ? 'table' : 'board';
}

/**
 * A reload clears the page state. Stay on the open project while its row
 * is still coming back, instead of the project list or another project.
 * The id comes from state or from `/projects/:id` or `/tasks/:id`.
 */
export function keepProjectWhileLoading(input: {
  fixtures: boolean;
  projectsLoading: boolean;
  projectFound: boolean;
  pathname: string;
  openId: string | null;
}): boolean {
  if (input.fixtures || !input.projectsLoading || input.projectFound) return false;
  if (input.openId) return true;
  return /^\/projects\/[^/]+/.test(input.pathname) || /^\/tasks\/[^/]+/.test(input.pathname);
}
