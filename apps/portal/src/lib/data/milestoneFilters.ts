import type { MilestoneWorkType } from '@convex/_lib/designGate';
import { MILESTONE_APPROVALS, type MilestoneApproval, type MilestoneRoadmapView } from '@convex/_lib/milestones';
import { MILESTONE_STATUSES, type MilestoneStatus } from '@convex/_lib/milestoneStatus';
import { groupMilestones } from '@convex/_lib/milestoneTasks';

/**
 * Filters for the milestone list on the project page
 * (`docs/design/milestone-filters.md`). Pure: it works on the list the page
 * already loaded, so a filter adds no Convex read. Same shape as the project
 * list's filters in `projectList.ts`.
 *
 * Every filter is pick-many. Values inside one filter are OR, filters are AND.
 * Approval and Needs you are staff only: a client's view ignores them even
 * when they are set. Archived is its own chip on the page, not a filter here.
 */

export const MILESTONE_WORK_TYPES = ['design', 'build', 'both'] as const satisfies readonly MilestoneWorkType[];

export type MilestoneListView = {
  statuses: MilestoneStatus[];
  types: MilestoneWorkType[];
  /** Staff only. */
  approval: MilestoneApproval[];
  /** Staff only. True keeps milestones with an open Ask on the viewer. */
  needsYou: boolean;
};

/**
 * What the filters read from a milestone. `needsYou` is not on the loaded
 * milestone: the page works it out for the viewer (an open Ask on them) and
 * passes it in. Absent means no.
 */
export type MilestoneFilterRow = Pick<MilestoneRoadmapView, 'status' | 'workType' | 'approval'> & {
  needsYou?: boolean;
};

export function emptyMilestoneListView(): MilestoneListView {
  return { statuses: [], types: [], approval: [], needsYou: false };
}

/** The known values of `picked`, once each, in the order of `known`. */
function knownValues<T extends string>(picked: unknown, known: readonly T[]): T[] {
  if (!Array.isArray(picked)) return [];
  return known.filter((value) => picked.includes(value));
}

/**
 * A view from anything: a stored value, an old shape, or nothing. Unknown
 * values drop (a status that no longer exists), repeats collapse, and values
 * come back in menu order.
 */
export function normalizeMilestoneListView(value: unknown): MilestoneListView {
  if (!value || typeof value !== 'object') return emptyMilestoneListView();
  const raw = value as Record<string, unknown>;
  return {
    statuses: knownValues(raw.statuses, MILESTONE_STATUSES),
    types: knownValues(raw.types, MILESTONE_WORK_TYPES),
    approval: knownValues(raw.approval, MILESTONE_APPROVALS),
    needsYou: raw.needsYou === true,
  };
}

export function sameMilestoneListView(left: MilestoneListView, right: MilestoneListView): boolean {
  const a = normalizeMilestoneListView(left);
  const b = normalizeMilestoneListView(right);
  const same = (x: readonly string[], y: readonly string[]) => x.length === y.length && x.every((v, i) => v === y[i]);
  return (
    same(a.statuses, b.statuses) && same(a.types, b.types) && same(a.approval, b.approval) && a.needsYou === b.needsYou
  );
}

/** One milestone against the view. Does not prune: see `filterMilestones`. */
export function milestoneMatchesFilters(
  milestone: MilestoneFilterRow,
  view: MilestoneListView,
  staff: boolean,
): boolean {
  if (view.statuses.length > 0 && !view.statuses.includes(milestone.status)) return false;
  // A milestone with no counted task has no type, so it matches no Type pick.
  if (view.types.length > 0 && !(milestone.workType && view.types.includes(milestone.workType))) return false;
  if (!staff) return true;
  if (view.approval.length > 0 && !(milestone.approval && view.approval.includes(milestone.approval))) return false;
  if (view.needsYou && milestone.needsYou !== true) return false;
  return true;
}

export type MilestoneListViewOptions = {
  statuses: MilestoneStatus[];
  types: MilestoneWorkType[];
  /** Staff only. Empty for a client viewer. */
  approval: MilestoneApproval[];
  /** Staff only. Whether Needs you is offered. False for a client viewer. */
  needsYou: boolean;
};

/**
 * The values to offer for one filter: those some milestone has, in menu
 * order. Empty when no value can narrow the list, which is when every
 * milestone has the same one (or none has any).
 */
function narrowingValues<T extends string>(
  known: readonly T[],
  values: readonly (T | null | undefined)[],
): T[] {
  const present = known.filter((value) => values.includes(value));
  const narrows = present.some((value) => values.some((other) => other !== value));
  return narrows ? present : [];
}

