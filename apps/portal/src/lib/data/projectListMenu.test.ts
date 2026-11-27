import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  defaultProjectListView,
  effectiveProjectSort,
  formatProjectFilterDay,
  projectFilterKeys,
  projectFilterSummary,
  projectFilterValueChips,
  projectListFixtureScreen,
  projectMatchesView,
  projectSortControlLabel,
  projectSortDirections,
  projectSortKeys,
  projectSortSubtitle,
  type ProjectListViewOptions,
} from './projectList';

const options: ProjectListViewOptions = {
  status: ['Planned', 'In progress'],
  clients: [
    { id: 'c-harbor', name: 'Harbor & Pine' },
    { id: 'c-north', name: 'Northwind Foods' },
  ],
  stack: ['Next.js'],
};

describe('project list sort copy', () => {
  it('writes the control value and the subtitle from the sort', () => {
    assert.equal(projectSortControlLabel({ key: 'lastUpdated', direction: 'desc' }), 'Last updated · Newest first');
    assert.equal(projectSortSubtitle({ key: 'lastUpdated', direction: 'desc' }), 'Sorted by last updated, newest first');
    assert.equal(projectSortControlLabel({ key: 'name', direction: 'desc' }), 'Name · Z to A');
    assert.equal(projectSortSubtitle({ key: 'startDate', direction: 'asc' }), 'Sorted by start date, earliest first');
    assert.equal(projectSortControlLabel({ key: 'tasks', direction: 'asc' }), 'Tasks · Fewest first');
    assert.equal(projectSortControlLabel({ key: 'progress', direction: 'asc' }), 'Progress · Least first');
  });

  it('lists the first direction on top and leaves Client out for a client viewer', () => {
    assert.deepEqual(projectSortDirections('lastUpdated'), ['desc', 'asc']);
    assert.deepEqual(projectSortDirections('name'), ['asc', 'desc']);
    assert.equal(projectSortKeys(true).includes('client'), true);
    assert.equal(projectSortKeys(false).includes('client'), false);
    const view = { ...defaultProjectListView(), sort: { key: 'client' as const, direction: 'asc' as const } };
    assert.deepEqual(effectiveProjectSort(view, false), { key: 'lastUpdated', direction: 'desc' });
    assert.deepEqual(effectiveProjectSort(view, true), { key: 'client', direction: 'asc' });
  });
});

describe('project list filter menu copy', () => {
  it('gives a client no Client or Publish state filter and hides Stack with no stack', () => {
    assert.deepEqual(projectFilterKeys(true, options), [
      'status',
      'client',
      'publish',
      'stack',
      'startDate',
      'endDate',
      'progress',
      'tasks',
      'updated',
    ]);
    assert.deepEqual(projectFilterKeys(false, options), [
      'status',
      'stack',
      'startDate',
      'endDate',
      'progress',
      'tasks',
      'updated',
    ]);
    assert.equal(projectFilterKeys(true, { ...options, stack: [] }).includes('stack'), false);
  });

  it('summarises a filter as Any, the one value, or a count', () => {
    const view = defaultProjectListView();
    assert.deepEqual(projectFilterSummary('status', view, options), { text: 'Any', set: false });
    assert.deepEqual(projectFilterSummary('updated', view, options), { text: 'Any time', set: false });
    view.clientIds = ['c-north'];
    view.status = ['Planned', 'In progress'];
    view.publish = 'published';
    view.updated = '30d';
    view.startDate = { from: '2026-11-01', to: null };
    assert.deepEqual(projectFilterSummary('client', view, options), { text: 'Northwind Foods', set: true });
    assert.deepEqual(projectFilterSummary('status', view, options), { text: '2 selected', set: true });
    assert.deepEqual(projectFilterSummary('publish', view, options), { text: 'Published', set: true });
    assert.deepEqual(projectFilterSummary('updated', view, options), { text: 'Last 30 days', set: true });
    assert.deepEqual(projectFilterSummary('startDate', view, options), { text: 'From Nov 1, 2026', set: true });
    assert.equal(formatProjectFilterDay('2026-03-09'), 'Mar 9, 2026');
  });

  it('makes one chip per value, and removing a chip removes that value only', () => {
    const view = defaultProjectListView();
    view.clientIds = ['c-north', 'c-harbor'];
    view.publish = 'published';
    view.updated = '30d';
    const chips = projectFilterValueChips(view, true, options);
    assert.deepEqual(
      chips.map((chip) => `${chip.field} ${chip.value}`),
      ['Client: Northwind Foods', 'Client: Harbor & Pine', 'Publish state: Published', 'Last updated: Last 30 days'],
    );
    const next = chips[0].remove(view);
    assert.deepEqual(next.clientIds, ['c-harbor']);
    assert.equal(next.publish, 'published');
    assert.equal(next.updated, '30d');
    assert.equal(chips[2].remove(view).publish, 'any');
    assert.deepEqual(projectFilterValueChips(view, false, options).map((chip) => chip.field), ['Last updated:']);
  });
});

describe('project list fixture screens', () => {
  it('opens the menus and sets filters for the design review', () => {
    assert.equal(projectListFixtureScreen(null, null, true, options), null);
    assert.equal(projectListFixtureScreen('filtered', null, true, options), null);
    const filters = projectListFixtureScreen('filters', null, true, options);
    assert.equal(filters?.open, 'filters');
    assert.deepEqual(filters?.expanded, ['status', 'startDate']);
    assert.equal(projectListFixtureScreen('sort', null, true, options)?.open, 'sort');
    const one = projectListFixtureScreen('one-filter', null, true, options);
    assert.deepEqual(one?.view.status, ['Planned']);
    assert.equal(one?.open, null);
    const several = projectListFixtureScreen('several-filters', 'filters', true, options);
    assert.equal(several?.open, 'filters');
    assert.deepEqual(several?.view.clientIds, ['c-harbor']);
    assert.equal(several?.view.publish, 'published');
    const client = projectListFixtureScreen('several-filters', 'sort', false, options);
    assert.equal(client?.open, 'sort');
    assert.deepEqual(client?.view.clientIds, []);
    assert.equal(client?.view.publish, 'any');
  });

  it('builds a no-matches view that no row passes', () => {
    const screen = projectListFixtureScreen('no-matches', null, true, options);
    assert.ok(screen);
    const row = {
      id: 'p1',
      name: 'Site',
      status: 'Planned',
      startDate: '2026-09-01',
      percent: 40,
      taskCount: 3,
    };
    assert.equal(projectMatchesView(row, screen.view, true), false);
  });
});
