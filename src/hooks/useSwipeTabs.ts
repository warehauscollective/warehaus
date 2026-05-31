'use client';

import { useEffect, useRef, type RefObject } from 'react';

/**
 * Shared horizontal swipe-tab behavior for the surfaces that snap between
 * full-screen panels (home pillars, style guide, worlds). One implementation so
 * every instance feels identical.
 *
 * Key behaviors:
 * - Native CSS scroll-snap drives the gesture; we never fight it.
 * - The active tab updates only once the swipe SETTLES (debounced) — never
 *   mid-gesture — so the easing is never interrupted.
 * - A swipe-driven tab change does NOT trigger a programmatic scroll (guarded),
 *   so the two never collide. Tab-button clicks / deep links DO smooth-scroll.
 * - Every off-screen panel is pinned to the top, so the panel you swipe/click to
 *   always starts from the top. The reset runs while the panel is off-screen
 *   (immediately for a settled swipe, after the scroll finishes for a click), so
 *   there's no visible jump.
 * - Reads `?tab=` on mount and keeps the URL in sync.
 */
export interface UseSwipeTabsOptions<T extends string> {
  /** Ordered tab keys; index = slide order. The first is the default. */
  tabs: readonly T[];
  /** The current valid tab for this surface. */
  active: T;
  /** Setter from LayoutProvider (accepts the wider ActiveTab union). */
  setActiveTab: (tab: T) => void;
  /** Vertical-scroll container ref for each panel, keyed by tab. */
  panelRefs: Record<T, RefObject<HTMLDivElement | null>>;
  /** Narrows a `?tab=` string to a valid tab for this surface. */
  isValidTab: (value: string | null) => value is T;
  /** Debounce before a settled swipe commits the tab. Default 90ms. */
  settleMs?: number;
}

export function useSwipeTabs<T extends string>({
  tabs,
  active,
  setActiveTab,
  panelRefs,
  isValidTab,
  settleMs = 90,
}: UseSwipeTabsOptions<T>): RefObject<HTMLDivElement | null> {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isProgScrolling = useRef(false);
  // Marks an activeTab change that came from the user's swipe, so the
  // tab→scroll effect doesn't fire a second (colliding) smooth scroll.
  const scrollSync = useRef(false);
  const activeRef = useRef(active);
  activeRef.current = active;

  const indexOf = (t: T) => tabs.indexOf(t);

  // Commit the active tab only once the swipe settles (debounced) — never
  // mid-gesture — so native scroll-snap easing is never interrupted.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let settle: ReturnType<typeof setTimeout>;
    const onScroll = () => {
      if (isProgScrolling.current) return;
      clearTimeout(settle);
      settle = setTimeout(() => {
        if (!el || isProgScrolling.current) return;
        const index = Math.round(el.scrollLeft / el.clientWidth);
        const tab = tabs[index];
        if (tab && tab !== activeRef.current) {
          scrollSync.current = true;
          setActiveTab(tab);
        }
      }, settleMs);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      clearTimeout(settle);
    };
  }, [tabs, setActiveTab, settleMs]);

  // Tab change → scroll to slide (skipped when swipe-driven), then pin every
  // off-screen panel to the top so the destination always starts at the top.
  useEffect(() => {
    const resetInactive = () => {
      for (const key of tabs) {
        if (key !== active) panelRefs[key]?.current?.scrollTo(0, 0);
      }
    };

    // Swipe-driven: we're already at the slide and the outgoing panel is fully
    // off-screen, so resetting it now is invisible.
    if (scrollSync.current) {
      scrollSync.current = false;
      resetInactive();
      return;
    }

    const el = scrollRef.current;
    if (!el) {
      resetInactive();
      return;
    }
    const target = indexOf(active) * el.clientWidth;
    if (Math.abs(el.scrollLeft - target) < 2) {
      resetInactive();
      return;
    }

    // Click / programmatic: smooth-scroll there, then reset the (now off-screen)
    // outgoing panels once the scroll has finished — so no exit jump is visible.
    isProgScrolling.current = true;
    el.scrollTo({ left: target, behavior: 'smooth' });
    const timeout = setTimeout(() => {
      isProgScrolling.current = false;
      resetInactive();
    }, 500);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // Read ?tab= on mount and position instantly.
  useEffect(() => {
    const tabParam = new URLSearchParams(window.location.search).get('tab');
    if (isValidTab(tabParam)) {
      scrollSync.current = true; // position instantly below; skip the smooth scroll
      setActiveTab(tabParam);
      requestAnimationFrame(() => {
        const el = scrollRef.current;
        if (el) el.scrollTo({ left: indexOf(tabParam) * el.clientWidth });
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setActiveTab, isValidTab]);

  // Keep the URL ?tab= in sync with the active tab.
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('tab', active);
    window.history.replaceState({}, '', url.toString());
  }, [active]);

  return scrollRef;
}
