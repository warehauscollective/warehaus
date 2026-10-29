import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { sectionPeekScroll } from './sectionEdgeFade';

describe('sectionPeekScroll', () => {
  it('peeks Meeting notes without sliding All resources out of the strip', () => {
    const scroll = sectionPeekScroll({
      scrollLeft: 0,
      clientWidth: 136,
      activeLeft: 20,
      nextLeft: 130,
    });
    assert.equal(scroll, 18);
    const pillLeft = 20 - scroll;
    const peek = 136 - (130 - scroll);
    assert.ok(pillLeft >= 2);
    assert.ok(peek > 136 - 130);
  });

  it('leaves Account alone when Profile already peeks', () => {
    const scroll = sectionPeekScroll({
      scrollLeft: 0,
      clientWidth: 136,
      activeLeft: 20,
      nextLeft: 92,
    });
    assert.equal(scroll, 0);
  });

  it('does not pull a wide active pill back off the right', () => {
    const scroll = sectionPeekScroll({
      scrollLeft: 184,
      clientWidth: 136,
      activeLeft: 20,
      nextLeft: 220,
    });
    assert.equal(scroll, 184);
  });

  it('does not scroll when there is no later tab', () => {
    assert.equal(
      sectionPeekScroll({
        scrollLeft: 0,
        clientWidth: 136,
        activeLeft: 20,
        nextLeft: null,
      }),
      0,
    );
  });
});