/**
 * Menu choices, from the milestones the viewer has and nothing else, so a
 * client is only offered statuses they can see. A filter with no choices is
 * hidden: it cannot narrow this list.
 */
export function milestoneListViewOptions(
  milestones: readonly MilestoneFilterRow[],
  staff: boolean,
): MilestoneListViewOptions {
  const needing = staff ? milestones.filter((milestone) => milestone.needsYou === true).length : 0;
  return {
    statuses: narrowingValues(
      MILESTONE_STATUSES,
      milestones.map((milestone) => milestone.status),
    ),
    types: narrowingValues(
      MILESTONE_WORK_TYPES,
      milestones.map((milestone) => milestone.workType),
    ),
    approval: staff
      ? narrowingValues(
          MILESTONE_APPROVALS,
          milestones.map((milestone) => milestone.approval),
        )
      : [],
    needsYou: needing > 0 && needing < milestones.length,
  };
}

/**
 * Drops picked values that are not a current choice (a status no milestone
 * has now, a filter that is hidden), so a stale value is not shown as picked
 * and does not hide every row. Use the result to filter, count and draw
 * chips. Do not save it back: the value may return.
 */
export function pruneMilestoneListView(view: MilestoneListView, options: MilestoneListViewOptions): MilestoneListView {
  const clean = normalizeMilestoneListView(view);
  return {
    statuses: clean.statuses.filter((value) => options.statuses.includes(value)),
    types: clean.types.filter((value) => options.types.includes(value)),
    approval: clean.approval.filter((value) => options.approval.includes(value)),
    needsYou: clean.needsYou && options.needsYou,
  };
}

/**
 * The milestones the view keeps, in the order given. Stale values are pruned
 * against this list first. The empty view returns every milestone.
 */
export function filterMilestones<T extends MilestoneFilterRow>(
  milestones: readonly T[],
  view: MilestoneListView,
  staff: boolean,
): T[] {
  const pruned = pruneMilestoneListView(view, milestoneListViewOptions(milestones, staff));
  return milestones.filter((milestone) => milestoneMatchesFilters(milestone, pruned, staff));
}

export type MilestoneFilterResult<T> = {
  /** The menu choices this list has. */
  options: MilestoneListViewOptions;
  /** The view as shown: stale picks dropped. Draw the bar from this, keep the held view as it is. */
  shown: MilestoneListView;
  /** Whether any filter is set, after pruning. */
  filtered: boolean;
  /** The milestones to group and draw, in the order given. */
  matches: T[];
  /** A filter is set and nothing matches: draw the no-match state instead of the groups. */
  noMatches: boolean;
  /**
   * A filter is set and every match is in the Done group. The page opens that
   * group, since a collapsed row would be the whole result. With a match in
   * another group it stays as the viewer left it.
   */
  onlyShipped: boolean;
};

/**
 * Everything the project page needs from one view: the choices, the view to
 * show, and the matches. The page passes `matches` to `groupMilestones()` and
 * keeps its other reads (the approved count, the open milestone) on the full
 * list.
 */
export function milestoneFilterResult<T extends MilestoneFilterRow>(
  milestones: readonly T[],
  view: MilestoneListView,
  staff: boolean,
): MilestoneFilterResult<T> {
  const options = milestoneListViewOptions(milestones, staff);
  const shown = pruneMilestoneListView(view, options);
  const filtered = milestoneListViewIsFiltered(shown, staff);
  const matches = filtered
    ? milestones.filter((milestone) => milestoneMatchesFilters(milestone, shown, staff))
    : [...milestones];
  const groups = groupMilestones(matches, staff);
  return {
    options,
    shown,
    filtered,
    matches,
    noMatches: filtered && matches.length === 0,
    onlyShipped: filtered && groups.length === 1 && groups[0].id === 'shipped',
  };
}

/** How many filters are set. Filters, not values. Staff-only filters do not count for a client. */
export function activeMilestoneFilterCount(view: MilestoneListView, staff: boolean): number {
  const set = [
    view.statuses.length > 0,
    view.types.length > 0,
    staff && view.approval.length > 0,
    staff && view.needsYou,
  ];
  return set.filter(Boolean).length;
}

/** Clear filters shows when any filter is set. */
export function milestoneListViewIsFiltered(view: MilestoneListView, staff: boolean): boolean {
  return activeMilestoneFilterCount(view, staff) > 0;
}

/* ── Menu and chip copy ────────────────────────────────────────────────────── */

export type MilestoneFilterKey = 'status' | 'type' | 'approval' | 'needsYou';

export const MILESTONE_FILTER_LABEL: Record<MilestoneFilterKey, string> = {
  status: 'Status',
  type: 'Type',
  approval: 'Approval',
  needsYou: 'Needs you',
};

