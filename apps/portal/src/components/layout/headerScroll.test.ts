import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { headerBorderFromScroll, pickMainPageScroller } from './headerScroll';

describe('phone header border scroll', () => {
  it('reads the page scroller and ignores a horizontal tab strip', () => {
    const hidden = { target: 'sidebar', role: null, overflowY: 'auto', display: 'none', scrollTop: 80 };
    const strip = { target: 'tabs', role: 'tablist', overflowY: 'auto', display: 'block', scrollTop: 0 };
    const page = { target: 'page', role: null, overflowY: 'auto', display: 'block', scrollTop: 40 };
    const picked = pickMainPageScroller([hidden, strip, page]);
    assert.equal(picked, 'page');
    assert.equal((page.scrollTop > 0), true);

    const fromStrip = headerBorderFromScroll({
      eventTarget: strip.target,
      pageScroller: picked,
      scrollTop: page.scrollTop,
    });
    assert.equal(fromStrip, null);

    assert.equal(
      headerBorderFromScroll({ eventTarget: page.target, pageScroller: picked, scrollTop: 0 }),
      false,
    );
    assert.equal(
      headerBorderFromScroll({ eventTarget: page.target, pageScroller: picked, scrollTop: 12 }),
      true,
    );
  });
});