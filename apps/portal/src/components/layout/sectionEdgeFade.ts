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

/**
 * Bring the active control fully inside the strip, including its left radius.
 * Call this on mount and when the active key changes. Never from a scroll listener.
 */
export function scrollActiveIntoView(node: HTMLElement, options?: EdgeFadeOptions): void {
  const inset = options?.inset ?? false;
  const activeSelector = options?.activeSelector ?? '[aria-current="true"]';
  const active = node.querySelector<HTMLElement>(activeSelector);
  const pad = inset ? 20 : 0;
  if (!active) return;
  // Scroll this row only. scrollIntoView would move the swipe track.
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
}

/** Trailing fade width only. Does not write scrollLeft. */
export function sectionEdgeFadePx(node: HTMLElement, options?: EdgeFadeOptions): number {
  const activeSelector = options?.activeSelector ?? '[aria-current="true"]';
  const active = node.querySelector<HTMLElement>(activeSelector);
  const overflow = node.scrollWidth - node.clientWidth > 1;
  const atEnd = node.scrollLeft + node.clientWidth >= node.scrollWidth - 1;
  if (!overflow || atEnd) return 0;
  // Trailing fade only. scrollLeft 0 has no leading fade: the mask stays
  // opaque from the left edge and only dissolves the clipped tab on the right.
  const edge = node.getBoundingClientRect().left;
  const activeRight = active ? active.getBoundingClientRect().right - edge : 0;
  const laterClipped = Array.from(node.querySelectorAll('button')).some((button) => {
    return button.getBoundingClientRect().right - edge > node.clientWidth + 0.5;
  });
  const roomAfterActive = activeRight > 0 ? node.clientWidth - activeRight : node.clientWidth;
  const width = laterClipped ? Math.min(20, Math.max(0, roomAfterActive - 8)) : 0;
  return width >= 12 ? Math.round(width) : 0;
}

/** Scroll listener for the activity filter row. Measures only. */
export function activityFilterFadeOnScroll(node: HTMLElement): number {
  return sectionEdgeFadePx(node, { activeSelector: '[aria-pressed="true"]' });
}
