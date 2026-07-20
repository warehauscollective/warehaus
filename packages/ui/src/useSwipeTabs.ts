'use client';

import { useEffect, useRef, type RefObject } from 'react';

/**
 * Shared horizontal swipe-tab behavior for surfaces that snap between
 * full-screen panels (website pillars / style guide / portal product tabs).
 *
 * Key behaviors:
 * - Native CSS scroll-snap + programmatic scroll for dock/click changes.
 * - Pointer/touch/mouse swipes commit to the previous/next tab once the
 *   gesture clears a distance threshold (works even when nested panes would
 *   otherwise swallow scroll deltas).
 * - Trackpad horizontal wheel still moves the snap track directly.
 * - A swipe-driven tab change does NOT trigger a second programmatic scroll.
 * - Optional `?tab=` URL sync (website). Path-based apps use `urlSync: 'none'`.
 */
export interface UseSwipeTabsOptions<T extends string> {
  /** Ordered tab keys; index = slide order. The first is the default. */
  tabs: readonly T[];
  /** The current valid tab for this surface. */
  active: T;
  /** Setter from the surface's tab provider. */
  setActiveTab: (tab: T) => void;
  /** Vertical-scroll container ref for each panel, keyed by tab. */
  panelRefs: Record<T, RefObject<HTMLDivElement | null>>;
  /** Narrows a `?tab=` string to a valid tab for this surface. */
  isValidTab: (value: string | null) => value is T;
  /** Debounce before a settled native scroll commits the tab. Default 90ms. */
  settleMs?: number;
  /**
   * URL sync strategy.
   * - `'query'` (default): read/write `?tab=`
   * - `'none'`: caller owns URL (e.g. portal path tabs)
   */
  urlSync?: 'query' | 'none';
  /** Min horizontal drag (px) to change tabs. Default 64. */
  swipeThresholdPx?: number;
}

