import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MILESTONE_STATUSES } from '@convex/_lib/milestoneStatus';
import { groupMilestones } from '@convex/_lib/milestoneTasks';
import { FIXTURE_TASKS } from './fixtures';
import { applyFixtureMilestonePreview, fixtureMilestones } from './milestoneRoadmap';
import {
  MILESTONE_APPROVAL_FILTER_LABEL,
  MILESTONE_FILTER_LABEL,
  MILESTONE_NEEDS_YOU_LABEL,
  MILESTONE_STATUS_FILTER_LABEL,
  MILESTONE_TYPE_LABEL,
  activeMilestoneFilterCount,
  emptyMilestoneListView,
  filterMilestones,
  milestoneFilterKeys,
  milestoneFilterResult,
  milestoneFilterSummary,
  milestoneFilterValueChips,
  milestoneListViewIsFiltered,
  milestoneListViewOptions,
  milestoneMatchesFilters,
  normalizeMilestoneListView,
  pruneMilestoneListView,
  sameMilestoneListView,
  type MilestoneFilterRow,
  type MilestoneListView,
} from './milestoneFilters';

type Row = MilestoneFilterRow & { id: string };

/** What staff load. The last milestone has no counted task, so no type. */
const STAFF: Row[] = [
  { id: 'a', status: 'Building', workType: 'design', approval: 'unreviewed' },
  { id: 'b', status: 'Ready to Ship', workType: 'both', approval: 'unreviewed', needsYou: true },
  { id: 'c', status: 'Shipped', workType: 'build', approval: 'approved' },
  { id: 'd', status: 'Building', workType: 'build', approval: 'changes_requested' },
  { id: 'e', status: 'Planning', approval: 'unreviewed' },
];

/** What a client loads: no approval key, no Ask. */
const CLIENT: Row[] = STAFF.map(({ id, status, workType }) => ({ id, status, ...(workType ? { workType } : {}) }));

function view(patch: Partial<MilestoneListView> = {}): MilestoneListView {
  return { ...emptyMilestoneListView(), ...patch };
}

function ids(rows: readonly Row[]): string {
  return rows.map((row) => row.id).join('');
}

describe('filterMilestones', () => {
  it('returns the list unchanged and in order for the empty view', () => {
    const out = filterMilestones(STAFF, emptyMilestoneListView(), true);
    assert.deepEqual(out, STAFF);
    out.forEach((row, index) => assert.equal(row, STAFF[index]));
    assert.deepEqual(filterMilestones(CLIENT, emptyMilestoneListView(), false), CLIENT);
    assert.deepEqual(filterMilestones([], emptyMilestoneListView(), true), []);
  });

  it('filters by status alone', () => {
    assert.equal(ids(filterMilestones(STAFF, view({ statuses: ['Building'] }), true)), 'ad');
    assert.equal(ids(filterMilestones(CLIENT, view({ statuses: ['Shipped'] }), false)), 'c');
  });

  it('filters by type alone, and a milestone with no type matches no pick', () => {
    assert.equal(ids(filterMilestones(STAFF, view({ types: ['design'] }), true)), 'a');
    assert.equal(ids(filterMilestones(STAFF, view({ types: ['build'] }), true)), 'cd');
    assert.equal(ids(filterMilestones(CLIENT, view({ types: ['both'] }), false)), 'b');
  });

  it('filters by approval alone', () => {
    assert.equal(ids(filterMilestones(STAFF, view({ approval: ['unreviewed'] }), true)), 'abe');
    assert.equal(ids(filterMilestones(STAFF, view({ approval: ['changes_requested'] }), true)), 'd');
  });

  it('filters by needs you alone', () => {
    assert.equal(ids(filterMilestones(STAFF, view({ needsYou: true }), true)), 'b');
  });

  it('ORs the values inside one filter and keeps list order', () => {
    assert.equal(ids(filterMilestones(STAFF, view({ statuses: ['Shipped', 'Building'] }), true)), 'acd');
    assert.equal(ids(filterMilestones(STAFF, view({ types: ['both', 'design'] }), true)), 'ab');
    assert.equal(ids(filterMilestones(STAFF, view({ approval: ['approved', 'changes_requested'] }), true)), 'cd');
  });

  it('ANDs across filters', () => {
    assert.equal(ids(filterMilestones(STAFF, view({ statuses: ['Building'], types: ['build'] }), true)), 'd');
    assert.equal(
      ids(filterMilestones(STAFF, view({ statuses: ['Building', 'Shipped'], types: ['build'], approval: ['approved'] }), true)),
      'c',
    );
    assert.equal(ids(filterMilestones(STAFF, view({ statuses: ['Ready to Ship'], needsYou: true }), true)), 'b');
    assert.equal(ids(filterMilestones(STAFF, view({ statuses: ['Shipped'], types: ['design'] }), true)), '');
    assert.equal(ids(filterMilestones(STAFF, view({ statuses: ['Building'], needsYou: true }), true)), '');
  });

  it('ignores staff-only filters for a client, even when set', () => {
    const staffOnly = view({ approval: ['approved'], needsYou: true });
    assert.deepEqual(filterMilestones(CLIENT, staffOnly, false), CLIENT);
    assert.equal(ids(filterMilestones(CLIENT, { ...staffOnly, statuses: ['Building'] }, false)), 'ad');
    // Even if a client payload carried the staff fields, they are not read.
    assert.deepEqual(filterMilestones(STAFF, staffOnly, false), STAFF);
  });

  it('drops stale values instead of hiding every row', () => {
    // No milestone is Parked now: the pick is ignored, not matched against nothing.
    assert.deepEqual(filterMilestones(STAFF, view({ statuses: ['Parked'] }), true), STAFF);
    assert.equal(ids(filterMilestones(STAFF, view({ statuses: ['Parked', 'Shipped'] }), true)), 'c');
    // A value that is not a status at all.
    const junk = { ...view(), statuses: ['Done', 'Building'], types: ['video'] } as unknown as MilestoneListView;
    assert.equal(ids(filterMilestones(STAFF, junk, true)), 'ad');
    // Nobody needs the viewer now, so Needs you is off the menu and ignored.
    const calm = STAFF.map((row) => ({ ...row, needsYou: false }));
    assert.equal(filterMilestones(calm, view({ needsYou: true }), true).length, calm.length);
  });
});

