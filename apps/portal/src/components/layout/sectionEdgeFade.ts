/**
 * Fade width for a horizontal chip row.
 * Shared by the portal section scroller and the client stage pills.
 * Never paints over the active control, and does not force a wide veil
 * when the next pill only peeks.
 */

/** Account at 390 lets Profile show about this much before the short edge fade. */
export const SECTION_NEXT_PEEK_PX = 44;

/**
 * Scroll so the next tab peeks like Account's Profile, without sliding the
 * active label off the left edge. Returns the scroll offset to apply.
 */
export function sectionPeekScroll(input: {
  scrollLeft: number;
  clientWidth: number;
  activeLeft: number;
  activeLabelInset: number;
  nextLeft: number | null;
  peekPx?: number;
}): number {
  const peekPx = input.peekPx ?? SECTION_NEXT_PEEK_PX;
  if (input.nextLeft == null || input.clientWidth <= 0) return input.scrollLeft;
  const visible = input.clientWidth - (input.nextLeft - input.scrollLeft);
  if (visible >= peekPx - 1) return input.scrollLeft;
  // Pill padding may leave the row. The label itself stays at x >= 0.
  const maxScroll = input.activeLeft + Math.max(0, input.activeLabelInset);
  if (maxScroll <= input.scrollLeft + 1) return input.scrollLeft;
  const desired = input.nextLeft - (input.clientWidth - peekPx);
  return Math.min(Math.max(input.scrollLeft, desired), maxScroll);
}

export function sectionEdgeFadePx(
  node: HTMLElement,
  options?: { inset?: boolean; activeSelector?: string },
): number {
  const inset = options?.inset ?? false;
  const activeSelector = options?.activeSelector ?? '[aria-current="true"]';
  const active = node.querySelector<HTMLElement>(activeSelector);
  const pad = inset ? 20 : 0;
  if (active) {
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
    const labelInset = Number.parseFloat(getComputedStyle(active).paddingLeft) || 0;
    next = sectionPeekScroll({
      scrollLeft: next,
      clientWidth: node.clientWidth,
      activeLeft: left,
      activeLabelInset: labelInset,
      nextLeft: nextButton ? contentLeft(nextButton) : null,
    });
    if (Math.abs(next - node.scrollLeft) > 1) node.scrollLeft = next;
  }
  const overflow = node.scrollWidth - node.clientWidth > 1;
  const atEnd = node.scrollLeft + node.clientWidth >= node.scrollWidth - 1;
  if (!overflow || atEnd) return 0;
  // A short edge fade only. A veil as wide as the leftover gap paints a
  // faint empty pill where the next tab should stay readable.
  const edge = node.getBoundingClientRect().left;
  const activeRight = active ? active.getBoundingClientRect().right - edge : 0;
  const laterClipped = Array.from(node.querySelectorAll('button')).some((button) => {
    return button.getBoundingClientRect().right - edge > node.clientWidth + 0.5;
  });
  const roomAfterActive = activeRight > 0 ? node.clientWidth - activeRight : node.clientWidth;
  const width = laterClipped ? Math.min(20, Math.max(0, roomAfterActive - 8)) : 0;
  return width >= 12 ? Math.round(width) : 0;
}
