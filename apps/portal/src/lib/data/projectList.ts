import type { PortalProject, PortalTask } from '@/lib/data/view-models';
import {
  DEFAULT_PROJECT_SORT,
  defaultProjectListView,
  type ProjectDateRange,
  type ProjectListFilter,
  type ProjectListView,
  type ProjectProgressBand,
  type ProjectSort,
  type ProjectSortKey,
  type ProjectUpdatedFilter,
} from '@convex/_lib/projectListView';

/**
 * The view's types, defaults and normalise live in `convex/_lib/projectListView`
 * so the saved-view mutation uses the same ones. Re-exported for the list.
 */
export {
  DEFAULT_PROJECT_SORT,
  PROJECT_PROGRESS_BANDS,
  PROJECT_SORT_FIRST_DIRECTION,
  PROJECT_SORT_KEYS,
  defaultProjectListView,
  normalizeProjectListView,
  sameProjectListView,
} from '@convex/_lib/projectListView';
export type {
  ProjectDateRange,
  ProjectListFilter,
  ProjectListView,
  ProjectProgressBand,
  ProjectPublishFilter,
  ProjectSort,
  ProjectSortDirection,
  ProjectSortKey,
  ProjectTasksFilter,
  ProjectUpdatedFilter,
} from '@convex/_lib/projectListView';

/**
 * Projects and clients have no brand field. The list meta uses the
 * description, never the stack, until a brand exists in the schema.
 */

export type ProjectListTask = Pick<PortalTask, 'projectId' | 'isDone' | 'stage'>;

const FILTER_LABEL: Record<ProjectListFilter, string> = {
  all: 'All',
  active: 'Active',
  shipped: 'Shipped',
  internal: 'Internal',
};

function glyphs(value: string): string[] {
  return Array.from(value);
}

/** First letters, by code point, so an emoji is never split into a surrogate. */
export function projectInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '·';
  if (parts.length === 1) return glyphs(parts[0]).slice(0, 2).join('').toUpperCase();
  return `${glyphs(parts[0])[0] ?? ''}${glyphs(parts[1])[0] ?? ''}`.toUpperCase();
}

export function projectListMeta(
  project: Pick<PortalProject, 'internal' | 'clientName' | 'description'>,
  fallbackClient: string | null | undefined,
  options?: { phone?: boolean },
): string {
  if (project.internal) {
    return options?.phone ? 'Admin only · never shown to clients' : 'Warehaus (internal) · admin-only';
  }
  const client = project.clientName ?? fallbackClient ?? '';
  const detail = project.description?.trim() ?? '';
  if (client && detail) return `${client} · ${detail}`;
  return client || detail || '—';
}

/** Notion progress is a 0–1 fraction or a 0–100 percent. Null stays unknown. */
export function progressPercent(value: number | null | undefined): number | null {
  if (value == null || Number.isNaN(value)) return null;
  const pct = value <= 1 ? Math.round(value * 100) : Math.round(value);
  return Math.min(100, Math.max(0, pct));
}

export function formatProgress(value: number | null | undefined): string {
  const pct = progressPercent(value);
  if (pct == null) return '—';
  return `${pct}%`;
}

export function projectProgress(input: {
  projectId: string;
  progress: number | null | undefined;
  tasks: readonly ProjectListTask[];
}): { percent: number | null; fromTasks: boolean } {
  const mine = input.tasks.filter((task) => task.projectId === input.projectId);
  if (mine.length > 0) {
    const shipped = mine.filter((task) => task.stage === 'Shipped' || task.isDone).length;
    const percent = Math.round((shipped / mine.length) * 100);
    return { percent, fromTasks: true };
  }
  return { percent: progressPercent(input.progress), fromTasks: false };
}

/** Same sentence at both widths. Unknown progress keeps the em dash in place of N%. */
export function projectProgressCopy(percent: number | null, taskCount: number): { desktop: string; phone: string } {
  const pct = percent == null ? '—' : `${percent}%`;
  const tasks = `${taskCount} ${taskCount === 1 ? 'task' : 'tasks'}`;
  return {
    desktop: `${pct} of tasks shipped`,
    phone: `${pct} shipped · ${tasks}`,
  };
}

export function isShippedStatus(status: string): boolean {
  return /ship|done/i.test(status);
}