describe('milestoneMatchesFilters', () => {
  it('matches one milestone without pruning', () => {
    const row = STAFF[0];
    assert.equal(milestoneMatchesFilters(row, emptyMilestoneListView(), true), true);
    assert.equal(milestoneMatchesFilters(row, view({ statuses: ['Parked'] }), true), false);
    assert.equal(milestoneMatchesFilters(row, view({ statuses: ['Building'], types: ['design'] }), true), true);
    assert.equal(milestoneMatchesFilters(row, view({ needsYou: true }), true), false);
    assert.equal(milestoneMatchesFilters(row, view({ needsYou: true, approval: ['approved'] }), false), true);
  });
});

describe('normalizeMilestoneListView', () => {
  it('returns the empty view for nothing or junk', () => {
    assert.deepEqual(normalizeMilestoneListView(null), emptyMilestoneListView());
    assert.deepEqual(normalizeMilestoneListView('Building'), emptyMilestoneListView());
    assert.deepEqual(normalizeMilestoneListView({ statuses: 'Building', needsYou: 'yes' }), emptyMilestoneListView());
  });

  it('drops unknown values, collapses repeats and uses menu order', () => {
    assert.deepEqual(
      normalizeMilestoneListView({
        statuses: ['Shipped', 'active', 'Idea', 'Shipped'],
        types: ['both', 'dev', 'design'],
        approval: ['approved', 'rejected'],
        needsYou: true,
      }),
      { statuses: ['Idea', 'Shipped'], types: ['design', 'both'], approval: ['approved'], needsYou: true },
    );
  });

  it('compares views by value, not pick order', () => {
    assert.equal(sameMilestoneListView(view({ statuses: ['Shipped', 'Idea'] }), view({ statuses: ['Idea', 'Shipped'] })), true);
    assert.equal(sameMilestoneListView(view({ statuses: ['Idea'] }), view({ statuses: ['Idea'], needsYou: true })), false);
  });
});

