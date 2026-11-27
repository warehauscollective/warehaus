'use client';

import { Icon } from '@/components/ui/Icon';
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { closeoutMenuItems } from '@convex/_lib/closeout';
import { PortalModal } from '@/components/ui/PortalModal';
import { useMaxWidth } from '@/lib/design/useMaxWidth';
import { MENU_ARCHIVE, MENU_MARK_COMPLETE, MENU_RESTORE, MILESTONE_MENU_HINT } from './closeoutCopy';

export type OverflowTarget = 'milestone' | 'task';
export type OverflowState = 'open' | 'complete' | 'archived';
export type OverflowAction = 'complete' | 'archive' | 'restore';

const ITEM_LABEL: Record<OverflowAction, string> = {
  complete: MENU_MARK_COMPLETE,
  archive: MENU_ARCHIVE,
  restore: MENU_RESTORE,
};

export const OVERFLOW_MENU_WIDTH = 280;
const GAP = 8;

/**
 * Right-align the panel to the trigger so it sits on the card's right edge.
 * Flip above when it does not fit below, then keep it inside the viewport.
 */
export function overflowMenuBox(input: {
  trigger: { top: number; bottom: number; right: number };
  menu: { width: number; height: number };
  viewport: { width: number; height: number };
}): { top: number; left: number; placement: 'up' | 'down' } {
  const { trigger, menu, viewport } = input;
  const below = viewport.height - trigger.bottom - GAP;
  const above = trigger.top - GAP;
  const placement = below < menu.height && above >= menu.height ? 'up' : 'down';
  const rawTop = placement === 'up' ? trigger.top - GAP - menu.height : trigger.bottom + GAP;
  const top = Math.min(Math.max(rawTop, GAP), Math.max(GAP, viewport.height - menu.height - GAP));
  const left = Math.min(Math.max(trigger.right - menu.width, GAP), Math.max(GAP, viewport.width - menu.width - GAP));
  return { top, left, placement };
}

const itemStyle: CSSProperties = {
  width: '100%',
  padding: 10,
  border: 0,
  borderRadius: 12,
  background: 'transparent',
  color: 'var(--fg)',
  font: 'inherit',
  fontSize: 14,
  lineHeight: '21px',
  textAlign: 'left',
  cursor: 'pointer',
};

const hintStyle: CSSProperties = {
  margin: '8px 10px',
  fontFamily: 'var(--font-mono)',
  fontSize: 12,
  lineHeight: '18px',
  color: 'var(--muted)',
};

const FOCUS =
  'focus-visible:[--tw-outline-style:solid] focus-visible:outline-2 focus-visible:outline-[var(--info)] focus-visible:outline-offset-2';

/**
 * OverflowMenu, Figma 1036:8439. The sixth Core menu, beside StatusMenu.
 * A 28×28 "…" trigger. 1440 opens a popover. 390 opens a bottom sheet in
 * PortalModal. An open item offers Mark complete and Archive. A completed or
 * archived item offers Restore alone. Staff only: the caller does not render
 * this for a client.
 */
