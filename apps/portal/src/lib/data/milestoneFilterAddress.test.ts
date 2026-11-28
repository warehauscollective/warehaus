import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { emptyMilestoneListView, type MilestoneListView } from './milestoneFilters';
import {
  milestoneViewFromSearch,
  milestoneViewKey,
  openingMilestoneView,
  readStoredMilestoneView,
  searchWithMilestoneView,
  searchWithoutMilestoneFilters,
  writeStoredMilestoneView,
  type MilestoneViewStore,
} from './milestoneFilterAddress';

function memoryStore(): MilestoneViewStore & { items: Map<string, string> } {
  const items = new Map<string, string>();
  return {
    items,
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
    removeItem: (key) => void items.delete(key),
  };
}

function viewWith(patch: Partial<MilestoneListView>): MilestoneListView {
  return { ...emptyMilestoneListView(), ...patch };
}

const FULL = viewWith({
  statuses: ['Building', 'Ready to Ship'],
  types: ['design'],
  approval: ['approved', 'changes_requested'],
  needsYou: true,
});

describe('the milestone filters in the address', () => {
  it('writes the example address', () => {
    const view = viewWith({ statuses: ['Building', 'Ready to Ship'], types: ['design'] });
    assert.equal(searchWithMilestoneView('', view, true), 'status=Building,Ready+to+Ship&type=design');
  });

  it('reads the example address', () => {
    assert.deepEqual(
      milestoneViewFromSearch('?status=Building,Ready+to+Ship&type=design', true),
      viewWith({ statuses: ['Building', 'Ready to Ship'], types: ['design'] }),
    );
  });

  it('round trips every filter', () => {
    const search = searchWithMilestoneView('', FULL, true);
    assert.equal(
      search,
      'status=Building,Ready+to+Ship&type=design&approval=approved,changes_requested&needs=you',
    );
    assert.deepEqual(milestoneViewFromSearch(search, true), FULL);
    assert.equal(searchWithMilestoneView(search, FULL, true), search);
  });

  it('round trips each single filter', () => {
    const views = [
      viewWith({ statuses: ['Awaiting Go'] }),
      viewWith({ types: ['build', 'both'] }),
      viewWith({ approval: ['unreviewed'] }),
      viewWith({ needsYou: true }),
    ];
    for (const view of views) {
      assert.deepEqual(milestoneViewFromSearch(searchWithMilestoneView('', view, true), true), view);
    }
  });

  it('reads an address the browser encoded', () => {
    const encoded = new URLSearchParams({ status: 'Building,Ready to Ship' }).toString();
    assert.equal(encoded, 'status=Building%2CReady+to+Ship');
    assert.deepEqual(milestoneViewFromSearch(encoded, true), viewWith({ statuses: ['Building', 'Ready to Ship'] }));
    assert.deepEqual(
      milestoneViewFromSearch('status=Ready%20to%20Ship', true),
      viewWith({ statuses: ['Ready to Ship'] }),
    );
  });

  it('drops unknown values and keeps the known ones in menu order', () => {
    assert.deepEqual(
      milestoneViewFromSearch('status=Shipped,Nope,Building,Building&type=dev,both&approval=maybe', true),
      viewWith({ statuses: ['Building', 'Shipped'], types: ['both'] }),
    );
  });

  it('matches values without case and reads a repeated param', () => {
    assert.deepEqual(
      milestoneViewFromSearch('status=building&status=ready+to+ship&type=DESIGN&needs=You', true),
      viewWith({ statuses: ['Building', 'Ready to Ship'], types: ['design'], needsYou: true }),
    );
  });

  it('is no view when the address has no filter or only bad values', () => {
    assert.equal(milestoneViewFromSearch('', true), null);
    assert.equal(milestoneViewFromSearch('layout=board&done=open', true), null);
    assert.equal(milestoneViewFromSearch('status=&type=', true), null);
    assert.equal(milestoneViewFromSearch('status=Nope&type=,,&approval=x&needs=me', true), null);
  });

  it('does not read or write a staff-only filter for a client', () => {
    assert.equal(milestoneViewFromSearch('approval=approved&needs=you', false), null);
    assert.deepEqual(
      milestoneViewFromSearch('status=Building&approval=approved&needs=you', false),
      viewWith({ statuses: ['Building'] }),
    );
    assert.equal(searchWithMilestoneView('', FULL, false), 'status=Building,Ready+to+Ship&type=design');
  });

  it('keeps the other params and replaces the filter params', () => {
    const search = 'milestone=abc&layout=board&done=open&status=Idea&banner=hidden&pane=milestones&tab=x&tiles=ready';
    const rest = 'milestone=abc&layout=board&done=open&banner=hidden&pane=milestones&tab=x&tiles=ready';
    assert.equal(searchWithoutMilestoneFilters(search), rest);
    assert.equal(searchWithMilestoneView(search, viewWith({ types: ['both'] }), true), `${rest}&type=both`);
  });

  it('clears the filter params for the empty view', () => {
    assert.equal(searchWithMilestoneView('?layout=board&status=Idea&needs=you', emptyMilestoneListView(), true), 'layout=board');
    assert.equal(searchWithMilestoneView('status=Nope', emptyMilestoneListView(), true), '');
  });

  it('writes a view with unknown values without them', () => {
    const stale = { statuses: ['Gone', 'Parked'], types: ['x'], approval: [], needsYou: false } as unknown as MilestoneListView;
    assert.equal(searchWithMilestoneView('', stale, true), 'status=Parked');
  });
});

