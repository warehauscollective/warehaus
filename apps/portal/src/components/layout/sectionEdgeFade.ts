/**
 * Fade width for a horizontal chip row.
 * Shared by the portal section scroller and the client stage pills.
 * Never paints over the active control, and does not force a wide veil
 * when the next pill only peeks.
 */

/** Account at 390 lets Profile show about this much before the short edge fade. */
export const SECTION_NEXT_PEEK_PX = 44;

/** The active pill's left radius stays this far inside the strip. */
const ACTIVE_PILL_CLEARANCE_PX = 2;

/**
 * Scroll so the next tab peeks like Account's Profile. The active pill,
 * including its left radius, stays fully inside the strip. Returns the
 * scroll offset to apply.
 */
export function sectionPeekScroll(input: {
  scrollLeft: number;
  clientWidth: number;
  activeLeft: number;
  nextLeft: number | null;
  peekPx?: number;
}): number {
  const peekPx = input.peekPx ?? SECTION_NEXT_PEEK_PX;
  if (input.nextLeft == null || input.clientWidth <= 0) return input.scrollLeft;
  const visible = input.clientWidth - (input.nextLeft - input.scrollLeft);
  if (visible >= peekPx - 1) return input.scrollLeft;
  const maxScroll = input.activeLeft - ACTIVE_PILL_CLEARANCE_PX;
  if (maxScroll <= input.scrollLeft + 1) return input.scrollLeft;
  const desired = input.nextLeft - (input.clientWidth - peekPx);
  return Math.min(Math.max(input.scrollLeft, desired), maxScroll);
}

type EdgeFadeOptions = { inset?: boolean; activeSelector?: string };

export type EdgeFade = { leading: number; trailing: number };

/**
 * Bring the active control fully inside the strip, including its left radius.
 * Call this on mount and when the active key changes. Never from a scroll listener.
 * Writes `node.scrollLeft` only. Does not scroll the page or any ancestor.
 */
export function scrollActiveIntoView(node: HTMLElement, options?: EdgeFadeOptions): void {
  const inset = options?.inset ?? false;
  const activeSelector = options?.activeSelector ?? '[aria-current="true"]';
  const active = node.querySelector<HTMLElement>(activeSelector);
  const pad = inset ? 20 : 0;
  const page = node.ownerDocument?.scrollingElement ?? null;
  const pageLeft = page && page !== node ? page.scrollLeft : 0;
  if (!active) {
    if (page && page !== node) page.scrollLeft = pageLeft;
    return;
  }
  const buttons = [...node.querySelectorAll<HTMLElement>('button')];
  const edge = node.getBoundingClientRect().left;
  const contentLeft = (button: HTMLElement) => button.getBoundingClientRect().left - edge + node.scrollLeft;
  const left = contentLeft(active);
  const width = active.getBoundingClientRect().width;
  const right = left + width;
  const later = buttons.some((button) => contentLeft(button) >= right - 1);
  const room = node.clientWidth - pad - width;
  const reserve = later && room >= 8 ? Math.min(16, Math.floor(room)) : 0;
  let next = node.scrollLeft;
  if (left - next < pad) next = Math.max(0, left - pad);
  const limit = node.clientWidth - reserve;
  if (right - next > limit) next = Math.max(0, right - limit);
  if (left - next < pad && width <= node.clientWidth - pad - reserve) next = Math.max(0, left - pad);
  const nextButton = buttons.find((button) => contentLeft(button) >= right - 1);
  next = sectionPeekScroll({
    scrollLeft: next,
    clientWidth: node.clientWidth,
    activeLeft: left,
    nextLeft: nextButton ? contentLeft(nextButton) : null,
  });
  if (Math.abs(next - node.scrollLeft) > 1) node.scrollLeft = next;
  if (page && page !== node) page.scrollLeft = pageLeft;
}

function cappedFade(room: number, clipped: boolean): number {
  const width = clipped ? Math.min(20, Math.max(0, room - 8)) : 0;
  return width >= 12 ? Math.round(width) : 0;
}

/**
 * Leading fade only after the strip has scrolled. Trailing fade only while
 * a later control is still clipped. Neither width covers the active control
 * when that control is on screen. Does not write scrollLeft.
 */
export function sectionEdgeFades(node: HTMLElement, options?: EdgeFadeOptions): EdgeFade {
  const activeSelector = options?.activeSelector ?? '[aria-current="true"]';
  const active = node.querySelector<HTMLElement>(activeSelector);
  const overflow = node.scrollWidth - node.clientWidth > 1;
  if (!overflow) return { leading: 0, trailing: 0 };
  const atStart = node.scrollLeft <= 1;
  const atEnd = node.scrollLeft + node.clientWidth >= node.scrollWidth - 1;
  const edge = node.getBoundingClientRect().left;
  const buttons = Array.from(node.querySelectorAll('button'));
  const earlierClipped = buttons.some((button) => button.getBoundingClientRect().left - edge < -0.5);
  const laterClipped = buttons.some((button) => button.getBoundingClientRect().right - edge > node.clientWidth + 0.5);
  const activeLeft = active ? active.getBoundingClientRect().left - edge : 0;
  const activeRight = active ? active.getBoundingClientRect().right - edge : 0;
  const activeOnScreen = Boolean(active) && activeRight > 0 && activeLeft < node.clientWidth;
  const roomBefore = activeOnScreen ? Math.max(0, activeLeft) : node.clientWidth;
  const roomAfter = activeOnScreen && activeRight > 0 ? node.clientWidth - activeRight : node.clientWidth;
  return {
    leading: atStart ? 0 : cappedFade(roomBefore, earlierClipped),
    trailing: atEnd ? 0 : cappedFade(roomAfter, laterClipped),
  };
}

/** Trailing fade width only. Does not write scrollLeft. */
export function sectionEdgeFadePx(node: HTMLElement, options?: EdgeFadeOptions): number {
  return sectionEdgeFades(node, options).trailing;
}

/** Scroll listener for the activity filter row. Measures only. */
export function activityFilterFadeOnScroll(node: HTMLElement): EdgeFade {
  return sectionEdgeFades(node, { activeSelector: '[aria-pressed="true"]' });
}

/** Mask for one or both edges. Opaque from the left until the strip has scrolled. */
export function sectionEdgeMask(fade: EdgeFade): string | null {
  const lead = fade.leading;
  const trail = fade.trailing;
  if (lead <= 0 && trail <= 0) return null;
  if (lead <= 0) {
    return `linear-gradient(to right, #000 0, #000 calc(100% - ${trail}px), transparent calc(100% - ${Math.round(trail * 0.45)}px))`;
  }
  if (trail <= 0) {
    return `linear-gradient(to right, transparent 0, #000 ${Math.round(lead * 0.45)}px, #000 ${lead}px, #000 100%)`;
  }
  return `linear-gradient(to right, transparent 0, #000 ${Math.round(lead * 0.45)}px, #000 ${lead}px, #000 calc(100% - ${trail}px), transparent calc(100% - ${Math.round(trail * 0.45)}px))`;
}
