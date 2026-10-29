import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { searchFixtures } from './fixtureSearch';

describe('fixture search', () => {
  it('keeps unpublished notes off the client palette', () => {
    const client = JSON.stringify(searchFixtures('client', 'note'));
    assert.match(client, /Capture homepage notes/);
    assert.match(client, /Kickoff recap/);
    assert.equal(client.includes('Workshop recap'), false);
    assert.equal(client.includes('Account notes'), false);
    assert.equal(client.includes('published'), false);
    assert.equal(client.includes('notion-'), false);
  });

  it('shows staff the unpublished notes', () => {
    const staff = JSON.stringify(searchFixtures('staff', 'note'));
    assert.match(staff, /Workshop recap/);
    assert.match(staff, /Account notes/);
    assert.match(staff, /Capture homepage notes/);
    assert.match(staff, /Kickoff recap/);
  });
});
