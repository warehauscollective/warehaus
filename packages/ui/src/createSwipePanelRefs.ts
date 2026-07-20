import { createRef, type RefObject } from 'react';

/** Build a stable `{ [tab]: RefObject }` map for `useSwipeTabs` / `SwipeTabView`. */
export function createSwipePanelRefs<T extends string>(
  tabs: readonly T[],
): Record<T, RefObject<HTMLDivElement | null>> {
  const refs = {} as Record<T, RefObject<HTMLDivElement | null>>;
  for (const tab of tabs) {
    refs[tab] = createRef<HTMLDivElement>();
  }
  return refs;
}
