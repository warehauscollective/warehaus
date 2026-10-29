import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { sectionEdgeFadePx, sectionPeekScroll } from './sectionEdgeFade';

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

type FakeChip = { left: number; width: number; pressed?: boolean };

function fakeChipRow(input: {
  clientWidth: number;
  scrollWidth: number;
  scrollLeft: number;
  buttons: FakeChip[];
}): HTMLElement {
  let scrollLeft = input.scrollLeft;
  const buttons = input.buttons.map((chip) => ({
    chip,
    getBoundingClientRect() {
      const left = chip.left - scrollLeft;
      return { left, right: left + chip.width, width: chip.width, top: 0, bottom: 32, height: 32, x: left, y: 0 };
    },
  }));
  return {
    clientWidth: input.clientWidth,
    scrollWidth: input.scrollWidth,
    get scrollLeft() {
      return scrollLeft;
    },
    set scrollLeft(value: number) {
      scrollLeft = value;
    },
    getBoundingClientRect() {
      return { left: 0, right: input.clientWidth, width: input.clientWidth, top: 0, bottom: 32, height: 32, x: 0, y: 0 };
    },
    querySelector(selector: string) {
      if (selector !== '[aria-pressed="true"]') return null;
      return buttons.find((button) => button.chip.pressed) ?? null;
    },
    querySelectorAll(selector: string) {
      return selector === 'button' ? buttons : [];
    },
  } as unknown as HTMLElement;
}

describe('sectionEdgeFadePx', () => {
  it('keeps a trailing fade at scrollLeft 0 and stops short of the active chip', () => {
    const node = fakeChipRow({
      clientWidth: 320,
      scrollWidth: 640,
      scrollLeft: 0,
      buttons: [
        { left: 0, width: 72, pressed: true },
        { left: 88, width: 80 },
        { left: 420, width: 90 },
      ],
    });
    const fade = sectionEdgeFadePx(node, { activeSelector: '[aria-pressed="true"]' });
    assert.equal(node.scrollLeft, 0);
    assert.equal(fade, 20);
    assert.ok(fade < 320 - 72);
  });

  it('drops the fade when the remaining room would reach the active chip', () => {
    const node = fakeChipRow({
      clientWidth: 100,
      scrollWidth: 220,
      scrollLeft: 0,
      buttons: [
        { left: 0, width: 90, pressed: true },
        { left: 100, width: 80 },
      ],
    });
    assert.equal(sectionEdgeFadePx(node, { activeSelector: '[aria-pressed="true"]' }), 0);
    assert.equal(node.scrollLeft, 0);
  });

  it('scrolls the active chip into view when the filter changes', () => {
    const buttons: FakeChip[] = [
      { left: 0, width: 60, pressed: true },
      { left: 400, width: 60 },
    ];
    const node = fakeChipRow({ clientWidth: 200, scrollWidth: 600, scrollLeft: 0, buttons });
    sectionEdgeFadePx(node, { activeSelector: '[aria-pressed="true"]' });
    assert.equal(node.scrollLeft, 0);

    buttons[0].pressed = false;
    buttons[1].pressed = true;
    sectionEdgeFadePx(node, { activeSelector: '[aria-pressed="true"]' });
    const visibleLeft = 400 - node.scrollLeft;
    const visibleRight = visibleLeft + 60;
    assert.ok(visibleLeft >= -1);
    assert.ok(visibleRight <= 201);
    assert.ok(node.scrollLeft > 0);
  });
});
