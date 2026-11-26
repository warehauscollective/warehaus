/**
 * The saved project list view: the quick filter chip, the menu filters and the
 * sort. Pure, so the list in the browser and `projectListPrefs.saveMine` agree
 * on what a valid view is. No Convex imports, no DOM.
 */

export type ProjectListFilter = 'all' | 'active' | 'shipped' | 'internal';

export type ProjectPublishFilter = 'any' | 'published' | 'unpublished';
export type ProjectProgressBand = 'notStarted' | 'inProgress' | 'complete' | 'none';
export type ProjectTasksFilter = 'any' | 'has' | 'none';
export type ProjectUpdatedFilter = 'any' | '7d' | '30d' | '90d';
export type ProjectSortKey =
  | 'lastUpdated'
  | 'name'
  | 'client'
  | 'status'
  | 'startDate'
  | 'endDate'
  | 'progress'
  | 'tasks';
export type ProjectSortDirection = 'asc' | 'desc';
export type ProjectSort = { key: ProjectSortKey; direction: ProjectSortDirection };

/** Dates are `YYYY-MM-DD`. Null means that end of the range is open. */
export type ProjectDateRange = { from: string | null; to: string | null };

/** What one person has set on the list. An empty list, `any` or a null range does nothing. */
export type ProjectListView = {
  /** The quick filter chip. */
  quick: ProjectListFilter;
  status: string[];
  /** Staff only. Client `orgId` values. */
  clientIds: string[];
  /** Staff only. */
  publish: ProjectPublishFilter;
  stack: string[];
  startDate: ProjectDateRange;
  endDate: ProjectDateRange;
  progress: ProjectProgressBand[];
  tasks: ProjectTasksFilter;
  updated: ProjectUpdatedFilter;
  sort: ProjectSort;
};

export const PROJECT_PROGRESS_BANDS: readonly ProjectProgressBand[] = ['notStarted', 'inProgress', 'complete', 'none'];
export const PROJECT_SORT_KEYS: readonly ProjectSortKey[] = [
  'lastUpdated',
  'name',
  'client',
  'status',
  'startDate',
  'endDate',
  'progress',
  'tasks',
];

/** The direction picked when a sort field is chosen. */
export const PROJECT_SORT_FIRST_DIRECTION: Record<ProjectSortKey, ProjectSortDirection> = {
  lastUpdated: 'desc',
  name: 'asc',
  client: 'asc',
  status: 'asc',
  startDate: 'asc',
  endDate: 'asc',
  progress: 'desc',
  tasks: 'desc',
};

export const DEFAULT_PROJECT_SORT: ProjectSort = { key: 'lastUpdated', direction: 'desc' };

/** A fresh default each call, so a caller can never mutate a shared one. */
export function defaultProjectListView(): ProjectListView {
  return {
    quick: 'all',
    status: [],
    clientIds: [],
    publish: 'any',
    stack: [],
    startDate: { from: null, to: null },
    endDate: { from: null, to: null },
    progress: [],
    tasks: 'any',
    updated: 'any',
    sort: { ...DEFAULT_PROJECT_SORT },
  };
}

const MAX_PICKED = 100;
const MAX_VALUE_LENGTH = 200;

function pickedStrings(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const value of raw) {
    if (typeof value !== 'string') continue;
    const text = value.trim();
    if (!text || text.length > MAX_VALUE_LENGTH || out.includes(text)) continue;
    out.push(text);
    if (out.length >= MAX_PICKED) break;
  }
  return out;
}

function oneOf<T extends string>(raw: unknown, allowed: readonly T[], fallback: T): T {
  return typeof raw === 'string' && (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;
}

function isRealDay(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return !Number.isNaN(time) && new Date(time).toISOString().slice(0, 10) === value;
}

function dateRange(raw: unknown): ProjectDateRange {
  const input = (raw != null && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return { from: isRealDay(input.from) ? input.from : null, to: isRealDay(input.to) ? input.to : null };
}

/**
 * A safe view from anything stored or sent. Unknown keys and values are
 * dropped, a bad field falls back to its default, and a client viewer loses
 * the staff-only parts: the client filter, the publish filter, the Internal
 * chip and the Client sort.
 */
export function normalizeProjectListView(raw: unknown, staff: boolean): ProjectListView {
  const view = defaultProjectListView();
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return view;
  const input = raw as Record<string, unknown>;

  view.quick = oneOf<ProjectListFilter>(input.quick, staff ? ['all', 'active', 'shipped', 'internal'] : ['all', 'active', 'shipped'], 'all');
  view.status = pickedStrings(input.status);
  view.stack = pickedStrings(input.stack);
  view.startDate = dateRange(input.startDate);
  view.endDate = dateRange(input.endDate);
  view.progress = PROJECT_PROGRESS_BANDS.filter(
    (band) => Array.isArray(input.progress) && input.progress.includes(band),
  );
  view.tasks = oneOf<ProjectTasksFilter>(input.tasks, ['any', 'has', 'none'], 'any');
  view.updated = oneOf<ProjectUpdatedFilter>(input.updated, ['any', '7d', '30d', '90d'], 'any');
  if (staff) {
    view.clientIds = pickedStrings(input.clientIds);
    view.publish = oneOf<ProjectPublishFilter>(input.publish, ['any', 'published', 'unpublished'], 'any');
  }

  const sort = (input.sort != null && typeof input.sort === 'object' ? input.sort : {}) as Record<string, unknown>;
  const keys = staff ? PROJECT_SORT_KEYS : PROJECT_SORT_KEYS.filter((key) => key !== 'client');
  if (typeof sort.key === 'string' && (keys as readonly string[]).includes(sort.key)) {
    const key = sort.key as ProjectSortKey;
    view.sort = { key, direction: oneOf<ProjectSortDirection>(sort.direction, ['asc', 'desc'], PROJECT_SORT_FIRST_DIRECTION[key]) };
  }
  return view;
}

/** Field by field, in order. Picked values keep the order they were picked in. */
export function sameProjectListView(a: ProjectListView, b: ProjectListView): boolean {
  const sameList = (left: readonly string[], right: readonly string[]) =>
    left.length === right.length && left.every((value, index) => value === right[index]);
  const sameRange = (left: ProjectDateRange, right: ProjectDateRange) => left.from === right.from && left.to === right.to;
  return (
    a.quick === b.quick &&
    sameList(a.status, b.status) &&
    sameList(a.clientIds, b.clientIds) &&
    a.publish === b.publish &&
    sameList(a.stack, b.stack) &&
    sameRange(a.startDate, b.startDate) &&
    sameRange(a.endDate, b.endDate) &&
    sameList(a.progress, b.progress) &&
    a.tasks === b.tasks &&
    a.updated === b.updated &&
    a.sort.key === b.sort.key &&
    a.sort.direction === b.sort.direction
  );
}
