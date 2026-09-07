/**
 * Shared portal chrome geometry (rem).
 * Keep Bevel / BevelFrame surfaces aligned with the left sidebar rail.
 */
export const PORTAL_SURFACE_RADIUS = 2.25;

/** Uniform gap between dashboard / workspace panels (row + column). */
export const PORTAL_PANEL_GAP = '1.25rem';

/** CSS custom property for {@link PORTAL_PANEL_GAP}. */
export const PORTAL_PANEL_GAP_VAR = 'var(--portal-panel-gap, 1.25rem)';

/**
 * Bottom clearance so page content can scroll under the floating dock
 * without the last tiles sitting permanently behind it.
 */
export const PORTAL_DOCK_CLEARANCE =
  'calc(7.25rem + env(safe-area-inset-bottom, 0px))';

/** CSS custom property for {@link PORTAL_DOCK_CLEARANCE}. */
export const PORTAL_DOCK_CLEARANCE_VAR =
  'var(--portal-dock-clearance, calc(7.25rem + env(safe-area-inset-bottom, 0px)))';
