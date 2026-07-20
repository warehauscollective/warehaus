'use client';

import { useSyncExternalStore, useMemo, useEffect, useRef, useCallback } from 'react';

/**
 * Reveals `text` character-by-character at ~`speed` ms per char.
 * Uses useSyncExternalStore to avoid setState-in-effect lint issues.
 */
export function useTypewriter(
  text: string,
  enabled: boolean,
  speed: number = 18,
) {
  const store = useMemo(
    () => new TypewriterStore(text, enabled, speed),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [text, enabled],
  );

  // Cleanup previous store on change or unmount
  const prevStoreRef = useRef<TypewriterStore | null>(null);
  useEffect(() => {
    if (prevStoreRef.current && prevStoreRef.current !== store) {
      prevStoreRef.current.cleanup();
    }
    prevStoreRef.current = store;
    return () => store.cleanup();
  }, [store]);

  const subscribe = useCallback(
    (cb: () => void) => store.subscribe(cb),
    [store],
  );
  const getSnapshot = useCallback(() => store.getSnapshot(), [store]);

  const displayed = useSyncExternalStore(subscribe, getSnapshot, () => text);
  const done = displayed.length >= text.length;

  return { displayed, done };
}

class TypewriterStore {
  private index: number;
  private snapshot: string;
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private text: string;

  constructor(text: string, enabled: boolean, speed: number) {
    this.text = text;

    if (!enabled) {
      this.index = text.length;
      this.snapshot = text;
      return;
    }

    this.index = 0;
    this.snapshot = '';

    this.timer = setInterval(() => {
      this.index += 1;
      if (this.index >= this.text.length) {
        this.snapshot = this.text;
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
      } else {
        this.snapshot = this.text.slice(0, this.index);
      }
      this.emit();
    }, speed);
  }

  subscribe(cb: () => void) {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  getSnapshot() {
    return this.snapshot;
  }

  cleanup() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.listeners.clear();
  }

  private emit() {
    for (const cb of this.listeners) cb();
  }
}