describe('milestoneListViewOptions', () => {
  it('offers the values the list has, in menu order', () => {
    assert.deepEqual(milestoneListViewOptions(STAFF, true), {
      statuses: ['Planning', 'Building', 'Ready to Ship', 'Shipped'],
      types: ['design', 'build', 'both'],
      approval: ['unreviewed', 'approved', 'changes_requested'],
      needsYou: true,
    });
  });

  it('takes status choices from MILESTONE_STATUSES', () => {
    const every = MILESTONE_STATUSES.map((status) => ({ status }));
    assert.deepEqual(milestoneListViewOptions(every, false).statuses, [...MILESTONE_STATUSES]);
    assert.deepEqual(Object.keys(MILESTONE_STATUS_FILTER_LABEL), [...MILESTONE_STATUSES]);
  });

  it('gives a client no staff-only choices', () => {
    const options = milestoneListViewOptions(STAFF, false);
    assert.deepEqual(options.approval, []);
    assert.equal(options.needsYou, false);
    assert.deepEqual(milestoneFilterKeys(false, options), ['status', 'type']);
  });

  it('hides a filter that cannot narrow the list', () => {
    const same: Row[] = [
      { id: 'a', status: 'Building', workType: 'build', approval: 'unreviewed', needsYou: true },
      { id: 'b', status: 'Building', workType: 'build', approval: 'unreviewed', needsYou: true },
    ];
    const options = milestoneListViewOptions(same, true);
    assert.deepEqual(options, { statuses: [], types: [], approval: [], needsYou: false });
    assert.deepEqual(milestoneFilterKeys(true, options), []);

    // Type alone is the same on every milestone: only Type hides.
    assert.deepEqual(
      milestoneFilterKeys(true, milestoneListViewOptions([same[0], { ...same[1], status: 'Shipped' }], true)),
      ['status'],
    );
    assert.deepEqual(milestoneFilterKeys(true, milestoneListViewOptions([], true)), []);
    assert.deepEqual(milestoneFilterKeys(true, milestoneListViewOptions(STAFF, true)), [
      'status',
      'type',
      'approval',
      'needsYou',
    ]);
  });

  it('keeps Type when one type and an untyped milestone are both present', () => {
    const rows: Row[] = [
      { id: 'a', status: 'Building', workType: 'design' },
      { id: 'b', status: 'Building' },
    ];
    assert.deepEqual(milestoneListViewOptions(rows, false).types, ['design']);
    assert.equal(ids(filterMilestones(rows, view({ types: ['design'] }), false)), 'a');
    // No milestone has a type: nothing to offer.
    assert.deepEqual(milestoneListViewOptions([{ status: 'Idea' }, { status: 'Shipped' }], false).types, []);
  });
});

describe('pruneMilestoneListView', () => {
  it('keeps current choices and drops the rest', () => {
    const options = milestoneListViewOptions(STAFF, true);
    assert.deepEqual(
      pruneMilestoneListView(view({ statuses: ['Parked', 'Building'], types: ['both'], approval: ['approved'], needsYou: true }), options),
      { statuses: ['Building'], types: ['both'], approval: ['approved'], needsYou: true },
    );
  });

  it('drops staff-only picks for a client', () => {
    const options = milestoneListViewOptions(CLIENT, false);
    assert.deepEqual(
      pruneMilestoneListView(view({ statuses: ['Building'], approval: ['approved'], needsYou: true }), options),
      view({ statuses: ['Building'] }),
    );
  });
});

describe('activeMilestoneFilterCount', () => {
  it('counts filters, not values', () => {
    assert.equal(activeMilestoneFilterCount(emptyMilestoneListView(), true), 0);
    assert.equal(activeMilestoneFilterCount(view({ statuses: ['Building', 'Shipped', 'Idea'] }), true), 1);
    assert.equal(
      activeMilestoneFilterCount(view({ statuses: ['Building'], types: ['both'], approval: ['approved'], needsYou: true }), true),
      4,
    );
  });

  it('does not count staff-only filters for a client', () => {
    const set = view({ statuses: ['Building'], approval: ['approved'], needsYou: true });
    assert.equal(activeMilestoneFilterCount(set, false), 1);
    assert.equal(milestoneListViewIsFiltered(view({ approval: ['approved'], needsYou: true }), false), false);
    assert.equal(milestoneListViewIsFiltered(view({ needsYou: true }), true), true);
  });
});

