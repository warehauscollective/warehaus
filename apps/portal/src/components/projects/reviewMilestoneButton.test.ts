import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readRoadmapSource } from './roadmapSource';

describe('review milestone button', () => {
  it('retires the old Review milestone buttons so the card is the only control', () => {
    const source = readRoadmapSource();
    const buttons = [...source.matchAll(/<(PrimaryButton|OutlineButton)\b([^>]*)>\s*Review milestone/g)];
    assert.equal(buttons.length, 0);
    assert.equal(source.includes('function ReviewDialog'), false);
    assert.equal(source.includes('decideAsClient('), false);
    assert.match(source, /staff && milestone\.review/);
  });
});