export function OverflowMenu({
  target,
  state,
  label,
  onAction,
  disabled = false,
  open: controlledOpen,
  onOpenChange,
  renderSheet = true,
  testId = 'overflow-menu',
}: {
  target: OverflowTarget;
  state: OverflowState;
  /** The item's name, for the trigger's accessible name. */
  label: string;
  onAction: (action: OverflowAction) => void;
  disabled?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** False when the caller shows the phone sheet itself, in place of its own dialog. */
  renderSheet?: boolean;
  testId?: string;
}) {
  const [ownOpen, setOwnOpen] = useState(false);
  const open = controlledOpen ?? ownOpen;
  const setOpen = (next: boolean) => {
    if (controlledOpen === undefined) setOwnOpen(next);
    onOpenChange?.(next);
  };
  const phone = useMaxWidth(767);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const menuId = useId();
  const popover = open && !phone;

  useLayoutEffect(() => {
    setHost(document.body);
  }, []);

  useLayoutEffect(() => {
    if (!popover) return;
    const menu = menuRef.current;
    const trigger = triggerRef.current;
    if (!menu || !trigger) return;
    const place = () => {
      const rect = trigger.getBoundingClientRect();
      const box = overflowMenuBox({
        trigger: { top: rect.top, bottom: rect.bottom, right: rect.right },
        menu: { width: OVERFLOW_MENU_WIDTH, height: menu.offsetHeight },
        viewport: { width: window.innerWidth, height: window.innerHeight },
      });
      menu.style.top = `${box.top}px`;
      menu.style.left = `${box.left}px`;
      menu.dataset.placement = box.placement;
    };
    place();
    menu.querySelector<HTMLElement>('[role="menuitem"]')?.focus({ preventScroll: true });
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [popover, host]);

  useEffect(() => {
    if (!popover) return;
    const onPointer = (event: PointerEvent) => {
      const node = event.target;
      if (!(node instanceof Node)) return;
      if (menuRef.current?.contains(node) || triggerRef.current?.contains(node)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [popover]);

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus({ preventScroll: true });
  };
  const choose = (action: OverflowAction) => {
    close(false);
    onAction(action);
  };
  const onMenuKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return;
    }
    if (event.key === 'Tab') {
      close(false);
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const items = [...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    if (items.length === 0) return;
    const index = items.indexOf(document.activeElement as HTMLElement);
    const step = event.key === 'ArrowDown' ? 1 : -1;
    items[(index + step + items.length) % items.length]?.focus();
  };

  const items = closeoutMenuItems(state);
  const hint = target === 'milestone' && state === 'open' ? MILESTONE_MENU_HINT : null;
  const list = (sheet: boolean) => (
    <>
      {items.map((action) => (
        <button
          key={action}
          type="button"
          role="menuitem"
          data-testid={`overflow-item-${action}`}
          onClick={(event) => {
            event.stopPropagation();
            choose(action);
          }}
          className={`overflow-menu-item ${FOCUS}`}
          style={sheet ? { ...itemStyle, padding: '12px 10px' } : itemStyle}
        >
          {ITEM_LABEL[action]}
        </button>
      ))}
      {hint ? (
        <p data-testid="overflow-hint" style={hintStyle}>
          {hint}
        </p>
      ) : null}
    </>
  );

  const panel = popover ? (
    <div
      ref={menuRef}
      id={menuId}
      role="menu"
      aria-label={`${target === 'milestone' ? 'Milestone' : 'Task'} actions`}
      className="ds-scope"
      data-testid={`${testId}-panel`}
      data-menu-layer=""
      data-target={target}
      data-state={state}
      onKeyDown={onMenuKey}
      onClick={(event) => event.stopPropagation()}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: OVERFLOW_MENU_WIDTH,
        zIndex: 90,
        boxSizing: 'border-box',
        padding: 6,
        background: 'var(--surface)',
        border: '1px solid var(--border-2)',
        borderRadius: 18,
        boxShadow: '0 16px 40px rgba(0,0,0,0.5)',
      }}
    >
      {list(false)}
    </div>
  ) : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`overflow-trigger ${FOCUS}`}
        data-testid={testId}
        data-open={open ? 'true' : 'false'}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={popover ? menuId : undefined}
        aria-label={`More actions for ${label}`}
        disabled={disabled}
        onClick={(event) => {
          event.stopPropagation();
          setOpen(!open);
        }}
      >
        <Icon name="More" size="sm" />
      </button>
      {panel ? (host ? createPortal(panel, host) : panel) : null}
      {open && phone && renderSheet ? (
        <OverflowSheet target={target} state={state} onClose={() => close(true)}>
          {list(true)}
        </OverflowSheet>
      ) : null}
    </>
  );
}

/** The 390 bottom sheet. PortalModal 603:1199 over Overlay / Scrim 603:1163. */
export function OverflowSheet({
  target,
  state,
  onClose,
  children,
}: {
  target: OverflowTarget;
  state: OverflowState;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const title = target === 'milestone' ? 'Milestone' : 'Task';
  return (
    <PortalModal
      testId="overflow-sheet"
      scrimTestId="overflow-sheet-scrim"
      label={title}
      onClose={onClose}
      narrow
      sheet="bottom"
      showFooter={false}
    >
      <div
        role="menu"
        aria-label={`${title} actions`}
        data-target={target}
        data-state={state}
        onClick={(event) => event.stopPropagation()}
        style={{ padding: '4px 12px calc(82px + env(safe-area-inset-bottom, 0px))' }}
      >
        <div className="mb-1 flex items-center px-2 py-2">
          <h2 style={{ fontSize: 20, lineHeight: '30px', fontWeight: 600 }}>{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className={`ml-auto rounded-[9px] px-3 py-2 ${FOCUS}`}
            style={{ background: 'none', border: 0, color: 'var(--muted)', font: 'inherit', fontSize: 14, lineHeight: '21px', cursor: 'pointer' }}
          >
            Close
          </button>
        </div>
        {children}
      </div>
    </PortalModal>
  );
}

/** The sheet's items, for a caller that shows the sheet in its own dialog stack. */
export function OverflowSheetItems({
  target,
  state,
  onAction,
}: {
  target: OverflowTarget;
  state: OverflowState;
  onAction: (action: OverflowAction) => void;
}) {
  const hint = target === 'milestone' && state === 'open' ? MILESTONE_MENU_HINT : null;
  return (
    <>
      {closeoutMenuItems(state).map((action) => (
        <button
          key={action}
          type="button"
          role="menuitem"
          data-testid={`overflow-item-${action}`}
          onClick={() => onAction(action)}
          className={`overflow-menu-item ${FOCUS}`}
          style={{ ...itemStyle, padding: '12px 10px' }}
        >
          {ITEM_LABEL[action]}
        </button>
      ))}
      {hint ? <p style={hintStyle}>{hint}</p> : null}
    </>
  );
}