describe('milestone filter copy', () => {
  it('uses the labels as drawn', () => {
    assert.deepEqual(MILESTONE_FILTER_LABEL, { status: 'Status', type: 'Type', approval: 'Approval', needsYou: 'Needs you' });
    assert.deepEqual(MILESTONE_TYPE_LABEL, { design: 'Design', build: 'Dev', both: 'Design and dev' });
    assert.deepEqual(MILESTONE_APPROVAL_FILTER_LABEL, {
      unreviewed: 'Unreviewed',
      approved: 'Approved',
      changes_requested: 'Changes requested',
    });
    assert.equal(MILESTONE_NEEDS_YOU_LABEL, 'Open Ask on you');
  });

  it('summarises a filter as Any, the one value, or a count', () => {
    assert.deepEqual(milestoneFilterSummary('status', emptyMilestoneListView()), { text: 'Any', set: false });
    assert.deepEqual(milestoneFilterSummary('type', view({ types: ['both'] })), { text: 'Design and dev', set: true });
    assert.deepEqual(milestoneFilterSummary('status', view({ statuses: ['Building', 'Shipped'] })), {
      text: '2 selected',
      set: true,
    });
    assert.deepEqual(milestoneFilterSummary('needsYou', view({ needsYou: true })), { text: 'Open Ask on you', set: true });
  });
});

describe('milestoneFilterValueChips', () => {
  const set = view({ statuses: ['Shipped', 'Building'], types: ['both'], approval: ['unreviewed'], needsYou: true });

  it('lists one chip per value, in menu order, with the drawn copy', () => {
    assert.deepEqual(
      milestoneFilterValueChips(set, true).map((chip) => `${chip.field} ${chip.value}`),
      ['Status: Building', 'Status: Shipped', 'Type: Design and dev', 'Approval: Unreviewed', 'Needs you: Open Ask on you'],
    );
    assert.deepEqual(milestoneFilterValueChips(emptyMilestoneListView(), true), []);
  });

  it('gives a client no chip for a staff-only filter', () => {
    assert.deepEqual(
      milestoneFilterValueChips(set, false).map((chip) => chip.id),
      ['status:Building', 'status:Shipped', 'type:both'],
    );
  });

  it('removes one value and leaves the rest', () => {
    const chips = milestoneFilterValueChips(set, true);
    const byId = (id: string) => chips.find((chip) => chip.id === id)!;
    assert.deepEqual(byId('status:Building').remove(set), { ...set, statuses: ['Shipped'] });
    assert.deepEqual(byId('type:both').remove(set), { ...set, types: [] });
    assert.deepEqual(byId('approval:unreviewed').remove(set), { ...set, approval: [] });
    assert.deepEqual(byId('needsYou').remove(set), { ...set, needsYou: false });
  });
});

