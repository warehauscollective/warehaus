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
 * Right inset so list rows, the billing rail, and the last kanban column
 * stay clear of the preview toolbar on the viewport edge.
 */
export const PORTAL_EDGE_SAFE = '4.5rem';
