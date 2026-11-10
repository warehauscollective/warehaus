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

/**
 * Desktop Eurostile is a few pixels wider than the Dock/Portal master on
 * RESOURCES and ACCOUNT. The nudge is desktop-only so the phone pill stays 122.
 */
export function dockLabelClassName(active: boolean, tab?: string): string {
  const base = active ? DOCK_ACTIVE_LABEL_CLASS : DOCK_IDLE_LABEL_CLASS;
  if (tab === 'resources') return `${base} dock-label-resources`;
  if (tab === 'account') return `${base} dock-label-account`;
  return base;
}

/**
 * Phone active pill is 35 tall (the track is 45). Desktop active is 46 and
 * idle is 44, so a 4px pad and 1px border make the track 56.
 * Idle phone tabs stay a 32px icon.
 */
export function dockTabClassName(active: boolean): string {
  const shape = active
    ? 'dock-tab-active box-border h-[35px] gap-1 px-3 lg:h-[46px] lg:gap-2 lg:px-4'
    : 'box-border size-8 p-2 lg:h-11 lg:w-auto lg:gap-2 lg:px-4 lg:py-0';
  return `relative flex shrink-0 items-center justify-center rounded-[13px] lg:rounded-[21px] ${shape}`;
}

/**
 * Active pill is paper with ink in both themes. `--paper` and `--ink` do not
 * flip with the light theme, so the contrast stays the same.
 */
export function dockTabStyle(active: boolean): CSSProperties {
  return {
    fontFamily: 'var(--font-display)',
    fontWeight: 900,
    fontStyle: 'italic',
    textTransform: 'uppercase',
    lineHeight: 'normal',
    color: active ? 'var(--ink)' : 'var(--muted)',
    background: active ? 'var(--paper)' : 'transparent',
    border: active ? '1px solid var(--paper)' : '1px solid transparent',
  };
}
