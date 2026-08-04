'use client';

import { useEffect, useRef, type RefObject } from 'react';

/**
 * Shared horizontal swipe-tab behavior for surfaces that snap between
 * full-screen panels (website pillars / style guide / portal product tabs).
 *
 * Key behaviors:
 * - Native CSS scroll-snap + programmatic scroll for dock/click changes.
 * - Every gesture commits at most one adjacent tab (±1). Never skips.
 * - Pointer/touch/mouse swipes commit once past a distance threshold.
 * - Trackpad horizontal wheel accumulates to one tab, then cools down.
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

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

/** Snap an index to the active tab or one neighbor — never skip. */
function adjacentIndex(current: number, raw: number, length: number): number {
  if (length <= 0) return 0;
  const base = clamp(current, 0, length - 1);
  if (raw > base) return clamp(base + 1, 0, length - 1);
  if (raw < base) return clamp(base - 1, 0, length - 1);
  return base;
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

  const commitAdjacent = (direction: -1 | 1, fromGesture: boolean) => {
    const list = tabsRef.current;
    const current = list.indexOf(activeRef.current);
    if (current < 0) return;
    const nextIndex = current + direction;
    if (nextIndex < 0 || nextIndex >= list.length) return;
    const tab = list[nextIndex]!;
    if (tab === activeRef.current) return;
    if (fromGesture) scrollSync.current = true;
    setActiveTabRef.current(tab);
  };

  const commitTabAtIndex = (index: number, fromGesture: boolean) => {
    const list = tabsRef.current;
    const current = list.indexOf(activeRef.current);
    const clamped = adjacentIndex(current < 0 ? 0 : current, index, list.length);
    const tab = list[clamped];
    if (!tab || tab === activeRef.current) return;
    if (fromGesture) scrollSync.current = true;
    setActiveTabRef.current(tab);
  };

  // Commit the active tab only once native scroll-snap settles (debounced).
  // Always clamp to ±1 from the current tab so momentum can't skip panels.
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
        const rawIndex = Math.round(el.scrollLeft / width);
        const current = tabsRef.current.indexOf(activeRef.current);
        const index = adjacentIndex(current < 0 ? 0 : current, rawIndex, tabsRef.current.length);

        // If native scroll overshot past one neighbor, pull back.
        const targetLeft = index * width;
        if (Math.abs(el.scrollLeft - targetLeft) > 2) {
          isProgScrolling.current = true;
          el.scrollTo({ left: targetLeft, behavior: 'smooth' });
          window.setTimeout(() => {
            isProgScrolling.current = false;
          }, 450);
        }

        commitTabAtIndex(index, true);
      }, settleMs);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      clearTimeout(settle);
    };
  }, [settleMs]);

  // Trackpad / mouse-wheel horizontal swipe → exactly one adjacent tab.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    let axis: 'h' | 'v' | null = null;
    let accX = 0;
    let coolUntil = 0;
    let resetTimer: ReturnType<typeof setTimeout>;
    const GESTURE_GAP_MS = 160;
    const COOLDOWN_MS = 520; // one trackpad flick → one tab
    const AXIS_RATIO = 0.55;
    const COMMIT_PX = swipeThresholdPx;

    const resetGesture = () => {
      axis = null;
      accX = 0;
      isDragging.current = false;
    };

    const onWheel = (e: WheelEvent) => {
      let dx = e.deltaX;
      let dy = e.deltaY;
      if (e.shiftKey && Math.abs(dy) >= Math.abs(dx)) {
        dx = dy;
        dy = 0;
      }

      if (e.deltaMode === 1) {
        dx *= 16;
        dy *= 16;
      } else if (e.deltaMode === 2) {
        dx *= el.clientWidth;
        dy *= el.clientHeight;
      }

      if (!axis) {
        if (Math.abs(dx) < 1.5 && Math.abs(dy) < 1.5) return;
        axis = Math.abs(dx) >= Math.abs(dy) * AXIS_RATIO ? 'h' : 'v';
      }

      clearTimeout(resetTimer);
      resetTimer = setTimeout(resetGesture, GESTURE_GAP_MS);

      if (axis !== 'h') return;

      e.preventDefault();
      e.stopPropagation();

      // After a commit, ignore the rest of the same physical flick.
      if (performance.now() < coolUntil) return;

      isDragging.current = true;
      accX += dx;

      const width = el.clientWidth || 1;
      const current = tabsRef.current.indexOf(activeRef.current);
      const base = Math.max(0, current) * width;
      // Live preview capped to one panel width so snap can't overshoot.
      const preview = clamp(accX, -width * 0.95, width * 0.95);
      const max = el.scrollWidth - width;
      el.scrollLeft = clamp(base + preview, 0, max);

      if (Math.abs(accX) < COMMIT_PX) return;

      const direction: -1 | 1 = accX > 0 ? 1 : -1;
      const nextIndex = current + direction;
      resetGesture();
      coolUntil = performance.now() + COOLDOWN_MS;

      if (nextIndex < 0 || nextIndex >= tabsRef.current.length) {
        el.scrollTo({ left: current * width, behavior: 'smooth' });
        return;
      }

      scrollSync.current = true;
      isProgScrolling.current = true;
      el.scrollTo({ left: nextIndex * width, behavior: 'smooth' });
      commitAdjacent(direction, true);
      window.setTimeout(() => {
        isProgScrolling.current = false;
      }, 450);
    };

    el.addEventListener('wheel', onWheel, { passive: false, capture: true });
    return () => {
      el.removeEventListener('wheel', onWheel, true);
      clearTimeout(resetTimer);
      resetGesture();
    };
  }, [swipeThresholdPx]);

  // Pointer + mouse + touch: swipe → exactly one adjacent tab.
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

      const current = indexOf(activeRef.current);
      const width = el.clientWidth || 1;

      if (Math.abs(dx) < swipeThresholdPx) {
        el.scrollTo({ left: current * width, behavior: 'smooth' });
        return;
      }

      // Always ±1 regardless of how far the finger traveled.
      const direction: -1 | 1 = dx < 0 ? 1 : -1;
      const nextIndex = current + direction;
      if (nextIndex < 0 || nextIndex >= tabsRef.current.length) {
        el.scrollTo({ left: current * width, behavior: 'smooth' });
        return;
      }

      scrollSync.current = true;
      isProgScrolling.current = true;
      el.scrollTo({ left: nextIndex * width, behavior: 'smooth' });
      commitAdjacent(direction, true);
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
      const width = el.clientWidth || 1;
      // Cap live drag to one panel so release velocity can't fling past a neighbor.
      const clampedDx = clamp(dx, -width * 0.95, width * 0.95);
      el.scrollLeft = indexOf(activeRef.current) * width - clampedDx;
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

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('input, textarea, select, [contenteditable="true"]')) return;
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