export function viewerProjects<T extends { internal?: boolean }>(projects: readonly T[], staff: boolean): T[] {
  return projects.filter((project) => staff || !project.internal);
}

export function projectMatchesFilter(
  project: { internal?: boolean; status: string },
  filter: ProjectListFilter,
): boolean {
  if (filter === 'all') return true;
  if (filter === 'internal') return project.internal === true;
  if (project.internal) return false;
  if (filter === 'shipped') return isShippedStatus(project.status);
  return !isShippedStatus(project.status);
}

export function projectFilterCounts(
  projects: readonly { internal?: boolean; status: string }[],
  staff: boolean,
): Array<{ key: ProjectListFilter; label: string; count: number }> {
  const visible = viewerProjects(projects, staff);
  const keys: ProjectListFilter[] = staff ? ['all', 'active', 'shipped', 'internal'] : ['all', 'active', 'shipped'];
  return keys.map((key) => ({
    key,
    label: FILTER_LABEL[key],
    count: key === 'all' ? visible.length : visible.filter((project) => projectMatchesFilter(project, key)).length,
  }));
}

/** Staff list only. Clients, internal rows, and a missing flag stay blank. */
export function showProjectPublish(
  staff: boolean,
  project: { internal?: boolean; publishToWarehaus?: boolean | null },
): boolean {
  return staff && !project.internal && project.publishToWarehaus != null;
}

/** Loaded task rows win. An empty load falls back to the stored project count. */
export function projectTaskCount(loadedCount: number, storedCount?: number | null): number {
  if (loadedCount > 0) return loadedCount;
  return storedCount ?? 0;
}

export const EDIT_PROJECT_WRITEBACK_HINT = 'Editing turns on with Notion write-back';

/** Same shape as Edit project. Shown while project create is off. */
export const PROJECT_CREATE_HINT = 'Creating a project turns on with Notion write-back';

/** Opens the new-project dialog only when project create is on. */
export function requestProjectCreate(enabled: boolean, open: () => void): boolean {
  if (!enabled) return false;
  open();
  return true;
}

export type ProjectSummaryVisibility = {
  showPublish: boolean;
  showSourceNotion: boolean;
  showEdit: boolean;
  /** True while the Edit control is on screen and Notion write-back is off. */
  editDisabled: boolean;
};

/**
 * Detail summary controls. Clients never see publish, Source Notion, or Edit.
 * Staff see publish on client projects with a flag, Source Notion when a page
 * id exists, and Edit. Edit stays disabled until write-back is on.
 */
export function projectSummaryVisibility(
  staff: boolean,
  project: {
    internal?: boolean;
    publishToWarehaus?: boolean | null;
    notionPageId?: string | null;
  },
  options?: { writebackEnabled?: boolean },
): ProjectSummaryVisibility {
  const showEdit = staff;
  const writeback = options?.writebackEnabled === true;
  return {
    showPublish: showProjectPublish(staff, project),
    showSourceNotion: staff && Boolean(project.notionPageId),
    showEdit,
    editDisabled: showEdit && !writeback,
  };
}

/** Audience line for the project task list. The board/table toggle does not change it. */
export function projectTasksSubtitle(staff: boolean): string {
  if (staff) return 'Synced from Notion · clients see published only';
  return 'Shared with you by the Warehaus team.';
}

export type ProjectKpiTask = {
  projectId: string | null;
  status?: string | null;
  stage?: string | null;
  isDone?: boolean;
  publishToWarehaus?: boolean;
  syncHidden?: boolean;
};

function isInProgressStatus(status: string | null | undefined): boolean {
  return /^in\s*progress$/i.test(status ?? '');
}

/**
 * List KPIs from rows the viewer is allowed to see.
 * No DOM. Clients drop internal projects and any task the publish gate would hide,
 * even if a caller passed those rows in.
 */
