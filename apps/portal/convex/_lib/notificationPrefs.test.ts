import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CLIENT_NOTIFICATION_KEYS,
  DEFAULT_NOTIFICATION_PREFS,
  NOTIFICATION_EMAIL_ENABLED,
  STAFF_NOTIFICATION_KEYS,
  mergeNotificationPrefs,
  normalizeNotificationPrefs,
  notificationKeysFor,
  readLegacyNotificationPrefs,
} from './notificationPrefs';

describe('notification prefs', () => {
  it('keeps email delivery off', () => {
    assert.equal(NOTIFICATION_EMAIL_ENABLED, false);
  });

  it('starts from the account-frame defaults', () => {
    assert.deepEqual(DEFAULT_NOTIFICATION_PREFS, {
      awaitingGo: true,
      syncProblems: true,
      draftRecaps: true,
      inviteNotices: false,
      needsAttention: true,
      sharedRecaps: true,
      weeklySummary: false,
    });
  });

  it('shows staff and client toggles separately', () => {
    assert.deepEqual([...notificationKeysFor(true)], [...STAFF_NOTIFICATION_KEYS]);
    assert.deepEqual([...notificationKeysFor(false)], [...CLIENT_NOTIFICATION_KEYS]);
  });

  it('fills missing flags and ignores non-booleans', () => {
    assert.deepEqual(
      normalizeNotificationPrefs({ awaitingGo: false, draftRecaps: 'yes' as unknown as boolean }),
      { ...DEFAULT_NOTIFICATION_PREFS, awaitingGo: false },
    );
    assert.deepEqual(normalizeNotificationPrefs(null), DEFAULT_NOTIFICATION_PREFS);
  });

  it('keeps the other audience when one side saves', () => {
    const saved = mergeNotificationPrefs(
      { ...DEFAULT_NOTIFICATION_PREFS, weeklySummary: true, inviteNotices: true },
      { awaitingGo: false, syncProblems: false },
    );
    assert.equal(saved.awaitingGo, false);
    assert.equal(saved.syncProblems, false);
    assert.equal(saved.weeklySummary, true);
    assert.equal(saved.inviteNotices, true);
  });

  it('reads the old localStorage staff flags', () => {
    assert.deepEqual(
      readLegacyNotificationPrefs(
        JSON.stringify({ awaitingGo: false, syncProblems: true, draftRecaps: false, inviteNotices: true }),
      ),
      {
        awaitingGo: false,
        syncProblems: true,
        draftRecaps: false,
        inviteNotices: true,
      },
    );
    assert.equal(readLegacyNotificationPrefs('not-json'), null);
    assert.equal(readLegacyNotificationPrefs(null), null);
  });
});
