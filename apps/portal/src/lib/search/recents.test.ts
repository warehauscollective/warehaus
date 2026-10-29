import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { SearchHit } from '@convex/_lib/portalSearch';
import {
  clearSearchRecents,
  readSearchRecents,
  searchRecentsKey,
  writeSearchRecent,
  type SearchRecentScope,
} from './recents';

function memoryStore() {
  const values = new Map<string, string>();
  return {
    values,
    getItem(key: string) {
      return values.has(key) ? values.get(key)! : null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
    removeItem(key: string) {
      values.delete(key);
    },
  };
}

const hit: SearchHit = {
  id: 't-1',
  kind: 'task',
  title: 'Write the project brief',
  subtitle: 'Task · Oct 20 · Northwind site',
  href: '/tasks/t-1',
  metaType: 'Task',
  metaWhen: 'Oct 20',
  metaProject: 'Northwind site',
};

const staff: SearchRecentScope = { authUserId: 'user-a', tier: 'staff', orgId: 'org-a' };
const client: SearchRecentScope = { authUserId: 'user-a', tier: 'client', orgId: 'org-a' };
const otherOrg: SearchRecentScope = { authUserId: 'user-a', tier: 'staff', orgId: 'org-b' };
const otherUser: SearchRecentScope = { authUserId: 'user-b', tier: 'staff', orgId: 'org-a' };

describe('search recents', () => {
  it('keys recents by user and tier and hides them from another user', () => {
    const store = memoryStore();
    writeSearchRecent(store, staff, hit);
    assert.equal(store.values.has('wh-portal-search-recents'), false);
    assert.equal(store.values.has(searchRecentsKey('user-a', 'staff')), true);
    assert.equal(readSearchRecents(store, staff)[0]?.title, hit.title);
    assert.deepEqual(readSearchRecents(store, otherUser), []);
    assert.deepEqual(readSearchRecents(store, client), []);
  });

  it('drops entries whose stored tier or org does not match', () => {
    const store = memoryStore();
    const key = searchRecentsKey('user-a', 'staff');
    store.setItem(
      key,
      JSON.stringify([
        { ...hit, tier: 'client', orgId: 'org-a' },
        { ...hit, id: 't-2', title: 'Other org', tier: 'staff', orgId: 'org-b' },
        { ...hit, id: 't-3', title: 'Kept', tier: 'staff', orgId: 'org-a' },
      ]),
    );
    const rows = readSearchRecents(store, staff);
    assert.deepEqual(rows.map((row) => row.title), ['Kept']);
    assert.equal('published' in rows[0]!, false);
    assert.deepEqual(readSearchRecents(store, otherOrg).map((row) => row.title), ['Other org']);
  });

  it('clears that user on sign-out, including the old shared key', () => {
    const store = memoryStore();
    writeSearchRecent(store, staff, hit);
    writeSearchRecent(store, client, { ...hit, id: 't-client', title: 'Client recent' });
    store.setItem('wh-portal-search-recents', JSON.stringify([hit]));
    writeSearchRecent(store, otherUser, { ...hit, id: 't-b', title: 'Other user' });
    clearSearchRecents(store, 'user-a');
    assert.equal(store.values.has('wh-portal-search-recents'), false);
    assert.equal(store.values.has(searchRecentsKey('user-a', 'staff')), false);
    assert.equal(store.values.has(searchRecentsKey('user-a', 'client')), false);
    assert.equal(readSearchRecents(store, otherUser)[0]?.title, 'Other user');
  });
});