export function projectListKpis(
  projects: readonly { id: string; internal?: boolean; status: string }[],
  tasks: readonly ProjectKpiTask[],
  staff: boolean,
): {
  active: number;
  shipped: number;
  awaitingGo: number;
  awaitingProjects: number;
  buildingNow: number;
} {
  const visible = viewerProjects(projects, staff);
  const visibleIds = new Set(visible.map((project) => project.id));
  const activeIds = new Set(
    visible.filter((project) => projectMatchesFilter(project, 'active')).map((project) => project.id),
  );
  const awaitingProjects = new Set<string>();
  const buildingProjects = new Set<string>();
  let awaitingGo = 0;
  for (const task of tasks) {
    if (!task.projectId || !visibleIds.has(task.projectId)) continue;
    if (!staff && (task.publishToWarehaus === false || task.syncHidden === true)) continue;
    if (task.stage === 'Awaiting Go' && !task.isDone) {
      awaitingGo += 1;
      awaitingProjects.add(task.projectId);
    }
    if (activeIds.has(task.projectId) && isInProgressStatus(task.status)) {
      buildingProjects.add(task.projectId);
    }
  }
  return {
    active: activeIds.size,
    shipped: visible.filter((project) => projectMatchesFilter(project, 'shipped')).length,
    awaitingGo,
    awaitingProjects: awaitingProjects.size,
    buildingNow: buildingProjects.size,
  };
}

export function acrossProjectsLabel(count: number): string {
  return `Across ${count} ${count === 1 ? 'project' : 'projects'}`;
}

export function activeKpiCaption(active: number, buildingNow: number): string {
  if (active <= 0) return 'None building';
  return `${buildingNow} building now`;
}

export function shippedKpiCaption(): string {
  return 'All time';
}

/** Red only while something is waiting. Zero is a muted line and a neutral number. */
export function awaitingKpiCaption(count: number, projectCount: number): { caption: string; hot: boolean } {
  if (count <= 0) return { caption: 'Nothing awaiting go', hot: false };
  return { caption: acrossProjectsLabel(projectCount), hot: true };
}

/**
 * Chips stay for a filtered-empty list. A true empty set has nothing to filter.
 * Loading hides them so counts cannot appear before the KPI numbers.
 */
export function projectListShowsFilters(viewerCount: number, loading = false): boolean {
  return viewerCount > 0 && !loading;
}

/** KPI cards hide only when the viewer total is zero. Loading still shows skeletons. */
export function projectListShowsKpis(viewerCount: number, loading: boolean): boolean {
  return loading || viewerCount > 0;
}

/** Snapshot query failure only. A blank message is not an error. */
export function portalHookError(snapshotError?: string | null): string | null {
  const snapshot = snapshotError?.trim() ?? '';
  return snapshot || null;
}

/**
 * One split for the portal hook. `snapshotError` is the query failure.
 * `syncError` stays on syncMeta for the dashboard sync card and row chips.
 */
export function portalFailure(input: {
  snapshotError?: string | null;
  syncError?: string | null;
}): { snapshotError: string | null; syncError: string | null } {
  return {
    snapshotError: portalHookError(input.snapshotError),
    syncError: input.syncError?.trim() || null,
  };
}

/** No cached rows: the error card replaces the page. Cached rows: a refresh banner. */
export function projectListErrorMode(
  queryError: string | null,
  cachedCount: number,
): 'none' | 'empty' | 'refresh' {
  if (!queryError) return 'none';
  return cachedCount > 0 ? 'refresh' : 'empty';
}

/**
 * Projects load notice. `syncError` is not a query failure: with no snapshot
 * or staff projects error, the list and empty states stay up.
 */
export function projectListQueryError(input: {
  snapshotError?: string | null;
  projectsError?: string | null;
  syncError?: string | null;
}): string | null {
  if (input.syncError && !input.snapshotError?.trim() && !input.projectsError?.trim()) return null;
  const snapshot = input.snapshotError?.trim() ?? '';
  const projects = input.projectsError?.trim() ?? '';
  return snapshot || projects || null;
}

/** Zero projects in the viewer set, versus a filter that hides every row. */
export function projectListEmptyCopy(viewerCount: number, staff: boolean): { title: string; detail: string | null } {
  if (viewerCount > 0) return { title: 'No projects match these filters.', detail: null };
  if (!staff) {
    return {
      title: 'No projects shared with you yet',
      detail: 'Warehaus will publish projects here when they are ready.',
    };
  }
  return {
    title: 'No projects yet',
    detail: 'Create a project under a client, or under Warehaus for internal work.',
  };
}

export const PROJECT_LIST_CLIENT_LOAD_TITLE = "We couldn't load your projects";
export const PROJECT_LIST_CLIENT_LOAD_BODY = 'Try again in a moment.';
export const PROJECT_LIST_STAFF_LOAD_TITLE = "Couldn't load projects";
export const PROJECT_LIST_CLIENT_REFRESH_TITLE = "We couldn't refresh your projects";
export const PROJECT_LIST_CLIENT_REFRESH_BODY = 'Showing what was last loaded.';
export const PROJECT_LIST_STAFF_REFRESH_TITLE = "Couldn't refresh projects";

