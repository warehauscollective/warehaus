import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { compareDocsByOrder } from './docOrder';

function titles(rows: { order?: number | null; title: string }[]): string[] {
  return [...rows].sort(compareDocsByOrder).map((row) => row.title);
}

describe('compareDocsByOrder', () => {
  it('sorts an Order of 1000 before a blank Order', () => {
    assert.deepEqual(
      titles([
        { title: 'Blank', order: null },
        { title: 'Thousand', order: 1000 },
      ]),
      ['Thousand', 'Blank'],
    );
  });

  it('tie-breaks equal Orders by title', () => {
    assert.deepEqual(
      titles([
        { title: 'Zebra', order: 2 },
        { title: 'Middle', order: 2 },
      ]),
      ['Middle', 'Zebra'],
    );
  });

  it('tie-breaks two blank Orders by title', () => {
    assert.deepEqual(
      titles([
        { title: 'Beta' },
        { title: 'Alpha', order: null },
      ]),
      ['Alpha', 'Beta'],
    );
  });
});
