import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { updatedRelative, updatedStampText } from './updatedStamp';

const NOW = Date.UTC(2026, 10, 22, 17, 0, 0);
const MIN = 60_000;
const HOUR = 60 * MIN;

describe('updated stamp', () => {
  it('reads just now, minutes, hours, yesterday, then a short date', () => {
    assert.equal(updatedRelative(NOW, NOW), 'just now');
    assert.equal(updatedRelative(NOW - 59_000, NOW), 'just now');
    assert.equal(updatedRelative(NOW - MIN, NOW), '1m ago');
    assert.equal(updatedRelative(NOW - 5 * MIN - 30_000, NOW), '5m ago');
    assert.equal(updatedRelative(NOW - 59 * MIN, NOW), '59m ago');
    assert.equal(updatedRelative(NOW - HOUR, NOW), '1h ago');
    assert.equal(updatedRelative(NOW - 2 * HOUR - 40 * MIN, NOW), '2h ago');
    assert.equal(updatedRelative(NOW - 23 * HOUR, NOW), '23h ago');
    assert.equal(updatedRelative(NOW - 24 * HOUR, NOW), 'yesterday');
    assert.equal(updatedRelative(NOW - 47 * HOUR, NOW), 'yesterday');
    assert.equal(updatedRelative(NOW - 48 * HOUR, NOW, 'America/New_York'), 'Nov 20');
    assert.equal(updatedRelative(Date.UTC(2026, 9, 3, 15), NOW, 'America/New_York'), 'Oct 3');
    assert.equal(updatedRelative(Date.UTC(2025, 11, 30, 15), NOW, 'America/New_York'), 'Dec 30, 2025');
  });

  it('treats a time ahead of the clock as just now, and shows nothing without a real time', () => {
    assert.equal(updatedRelative(NOW + 5 * MIN, NOW), 'just now');
    assert.equal(updatedStampText(NOW - 5 * MIN, NOW), 'Updated 5m ago');
    assert.equal(updatedStampText(null, NOW), null);
    assert.equal(updatedStampText(undefined, NOW), null);
    assert.equal(updatedStampText(Number.NaN, NOW), null);
  });
});