/** A status is its own label. */
export const MILESTONE_STATUS_FILTER_LABEL: Record<MilestoneStatus, string> = {
  Idea: 'Idea',
  Planning: 'Planning',
  'Awaiting Go': 'Awaiting Go',
  Building: 'Building',
  'Ready to Ship': 'Ready to Ship',
  Shipped: 'Shipped',
  Parked: 'Parked',
};

export const MILESTONE_TYPE_LABEL: Record<MilestoneWorkType, string> = {
  design: 'Design',
  build: 'Dev',
  both: 'Design and dev',
};

export const MILESTONE_APPROVAL_FILTER_LABEL: Record<MilestoneApproval, string> = {
  unreviewed: 'Unreviewed',
  approved: 'Approved',
  changes_requested: 'Changes requested',
};

/** The one Needs you option. */
export const MILESTONE_NEEDS_YOU_LABEL = 'Open Ask on you';

export const MILESTONE_FILTERS_EMPTY_TITLE = 'No milestones match these filters.';
export const MILESTONE_FILTERS_CLEAR = 'Clear filters';

const FILTER_ORDER: readonly MilestoneFilterKey[] = ['status', 'type', 'approval', 'needsYou'];

/** Menu filters in order. Approval and Needs you are staff only. A filter with no choices is hidden. */
export function milestoneFilterKeys(staff: boolean, options: MilestoneListViewOptions): MilestoneFilterKey[] {
  return FILTER_ORDER.filter((key) => {
    switch (key) {
      case 'status':
        return options.statuses.length > 0;
      case 'type':
        return options.types.length > 0;
      case 'approval':
        return staff && options.approval.length > 0;
      case 'needsYou':
        return staff && options.needsYou;
    }
  });
}

function pickedLabels(key: MilestoneFilterKey, view: MilestoneListView): string[] {
  switch (key) {
    case 'status':
      return view.statuses.map((value) => MILESTONE_STATUS_FILTER_LABEL[value]);
    case 'type':
      return view.types.map((value) => MILESTONE_TYPE_LABEL[value]);
    case 'approval':
      return view.approval.map((value) => MILESTONE_APPROVAL_FILTER_LABEL[value]);
    case 'needsYou':
      return view.needsYou ? [MILESTONE_NEEDS_YOU_LABEL] : [];
  }
}

/** The summary beside a filter's name: `Any`, the one value, or `2 selected`. */
export function milestoneFilterSummary(key: MilestoneFilterKey, view: MilestoneListView): { text: string; set: boolean } {
  const labels = pickedLabels(key, view);
  if (labels.length === 0) return { text: 'Any', set: false };
  return { text: labels.length === 1 ? labels[0] : `${labels.length} selected`, set: true };
}

export type MilestoneFilterValueChip = {
  id: string;
  /** With its colon, as drawn: `Status:`. */
  field: string;
  value: string;
  /** The view with this one value removed. */
  remove: (view: MilestoneListView) => MilestoneListView;
};

/**
 * One chip per value that is set, in menu order. Removing a chip removes that
 * value only. A client gets no chip for a staff-only filter. Pass the pruned
 * view, so a stale value draws no chip.
 */
export function milestoneFilterValueChips(view: MilestoneListView, staff: boolean): MilestoneFilterValueChip[] {
  const clean = normalizeMilestoneListView(view);
  const field = (key: MilestoneFilterKey) => `${MILESTONE_FILTER_LABEL[key]}:`;
  const chips: MilestoneFilterValueChip[] = [];
  for (const value of clean.statuses) {
    chips.push({
      id: `status:${value}`,
      field: field('status'),
      value: MILESTONE_STATUS_FILTER_LABEL[value],
      remove: (next) => ({ ...next, statuses: next.statuses.filter((item) => item !== value) }),
    });
  }
  for (const value of clean.types) {
    chips.push({
      id: `type:${value}`,
      field: field('type'),
      value: MILESTONE_TYPE_LABEL[value],
      remove: (next) => ({ ...next, types: next.types.filter((item) => item !== value) }),
    });
  }
  if (!staff) return chips;
  for (const value of clean.approval) {
    chips.push({
      id: `approval:${value}`,
      field: field('approval'),
      value: MILESTONE_APPROVAL_FILTER_LABEL[value],
      remove: (next) => ({ ...next, approval: next.approval.filter((item) => item !== value) }),
    });
  }
  if (clean.needsYou) {
    chips.push({
      id: 'needsYou',
      field: field('needsYou'),
      value: MILESTONE_NEEDS_YOU_LABEL,
      remove: (next) => ({ ...next, needsYou: false }),
    });
  }
  return chips;
}
