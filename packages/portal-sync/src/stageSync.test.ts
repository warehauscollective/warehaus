import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isStagePending,
  stageConfirmed,
  stageDrainWrite,
  stageMoved,
  stagePulled,
  type StagePatch,
  type StageState,
} from './stageSync';

const T0 = '2026-11-20T10:00:00.000Z';
const T1 = '2026-11-20T11:00:00.000Z';
const T2 = '2026-11-20T12:00:00.000Z';
const PR = 'https://github.com/warehauscollective/warehaus/pull/12';

/** Apply a patch the way Convex does: a present key is written, `undefined` clears it. */
function apply(state: StageState, patch: StagePatch): StageState {
  const next: Record<string, unknown> = { ...state };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete next[key];
    else next[key] = value;
  }
  return next as StageState;
}

const synced = (stage: string): StageState => ({ stage, stageSynced: stage });
const move = (stage: string, extra: Partial<Parameters<typeof stageMoved>[1]> = {}) => ({
  stage,
  pullRequestLink: null,
  base: T0,
  at: 100,
  actorId: 'contacts:staff',
  writesBack: true,
  inflight: false,
  ...extra,
});
const pull = (stage: string, at: string) => ({
  name: 'Homepage',
  notionPageId: 'page-1',
  notionStage: stage,
  notionLastEditedTime: at,
  notionEditedMs: Date.parse(at),
});

describe('stage sync sequences', () => {
  it('move, then confirm: Synced, Pending, Synced', () => {
    let state = synced('Building');
    const moved = stageMoved(state, move('Ready to Ship'));
    assert.equal(moved.settles, false);
    state = apply(state, moved.patch);
    assert.equal(isStagePending(state), true);
    assert.deepEqual([state.stage, state.stageSynced, state.stagePendingBy], ['Ready to Ship', 'Building', 'contacts:staff']);
    state = apply(state, stageConfirmed(state, 'Ready to Ship', T1));
    assert.equal(isStagePending(state), false);
    assert.deepEqual([state.stage, state.stageSynced, state.stagePendingBy], ['Ready to Ship', 'Ready to Ship', undefined]);
  });

  it('two moves keep the first pending time and the original synced stage', () => {
    let state = synced('Building');
    state = apply(state, stageMoved(state, move('Planning')).patch);
    state = apply(state, stageMoved(state, move('Idea', { at: 200 })).patch);
    assert.deepEqual([state.stagePendingAt, state.stageSynced, state.stage], [100, 'Building', 'Idea']);
  });

  it('moving back onto the synced stage settles, unless a write is inflight', () => {
    let state = apply(synced('Building'), stageMoved(synced('Building'), move('Planning')).patch);
    const back = stageMoved(state, move('Building'));
    assert.equal(back.settles, true);
    assert.equal(isStagePending(apply(state, back.patch)), false);
    const racing = stageMoved(state, move('Building', { inflight: true }));
    assert.equal(racing.settles, false);
    state = apply(state, racing.patch);
    assert.equal(isStagePending(state), true, 'the inflight write may still land, so the move back is sent too');
  });

  it('a confirm for an older move keeps the later move pending and moves its base forward', () => {
    let state = synced('Building');
    state = apply(state, stageMoved(state, move('Planning')).patch);
    state = apply(state, stageMoved(state, move('Idea')).patch);
    state = apply(state, stageConfirmed(state, 'Planning', T1));
    assert.deepEqual([state.stage, isStagePending(state), state.stagePendingBaseEditedTime], ['Idea', true, T1]);
  });

  it('write-back off saves the stage with no pending mark', () => {
    const moved = stageMoved(synced('Building'), move('Planning', { writesBack: false }));
    assert.deepEqual(moved, { patch: { stage: 'Planning' }, settles: false, deleteUnsent: false });
  });

  it('a pull of an older edit keeps the pending move; a newer different edit wins and raises a notice', () => {
    let state = apply(synced('Building'), stageMoved(synced('Building'), move('Planning')).patch);
    const older = stagePulled({ ...state, lastEditedTime: T0 }, pull('Building', T0));
    assert.equal(older.stage, 'Planning');
    assert.equal(older.deleteUnsent, false);
    const newer = stagePulled({ ...state, lastEditedTime: T0 }, pull('Parked', T2));
    assert.equal(newer.stage, 'Parked');
    assert.equal(newer.deleteUnsent, true);
    assert.match(newer.notice?.message ?? '', /Parked/);
    state = apply({ ...state, stage: newer.stage }, newer.patch);
    assert.equal(isStagePending(state), false);
  });

  it('the drain resends the pending move, including a verified Shipped with its link', () => {
    assert.equal(stageDrainWrite(synced('Building'), 'page-1'), null);
    const pending = apply(synced('Building'), stageMoved(synced('Building'), move('Shipped', { pullRequestLink: PR })).patch);
    const write = stageDrainWrite(pending, 'page-1');
    assert.deepEqual(write?.properties, { Stage: 'Shipped', 'GitHub Issue/PR': PR });
    assert.equal(write?.base, T0);
  });
});
