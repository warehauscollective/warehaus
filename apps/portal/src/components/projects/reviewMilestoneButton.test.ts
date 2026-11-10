import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

describe('review milestone button', () => {
  it('locks every Review milestone button, primary and outline, to 148 by 42', () => {
    const source = readFileSync(new URL('./ProjectRoadmap.tsx', import.meta.url), 'utf8');
    const buttons = [...source.matchAll(/<(PrimaryButton|OutlineButton)\b([^>]*)>\s*Review milestone/g)];
    assert.equal(buttons.length, 4);
    for (const [, kind, attrs] of buttons) {
      assert.match(attrs, /width=\{148\}/);
      assert.match(attrs, /height=\{42\}/);
      assert.equal(attrs.includes('minWidth'), false, kind);
    }
  });
});