/**
 * List load failure. `refresh` is a failed refetch that still has rows.
 * Both audiences get Try again. The save-queued sentence from the states
 * frame is not used here: a failed load has nothing queued.
 * Client title and body live only in the constants above.
 */
export function projectListLoadNotice(
  staff: boolean,
  message: string,
  refresh = false,
): { title: string; body: string; retry: boolean; mono: boolean } {
  if (refresh) {
    if (!staff) {
      return {
        title: PROJECT_LIST_CLIENT_REFRESH_TITLE,
        body: PROJECT_LIST_CLIENT_REFRESH_BODY,
        retry: true,
        mono: false,
      };
    }
    const detail = message.trim();
    const mono = Boolean(detail) && detail !== PROJECT_LIST_STAFF_REFRESH_TITLE;
    return {
      title: PROJECT_LIST_STAFF_REFRESH_TITLE,
      body: mono ? detail : PROJECT_LIST_CLIENT_REFRESH_BODY,
      retry: true,
      mono,
    };
  }
  if (!staff) {
    return {
      title: PROJECT_LIST_CLIENT_LOAD_TITLE,
      body: PROJECT_LIST_CLIENT_LOAD_BODY,
      retry: true,
      mono: false,
    };
  }
  const detail = message.trim();
  const mono = Boolean(detail) && detail !== PROJECT_LIST_STAFF_LOAD_TITLE && detail !== PROJECT_LIST_CLIENT_LOAD_TITLE;
  return {
    title: PROJECT_LIST_STAFF_LOAD_TITLE,
    body: mono ? detail : PROJECT_LIST_CLIENT_LOAD_BODY,
    retry: true,
    mono,
  };
}

/** The default sort: last updated, newest first. Kept for callers that only need that. */
export function sortProjectsByLastUpdated<T extends { lastSyncedAt?: number | null; name: string; id?: string }>(
  projects: readonly T[],
): T[] {
  return sortProjects(projects, DEFAULT_PROJECT_SORT);
}

/* ── Project list view: menu filters, quick filter chip and sort ───────────── */

/** A list row with the two numbers the row shows, so filters and sorts use the same ones. */
export type ProjectViewRow = {
  id: string;
  name: string;
  status: string;
  stack?: readonly string[];
  startDate?: string | null;
  endDate?: string | null;
  lastSyncedAt?: number | null;
  publishToWarehaus?: boolean | null;
  internal?: boolean;
  orgId?: string;
  clientName?: string | null;
  /** `projectProgress().percent`. Null is the em dash. */
  percent: number | null;
  /** `projectTaskCount()`. */
  taskCount: number;
};

const UPDATED_WINDOW_DAYS: Record<Exclude<ProjectUpdatedFilter, 'any'>, number> = { '7d': 7, '30d': 30, '90d': 90 };
const DAY_MS = 24 * 60 * 60 * 1000;
const KNOWN_STATUS_ORDER = ['inbox', 'planned', 'in progress', 'paused', 'shipped', 'done'];

function statusKey(status: string): string {
  return status.trim().toLowerCase();
}

