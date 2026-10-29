import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { sectionPeekScroll } from './sectionEdgeFade';

describe('sectionPeekScroll', () => {
  it('scrolls Resources at 390 until Meeting notes peeks, keeping All resources readable', () => {
    const scroll = sectionPeekScroll({
      scrollLeft: 0,
      clientWidth: 136,
      activeLeft: 20,
      activeLabelInset: 11.2,
      nextLeft: 130,
    });
    assert.equal(scroll, 31.2);
    const peek = 136 - (130 - scroll);
    const labelLeft = 20 + 11.2 - scroll;
    assert.ok(peek >= 36);
    assert.ok(labelLeft >= 0);
  });

  it('leaves Account alone when Profile already peeks', () => {
    const scroll = sectionPeekScroll({
      scrollLeft: 0,
      clientWidth: 136,
      activeLeft: 20,
      activeLabelInset: 11.2,
      nextLeft: 92,
    });
    assert.equal(scroll, 0);
  });

  it('does not pull a wide active pill back off the right', () => {
    const scroll = sectionPeekScroll({
      scrollLeft: 184,
      clientWidth: 136,
      activeLeft: 20,
      activeLabelInset: 11.2,
      nextLeft: 220,
    });
    assert.equal(scroll, 184);
  });

  it('does not scroll when there is no later tab', () => {
    assert.equal(
      sectionPeekScroll({
        scrollLeft: 12,
        clientWidth: 136,
        activeLeft: 20,
        activeLabelInset: 11.2,
        nextLeft: null,
      }),
      12,
    );
  });
});
