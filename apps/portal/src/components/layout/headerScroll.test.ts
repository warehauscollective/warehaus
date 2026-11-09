import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { findPageScroller, headerBorderFromScroll } from './headerScroll';

function marked(id: string) {
  return { id, hasAttribute: (name: string) => name === 'data-page-scroll' };
}

describe('phone header border scroll', () => {
  it('reads the marked page scroller and ignores a horizontal tab strip', () => {
    const pane = marked('pane');
    const strip = { id: 'tabs', hasAttribute: () => false };
    const page = marked('page');
    const picked = findPageScroller([pane, page]);
    assert.equal(picked, page);

    assert.equal(headerBorderFromScroll({ eventTarget: strip, scrollTop: 0 }), null);
    assert.equal(headerBorderFromScroll({ eventTarget: page, scrollTop: 0 }), false);
    assert.equal(headerBorderFromScroll({ eventTarget: page, scrollTop: 12 }), true);
    assert.equal(
      headerBorderFromScroll({ eventTarget: marked('table'), scrollTop: 0, previousScrollTop: 0 }),
      null,
    );
  });
});
