/**
 * Activity page view model.
 * Client rows are already filtered by buildActivityFeed. This module does not
 * decide who can see an event. Staff publish marks read the clientVisible
 * flag that helper sets. "Not published" is a staff display filter on that flag.
 */

export type ActivityAudience = 'staff' | 'client';

export type ActivityFilter = 'all' | 'tasks' | 'resources' | 'sync' | 'unpublished';

export type ActivityLane = 'tasks' | 'resources' | 'people' | 'sync';

export type ActivityInputItem = {
  id: string;
  name: string;
  summary: string;
  type: string;
  timestamp: string;
  /** Filter lane from the feed. Visibility stays on `type` / clientVisible. */
  lane?: ActivityLane;
  /** Staff feed only. Omitted on the client feed. */
  clientVisible?: boolean;
};

export type ActivityRow = {
  id: string;
  name: string;
  summary: string;
  when: string;
  type: string;
  lane: ActivityLane | 'other';
  /** Staff rows only. */
  published?: boolean;
};

export type ActivityGroup = {
  key: 'today' | 'yesterday' | 'week' | 'earlier';
  label: string;
  countLabel: string;
  rows: ActivityRow[];
};

export type ActivityChip = {
  key: ActivityFilter;
  label: string;
  count: number;
};

export type ActivityView = {
  audience: ActivityAudience;
  title: string;
  subtitle: string;
  filters: ActivityChip[];
  groups: ActivityGroup[];
  rows: ActivityRow[];
  total: number;
};

const DAY = 24 * 60 * 60 * 1000;

const FILTER_LABEL: Record<ActivityFilter, string> = {
  all: 'All',
  tasks: 'Tasks',
  resources: 'Resources',
  sync: 'Sync',
  unpublished: 'Not published',
};

const GROUP_LABEL: Record<ActivityGroup['key'], string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  week: 'Earlier this week',
  earlier: 'Earlier',
};

export function activityFiltersFor(audience: ActivityAudience): ActivityFilter[] {
  if (audience === 'staff') return ['all', 'tasks', 'resources', 'sync', 'unpublished'];
  return ['all', 'tasks', 'resources'];
}

export function activityEmptyCopy(audience: ActivityAudience): { title: string; body: string } {
  if (audience === 'staff') {
    return {
      title: 'No activity yet',
      body: 'Events from tasks, resources and sync will show here.',
    };
  }
  return {
    title: 'No updates yet',
    body: 'Updates Warehaus shares with you will show here.',
  };
}

export const STAFF_ACTIVITY_ERROR = {
  title: 'Activity feed is behind',
  body: 'Events will appear when it catches up.',
  previewBody: 'Notion sync is behind by 14 minutes. Events will appear when it catches up.',
} as const;

export const CLIENT_ACTIVITY_ERROR = {
  title: 'We could not load your updates',
  body: 'Try again in a moment.',
} as const;

/** Preview row. The title is long on purpose so the row wraps instead of clipping. */
export const ACTIVITY_LONG_PREVIEW: Record<
  ActivityAudience,
  { name: string; summary: string; published?: boolean }
> = {
  staff: {
    name: 'Quarterly seasonal menu photography, packaging and in-store signage rollout for all twelve Northwind Foods locations moved to Awaiting Go',
    summary: 'Maya Chen · Northwind Foods · Source: Notion',
    published: true,
  },
  client: {
    name: 'Spring menu launch for all Northwind Foods locations is ready for your review',
    summary: 'Maya Chen',
  },
};

const WEEKDAY: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function laneOf(item: ActivityInputItem): ActivityRow['lane'] {
  if (item.lane === 'tasks' || item.lane === 'resources' || item.lane === 'people' || item.lane === 'sync') {
    return item.lane;
  }
  if (item.type === 'task' || item.type === 'project') return 'tasks';
  if (item.type === 'resource') return 'resources';
  if (item.type === 'sync' || item.type === 'exception') return 'sync';
  return 'other';
}

function zoneOrUtc(timeZone: string): string {
  try {
    Intl.DateTimeFormat('en-US', { timeZone });
    return timeZone;
  } catch {
    return 'UTC';
  }
}

function viewerZone(timeZone?: string): string {
  if (timeZone) return zoneOrUtc(timeZone);
  const local = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return zoneOrUtc(local || 'UTC');
}

/** Calendar day in `timeZone`, not UTC. Weekday is Sunday = 0. */
function localDay(ms: number, timeZone: string): { index: number; weekday: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).formatToParts(new Date(ms));
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  const year = Number(read('year'));
  const month = Number(read('month'));
  const day = Number(read('day'));
  return {
    index: Math.floor(Date.UTC(year, month - 1, day) / DAY),
    weekday: WEEKDAY[read('weekday')] ?? 0,
  };
}

function groupOf(ms: number, now: number, timeZone: string): ActivityGroup['key'] {
  const day = localDay(ms, timeZone);
  const today = localDay(now, timeZone);
  if (day.index === today.index) return 'today';
  if (day.index === today.index - 1) return 'yesterday';
  if (day.index - day.weekday === today.index - today.weekday) return 'week';
  return 'earlier';
}