export function useSwipeTabs<T extends string>({
  tabs,
  active,
  setActiveTab,
  panelRefs,
  isValidTab,
  settleMs = 90,
  urlSync = 'query',
  swipeThresholdPx = 64,
}: UseSwipeTabsOptions<T>): RefObject<HTMLDivElement | null> {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isProgScrolling = useRef(false);
  const isDragging = useRef(false);
  // Marks an activeTab change that came from the user's swipe, so the
  // tab→scroll effect doesn't fire a second (colliding) smooth scroll.
  const scrollSync = useRef(false);
  const didInit = useRef(false);
  const activeRef = useRef(active);
  activeRef.current = active;
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const setActiveTabRef = useRef(setActiveTab);
  setActiveTabRef.current = setActiveTab;

  const indexOf = (t: T) => tabs.indexOf(t);

  const commitTabAtIndex = (index: number, fromGesture: boolean) => {
    const list = tabsRef.current;
    const tab = list[Math.min(list.length - 1, Math.max(0, index))];
    if (!tab || tab === activeRef.current) return;
    if (fromGesture) scrollSync.current = true;
    setActiveTabRef.current(tab);
  };

  // Commit the active tab only once native scroll-snap settles (debounced).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let settle: ReturnType<typeof setTimeout>;
    const onScroll = () => {
      if (isProgScrolling.current || isDragging.current) return;
      clearTimeout(settle);
      settle = setTimeout(() => {
        if (!el || isProgScrolling.current || isDragging.current) return;
        const width = el.clientWidth || 1;
        const index = Math.min(
          tabsRef.current.length - 1,
          Math.max(0, Math.round(el.scrollLeft / width)),
        );
        commitTabAtIndex(index, true);
      }, settleMs);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      clearTimeout(settle);
    };
  }, [settleMs]);

  // Trackpad: forward dominant-horizontal wheel to the snap track.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      const max = el.scrollWidth - el.clientWidth;
      if (max <= 0) return;
      const next = Math.min(max, Math.max(0, el.scrollLeft + e.deltaX));
      if (next === el.scrollLeft) return;
      el.scrollLeft = next;
      e.preventDefault();
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Pointer + mouse + touch: swipe left/right past a threshold → adjacent tab.
  // Capture-phase + document move/up so nested buttons/tiles can't swallow it.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    type Gesture = {
      id: number | 'mouse' | 'touch';
      startX: number;
      startY: number;
      axis: 'h' | 'v' | null;
      swiped: boolean;
    };
    let gesture: Gesture | null = null;

    const endGesture = (clientX: number) => {
      if (!gesture) return;
      const dx = clientX - gesture.startX;
      const didSwipe = gesture.swiped || Math.abs(dx) >= swipeThresholdPx;
      const axis = gesture.axis;
      gesture = null;
      isDragging.current = false;
      document.body.style.removeProperty('user-select');
      document.body.style.removeProperty('cursor');

      if (!didSwipe || axis === 'v') return;
      if (Math.abs(dx) < swipeThresholdPx) {
        // Snap back to the current tab if the drag was short.
        const width = el.clientWidth || 1;
        const index = indexOf(activeRef.current);
        el.scrollTo({ left: index * width, behavior: 'smooth' });
        return;
      }

      const current = indexOf(activeRef.current);
      // Drag content left (finger moves left, dx < 0) → next tab.
      const nextIndex = dx < 0 ? current + 1 : current - 1;
      if (nextIndex < 0 || nextIndex >= tabsRef.current.length) {
        const width = el.clientWidth || 1;
        el.scrollTo({ left: current * width, behavior: 'smooth' });
        return;
      }

      scrollSync.current = true;
      const width = el.clientWidth || 1;
      isProgScrolling.current = true;
      el.scrollTo({ left: nextIndex * width, behavior: 'smooth' });
      setActiveTabRef.current(tabsRef.current[nextIndex]!);
      window.setTimeout(() => {
        isProgScrolling.current = false;
      }, 450);

      const blockClick = (ev: Event) => {
        ev.preventDefault();
        ev.stopPropagation();
      };
      document.addEventListener('click', blockClick, { capture: true, once: true });
    };

    const onMoveXY = (clientX: number, clientY: number, prevent: () => void) => {
      if (!gesture) return;
      const dx = clientX - gesture.startX;
      const dy = clientY - gesture.startY;
      if (!gesture.axis) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        gesture.axis = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
      }
      if (gesture.axis !== 'h') return;
      gesture.swiped = true;
      isDragging.current = true;
      // Live-drag the track so the user sees panels move under the finger.
      el.scrollLeft = indexOf(activeRef.current) * (el.clientWidth || 1) - dx;
      prevent();
    };

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      gesture = {
        id: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        axis: null,
        swiped: false,
      };
      document.body.style.userSelect = 'none';
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!gesture || gesture.id !== e.pointerId) return;
      onMoveXY(e.clientX, e.clientY, () => e.preventDefault());
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!gesture || gesture.id !== e.pointerId) return;
      endGesture(e.clientX);
    };

    // Mouse fallbacks for environments that don't emit pointer events.
    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('input, textarea, select, [contenteditable="true"]')) return;
      // If a pointer gesture already started, skip duplicate mouse path.
      if (gesture) return;
      gesture = {
        id: 'mouse',
        startX: e.clientX,
        startY: e.clientY,
        axis: null,
        swiped: false,
      };
      document.body.style.userSelect = 'none';
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!gesture || gesture.id !== 'mouse') return;
      onMoveXY(e.clientX, e.clientY, () => e.preventDefault());
    };

    const onMouseUp = (e: MouseEvent) => {
      if (!gesture || gesture.id !== 'mouse') return;
      endGesture(e.clientX);
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (gesture) return;
      const t = e.touches[0]!;
      gesture = {
        id: 'touch',
        startX: t.clientX,
        startY: t.clientY,
        axis: null,
        swiped: false,
      };
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!gesture || gesture.id !== 'touch' || e.touches.length !== 1) return;
      const t = e.touches[0]!;
      onMoveXY(t.clientX, t.clientY, () => {
        if (gesture?.axis === 'h') e.preventDefault();
      });
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (!gesture || gesture.id !== 'touch') return;
      const t = e.changedTouches[0];
      endGesture(t?.clientX ?? gesture.startX);
    };

    // Capture on the track so we see events before children stop them.
    el.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('pointermove', onPointerMove, { passive: false });
    document.addEventListener('pointerup', onPointerUp, true);
    document.addEventListener('pointercancel', onPointerUp, true);

    el.addEventListener('mousedown', onMouseDown, true);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp, true);

    el.addEventListener('touchstart', onTouchStart, { capture: true, passive: true });
    el.addEventListener('touchmove', onTouchMove, { capture: true, passive: false });
    el.addEventListener('touchend', onTouchEnd, true);
    el.addEventListener('touchcancel', onTouchEnd, true);

    return () => {
      el.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp, true);
      document.removeEventListener('pointercancel', onPointerUp, true);
      el.removeEventListener('mousedown', onMouseDown, true);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp, true);
      el.removeEventListener('touchstart', onTouchStart, true);
      el.removeEventListener('touchmove', onTouchMove, true);
      el.removeEventListener('touchend', onTouchEnd, true);
      el.removeEventListener('touchcancel', onTouchEnd, true);
      document.body.style.removeProperty('user-select');
      document.body.style.removeProperty('cursor');
    };
  }, [swipeThresholdPx]);

  // Tab change → scroll to slide (skipped when swipe-driven), then pin every
  // off-screen panel to the top so the destination always starts at the top.
  useEffect(() => {
    const resetInactive = () => {
      for (const key of tabs) {
        if (key !== active) panelRefs[key]?.current?.scrollTo(0, 0);
      }
    };

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
      didInit.current = true;
      resetInactive();
      return;
    }

    if (!didInit.current) {
      didInit.current = true;
      el.scrollTo({ left: target });
      resetInactive();
      return;
    }

    isProgScrolling.current = true;
    el.scrollTo({ left: target, behavior: 'smooth' });
    const timeout = setTimeout(() => {
      isProgScrolling.current = false;
      resetInactive();
    }, 500);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // Read ?tab= on mount and position instantly (query mode only).
  useEffect(() => {
    if (urlSync !== 'query') return;
    const tabParam = new URLSearchParams(window.location.search).get('tab');
    if (isValidTab(tabParam)) {
      scrollSync.current = true;
      setActiveTab(tabParam);
      requestAnimationFrame(() => {
        const el = scrollRef.current;
        if (el) el.scrollTo({ left: indexOf(tabParam) * el.clientWidth });
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setActiveTab, isValidTab, urlSync]);

  // Keep the URL ?tab= in sync with the active tab (query mode only).
  useEffect(() => {
    if (urlSync !== 'query') return;
    const url = new URL(window.location.href);
    url.searchParams.set('tab', active);
    window.history.replaceState({}, '', url.toString());
  }, [active, urlSync]);

  return scrollRef;
}
