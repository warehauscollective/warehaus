/**
 * Activity page view model.
 * Client rows are already filtered by buildActivityFeed. This module does not
 * decide who can see an event. Staff publish marks read the clientVisible
 * flag that helper sets. "Not published" is a staff display filter on that flag.
 */

import { formatPortalDate } from '@/lib/data/view-models';

export type ActivityAudience = 'staff' | 'client';

export type ActivityFilter = 'all' | 'tasks' | 'resources' | 'sync' | 'unpublished';

export type ActivityInputItem = {
  id: string;
  name: string;
  summary: string;
  type: string;
  timestamp: string;
  /** Staff feed only. Omitted on the client feed. */
  clientVisible?: boolean;
};

export type ActivityRow = {
  id: string;
  name: string;
  summary: string;
  when: string;
  type: string;
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

function bucket(type: string): 'tasks' | 'resources' | 'sync' | 'other' {
  if (type === 'task' || type === 'project') return 'tasks';
  if (type === 'resource') return 'resources';
  return type === 'sync' || type === 'exception' ? 'sync' : 'other';
}

function utcDay(ms: number): number {
  return Math.floor(ms / DAY);
}

function weekStartDay(ms: number): number {
  return utcDay(ms) - new Date(ms).getUTCDay();
}

function groupOf(ms: number, now: number): ActivityGroup['key'] {
  const day = utcDay(ms);
  const today = utcDay(now);
  if (day === today) return 'today';
  if (day === today - 1) return 'yesterday';
  if (weekStartDay(ms) === weekStartDay(now)) return 'week';
  return 'earlier';
}

function whenLabel(iso: string, now: number): string {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return '';
  if (utcDay(time) !== utcDay(now)) return formatPortalDate(iso);
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

function toRow(item: ActivityInputItem, audience: ActivityAudience, now: number): ActivityRow {
  const row: ActivityRow = {
    id: item.id,
    name: item.name,
    summary: item.summary,
    when: whenLabel(item.timestamp, now),
    type: item.type,
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
  return bucket(item.type) === filter;
}

export function buildActivityView(input: {
  audience: ActivityAudience;
  items: readonly ActivityInputItem[];
  filter: ActivityFilter;
  now: number;
  clientName?: string | null;
}): ActivityView {
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
    .map((item) => toRow(item, input.audience, input.now));
  const grouped = new Map<ActivityGroup['key'], ActivityRow[]>();
  for (const item of ordered.filter((row) => matches(row, filter, input.audience))) {
    const time = Date.parse(item.timestamp);
    const key = Number.isNaN(time) ? 'earlier' : groupOf(time, input.now);
    const list = grouped.get(key) ?? [];
    list.push(toRow(item, input.audience, input.now));
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
