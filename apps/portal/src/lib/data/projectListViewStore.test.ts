import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { defaultProjectListView, type ProjectListView } from '@convex/_lib/projectListView';
import {
  currentProjectListView,
  projectListViewKey,
  projectListViewSave,
  readStoredProjectListView,
  reconcileProjectSection,
  writeStoredProjectListView,
  type ProjectListViewStore,
} from './projectListViewStore';

function memoryStore(): ProjectListViewStore & { items: Map<string, string> } {
  const items = new Map<string, string>();
  return {
    items,
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
    removeItem: (key) => void items.delete(key),
  };
}

function viewWith(patch: Partial<ProjectListView>): ProjectListView {
  return { ...defaultProjectListView(), ...patch };
}

const filtered = viewWith({ quick: 'active', status: ['Building'], sort: { key: 'name', direction: 'asc' } });

describe('the browser copy of the project list view', () => {
  it('gives back what was written for the same contact', () => {
    const store = memoryStore();
    writeStoredProjectListView(store, 'contact-a', filtered, false);
    assert.deepEqual(readStoredProjectListView(store, 'contact-a'), { view: filtered, pending: false });
  });

  it('never gives one contact another contact\'s view', () => {
    const store = memoryStore();
    writeStoredProjectListView(store, 'contact-a', filtered, false);
    assert.equal(readStoredProjectListView(store, 'contact-b'), null);
    assert.equal(readStoredProjectListView(store, ''), null);
  });

  it('ignores a copy moved under another contact\'s key', () => {
    const store = memoryStore();
    writeStoredProjectListView(store, 'contact-a', filtered, false);
    store.setItem(projectListViewKey('contact-b'), store.getItem(projectListViewKey('contact-a')) as string);
    assert.equal(readStoredProjectListView(store, 'contact-b'), null);
  });

  it('keeps the pending mark until the view is confirmed saved', () => {
    const store = memoryStore();
    writeStoredProjectListView(store, 'contact-a', filtered, true);
    assert.equal(readStoredProjectListView(store, 'contact-a')?.pending, true);
    writeStoredProjectListView(store, 'contact-a', filtered, false);
    assert.equal(readStoredProjectListView(store, 'contact-a')?.pending, false);
  });

  it('stores a saved default view as no key', () => {
    const store = memoryStore();
    writeStoredProjectListView(store, 'contact-a', filtered, false);
    writeStoredProjectListView(store, 'contact-a', defaultProjectListView(), false);
    assert.equal(store.items.size, 0);
  });

  it('keeps a default view that is still waiting to be saved', () => {
    const store = memoryStore();
    writeStoredProjectListView(store, 'contact-a', defaultProjectListView(), true);
    assert.deepEqual(readStoredProjectListView(store, 'contact-a'), { view: defaultProjectListView(), pending: true });
  });

  it('reads junk, an old version and unknown values as nothing or the default', () => {
    const store = memoryStore();
    store.setItem(projectListViewKey('contact-a'), 'not json');
    assert.equal(readStoredProjectListView(store, 'contact-a'), null);
    store.setItem(projectListViewKey('contact-a'), JSON.stringify({ v: 0, contactId: 'contact-a', view: filtered }));
    assert.equal(readStoredProjectListView(store, 'contact-a'), null);
    store.setItem(
      projectListViewKey('contact-a'),
      JSON.stringify({ v: 1, contactId: 'contact-a', view: { quick: 'nope', status: ['Building'], extra: 1 } }),
    );
    assert.deepEqual(readStoredProjectListView(store, 'contact-a')?.view, viewWith({ status: ['Building'] }));
  });

  it('does not throw when there is no store or the store throws', () => {
    const broken: ProjectListViewStore = {
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
    assert.equal(readStoredProjectListView(null, 'contact-a'), null);
    assert.equal(readStoredProjectListView(broken, 'contact-a'), null);
    writeStoredProjectListView(null, 'contact-a', filtered, false);
    writeStoredProjectListView(broken, 'contact-a', filtered, false);
    writeStoredProjectListView(broken, 'contact-a', defaultProjectListView(), false);
  });
});

describe('which view the list shows', () => {
  const other = viewWith({ quick: 'shipped' });

  it('shows the browser copy until Convex answers, so the list opens filtered', () => {
    assert.deepEqual(currentProjectListView({ edit: null, saved: undefined, local: filtered }), filtered);
  });

  it('shows the default when nothing is known', () => {
    assert.deepEqual(currentProjectListView({ edit: null, saved: undefined, local: null }), defaultProjectListView());
  });

  it('shows what Convex has over the browser copy', () => {
    assert.deepEqual(currentProjectListView({ edit: null, saved: other, local: filtered }), other);
  });

  it('shows the default when Convex has no saved view, even with a browser copy', () => {
    assert.deepEqual(currentProjectListView({ edit: null, saved: null, local: filtered }), defaultProjectListView());
  });

  it('keeps a change made here on screen whatever is saved', () => {
    assert.deepEqual(currentProjectListView({ edit: filtered, saved: other, local: other }), filtered);
    assert.deepEqual(currentProjectListView({ edit: filtered, saved: undefined, local: null }), filtered);
  });
});

describe('when a change is saved', () => {
  it('writes nothing with no change, as on a plain page load', () => {
    assert.equal(projectListViewSave(null, filtered, false), 'skip');
    assert.equal(projectListViewSave(null, undefined, false), 'skip');
  });

  it('waits until Convex has said what is saved', () => {
    assert.equal(projectListViewSave(filtered, undefined, false), 'wait');
  });

  it('skips a change that matches what is saved', () => {
    assert.equal(projectListViewSave(filtered, { ...filtered }, false), 'skip');
    assert.equal(projectListViewSave(defaultProjectListView(), null, false), 'skip');
  });

  it('saves a change that differs, including back to the default', () => {
    assert.equal(projectListViewSave(filtered, null, false), 'save');
    assert.equal(projectListViewSave(filtered, viewWith({ quick: 'shipped' }), false), 'save');
    assert.equal(projectListViewSave(defaultProjectListView(), filtered, false), 'save');
  });

  it('still sends the change when the read failed', () => {
    assert.equal(projectListViewSave(filtered, undefined, true), 'save');
  });
});

describe('the sidebar and the quick filter chip', () => {
  it('moves the sidebar to a saved chip when the sidebar was not touched', () => {
    assert.deepEqual(reconcileProjectSection({ section: 'all', agreed: 'all', quick: 'shipped' }), {
      set: 'sidebar',
      section: 'shipped',
    });
  });

  it('moves the chip when the sidebar was clicked', () => {
    assert.deepEqual(reconcileProjectSection({ section: 'active', agreed: 'all', quick: 'shipped' }), {
      set: 'chip',
      quick: 'active',
    });
  });

  it('leaves both alone when they agree', () => {
    assert.equal(reconcileProjectSection({ section: 'all', agreed: 'all', quick: 'all' }), null);
    assert.equal(reconcileProjectSection({ section: 'shipped', agreed: 'all', quick: 'shipped' }), null);
  });

  it('leaves the sidebar alone for the Internal chip, which it has no entry for', () => {
    assert.equal(reconcileProjectSection({ section: 'active', agreed: 'active', quick: 'internal' }), null);
  });

  it('replaces the Internal chip when the sidebar is clicked', () => {
    assert.deepEqual(reconcileProjectSection({ section: 'all', agreed: 'active', quick: 'internal' }), {
      set: 'chip',
      quick: 'all',
    });
  });

  it('ignores a section that is not a quick filter', () => {
    assert.equal(reconcileProjectSection({ section: 'overview', agreed: 'all', quick: 'active' }), null);
  });
});
