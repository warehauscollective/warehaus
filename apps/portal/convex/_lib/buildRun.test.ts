import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  RUN_ALIVE_WRITE_MS,
  RUN_STALLED_AFTER_MS,
  aliveWriteDue,
  buildRunFactsForAudience,
  buildRunLabel,
  buildRunState,
  buildRunSuffix,
  clientBuildRunState,
  runStalled,
} from './buildRun';

const NOW = 10_000_000;

describe('Building indicator state', () => {
  it('is null unless the milestone is Building', () => {
    for (const status of ['Idea', 'Planning', 'Awaiting Go', 'Ready to Ship', 'Shipped', 'Parked']) {
      assert.equal(buildRunState(status, { running: true, aliveAt: NOW }, NOW), null, status);
    }
  });

  it('is live while a run goes, and Stalled after 5 minutes with no sign of life', () => {
    assert.equal(buildRunState('Building', { running: true, aliveAt: NOW }, NOW), 'live');
    assert.equal(buildRunState('Building', { running: true, aliveAt: NOW - RUN_STALLED_AFTER_MS + 1 }, NOW), 'live');
    assert.equal(buildRunState('Building', { running: true, aliveAt: NOW - RUN_STALLED_AFTER_MS }, NOW), 'stalled');
  });

  it('never shows Stalled for a run from a runner older than protocol 4', () => {
    assert.equal(buildRunState('Building', { running: true }, NOW), 'live');
    assert.equal(buildRunState('Building', { running: true, aliveAt: null }, NOW + 60 * 60_000), 'live');
  });

  it('a run going wins over a blocked task; with no run it is Blocked, else Queued', () => {
    assert.equal(buildRunState('Building', { running: true, aliveAt: NOW, blocked: true }, NOW), 'live');
    assert.equal(buildRunState('Building', { running: false, blocked: true }, NOW), 'blocked');
    assert.equal(buildRunState('Building', { running: false }, NOW), 'queued');
    assert.equal(buildRunState('Building', undefined, NOW), 'queued');
  });

  it('labels the status with a suffix, and live has none', () => {
    assert.equal(buildRunSuffix('live'), null);
    assert.equal(buildRunSuffix(null), null);
    assert.equal(buildRunLabel('Building', 'live'), 'Building');
    assert.equal(buildRunLabel('Building', 'queued'), 'Building · Queued');
    assert.equal(buildRunLabel('Building', 'blocked'), 'Building · Blocked');
    assert.equal(buildRunLabel('Building', 'stalled'), 'Building · Stalled');
  });
});

describe('sign of life writes', () => {
  it('writes at most once a minute', () => {
    assert.equal(aliveWriteDue(undefined, NOW), true);
    assert.equal(aliveWriteDue(NOW - RUN_ALIVE_WRITE_MS + 1, NOW), false);
    assert.equal(aliveWriteDue(NOW - RUN_ALIVE_WRITE_MS, NOW), true);
    assert.equal(runStalled(undefined, NOW), false);
  });
});

describe('client audience', () => {
  it('drops the blocked flag, and a client sees only live or nothing', () => {
    const facts = { running: false, blocked: true, aliveAt: NOW, taskId: 'tasks:1' };
    assert.deepEqual(buildRunFactsForAudience(facts, 'staff'), facts);
    assert.deepEqual(buildRunFactsForAudience(facts, 'client'), { running: false, aliveAt: NOW, taskId: 'tasks:1' });
    assert.equal(buildRunFactsForAudience(undefined, 'client'), undefined);
    assert.equal(clientBuildRunState('live'), 'live');
    for (const state of ['queued', 'blocked', 'stalled', null] as const) assert.equal(clientBuildRunState(state), null);
  });
});