describe('milestoneFilterResult on the project page fixtures', () => {
  const site = { id: 'p-site', name: 'Northwind site', publishToWarehaus: true, internal: false };
  const load = (audience: 'staff' | 'client') =>
    applyFixtureMilestonePreview(fixtureMilestones(site, FIXTURE_TASKS, audience), '?tiles=states');
  const staffList = load('staff');
  const clientList = load('client');
  /** The tiles the page draws: list groups and board columns come from the same groups. */
  const drawn = <T extends MilestoneFilterRow>(matches: T[], staff: boolean) =>
    groupMilestones(matches, staff).flatMap((group) => group.milestones);

  it('has fixtures with more than one status and type, for staff and a client', () => {
    for (const list of [staffList, clientList]) {
      assert.ok(new Set(list.map((milestone) => milestone.status)).size > 1);
      assert.ok(list.some((milestone) => milestone.workType === 'design'));
      assert.ok(list.some((milestone) => milestone.workType !== 'design'));
    }
  });

  it('returns the whole list, unfiltered, for the empty view', () => {
    const result = milestoneFilterResult(staffList, view(), true);
    assert.deepEqual(result.matches, staffList);
    assert.equal(result.filtered, false);
    assert.equal(result.noMatches, false);
    assert.equal(result.onlyShipped, false);
  });

  it('shows only Building tiles for Status Building, in the list and the board', () => {
    for (const [list, staff] of [[staffList, true], [clientList, false]] as const) {
      const result = milestoneFilterResult(list, view({ statuses: ['Building'] }), staff);
      const tiles = drawn(result.matches, staff);
      assert.ok(tiles.length > 0 && tiles.length < list.length);
      assert.ok(tiles.every((milestone) => milestone.status === 'Building'));
      assert.equal(tiles.length, list.filter((milestone) => milestone.status === 'Building').length);
      // No Done group or column when nothing Shipped matches.
      assert.ok(!groupMilestones(result.matches, staff).some((group) => group.id === 'shipped'));
    }
  });

  it('shows only design-only milestones for Type Design', () => {
    for (const [list, staff] of [[staffList, true], [clientList, false]] as const) {
      const result = milestoneFilterResult(list, view({ types: ['design'] }), staff);
      assert.ok(result.matches.length > 0 && result.matches.length < list.length);
      assert.ok(result.matches.every((milestone) => milestone.workType === 'design'));
    }
  });

  it('restores the full list when the filters are cleared', () => {
    const picked = milestoneFilterResult(staffList, view({ statuses: ['Building'], types: ['design'] }), true);
    assert.ok(picked.matches.length < staffList.length);
    assert.deepEqual(milestoneFilterResult(staffList, emptyMilestoneListView(), true).matches, staffList);
  });

  it('gives staff and a client their own filter sets', () => {
    const staff = milestoneFilterResult(staffList, view(), true);
    const client = milestoneFilterResult(clientList, view(), false);
    assert.deepEqual(milestoneFilterKeys(true, staff.options).slice(0, 3), ['status', 'type', 'approval']);
    assert.deepEqual(milestoneFilterKeys(false, client.options), ['status', 'type']);
    assert.deepEqual(client.options.approval, []);
    assert.equal(client.options.needsYou, false);
    // A client is only offered statuses in their own list.
    assert.ok(client.options.statuses.every((status) => clientList.some((milestone) => milestone.status === status)));
  });

  it('offers Needs you when the page marks an open Ask on the viewer', () => {
    const rows = staffList.map((milestone, index) => ({ ...milestone, needsYou: index === 0 }));
    const result = milestoneFilterResult(rows, view({ needsYou: true }), true);
    assert.equal(result.options.needsYou, true);
    assert.deepEqual(result.matches.map((milestone) => milestone.id), [staffList[0].id]);
  });

  it('reports no matches when the filters are set and nothing fits both', () => {
    const shippedType = staffList.find((milestone) => milestone.status === 'Shipped')?.workType;
    const other = (['design', 'build', 'both'] as const).find(
      (type) => type !== shippedType && staffList.some((milestone) => milestone.workType === type && milestone.status !== 'Shipped'),
    );
    assert.ok(other);
    const shipped = staffList.filter((milestone) => milestone.status === 'Shipped');
    assert.ok(shipped.every((milestone) => milestone.workType !== other));
    const result = milestoneFilterResult(staffList, view({ statuses: ['Shipped'], types: [other] }), true);
    assert.equal(result.filtered, true);
    assert.deepEqual(result.matches, []);
    assert.equal(result.noMatches, true);
    assert.equal(result.onlyShipped, false);
  });

  it('opens Done only when it is the only group with a match', () => {
    assert.equal(milestoneFilterResult(staffList, view({ statuses: ['Shipped'] }), true).onlyShipped, true);
    assert.equal(milestoneFilterResult(staffList, view({ statuses: ['Building', 'Shipped'] }), true).onlyShipped, false);
    // Every milestone Shipped and no filter set: the group stays as the viewer left it.
    const allShipped = staffList.filter((milestone) => milestone.status === 'Shipped');
    assert.equal(milestoneFilterResult(allShipped, view(), true).onlyShipped, false);
  });

  it('keeps the held view and shows the pruned one', () => {
    const held = view({ statuses: ['Parked', 'Building'] });
    assert.ok(!staffList.some((milestone) => milestone.status === 'Parked'));
    const result = milestoneFilterResult(staffList, held, true);
    assert.deepEqual(result.shown.statuses, ['Building']);
    assert.deepEqual(held.statuses, ['Parked', 'Building']);
  });

  it('leaves a hidden milestone on the full list, so a link to it still opens', () => {
    const result = milestoneFilterResult(staffList, view({ statuses: ['Building'] }), true);
    const hidden = staffList.find((milestone) => milestone.status !== 'Building');
    assert.ok(hidden && !result.matches.some((milestone) => milestone.id === hidden.id));
    assert.equal(staffList.find((milestone) => milestone.id === hidden.id), hidden);
  });
});
