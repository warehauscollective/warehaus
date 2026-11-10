import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readStaffJoined, rememberStaffJoined } from './staffJoined';

describe('staff joined flag', () => {
  it('shows the welcome once, then clears the saved flag', async () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    };
    Object.defineProperty(globalThis, 'sessionStorage', { value: storage, configurable: true });

    rememberStaffJoined({ name: 'Jordan', passwordSet: true });
    assert.deepEqual(readStaffJoined(), { name: 'Jordan', passwordSet: true });
    assert.equal(storage.getItem('warehaus-staff-joined'), null);
    assert.deepEqual(readStaffJoined(), { name: 'Jordan', passwordSet: true });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(readStaffJoined(), null);

    rememberStaffJoined({ name: 'Sam', passwordSet: false });
    assert.deepEqual(readStaffJoined(), { name: 'Sam', passwordSet: false });
  });
});