function formatLocalDate(ms: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone }).format(new Date(ms));
}

function whenLabel(iso: string, now: number, timeZone: string): string {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return '';
  if (localDay(time, timeZone).index !== localDay(now, timeZone).index) return formatLocalDate(time, timeZone);
  const minutes = Math.max(0, Math.round((now - time) / 60000));
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.max(1, Math.round(minutes / 60))}h ago`;
}

function eventCount(count: number): string {
  return `${count} event${count === 1 ? '' : 's'}`;
}

function heading(audience: ActivityAudience, filter: ActivityFilter, clientName?: string | null): {
  title: string;
  subtitle: string;
} {
  const subtitle =
    audience === 'staff'
      ? 'Everything that happened, including events not published to clients'
      : `Only events Warehaus has published to ${clientName?.trim() || 'you'}`;
  const title =
    filter === 'all'
      ? audience === 'staff'
        ? 'All activity'
        : 'Updates for you'
      : FILTER_LABEL[filter];
  return { title, subtitle };
}

function toRow(item: ActivityInputItem, audience: ActivityAudience, now: number, timeZone: string): ActivityRow {
  const row: ActivityRow = {
    id: item.id,
    name: item.name,
    summary: item.summary,
    when: whenLabel(item.timestamp, now, timeZone),
    type: item.type,
    lane: laneOf(item),
  };
  if (audience === 'staff') row.published = item.clientVisible === true;
  return row;
}

function matches(item: ActivityInputItem, filter: ActivityFilter, audience: ActivityAudience): boolean {
  if (filter === 'all') return true;
  if (filter === 'unpublished') {
    if (audience !== 'staff') return true;
    return item.clientVisible !== true;
  }
  return laneOf(item) === filter;
}

export function buildActivityView(input: {
  audience: ActivityAudience;
  items: readonly ActivityInputItem[];
  filter: ActivityFilter;
  now: number;
  /** IANA zone for Today / Yesterday. Tests pass this so the clock stays fixed. */
  timeZone?: string;
  clientName?: string | null;
}): ActivityView {
  const timeZone = viewerZone(input.timeZone);
  const filter = activityFiltersFor(input.audience).includes(input.filter) ? input.filter : 'all';
  const ordered = [...input.items].sort(
    (a, b) => (Date.parse(b.timestamp) || 0) - (Date.parse(a.timestamp) || 0),
  );
  const filters = activityFiltersFor(input.audience).map((key) => ({
    key,
    label: FILTER_LABEL[key],
    count: ordered.filter((item) => matches(item, key, input.audience)).length,
  }));
  const rows = ordered
    .filter((item) => matches(item, filter, input.audience))
    .map((item) => toRow(item, input.audience, input.now, timeZone));
  const grouped = new Map<ActivityGroup['key'], ActivityRow[]>();
  for (const item of ordered.filter((row) => matches(row, filter, input.audience))) {
    const time = Date.parse(item.timestamp);
    const key = Number.isNaN(time) ? 'earlier' : groupOf(time, input.now, timeZone);
    const list = grouped.get(key) ?? [];
    list.push(toRow(item, input.audience, input.now, timeZone));
    grouped.set(key, list);
  }
  const groups = (['today', 'yesterday', 'week', 'earlier'] as const)
    .filter((key) => grouped.has(key))
    .map((key) => {
      const groupRows = grouped.get(key) ?? [];
      return {
        key,
        label: GROUP_LABEL[key],
        countLabel: eventCount(groupRows.length),
        rows: groupRows,
      };
    });
  const copy = heading(input.audience, filter, input.clientName);
  return {
    audience: input.audience,
    title: copy.title,
    subtitle: copy.subtitle,
    filters,
    groups,
    rows,
    total: ordered.length,
  };
}

/** Long-text preview row. Chip counts stay equal to the rows on screen. */
export function withActivityLongPreview(view: ActivityView, filter: ActivityFilter): ActivityView {
  const sample = ACTIVITY_LONG_PREVIEW[view.audience];
  const row: ActivityRow = {
    id: 'long-text',
    name: sample.name,
    summary: sample.summary,
    when: '2h ago',
    type: 'project',
    lane: 'tasks',
    ...(view.audience === 'staff' ? { published: sample.published === true } : {}),
  };
  const filters = view.filters.map((chip) =>
    chip.key === 'all' || chip.key === 'tasks' ? { ...chip, count: chip.count + 1 } : chip,
  );
  const show = filter === 'all' || filter === 'tasks';
  if (!show) return { ...view, filters, total: view.total + 1 };
  const groups = view.groups.map((group) => ({ ...group, rows: [...group.rows] }));
  const today = groups.find((group) => group.key === 'today');
  if (today) today.rows = [row, ...today.rows];
  else groups.unshift({ key: 'today', label: GROUP_LABEL.today, countLabel: '', rows: [row] });
  return {
    ...view,
    filters,
    groups: groups.map((group) => ({ ...group, countLabel: eventCount(group.rows.length) })),
    rows: [row, ...view.rows],
    total: view.total + 1,
  };
}
