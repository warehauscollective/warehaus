import type { PortalProject, PortalTask } from '@/lib/data/view-models';

/**
 * Projects and clients have no brand field. The list meta uses the
 * description, never the stack, until a brand exists in the schema.
 */
export type ProjectListFilter = 'all' | 'active' | 'shipped' | 'internal';

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

export function projectTasksSubtitle(view: 'board' | 'table'): string {
  if (view === 'table') return 'Table by Status · All project tasks';
  return 'Board by Status · Notion Status columns';
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

export function sortProjectsByLastUpdated<T extends { lastSyncedAt?: number | null; name: string }>(
  projects: readonly T[],
): T[] {
  return [...projects].sort((a, b) => {
    const left = a.lastSyncedAt ?? Number.NEGATIVE_INFINITY;
    const right = b.lastSyncedAt ?? Number.NEGATIVE_INFINITY;
    if (right !== left) return right - left;
    return a.name.localeCompare(b.name);
  });
}