describe('the milestone filters kept for the session', () => {
  it('round trips a view per project', () => {
    const store = memoryStore();
    writeStoredMilestoneView(store, 'p1', FULL);
    writeStoredMilestoneView(store, 'p2', viewWith({ types: ['build'] }));
    assert.deepEqual(readStoredMilestoneView(store, 'p1', true), FULL);
    assert.deepEqual(readStoredMilestoneView(store, 'p2', true), viewWith({ types: ['build'] }));
    assert.equal(readStoredMilestoneView(store, 'p3', true), null);
  });

  it('stores no filter as no key', () => {
    const store = memoryStore();
    writeStoredMilestoneView(store, 'p1', FULL);
    writeStoredMilestoneView(store, 'p1', emptyMilestoneListView());
    assert.equal(store.items.size, 0);
    assert.equal(readStoredMilestoneView(store, 'p1', true), null);
  });

  it('ignores a copy that is broken, old, or for another project', () => {
    const store = memoryStore();
    const key = milestoneViewKey('p1');
    for (const raw of [
      'not json',
      'null',
      '"text"',
      JSON.stringify({ v: 0, projectId: 'p1', view: FULL }),
      JSON.stringify({ v: 1, projectId: 'p2', view: FULL }),
      JSON.stringify({ v: 1, projectId: 'p1' }),
      JSON.stringify({ v: 1, projectId: 'p1', view: { statuses: ['Gone'], types: 'design' } }),
    ]) {
      store.items.set(key, raw);
      assert.equal(readStoredMilestoneView(store, 'p1', true), null, raw);
    }
  });

  it('drops unknown stored values', () => {
    const store = memoryStore();
    store.items.set(
      milestoneViewKey('p1'),
      JSON.stringify({ v: 1, projectId: 'p1', view: { statuses: ['Gone', 'Idea'], types: ['x'], needsYou: 'yes' } }),
    );
    assert.deepEqual(readStoredMilestoneView(store, 'p1', true), viewWith({ statuses: ['Idea'] }));
  });

  it('gives a client nothing from a staff-only copy', () => {
    const store = memoryStore();
    writeStoredMilestoneView(store, 'p1', viewWith({ approval: ['approved'], needsYou: true }));
    assert.equal(readStoredMilestoneView(store, 'p1', false), null);
  });

  it('survives no store and a store that throws', () => {
    const throwing: MilestoneViewStore = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('full');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    assert.equal(readStoredMilestoneView(null, 'p1', true), null);
    assert.equal(readStoredMilestoneView(throwing, 'p1', true), null);
    assert.doesNotThrow(() => writeStoredMilestoneView(null, 'p1', FULL));
    assert.doesNotThrow(() => writeStoredMilestoneView(throwing, 'p1', FULL));
    assert.doesNotThrow(() => writeStoredMilestoneView(throwing, 'p1', emptyMilestoneListView()));
  });
});

describe('the view the project page opens with', () => {
  const stored = viewWith({ types: ['build'] });

  it('takes the address over the stored view', () => {
    assert.deepEqual(openingMilestoneView({ search: 'status=Idea', stored, staff: true }), {
      view: viewWith({ statuses: ['Idea'] }),
      from: 'address',
    });
  });

  it('takes the stored view when the address has no filter or only bad values', () => {
    assert.deepEqual(openingMilestoneView({ search: 'layout=board', stored, staff: true }), { view: stored, from: 'stored' });
    assert.deepEqual(openingMilestoneView({ search: 'status=Nope', stored, staff: true }), { view: stored, from: 'stored' });
  });

  it('is no filter with neither', () => {
    assert.deepEqual(openingMilestoneView({ search: '', stored: null, staff: true }), {
      view: emptyMilestoneListView(),
      from: 'none',
    });
  });
});
