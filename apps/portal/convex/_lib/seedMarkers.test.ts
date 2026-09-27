import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { seedMatchReasons } from './seedMarkers';

describe('seed markers', () => {
  it('matches known seed emails, notion ids, and stripe ids', () => {
    assert.deepEqual(seedMatchReasons({ email: 'Demo@northbay.test' }), ['email:demo@northbay.test']);
    assert.deepEqual(seedMatchReasons({ notionPageId: 'seed-project-northbay' }), [
      'notionPageId:seed-project-northbay',
    ]);
    assert.deepEqual(seedMatchReasons({ stripeId: 'in_seed_client-portal_open' }), [
      'stripeId:in_seed_client-portal_open',
    ]);
    assert.deepEqual(seedMatchReasons({ email: 'guest@client.test', notionPageId: 'real-page' }), []);
  });
});
