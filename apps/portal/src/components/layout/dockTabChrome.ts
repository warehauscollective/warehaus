import type { CSSProperties } from 'react';

/**
 * Below the lg breakpoint (1024px) only the active dock tab shows its label.
 * Desktop shows every label at 13px / 1.3px tracking.
 * Mobile active label is 11px / 1.1px, matching Dock/Portal 284:8236.
 */
export const DOCK_ACTIVE_LABEL_CLASS =
  'whitespace-nowrap text-[11px] tracking-[1.1px] lg:text-[13px] lg:tracking-[1.3px]';

export const DOCK_IDLE_LABEL_CLASS =
  'hidden whitespace-nowrap text-[13px] tracking-[1.3px] lg:inline';

export function dockLabelClassName(active: boolean): string {
  return active ? DOCK_ACTIVE_LABEL_CLASS : DOCK_IDLE_LABEL_CLASS;
}

/** Active pill grows for its label. Idle tabs stay a 32px icon. */
export function dockTabClassName(active: boolean): string {
  const shape = active ? 'dock-tab-active gap-1 px-3 py-2' : 'size-8 p-2';
  return `relative flex shrink-0 items-center justify-center rounded-[13px] lg:size-auto lg:gap-2 lg:rounded-[21px] lg:px-4 lg:py-3 ${shape}`;
}

/**
 * Dark mode keeps the token pair: paper fill (`--fg`) and ink type (`--bg`).
 * Light mode sets `--dock-active-paper` / `--dock-active-ink` so the pill stays
 * paper with an ink icon and label instead of inverting.
 */
export function dockTabStyle(active: boolean): CSSProperties {
  return {
    fontFamily: 'var(--font-display)',
    fontWeight: 900,
    fontStyle: 'italic',
    textTransform: 'uppercase',
    lineHeight: 'normal',
    color: active ? 'var(--dock-active-ink, var(--bg))' : 'var(--muted)',
    background: active ? 'var(--dock-active-paper, var(--fg))' : 'transparent',
    border: active ? '1px solid var(--dock-active-paper, var(--fg))' : '1px solid transparent',
  };
}
