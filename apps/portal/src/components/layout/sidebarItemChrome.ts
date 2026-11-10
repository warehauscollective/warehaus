import type { CSSProperties } from 'react';

/**
 * One selected row in the desktop rail.
 * The fill is the selection. A border reads as a hover outline, so the
 * selected row and the idle rows share a transparent border.
 */
export function sidebarItemStyle(active: boolean): CSSProperties {
  return {
    fontFamily: 'var(--font-geist), var(--font-body)',
    fontSize: 14,
    lineHeight: '20px',
    fontWeight: active ? 600 : 500,
    padding: 12,
    borderRadius: 12,
    color: active ? 'var(--fg)' : 'var(--muted)',
    background: active ? 'var(--sidebar-active-fill, var(--surface-2))' : 'transparent',
    border: '1px solid transparent',
    outline: 'none',
    boxShadow: 'none',
  };
}
