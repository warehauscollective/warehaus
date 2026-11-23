import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { milestoneLastChange, roadmapViewForAudience, showsUpdatedStamp } from './milestones';

describe('milestone last-change time', () => {
  it('is the newest real time and ignores missing ones', () => {
    assert.equal(milestoneLastChange([100, null, undefined, 300, 200]), 300);
    assert.equal(milestoneLastChange([Number.NaN, 50]), 50);
    assert.equal(milestoneLastChange([]), null);
    assert.equal(milestoneLastChange([null, undefined]), null);
  });

  it('is read only for the live loop, and never sent to a client', () => {
    assert.equal(showsUpdatedStamp('Planning'), true);
    assert.equal(showsUpdatedStamp('Building'), true);
    for (const status of ['Idea', 'Awaiting Go', 'Ready to Ship', 'Shipped', 'Parked']) assert.equal(showsUpdatedStamp(status), false);
    const view = { id: 'm1', updatedAt: 123 };
    assert.deepEqual(roadmapViewForAudience(view, 'staff'), view);
    assert.equal('updatedAt' in roadmapViewForAudience(view, 'client'), false);
  });
});
