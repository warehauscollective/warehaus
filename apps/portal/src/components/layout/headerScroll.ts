export type PageScrollCandidate<T> = {
  target: T;
  role: string | null;
  overflowY: string;
  display: string;
};

/** The page's vertical scroller. A tab strip and a hidden pane are not it. */
export function pickMainPageScroller<T>(candidates: readonly PageScrollCandidate<T>[]): T | null {
  for (const candidate of candidates) {
    if (candidate.role === 'tablist') continue;
    if (candidate.display === 'none') continue;
    if (
      candidate.overflowY === 'auto' ||
      candidate.overflowY === 'scroll' ||
      candidate.overflowY === 'overlay'
    ) {
      return candidate.target;
    }
  }
  return null;
}

/**
 * Whether the header border is showing.
 * Null means this event was not the page scroller, so the current line stays.
 */
export function headerBorderFromScroll(input: {
  eventTarget: unknown;
  pageScroller: unknown;
  scrollTop: number;
}): boolean | null {
  if (input.pageScroller == null || input.eventTarget !== input.pageScroller) return null;
  return input.scrollTop > 0;
}
