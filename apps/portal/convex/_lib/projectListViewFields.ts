import { v } from 'convex/values';

/**
 * Strict validators for the saved project list view. Used for the
 * `projectListPrefs` table and for `saveMine` arguments, so an unknown key or
 * value is refused before the handler runs. Shape: `ProjectListView` in
 * `./projectListView`.
 */
const dateRange = v.object({
  from: v.union(v.string(), v.null()),
  to: v.union(v.string(), v.null()),
});

export const projectListViewFields = {
  quick: v.union(v.literal('all'), v.literal('active'), v.literal('shipped'), v.literal('internal')),
  status: v.array(v.string()),
  /** Staff only. Always empty on a client's row. */
  clientIds: v.array(v.string()),
  /** Staff only. Always `any` on a client's row. */
  publish: v.union(v.literal('any'), v.literal('published'), v.literal('unpublished')),
  stack: v.array(v.string()),
  startDate: dateRange,
  endDate: dateRange,
  progress: v.array(
    v.union(v.literal('notStarted'), v.literal('inProgress'), v.literal('complete'), v.literal('none')),
  ),
  tasks: v.union(v.literal('any'), v.literal('has'), v.literal('none')),
  updated: v.union(v.literal('any'), v.literal('7d'), v.literal('30d'), v.literal('90d')),
  sort: v.object({
    key: v.union(
      v.literal('lastUpdated'),
      v.literal('name'),
      v.literal('client'),
      v.literal('status'),
      v.literal('startDate'),
      v.literal('endDate'),
      v.literal('progress'),
      v.literal('tasks'),
    ),
    direction: v.union(v.literal('asc'), v.literal('desc')),
  }),
};