/** The day part of a stored date, or null when there is none. */
function dayOf(value: string | null | undefined): string | null {
  const day = value?.slice(0, 10) ?? '';
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

function rangeIsSet(range: ProjectDateRange): boolean {
  return range.from != null || range.to != null;
}

function inRange(value: string | null | undefined, range: ProjectDateRange): boolean {
  const day = dayOf(value);
  if (day == null) return false;
  if (range.from != null && day < range.from) return false;
  if (range.to != null && day > range.to) return false;
  return true;
}

export function progressBand(percent: number | null): ProjectProgressBand {
  if (percent == null) return 'none';
  if (percent <= 0) return 'notStarted';
  if (percent >= 100) return 'complete';
  return 'inProgress';
}

/** Adds the percent and task count each row shows. Tasks are grouped once. */
export function projectViewRows<T extends { id: string; progress?: number | null; taskCount?: number | null }>(
  projects: readonly T[],
  tasks: readonly ProjectListTask[],
): Array<T & { percent: number | null; taskCount: number }> {
  const byProject = new Map<string, ProjectListTask[]>();
  for (const task of tasks) {
    if (!task.projectId) continue;
    const list = byProject.get(task.projectId);
    if (list) list.push(task);
    else byProject.set(task.projectId, [task]);
  }
  return projects.map((project) => {
    const mine = byProject.get(project.id) ?? [];
    const { percent } = projectProgress({ projectId: project.id, progress: project.progress, tasks: mine });
    return { ...project, percent, taskCount: projectTaskCount(mine.length, project.taskCount) };
  });
}

/**
 * True when the viewer may see the row and it passes the chip and every set
 * filter (AND). Values inside one pick-many filter are OR. A client viewer
 * never matches an internal row, and staff-only filters are ignored for them.
 */
export function projectMatchesView(
  project: ProjectViewRow,
  view: ProjectListView,
  staff: boolean,
  options?: { now?: number },
): boolean {
  if (!staff && project.internal) return false;
  const quick = !staff && view.quick === 'internal' ? 'all' : view.quick;
  if (!projectMatchesFilter(project, quick)) return false;

  if (view.status.length > 0) {
    const key = statusKey(project.status);
    if (!view.status.some((status) => statusKey(status) === key)) return false;
  }
  if (staff) {
    if (view.clientIds.length > 0 && (project.orgId == null || !view.clientIds.includes(project.orgId))) return false;
    if (view.publish !== 'any') {
      if (project.internal || project.publishToWarehaus == null) return false;
      if (project.publishToWarehaus !== (view.publish === 'published')) return false;
    }
  }
  if (view.stack.length > 0) {
    const stack = project.stack ?? [];
    if (!view.stack.some((value) => stack.includes(value))) return false;
  }
  if (rangeIsSet(view.startDate) && !inRange(project.startDate, view.startDate)) return false;
  if (rangeIsSet(view.endDate) && !inRange(project.endDate, view.endDate)) return false;
  if (view.progress.length > 0 && !view.progress.includes(progressBand(project.percent))) return false;
  if (view.tasks === 'has' && project.taskCount <= 0) return false;
  if (view.tasks === 'none' && project.taskCount > 0) return false;
  if (view.updated !== 'any') {
    if (project.lastSyncedAt == null) return false;
    const now = options?.now ?? Date.now();
    if (project.lastSyncedAt < now - UPDATED_WINDOW_DAYS[view.updated] * DAY_MS) return false;
  }
  return true;
}

type SortableProject = {
  name: string;
  id?: string;
  status?: string;
  clientName?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  lastSyncedAt?: number | null;
  percent?: number | null;
  taskCount?: number | null;
};

function sortValue(project: SortableProject, key: ProjectSortKey): string | number | null {
  switch (key) {
    case 'lastUpdated':
      return project.lastSyncedAt ?? null;
    case 'name':
      return project.name;
    case 'client':
      return project.clientName?.trim() || null;
    case 'status':
      return project.status?.trim() || null;
    case 'startDate':
      return dayOf(project.startDate);
    case 'endDate':
      return dayOf(project.endDate);
    case 'progress':
      return project.percent ?? null;
    case 'tasks':
      return project.taskCount ?? null;
  }
}

/**
 * One sort, either direction. A row with no value for the field goes last in
 * both directions. Ties break by name A to Z, then id, so the order is stable.
 */
export function sortProjects<T extends SortableProject>(rows: readonly T[], sort: ProjectSort): T[] {
  const flip = sort.direction === 'desc' ? -1 : 1;
  return [...rows].sort((a, b) => {
    const left = sortValue(a, sort.key);
    const right = sortValue(b, sort.key);
    if (left == null || right == null) {
      if (left != null) return -1;
      if (right != null) return 1;
    } else {
      const order =
        typeof left === 'number' && typeof right === 'number'
          ? left - right
          : String(left).localeCompare(String(right), undefined, { sensitivity: 'base' });
      if (order !== 0) return order * flip;
    }
    const byName = a.name.localeCompare(b.name);
    if (byName !== 0) return byName;
    return (a.id ?? '').localeCompare(b.id ?? '');
  });
}

/** The rows the list shows: viewer gate first, then the view's filters, then its sort. */
export function applyProjectListView<T extends ProjectViewRow>(
  rows: readonly T[],
  view: ProjectListView,
  staff: boolean,
  options?: { now?: number },
): T[] {
  const now = options?.now ?? Date.now();
  const sort = !staff && view.sort.key === 'client' ? DEFAULT_PROJECT_SORT : view.sort;
  return sortProjects(
    viewerProjects(rows, staff).filter((row) => projectMatchesView(row, view, staff, { now })),
    sort,
  );
}

/** Chip counts with the menu filters applied: what each chip would list. */
export function projectViewChipCounts(
  rows: readonly ProjectViewRow[],
  view: ProjectListView,
  staff: boolean,
  options?: { now?: number },
): Array<{ key: ProjectListFilter; label: string; count: number }> {
  const now = options?.now ?? Date.now();
  const menuOnly = viewerProjects(rows, staff).filter((row) =>
    projectMatchesView(row, { ...view, quick: 'all' }, staff, { now }),
  );
  return projectFilterCounts(menuOnly, staff);
}

export type ProjectListViewOptions = {
  status: string[];
  /** Staff only. Empty for a client viewer. */
  clients: Array<{ id: string; name: string }>;
  stack: string[];
};

/**
 * Menu choices, from the rows the viewer can see and nothing else. Status:
 * known values in workflow order, then the rest A to Z. Clients and stack A to Z.
 */
export function projectListViewOptions(
  rows: readonly Pick<ProjectViewRow, 'status' | 'stack' | 'internal' | 'orgId' | 'clientName'>[],
  staff: boolean,
): ProjectListViewOptions {
  const visible = viewerProjects(rows, staff);
  const statuses = new Map<string, string>();
  const clients = new Map<string, string>();
  const stack = new Set<string>();
  for (const row of visible) {
    const key = statusKey(row.status);
    if (key && !statuses.has(key)) statuses.set(key, row.status.trim());
    const clientName = row.clientName?.trim();
    if (staff && !row.internal && row.orgId && clientName && !clients.has(row.orgId)) {
      clients.set(row.orgId, clientName);
    }
    for (const value of row.stack ?? []) {
      if (value.trim()) stack.add(value);
    }
  }
  const rank = (key: string) => {
    const index = KNOWN_STATUS_ORDER.indexOf(key);
    return index === -1 ? KNOWN_STATUS_ORDER.length : index;
  };
  return {
    status: [...statuses.entries()]
      .sort(([leftKey, left], [rightKey, right]) => rank(leftKey) - rank(rightKey) || left.localeCompare(right))
      .map(([, label]) => label),
    clients: [...clients.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)),
    stack: [...stack].sort((a, b) => a.localeCompare(b)),
  };
}

