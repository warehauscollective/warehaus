'use client';

import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

type KeyEvent = {
  key: string;
  shiftKey?: boolean;
  preventDefault(): void;
  stopPropagation(): void;
};

/** Escape closes the popover and does not reach a modal behind it. Tab stays inside. */
export function handleNoticePopoverKey(
  event: KeyEvent,
  panel: ParentNode | null,
  active: unknown,
  close: () => void,
) {
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    close();
    return;
  }
  if (event.key !== 'Tab' || !panel) return;
  const nodes = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => !el.hasAttribute('disabled'));
  if (nodes.length === 0) return;
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  if (event.shiftKey && active === first) {
    event.preventDefault();
    event.stopPropagation();
    last?.focus({ preventScroll: true });
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    event.stopPropagation();
    first?.focus({ preventScroll: true });
  }
}

/**
 * Saves focus when the popover opens, moves it to the first control, and
 * returns it on close. `onClose` is read from a ref so a new callback does
 * not rebind the keys.
 */
export function useNoticePopoverKeys<T extends HTMLElement>(
  open: boolean,
  panelRef: RefObject<T | null>,
  onClose: () => void,
) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const returnFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => {
      panelRef.current?.querySelector<HTMLElement>('button')?.focus({ preventScroll: true });
    });
    const onKey = (event: KeyboardEvent) => {
      handleNoticePopoverKey(event, panelRef.current, document.activeElement, () => onCloseRef.current());
    };
    document.addEventListener('keydown', onKey);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKey);
      returnFocus.current?.focus({ preventScroll: true });
      returnFocus.current = null;
    };
  }, [open, panelRef]);
}
