/**
 * The milestone filters in the project page address, and the copy kept per
 * project for the session. Pure: the search string and the store are passed
 * in, so this runs in a test with plain values. No React, no Convex.
 *
 * The address is `?status=Building,Ready+to+Ship&type=design`: one param per
 * filter, values joined with a comma. Unknown values drop. An address with a
 * filter wins over the stored view.
 */
import { MILESTONE_APPROVALS } from '@convex/_lib/milestones';
import { MILESTONE_STATUSES } from '@convex/_lib/milestoneStatus';
import {
  MILESTONE_WORK_TYPES,
  emptyMilestoneListView,
  milestoneListViewIsFiltered,
  normalizeMilestoneListView,
  type MilestoneListView,
} from './milestoneFilters';

/**
 * The filter params. None is a param the project page already reads
 * (milestone, layout, done, banner, pane, tab, tiles and the preview ones).
 */
export const MILESTONE_FILTER_PARAMS = {
  status: 'status',
  type: 'type',
  approval: 'approval',
  needsYou: 'needs',
} as const;

/** The one value of the Needs you param. */
export const MILESTONE_NEEDS_YOU_PARAM_VALUE = 'you';

const PARAM_NAMES: readonly string[] = Object.values(MILESTONE_FILTER_PARAMS);

function paramsOf(search: string): URLSearchParams {
  return new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
}

/** The known values in a param, matched without case. A repeated param adds its values. */
function listed<T extends string>(params: URLSearchParams, name: string, known: readonly T[]): T[] {
  const picked = params
    .getAll(name)
    .flatMap((value) => value.split(','))
    .map((value) => value.trim().toLowerCase());
  return known.filter((value) => picked.includes(value.toLowerCase()));
}

/**
 * The view an address asks for, or null when it asks for none: no filter
 * param, or only values that are not known. A client's address cannot set a
 * staff-only filter.
 */
export function milestoneViewFromSearch(search: string, staff: boolean): MilestoneListView | null {
  const params = paramsOf(search);
  const view: MilestoneListView = {
    statuses: listed(params, MILESTONE_FILTER_PARAMS.status, MILESTONE_STATUSES),
    types: listed(params, MILESTONE_FILTER_PARAMS.type, MILESTONE_WORK_TYPES),
    approval: staff ? listed(params, MILESTONE_FILTER_PARAMS.approval, MILESTONE_APPROVALS) : [],
    needsYou:
      staff &&
      params
        .getAll(MILESTONE_FILTER_PARAMS.needsYou)
        .some((value) => value.trim().toLowerCase() === MILESTONE_NEEDS_YOU_PARAM_VALUE),
  };
  return milestoneListViewIsFiltered(view, staff) ? view : null;
}

/** The search without the filter params, other params as they were. No leading `?`. */
export function searchWithoutMilestoneFilters(search: string): string {
  const params = paramsOf(search);
  for (const name of PARAM_NAMES) params.delete(name);
  return params.toString();
}

/** Values joined with a plain comma, so the address reads `Building,Ready+to+Ship`. */
function joined(values: readonly string[]): string {
  return values.map((value) => encodeURIComponent(value).replace(/%20/g, '+')).join(',');
}

/**
 * The search with the view written into it. Other params stay, the filter
 * params are replaced, and an unset filter has no param. No leading `?`.
 */
export function searchWithMilestoneView(search: string, view: MilestoneListView, staff: boolean): string {
  const clean = normalizeMilestoneListView(view);
  const rest = searchWithoutMilestoneFilters(search);
  const parts = rest ? [rest] : [];
  if (clean.statuses.length > 0) parts.push(`${MILESTONE_FILTER_PARAMS.status}=${joined(clean.statuses)}`);
  if (clean.types.length > 0) parts.push(`${MILESTONE_FILTER_PARAMS.type}=${joined(clean.types)}`);
  if (staff && clean.approval.length > 0) parts.push(`${MILESTONE_FILTER_PARAMS.approval}=${joined(clean.approval)}`);
  if (staff && clean.needsYou) parts.push(`${MILESTONE_FILTER_PARAMS.needsYou}=${MILESTONE_NEEDS_YOU_PARAM_VALUE}`);
  return parts.join('&');
}

/* ── The copy kept for the session ─────────────────────────────────────────── */

export type MilestoneViewStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

const KEY = 'wh-portal-milestone-filters';
const VERSION = 1;

/** One key per project, so each project keeps its own filters. */
export function milestoneViewKey(projectId: string): string {
  return `${KEY}:${projectId}`;
}

/** The tab's session store, or null on the server and where storage is blocked. */
export function sessionMilestoneViewStore(): MilestoneViewStore | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

/**
 * The view kept for this project, or null. A copy written for another
 * project, another version, one that does not parse, or one with no filter
 * left after unknown values drop is ignored.
 */
export function readStoredMilestoneView(
  store: MilestoneViewStore | null,
  projectId: string,
  staff: boolean,
): MilestoneListView | null {
  if (!store || !projectId) return null;
  try {
    const raw = store.getItem(milestoneViewKey(projectId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (parsed == null || typeof parsed !== 'object') return null;
    const entry = parsed as Record<string, unknown>;
    if (entry.v !== VERSION || entry.projectId !== projectId) return null;
    const view = normalizeMilestoneListView(entry.view);
    return milestoneListViewIsFiltered(view, staff) ? view : null;
  } catch {
    return null;
  }
}

/**
 * Keep the view for this project. No filter set is stored as no key. Storage
 * errors are swallowed: the copy is a convenience and must never break the page.
 */
export function writeStoredMilestoneView(
  store: MilestoneViewStore | null,
  projectId: string,
  view: MilestoneListView,
): void {
  if (!store || !projectId) return;
  try {
    const key = milestoneViewKey(projectId);
    const clean = normalizeMilestoneListView(view);
    if (!milestoneListViewIsFiltered(clean, true)) {
      store.removeItem(key);
      return;
    }
    store.setItem(key, JSON.stringify({ v: VERSION, projectId, view: clean }));
  } catch {
    // Full or blocked storage.
  }
}

export type OpeningMilestoneView = {
  view: MilestoneListView;
  /** Where it came from. `stored` means the address does not show it yet. */
  from: 'address' | 'stored' | 'none';
};

/** The view the page opens with: the address, then the stored view, then no filter. */
export function openingMilestoneView(input: {
  search: string;
  stored: MilestoneListView | null;
  staff: boolean;
}): OpeningMilestoneView {
  const fromAddress = milestoneViewFromSearch(input.search, input.staff);
  if (fromAddress) return { view: fromAddress, from: 'address' };
  if (input.stored && milestoneListViewIsFiltered(input.stored, input.staff)) {
    return { view: input.stored, from: 'stored' };
  }
  return { view: emptyMilestoneListView(), from: 'none' };
}
