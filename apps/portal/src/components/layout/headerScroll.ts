/**
 * The page scroller is the element marked `data-page-scroll`.
 * A tab strip is not marked, so its scroll does not move the header line.
 */

export function findPageScroller<T>(markedInTreeOrder: readonly T[]): T | null {
  return markedInTreeOrder.length > 0 ? markedInTreeOrder[markedInTreeOrder.length - 1] ?? null : null;
}

export function headerBorderFromScroll(input: {
  eventTarget: { hasAttribute?: (name: string) => boolean } | null;
  scrollTop: number;
  /** Same value means this event did not move vertically, so the line stays. */
  previousScrollTop?: number | null;
}): boolean | null {
  if (!input.eventTarget?.hasAttribute?.('data-page-scroll')) return null;
  if (input.previousScrollTop != null && input.scrollTop === input.previousScrollTop) return null;
  return input.scrollTop > 0;
}