/**
 * Drops picked values that are not a current choice (a removed client, a
 * status no project has now), so a stale saved value is not shown as picked
 * and does not hide every row. Use the result to filter. Do not save it back:
 * the value may return.
 */
export function pruneProjectListView(view: ProjectListView, options: ProjectListViewOptions): ProjectListView {
  const statusKeys = new Set(options.status.map(statusKey));
  const clientIds = new Set(options.clients.map((client) => client.id));
  const stack = new Set(options.stack);
  return {
    ...view,
    status: view.status.filter((value) => statusKeys.has(statusKey(value))),
    clientIds: view.clientIds.filter((id) => clientIds.has(id)),
    stack: view.stack.filter((value) => stack.has(value)),
  };
}

/** How many menu filters are set. Filters, not values. The chip and the sort do not count. */
export function activeProjectFilterCount(view: ProjectListView, staff: boolean): number {
  const set = [
    view.status.length > 0,
    staff && view.clientIds.length > 0,
    staff && view.publish !== 'any',
    view.stack.length > 0,
    rangeIsSet(view.startDate),
    rangeIsSet(view.endDate),
    view.progress.length > 0,
    view.tasks !== 'any',
    view.updated !== 'any',
  ];
  return set.filter(Boolean).length;
}

/** Clear filters shows when the chip is not All or any menu filter is set. */
export function projectListViewIsFiltered(view: ProjectListView, staff: boolean): boolean {
  const quick = !staff && view.quick === 'internal' ? 'all' : view.quick;
  return quick !== 'all' || activeProjectFilterCount(view, staff) > 0;
}

/** Chip to All and every menu filter to Any. The sort stays: it is not a filter. */
export function clearProjectListFilters(view: ProjectListView): ProjectListView {
  return { ...defaultProjectListView(), sort: { ...view.sort } };
}
